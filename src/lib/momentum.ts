import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MomentumScore } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return toDateOnly(d);
}

interface HabitCompletionRow {
  date: string;
  habits: { user_id: string; category: string } | { user_id: string; category: string }[];
}

// M3 weights — Training/Habits carry the most weight, Nutrition/Recovery
// slightly less, Consistency the least (it's already implicit in the other
// four). Training and Consistency are always computed; Habits/Nutrition/
// Recovery can be genuinely unavailable and are excluded below rather than
// filled with a fake placeholder value.
const WEIGHTS = {
  training: 0.25,
  habits: 0.25,
  nutrition: 0.2,
  recovery: 0.2,
  consistency: 0.1,
};

// Deterministic — no AI involved. Vi narrates this number; it never
// computes or influences it, so the score can't drift or be flattered.
export async function calculateMomentumScore(supabase: SupabaseClient<Database>, userId: string) {
  const since = daysAgo(7);
  const today = toDateOnly(new Date());

  // --- Training: workouts logged this week vs. the user's committed
  // schedule. Always available — schedule_days_per_week defaults to 3.
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
  // category so a nutrition habit isn't counted toward both pillars. Either
  // pillar is unavailable (null) when the user has no active habits in
  // that category yet — a habit-less user isn't "failing," there's simply
  // nothing to measure, so this must not be scored as 0 or a fake average.
  const { data: habits } = await supabase
    .from("habits")
    .select("id, category, frequency")
    .eq("user_id", userId)
    .eq("status", "active");

  const nonNutritionHabits = (habits ?? []).filter((h) => h.category !== "nutrition");
  const nutritionHabits = (habits ?? []).filter((h) => h.category === "nutrition");

  async function categoryScore(habitIds: string[], totalPlanned: number): Promise<number | null> {
    if (habitIds.length === 0 || totalPlanned === 0) return null;
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
  // Nutrition uses the only nutrition-adjacent data this app actually
  // collects today (nutrition-category habit completions) — there's no
  // dedicated meal/calorie log. If that placeholder architecture is ever
  // replaced with real nutrition tracking, only this line needs to change.
  const nutritionScore = await categoryScore(
    nutritionHabits.map((h) => h.id),
    nutritionHabits.reduce((sum, h) => sum + h.frequency, 0),
  );

  // --- Recovery: average energy/soreness from check-ins in the window.
  // Unavailable (null) if the user hasn't checked in at all in 7 days.
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("check_in_date, energy_level, soreness")
    .eq("user_id", userId)
    .gte("check_in_date", since);

  let recoveryScore: number | null = null;
  const checkInsWithData = (checkIns ?? []).filter((c) => c.energy_level != null && c.soreness != null);
  if (checkInsWithData.length > 0) {
    const avgEnergy =
      checkInsWithData.reduce((sum, c) => sum + (c.energy_level as number), 0) / checkInsWithData.length;
    const avgSoreness =
      checkInsWithData.reduce((sum, c) => sum + (c.soreness as number), 0) / checkInsWithData.length;
    // Both energy_level and soreness are 1-5 scales (see dashboard/checkin).
    // Energy: 1 (low) -> 5 (high) maps directly to 0-100. Soreness is
    // inverted: 5 (very sore) is bad for recovery, so it maps to 0, and 1
    // (not sore) maps to 100.
    const energyComponent = ((avgEnergy - 1) / 4) * 100;
    const sorenessComponent = ((5 - avgSoreness) / 4) * 100;
    recoveryScore = Math.min(100, Math.max(0, Math.round((energyComponent + sorenessComponent) / 2)));
  }

  // --- Consistency: did the user show up at all, on how many of the last
  // 7 days. Always available — there's no setup prerequisite for this one.
  const activeDates = new Set<string>(workoutDays);
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

  // --- Total: weighted average over whichever pillars are actually
  // available, with weights renormalized among them — a pillar with no
  // data yet is excluded, not defaulted, so it can never drag the score
  // down (or artificially prop it up) before there's anything to measure.
  const pillars: { score: number | null; weight: number }[] = [
    { score: trainingScore, weight: WEIGHTS.training },
    { score: habitsScore, weight: WEIGHTS.habits },
    { score: nutritionScore, weight: WEIGHTS.nutrition },
    { score: recoveryScore, weight: WEIGHTS.recovery },
    { score: consistencyScore, weight: WEIGHTS.consistency },
  ];
  const available = pillars.filter(
    (p): p is { score: number; weight: number } => p.score !== null,
  );
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const totalScore =
    totalWeight > 0
      ? Math.min(100, Math.round(available.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight))
      : 0;

  await supabase.from("momentum_scores").upsert(
    {
      user_id: userId,
      score_date: today,
      training_score: trainingScore,
      habits_score: habitsScore,
      nutrition_score: nutritionScore,
      recovery_score: recoveryScore,
      consistency_score: consistencyScore,
      total_score: totalScore,
    },
    { onConflict: "user_id,score_date" },
  );

  return {
    training_score: trainingScore,
    habits_score: habitsScore,
    nutrition_score: nutritionScore,
    recovery_score: recoveryScore,
    consistency_score: consistencyScore,
    total_score: totalScore,
  };
}

// Ordered oldest -> newest, for the trend view and day-over-day comparison.
// Read-only — never recomputes or backfills past rows, so historical
// scores are never touched by a later calculation.
export async function getMomentumHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  days = 30,
): Promise<MomentumScore[]> {
  const since = daysAgo(days);
  const { data } = await supabase
    .from("momentum_scores")
    .select("*")
    .eq("user_id", userId)
    .gte("score_date", since)
    .order("score_date", { ascending: true });

  return data ?? [];
}
