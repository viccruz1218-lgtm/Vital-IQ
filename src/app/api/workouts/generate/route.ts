import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import { GENERATE_WORKOUT_PLAN_TOOL, planGenerationPrompt } from "@/lib/ai/persona";
import { persistGeneratedPlan } from "@/lib/ai/plan";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import type { Profile } from "@/types/database";

export async function POST() {
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

  await track(supabase, user.id, "ai_call", { route: "workouts/generate" });

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 4096,
    tools: [GENERATE_WORKOUT_PLAN_TOOL],
    tool_choice: { type: "tool", name: "generate_workout_plan" },
    messages: [{ role: "user", content: planGenerationPrompt(profile as Profile) }],
  });

  const toolUse = response.content.find(
    (b) => b.type === "tool_use" && b.name === "generate_workout_plan",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Plan generation failed" }, { status: 502 });
  }

  const plan = await persistGeneratedPlan(
    supabase,
    user.id,
    toolUse.input as Parameters<typeof persistGeneratedPlan>[2],
  );

  return NextResponse.json({ plan });
}
