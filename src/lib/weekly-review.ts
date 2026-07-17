import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile, WeeklyReview } from "@/types/database";
import { getAnthropic, COACH_MODEL } from "@/lib/ai/anthropic";
import { weeklyReviewSystemPrompt, SAVE_WEEKLY_REVIEW_TOOL } from "@/lib/ai/persona";
import { track } from "@/lib/analytics";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toDateOnly(d);
}

// The app's week starts Sunday — see dashboard/page.tsx's existing
// "sessions this week" calc (weekStart.setDate(weekStart.getDate() -
// weekStart.getDay())). Kept consistent here rather than introducing a
// different week-boundary convention for this one feature.
export function getPreviousWeekStart(reference: Date = new Date()): string {
  const d = new Date(reference);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - 7);
  return toDateOnly(d);
}

export interface WeeklyDataSummary {
  week_start: string;
  week_end: string;
  identity_statement: string | null;
  quit_pattern: string | null;
  goal: string | null;
  workouts_planned: number;
  workouts_completed: number;
  habits: { name: string; category: string; planned: number; completed: number }[];
  check_ins: { date: string; energy_level: number | null; soreness: number | null }[];
  days_since: { event_type: string; current_days: number }[];
  momentum: { score_date: string; total_score: number }[];
  consistency_rate: number;
}

// Pulls only what actually happened — workouts, habit completions, Days
// Since counters, Momentum Score history, check-ins, and Vital Contract
// goals — for exactly one already-completed week. Nothing here is
// inferred or estimated; every field traces to a stored row.
export async function aggregateWeeklyData(
  supabase: SupabaseClient<Database>,
  userId: string,
  weekStart: string,
): Promise<WeeklyDataSummary> {
  const weekEnd = addDays(weekStart, 6);

  const [
    { data: profile },
    { data: workoutLogs },
    { data: habits },
    { data: checkIns },
    { data: daysSince },
    { data: momentum },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("identity_statement, quit_pattern, goal, schedule_days_per_week")
      .eq("id", userId)
      .single(),
    supabase
      .from("workout_logs")
      .select("performed_at")
      .eq("user_id", userId)
      .gte("performed_at", weekStart)
      .lte("performed_at", weekEnd),
    supabase.from("habits").select("id, name, category, frequency").eq("user_id", userId).eq("status", "active"),
    supabase
      .from("check_ins")
      .select("check_in_date, energy_level, soreness")
      .eq("user_id", userId)
      .gte("check_in_date", weekStart)
      .lte("check_in_date", weekEnd),
    supabase.from("days_since_events").select("event_type, current_days").eq("user_id", userId),
    supabase
      .from("momentum_scores")
      .select("score_date, total_score")
      .eq("user_id", userId)
      .gte("score_date", weekStart)
      .lte("score_date", weekEnd)
      .order("score_date", { ascending: true }),
  ]);

  const habitIds = (habits ?? []).map((h) => h.id);
  const { data: completions } =
    habitIds.length > 0
      ? await supabase
          .from("habit_completion")
          .select("habit_id, date")
          .in("habit_id", habitIds)
          .eq("completed", true)
          .gte("date", weekStart)
          .lte("date", weekEnd)
      : { data: [] };

  const completedByHabit = new Map<string, number>();
  for (const c of completions ?? []) completedByHabit.set(c.habit_id, (completedByHabit.get(c.habit_id) ?? 0) + 1);

  const habitSummaries = (habits ?? []).map((h) => ({
    name: h.name,
    category: h.category,
    planned: h.frequency,
    completed: completedByHabit.get(h.id) ?? 0,
  }));

  const workoutDays = new Set((workoutLogs ?? []).map((w) => w.performed_at.slice(0, 10)));
  const workoutsPlanned = profile?.schedule_days_per_week || 3;
  const workoutsCompleted = workoutDays.size;

  const habitsPlanned = habitSummaries.reduce((sum, h) => sum + h.planned, 0);
  const habitsCompleted = habitSummaries.reduce((sum, h) => sum + h.completed, 0);

  // Matches the same WCR formula already used cohort-wide in
  // src/lib/admin-metrics.ts and per-user in src/lib/admin-users.ts — sum
  // completed/planned across habits + workouts, clamp only the final ratio.
  const totalPlanned = workoutsPlanned + habitsPlanned;
  const totalCompleted = workoutsCompleted + habitsCompleted;
  const consistencyRate = totalPlanned > 0 ? Math.min(100, Math.round((totalCompleted / totalPlanned) * 100)) : 0;

  return {
    week_start: weekStart,
    week_end: weekEnd,
    identity_statement: profile?.identity_statement ?? null,
    quit_pattern: profile?.quit_pattern ?? null,
    goal: profile?.goal ?? null,
    workouts_planned: workoutsPlanned,
    workouts_completed: workoutsCompleted,
    habits: habitSummaries,
    check_ins: (checkIns ?? []).map((c) => ({
      date: c.check_in_date,
      energy_level: c.energy_level,
      soreness: c.soreness,
    })),
    days_since: (daysSince ?? []).map((d) => ({ event_type: d.event_type, current_days: d.current_days })),
    momentum: (momentum ?? []).map((m) => ({ score_date: m.score_date, total_score: m.total_score })),
    consistency_rate: consistencyRate,
  };
}

