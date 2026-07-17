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

// Shared by completeHabit and uncompleteHabit — both mutate habit_completion
// and then need the same current_streak/longest_streak/completion_rate
// recompute against whatever the table now looks like.
//
// Deliberately walks backward from the MOST RECENT remaining completed date,
// not from "today" — undoing today's completion must not always collapse
// the streak to 0. If yesterday and the day before are still completed,
// the streak is 2, not 0, even though today itself is now incomplete.
async function recomputeHabitStats(supabase: SupabaseClient<Database>, habitId: string) {
  const { data: habit } = await supabase.from("habits").select("longest_streak").eq("id", habitId).single();

  const { data: completions } = await supabase
    .from("habit_completion")
    .select("date, completed")
    .eq("habit_id", habitId)
    .eq("completed", true)
    .order("date", { ascending: false })
    .limit(400);

  const completedDates = (completions ?? []).map((c) => c.date);
  const completedSet = new Set(completedDates);

  let streak = 0;
  if (completedDates.length > 0) {
    let cursor = completedDates[0];
    while (completedSet.has(cursor)) {
      streak += 1;
      cursor = daysBefore(cursor, 1);
    }
  }

  const today = toDateOnly(new Date());
  const thirtyDaysAgo = daysBefore(today, 30);
  const { count: completedLast30 } = await supabase
    .from("habit_completion")
    .select("id", { count: "exact", head: true })
    .eq("habit_id", habitId)
    .eq("completed", true)
    .gte("date", thirtyDaysAgo)
    .lte("date", today);

  const completionRate = Math.round(((completedLast30 ?? 0) / 30) * 100) / 100;

  // Math.max means longest_streak only ever grows here — an uncomplete that
  // drops the current streak below a past peak must never erase that peak.
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

  return recomputeHabitStats(supabase, habitId);
}

// Undoes a mis-tapped completion. RLS (see migration 0006) only allows
// deleting today's row, so this can't be used to rewrite history that
// momentum scoring or the admin dashboard already read.
export async function uncompleteHabit(
  supabase: SupabaseClient<Database>,
  habitId: string,
  date?: string,
) {
  const targetDate = date ?? toDateOnly(new Date());

  const { error: deleteError } = await supabase
    .from("habit_completion")
    .delete()
    .eq("habit_id", habitId)
    .eq("date", targetDate);
  if (deleteError) throw deleteError;

  return recomputeHabitStats(supabase, habitId);
}

// Nightly: current_streak is only ever recomputed at completion time above
// — a habit nobody has touched in weeks would otherwise keep displaying
// its last-known streak forever. A streak is broken once a full calendar
// day has passed with no completion (yesterday AND today both missed).
export async function resetStaleHabitStreaks(supabase: SupabaseClient<Database>) {
  const yesterday = daysBefore(toDateOnly(new Date()), 1);

  const { data: habits } = await supabase
    .from("habits")
    .select("id")
    .eq("status", "active")
    .gt("current_streak", 0);

  for (const habit of habits ?? []) {
    const { data: recent } = await supabase
      .from("habit_completion")
      .select("date")
      .eq("habit_id", habit.id)
      .eq("completed", true)
      .gte("date", yesterday)
      .limit(1)
      .maybeSingle();

    if (!recent) {
      await supabase.from("habits").update({ current_streak: 0 }).eq("id", habit.id);
    }
  }
}
