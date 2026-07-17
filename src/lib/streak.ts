import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

// Call whenever the user logs a workout or completes a daily check-in —
// either one counts as "showed up today" for streak purposes.
export async function recordActivity(supabase: SupabaseClient<Database>, userId: string) {
  const today = toDateOnly(new Date());

  const { data: existing } = await supabase
    .from("streaks")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await supabase
      .from("streaks")
      .insert({ user_id: userId, current_streak: 1, longest_streak: 1, last_activity_date: today });
    return;
  }

  if (existing.last_activity_date === today) return; // already counted today

  const gap = existing.last_activity_date ? daysBetween(existing.last_activity_date, today) : null;
  const nextStreak = gap === 1 ? existing.current_streak + 1 : 1;

  await supabase
    .from("streaks")
    .update({
      current_streak: nextStreak,
      longest_streak: Math.max(existing.longest_streak, nextStreak),
      last_activity_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
