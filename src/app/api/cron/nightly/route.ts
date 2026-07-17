import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recomputeAllDaysSince, isUserInactive, claimComebackSlot } from "@/lib/days-since";
import { resetStaleHabitStreaks } from "@/lib/habits";
import { calculateMomentumScore } from "@/lib/momentum";
import { generateWeeklyReview } from "@/lib/weekly-review";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import { comebackSystemPrompt } from "@/lib/ai/persona";
import { track } from "@/lib/analytics";
import type { Profile } from "@/types/database";

// Each user in the loop can involve a full Anthropic call — with even a
// modest alpha cohort this can exceed Vercel's default function duration.
// Requires a plan that supports it; if the account's max is lower, this is
// silently capped rather than erroring, so verify against the actual plan.
export const maxDuration = 300;

interface UserResult {
  userId: string;
  momentum: "ok" | "error";
  comeback: "sent" | "skipped" | "error";
  weeklyReview: "generated" | "skipped" | "error";
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
    console.error("[cron/nightly] recomputeAllDaysSince failed:", err);
  }

  let staleStreaksResetError: string | null = null;
  try {
    await resetStaleHabitStreaks(supabase);
  } catch (err) {
    staleStreaksResetError = (err as Error).message;
    console.error("[cron/nightly] resetStaleHabitStreaks failed:", err);
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("onboarding_completed", true);

  if (profilesError || !profiles) {
    console.error("[cron/nightly] failed to load profiles:", profilesError);
    return NextResponse.json(
      { error: `Failed to load profiles: ${profilesError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  // Weekly Review covers Sunday-Saturday (see getPreviousWeekStart) — the
  // week is only fully complete once Sunday has arrived, so generation
  // only runs that one day rather than on every nightly run.
  const isWeekBoundaryDay = new Date().getUTCDay() === 0;

  const results: UserResult[] = [];

  for (const profile of profiles as Profile[]) {
    const result: UserResult = { userId: profile.id, momentum: "ok", comeback: "skipped", weeklyReview: "skipped" };

    try {
      await calculateMomentumScore(supabase, profile.id);
    } catch (err) {
      result.momentum = "error";
      result.error = `momentum: ${(err as Error).message}`;
      console.error(`[cron/nightly] momentum failed for ${profile.id}:`, err);
    }

    try {
      const inactive = await isUserInactive(supabase, profile.id);
      if (inactive) {
        const response = await anthropic.messages.create({
          model: COACH_MODEL,
          max_tokens: 300,
          system: comebackSystemPrompt(profile),
          messages: [{ role: "user", content: "Generate the comeback message now." }],
        });

        const message = response.content.find((b) => b.type === "text");
        const text = message && message.type === "text" ? message.text : "";

        if (text) {
          // Claim right before writing, not before the Anthropic call — an
          // AI failure shouldn't burn tonight's slot, but the actual send
          // must be serialized against a concurrent/overlapping cron run.
          const claimed = await claimComebackSlot(supabase, profile.id);
          if (claimed) {
            await supabase
              .from("chat_messages")
              .insert({ user_id: profile.id, context: "coach", role: "assistant", content: text });
            await track(supabase, profile.id, "comeback_message_sent", {});
            result.comeback = "sent";
          }
        }
      }
    } catch (err) {
      result.comeback = "error";
      result.error = result.error
        ? `${result.error}; comeback: ${(err as Error).message}`
        : `comeback: ${(err as Error).message}`;
      console.error(`[cron/nightly] comeback failed for ${profile.id}:`, err);
    }

    // Full-experience only, matching Habits/Momentum/Coach — the control
    // arm never sees the consistency engine this reviews.
    if (isWeekBoundaryDay && profile.experiment_group !== "control") {
      try {
        await generateWeeklyReview(supabase, profile.id);
        result.weeklyReview = "generated";
      } catch (err) {
        result.weeklyReview = "error";
        result.error = result.error
          ? `${result.error}; weekly_review: ${(err as Error).message}`
          : `weekly_review: ${(err as Error).message}`;
        console.error(`[cron/nightly] weekly review failed for ${profile.id}:`, err);
      }
    }

    results.push(result);
  }

  const summary = {
    processed_users: results.length,
    momentum_ok: results.filter((r) => r.momentum === "ok").length,
    momentum_errors: results.filter((r) => r.momentum === "error").length,
    comeback_sent: results.filter((r) => r.comeback === "sent").length,
    comeback_errors: results.filter((r) => r.comeback === "error").length,
    weekly_reviews_generated: results.filter((r) => r.weeklyReview === "generated").length,
    weekly_review_errors: results.filter((r) => r.weeklyReview === "error").length,
    days_since_recompute_error: daysSinceRecomputeError,
    stale_streaks_reset_error: staleStreaksResetError,
    errors: results.filter((r) => r.error).map((r) => ({ userId: r.userId, error: r.error })),
  };

  return NextResponse.json(summary);
}