function isEmptyWeek(data: WeeklyDataSummary): boolean {
  return data.workouts_completed === 0 && data.check_ins.length === 0 && data.habits.every((h) => h.completed === 0);
}

export interface WeeklyReviewContent {
  wins: string[];
  friction_points: string[];
  patterns: string;
  next_week_focus: string;
}

// Exported separately so the AI output shape can be validated in a unit
// test without needing to mock the Anthropic client — Claude's tool_use
// input is untrusted structured data until this passes.
export function validateWeeklyReviewContent(input: unknown): WeeklyReviewContent {
  const obj = input as Partial<WeeklyReviewContent> | null;
  if (!obj || typeof obj !== "object") {
    throw new Error("Weekly review content must be an object");
  }
  if (!Array.isArray(obj.wins) || !obj.wins.every((w) => typeof w === "string")) {
    throw new Error("wins must be an array of strings");
  }
  if (!Array.isArray(obj.friction_points) || !obj.friction_points.every((f) => typeof f === "string")) {
    throw new Error("friction_points must be an array of strings");
  }
  if (typeof obj.patterns !== "string") {
    throw new Error("patterns must be a string");
  }
  if (typeof obj.next_week_focus !== "string") {
    throw new Error("next_week_focus must be a string");
  }
  return { wins: obj.wins, friction_points: obj.friction_points, patterns: obj.patterns, next_week_focus: obj.next_week_focus };
}

// A week with zero logged activity is handled deterministically, without
// an AI call at all — "do not invent user behavior" is easiest to guarantee
// for the one case where there's no behavior to describe.
function emptyWeekContent(data: WeeklyDataSummary): WeeklyReviewContent {
  return {
    wins: [],
    friction_points: ["No workouts, habit completions, or check-ins were logged this week."],
    patterns: "Nothing was logged this week, so there's no behavior pattern to describe yet.",
    next_week_focus: data.habits[0]?.name
      ? `Log ${data.habits[0].name} just once this week to restart momentum.`
      : "Log one workout or check-in this week, however small, to restart momentum.",
  };
}

// Idempotent — a week that already has a saved review is returned as-is,
// never regenerated or overwritten (see the missing update/delete RLS
// policy in migration 0008, which enforces this at the database level too).
export async function generateWeeklyReview(
  supabase: SupabaseClient<Database>,
  userId: string,
  weekStart?: string,
): Promise<WeeklyReview> {
  const targetWeekStart = weekStart ?? getPreviousWeekStart();

  const { data: existing } = await supabase
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", targetWeekStart)
    .maybeSingle();
  if (existing) return existing;

  const data = await aggregateWeeklyData(supabase, userId, targetWeekStart);

  let content: WeeklyReviewContent;
  if (isEmptyWeek(data)) {
    content = emptyWeekContent(data);
  } else {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
    await track(supabase, userId, "ai_call", { route: "weekly-review" });
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: COACH_MODEL,
      max_tokens: 1024,
      system: weeklyReviewSystemPrompt(profile as Profile),
      tools: [SAVE_WEEKLY_REVIEW_TOOL],
      tool_choice: { type: "tool", name: "save_weekly_review" },
      messages: [{ role: "user", content: JSON.stringify(data) }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use" && b.name === "save_weekly_review");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Weekly review generation failed — Claude did not return a tool call");
    }
    content = validateWeeklyReviewContent(toolUse.input);
  }

  const { data: saved, error } = await supabase
    .from("weekly_reviews")
    .insert({
      user_id: userId,
      week_start: targetWeekStart,
      wins: content.wins,
      friction_points: content.friction_points,
      patterns: content.patterns,
      next_week_focus: content.next_week_focus,
      momentum_snapshot: { scores: data.momentum },
      consistency_rate: data.consistency_rate,
    })
    .select()
    .single();

  if (error) {
    // unique(user_id, week_start) — a concurrent call (e.g. the cron and an
    // on-demand request landing at the same moment) already saved this
    // week's review. That's not a real failure: re-fetch and return it
    // instead of surfacing an "error" for an outcome that isn't one.
    if (error.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("weekly_reviews")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", targetWeekStart)
        .single();
      if (raceWinner) return raceWinner;
    }
    throw error;
  }

  await track(supabase, userId, "weekly_review_generated", {
    week_start: targetWeekStart,
    consistency_rate: data.consistency_rate,
  });

  return saved as WeeklyReview;
}

export async function getWeeklyReviewHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 12,
): Promise<WeeklyReview[]> {
  const { data } = await supabase
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limit);

  return data ?? [];
}
