import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanDay, PlanExercise, WorkoutPlan } from "@/types/database";

export interface TodaysWorkout {
  plan: WorkoutPlan;
  day: PlanDay & { plan_exercises: PlanExercise[] };
  dayNumber: number;
  totalDays: number;
}

// The plan doesn't map to calendar days (users train on flexible schedules) —
// "today's" session is just the next day in rotation, based on how many
// sessions from this plan have already been logged.
export async function getTodaysWorkout(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TodaysWorkout | null> {
  const { data: plan } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return null;

  const { data: days } = await supabase
    .from("plan_days")
    .select("*, plan_exercises(*)")
    .eq("plan_id", plan.id)
    .order("order_index", { ascending: true });

  if (!days || days.length === 0) return null;

  const dayIds = days.map((d) => d.id);
  const { count } = await supabase
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("plan_day_id", dayIds);

  const index = (count ?? 0) % days.length;
  const day = days[index] as PlanDay & { plan_exercises: PlanExercise[] };
  day.plan_exercises.sort((a, b) => a.order_index - b.order_index);

  return { plan, day, dayNumber: index + 1, totalDays: days.length };
}
