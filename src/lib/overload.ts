import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

interface SetRow {
  reps: number;
  weight_kg: number;
  workout_logs: { performed_at: string; user_id: string } | { performed_at: string; user_id: string }[];
}

function performedAt(row: SetRow) {
  return Array.isArray(row.workout_logs) ? row.workout_logs[0]?.performed_at : row.workout_logs.performed_at;
}

// Best set (by weight, then reps) the user has ever logged for this exercise,
// optionally excluding one workout_log (the one currently being saved).
export async function getPreviousBest(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseName: string,
  excludeWorkoutLogId?: string,
) {
  let query = supabase
    .from("set_logs")
    .select("reps, weight_kg, workout_logs!inner(performed_at, user_id)")
    .eq("exercise_name", exerciseName)
    .eq("workout_logs.user_id", userId);

  if (excludeWorkoutLogId) query = query.neq("workout_log_id", excludeWorkoutLogId);

  const { data } = await query;
  if (!data || data.length === 0) return null;

  const rows = data as unknown as SetRow[];
  return rows.reduce((best, row) => {
    if (!best) return row;
    if (row.weight_kg > best.weight_kg) return row;
    if (row.weight_kg === best.weight_kg && row.reps > best.reps) return row;
    return best;
  }, null as SetRow | null);
}

export interface ExerciseHistoryPoint {
  date: string;
  maxWeight: number;
  totalVolume: number;
}

// Per-session max weight and total volume (sets x reps x weight) for an
// exercise, oldest first — the data behind the progressive-overload trend.
export async function getExerciseHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseName: string,
): Promise<ExerciseHistoryPoint[]> {
  const { data } = await supabase
    .from("set_logs")
    .select("reps, weight_kg, workout_logs!inner(performed_at, user_id)")
    .eq("exercise_name", exerciseName)
    .eq("workout_logs.user_id", userId);

  if (!data) return [];

  const rows = data as unknown as SetRow[];
  const byDate = new Map<string, { maxWeight: number; totalVolume: number }>();

  for (const row of rows) {
    const date = performedAt(row);
    if (!date) continue;
    const entry = byDate.get(date) ?? { maxWeight: 0, totalVolume: 0 };
    entry.maxWeight = Math.max(entry.maxWeight, row.weight_kg);
    entry.totalVolume += row.reps * row.weight_kg;
    byDate.set(date, entry);
  }

  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
