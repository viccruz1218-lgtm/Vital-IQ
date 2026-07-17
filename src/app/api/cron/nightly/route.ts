import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recomputeAllDaysSince, isDueForComeback, markComebackSent } from "@/lib/days-since";
import { calculateMomentumScore } from "@/lib/momentum";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import { comebackSystemPrompt } from "@/lib/ai/persona";
import { track } from "@/lib/analytics";
import type { Profile } from "@/types/database";

interface UserResult {
  userId: string;
  momentum: "ok" | "error";
  comeback: "sent" | "skipped" | "error";
  error?: string;
}

// Triggered by a Vercel Cron job hitting this route once nightly (see
// vercel.json). Vercel Cron only issues GET requests, and automatically
// sends `Authorization: Bearer $CRON_SECRET` when that env var is set —
// this checks for that same header. Runs with the service-role client
// because it operates across every user, not just the authenticated caller.
//
// Every user is processed independently: a failure for one user (a bad
// Claude call, a malformed row) is caught, logged, and skipped — it must
// never prevent the remaining users in the batch from getting their
// Momentum update or Comeback evaluation.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const anthropic = getAnthropic();

  let daysSinceRecomputeError: string | null = null;
  try {
    await recomputeAllDaysSince(supabase);
  } catch (err) {
    daysSinceRecomputeError = (err as Error).message;
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("onboarding_completed", true);

  if (profilesError || !profiles) {
    return NextResponse.json(
      { error: `Failed to load profiles: ${profilesError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  const results: UserResult[] = [];

  for (const profile of profiles as Profile[]) {
    const result: UserResult = { userId: profile.id, momentum: "ok", comeback: "skipped" };

    try {
      await calculateMomentumScore(supabase, profile.id);
    } catch (err) {
      result.momentum = "error";
      result.error = `momentum: ${(err as Error).message}`;
    }

    try {
      const due = await isDueForComeback(supabase, profile.id, profile.last_comeback_sent_at);
      if (due) {
        const response = await anthropic.messages.create({
          model: COACH_MODEL,
          max_tokens: 300,
          system: comebackSystemPrompt(profile),
          messages: [{ role: "user", content: "Generate the comeback message now." }],
        });

        const message = response.content.find((b) => b.type === "text");
        const text = message && message.type === "text" ? message.text : "";

        if (text) {
          await supabase
            .from("chat_messages")
            .insert({ user_id: profile.id, context: "coach", role: "assistant", content: text });
          await track(supabase, profile.id, "comeback_message_sent", {});
          await markComebackSent(supabase, profile.id);
          result.comeback = "sent";
        }
      }
    } catch (err) {
      result.comeback = "error";
      result.error = result.error
        ? `${result.error}; comeback: ${(err as Error).message}`
        : `comeback: ${(err as Error).message}`;
    }

    results.push(result);
  }

  const summary = {
    processed_users: results.length,
    momentum_ok: results.filter((r) => r.momentum === "ok").length,
    momentum_errors: results.filter((r) => r.momentum === "error").length,
    comeback_sent: results.filter((r) => r.comeback === "sent").length,
    comeback_errors: results.filter((r) => r.comeback === "error").length,
    days_since_recompute_error: daysSinceRecomputeError,
    errors: results.filter((r) => r.error).map((r) => ({ userId: r.userId, error: r.error })),
  };

  return NextResponse.json(summary);
}
