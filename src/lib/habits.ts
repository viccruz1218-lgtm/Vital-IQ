import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBefore(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return toDateOnly(d);
}

// Marks a habit complete for `date` (defaults to today) and recomputes the
// denormalized current_streak / longest_streak / completion_rate on the
// habits row — these are read on every dashboard load, so they're kept
// up to date at write time rather than computed live on every request.
export async function completeHabit(
  supabase: SupabaseClient<Database>,
  habitId: string,
  date?: string,
) {
  const completedOn = date ?? toDateOnly(new Date());

  const { error: insertError } = await supabase
    .from("habit_completion")
    .upsert({ habit_id: habitId, date: completedOn, completed: true }, { onConflict: "habit_id,date" });
  if (insertError) throw insertError;

  const { data: habit } = await supabase.from("habits").select("longest_streak").eq("id", habitId).single();

  // Walk backward from the completed date through consecutive completed
  // days to compute the current streak.
  const { data: completions } = await supabase
    .from("habit_completion")
    .select("date, completed")
    .eq("habit_id", habitId)
    .eq("completed", true)
    .lte("date", completedOn)
    .order("date", { ascending: false })
    .limit(400);

  const completedDates = new Set((completions ?? []).map((c) => c.date));
  let streak = 0;
  let cursor = completedOn;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = daysBefore(cursor, 1);
  }

  const thirtyDaysAgo = daysBefore(completedOn, 30);
  const { count: completedLast30 } = await supabase
    .from("habit_completion")
    .select("id", { count: "exact", head: true })
    .eq("habit_id", habitId)
    .eq("completed", true)
    .gte("date", thirtyDaysAgo)
    .lte("date", completedOn);

  const completionRate = Math.round(((completedLast30 ?? 0) / 30) * 100) / 100;

  await supabase
    .from("habits")
    .update({
      current_streak: streak,
      longest_streak: Math.max(habit?.longest_streak ?? 0, streak),
      completion_rate: completionRate,
    })
    .eq("id", habitId);

  return { current_streak: streak, completion_rate: completionRate };
}
