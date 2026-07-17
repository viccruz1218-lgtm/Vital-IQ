import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

interface PlanExerciseInput {
  exercise_name: string;
  target_sets: number;
  target_reps: string;
  notes?: string;
}

interface PlanDayInput {
  day_label: string;
  exercises: PlanExerciseInput[];
}

interface PlanInput {
  title: string;
  goal_summary: string;
  days: PlanDayInput[];
}

export async function persistGeneratedPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: PlanInput,
) {
  await supabase
    .from("workout_plans")
    .update({ status: "archived" })
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: newPlan, error: planError } = await supabase
    .from("workout_plans")
    .insert({ user_id: userId, title: plan.title, goal_summary: plan.goal_summary, status: "active" })
    .select()
    .single();

  if (planError || !newPlan) throw planError ?? new Error("Failed to create plan");

  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];
    const { data: newDay, error: dayError } = await supabase
      .from("plan_days")
      .insert({ plan_id: newPlan.id, day_label: day.day_label, order_index: dayIndex })
      .select()
      .single();

    if (dayError || !newDay) throw dayError ?? new Error("Failed to create plan day");

    const exerciseRows = day.exercises.map((ex, exIndex) => ({
      plan_day_id: newDay.id,
      order_index: exIndex,
      exercise_name: ex.exercise_name,
      target_sets: ex.target_sets,
      target_reps: ex.target_reps,
      notes: ex.notes ?? null,
    }));

    if (exerciseRows.length > 0) {
      const { error: exError } = await supabase.from("plan_exercises").insert(exerciseRows);
      if (exError) throw exError;
    }
  }

  return newPlan;
}
