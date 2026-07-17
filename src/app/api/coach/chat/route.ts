import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import { coachSystemPrompt, GENERATE_WORKOUT_PLAN_TOOL } from "@/lib/ai/persona";
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

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 1024,
    system: coachSystemPrompt(profile as Profile),
    tools: [GENERATE_WORKOUT_PLAN_TOOL],
    messages: [
      ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ],
  });

  let reply = "";
  let planUpdated = false;

  for (const block of response.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use" && block.name === "generate_workout_plan") {
      await persistGeneratedPlan(supabase, user.id, block.input as Parameters<typeof persistGeneratedPlan>[2]);
      planUpdated = true;
      if (!reply) reply = "Updated your plan — check the workout tab for the new session.";
    }
  }

  if (!reply) reply = "Got it.";

  await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, context: "coach", role: "assistant", content: reply });

  await track(supabase, user.id, "vi_conversation", { plan_updated: planUpdated });

  return NextResponse.json({ reply, planUpdated });
}
