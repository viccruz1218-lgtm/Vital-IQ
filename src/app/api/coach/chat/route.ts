import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import { coachSystemPrompt, GENERATE_WORKOUT_PLAN_TOOL, validateGeneratedPlanInput } from "@/lib/ai/persona";
import { aggregateCoachContext } from "@/lib/ai/coach-context";
import { persistGeneratedPlan } from "@/lib/ai/plan";
import { track } from "@/lib/analytics";
import { checkAiRateLimit } from "@/lib/rate-limit";
import type { Profile } from "@/types/database";

export async function POST(request: Request) {
  const { message } = (await request.json()) as { message: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkAiRateLimit(supabase, user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const coachContext = await aggregateCoachContext(supabase, user.id);

  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("context", "coach")
    .order("created_at", { ascending: true })
    .limit(40);

  await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, context: "coach", role: "user", content: message });
  await track(supabase, user.id, "ai_call", { route: "coach/chat" });

  let reply = "";
  let planUpdated = false;

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: COACH_MODEL,
      // 4096, matching /api/workouts/generate — this route's tool_choice is
      // NOT forced (plain conversation is the common case), so when Claude
      // does decide to call generate_workout_plan mid-conversation there's
      // no guarantee it does so before spending tokens on chat text first.
      // At 1024 a full multi-day plan's tool-call JSON got truncated
      // mid-`days` array and failed validateGeneratedPlanInput every time.
      max_tokens: 4096,
      system: coachSystemPrompt(profile as Profile, coachContext),
      tools: [GENERATE_WORKOUT_PLAN_TOOL],
      messages: [
        ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message },
      ],
    });

    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      } else if (block.type === "tool_use" && block.name === "generate_workout_plan") {
        const plan = validateGeneratedPlanInput(block.input);
        await persistGeneratedPlan(supabase, user.id, plan);
        planUpdated = true;
        if (!reply) reply = "Updated your plan — check the workout tab for the new session.";
      }
    }
  } catch (err) {
    console.error("[coach/chat] failed:", err);
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      context: "coach",
      role: "assistant",
      content: "Sorry, something went wrong on my end — try sending that again.",
    });
    return NextResponse.json({ error: "Failed to process message" }, { status: 502 });
  }

  if (!reply) reply = "Got it.";

  await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, context: "coach", role: "assistant", content: reply });

  await track(supabase, user.id, "vi_conversation", { plan_updated: planUpdated });

  return NextResponse.json({ reply, planUpdated });
}
