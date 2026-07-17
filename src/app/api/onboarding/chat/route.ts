import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import {
  ONBOARDING_SYSTEM_PROMPT,
  SAVE_ONBOARDING_PROFILE_TOOL,
  SEED_STARTER_HABITS_TOOL,
  type OnboardingProfileInput,
  type SeedHabitInput,
} from "@/lib/ai/persona";
import { track } from "@/lib/analytics";
import { checkAiRateLimit } from "@/lib/rate-limit";

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

  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("context", "onboarding")
    .order("created_at", { ascending: true });

  await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, context: "onboarding", role: "user", content: message });
  await track(supabase, user.id, "ai_call", { route: "onboarding/chat" });

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 1536,
    system: ONBOARDING_SYSTEM_PROMPT,
    tools: [SAVE_ONBOARDING_PROFILE_TOOL, SEED_STARTER_HABITS_TOOL],
    messages: [
      ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ],
  });

  let onboardingCompleted = false;
  let reply = "";

  for (const block of response.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use" && block.name === "save_onboarding_profile") {
      const input = block.input as OnboardingProfileInput;
      // onboarding_completed is a protected column (see migration 0004) —
      // this write must go through the service-role client, not the
      // per-session client, or the DB trigger rejects it.
      const serviceRoleSupabase = createServiceRoleClient();
      await serviceRoleSupabase
        .from("profiles")
        .update({
          // These are free text and get re-injected into every future coach
          // system prompt (see coachSystemPrompt) — capped to bound how much
          // user-controlled text can ride along in a persistent context.
          identity_statement: input.identity_statement?.slice(0, 300),
          main_motivation: input.main_motivation?.slice(0, 300),
          quit_pattern: input.quit_pattern?.slice(0, 300),
          goal: input.goal,
          fitness_level: input.fitness_level,
          age: input.age,
          height_cm: input.height_cm,
          weight_kg: input.weight_kg,
          equipment: input.equipment,
          schedule_days_per_week: input.schedule_days_per_week,
          injuries: input.injuries?.slice(0, 300),
          coaching_tone: input.coaching_tone,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      onboardingCompleted = true;
      await track(supabase, user.id, "onboarding_completed", { goal: input.goal });
      if (!reply) {
        reply = "That's everything I need. Building your first plan now — check your dashboard.";
      }
    } else if (block.type === "tool_use" && block.name === "seed_starter_habits") {
      const input = block.input as { habits: SeedHabitInput[] };
      const rows = (input.habits ?? []).slice(0, 2).map((h) => ({
        user_id: user.id,
        name: h.name,
        category: h.category,
        frequency: h.frequency,
      }));
      if (rows.length > 0) {
        await supabase.from("habits").insert(rows);
        await track(supabase, user.id, "habit_created", { source: "onboarding_seed", count: rows.length });
      }
    }
  }

  if (!reply) reply = "Got it.";

  await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, context: "onboarding", role: "assistant", content: reply });

  return NextResponse.json({ reply, onboardingCompleted });
}
