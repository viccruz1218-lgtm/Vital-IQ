import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return toDateOnly(d);
}

const NEUTRAL_BASELINE = 50; // cold-start default when a pillar has no data yet, not 0

interface HabitCompletionRow {
  date: string;
  habits: { user_id: string; category: string } | { user_id: string; category: string }[];
}

// Deterministic — no AI involved. Training/Habits/Nutrition/Consistency,
// weighted 25% each per the Phase 1 spec. Vi narrates this number; it never
// computes it, so the score can't drift or be flattered.
export async function calculateMomentumScore(supabase: SupabaseClient<Database>, userId: string) {
  const since = daysAgo(7);
  const today = toDateOnly(new Date());

  // --- Training: workouts logged this week vs. the user's committed schedule.
  const { data: profile } = await supabase
    .from("profiles")
    .select("schedule_days_per_week")
    .eq("id", userId)
    .single();
  const targetSessions = profile?.schedule_days_per_week || 3;

  const { data: recentWorkouts } = await supabase
    .from("workout_logs")
    .select("performed_at")
    .eq("user_id", userId)
    .gte("performed_at", since);

  const workoutDays = new Set((recentWorkouts ?? []).map((w) => w.performed_at));
  const trainingScore = Math.min(100, Math.round((workoutDays.size / targetSessions) * 100));

  // --- Habits & Nutrition: completion vs. committed frequency, split by
  // category so a nutrition habit isn't counted toward both pillars.
  const { data: habits } = await supabase
    .from("habits")
    .select("id, category, frequency")
    .eq("user_id", userId)
    .eq("status", "active");

  const nonNutritionHabits = (habits ?? []).filter((h) => h.category !== "nutrition");
  const nutritionHabits = (habits ?? []).filter((h) => h.category === "nutrition");

  async function categoryScore(habitIds: string[], totalPlanned: number) {
    if (habitIds.length === 0 || totalPlanned === 0) return NEUTRAL_BASELINE;
    const { count } = await supabase
      .from("habit_completion")
      .select("id", { count: "exact", head: true })
      .in("habit_id", habitIds)
      .eq("completed", true)
      .gte("date", since)
      .lte("date", today);
    return Math.min(100, Math.round(((count ?? 0) / totalPlanned) * 100));
  }

  const habitsScore = await categoryScore(
    nonNutritionHabits.map((h) => h.id),
    nonNutritionHabits.reduce((sum, h) => sum + h.frequency, 0),
  );
  const nutritionScore = await categoryScore(
    nutritionHabits.map((h) => h.id),
    nutritionHabits.reduce((sum, h) => sum + h.frequency, 0),
  );

  // --- Consistency: did the user show up at all, on how many of the last 7 days.
  const activeDates = new Set<string>(workoutDays);

  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("check_in_date")
    .eq("user_id", userId)
    .gte("check_in_date", since);
  for (const c of checkIns ?? []) activeDates.add(c.check_in_date);

  if ((habits ?? []).length > 0) {
    const { data: completions } = await supabase
      .from("habit_completion")
      .select("date, habits!inner(user_id, category)")
      .eq("habits.user_id", userId)
      .eq("completed", true)
      .gte("date", since);
    for (const row of (completions ?? []) as HabitCompletionRow[]) activeDates.add(row.date);
  }

  const consistencyScore = Math.min(100, Math.round((activeDates.size / 7) * 100));

  const totalScore = Math.round(
    trainingScore * 0.25 + habitsScore * 0.25 + nutritionScore * 0.25 + consistencyScore * 0.25,
  );

  await supabase.from("momentum_scores").upsert(
    {
      user_id: userId,
      score_date: today,
      training_score: trainingScore,
      habits_score: habitsScore,
      nutrition_score: nutritionScore,
      consistency_score: consistencyScore,
      total_score: totalScore,
    },
    { onConflict: "user_id,score_date" },
  );

  return {
    training_score: trainingScore,
    habits_score: habitsScore,
    nutrition_score: nutritionScore,
    consistency_score: consistencyScore,
    total_score: totalScore,
  };
}
