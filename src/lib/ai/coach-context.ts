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

export interface CoachContext {
  streak: { current_streak: number; longest_streak: number } | null;
  momentum: { total_score: number; score_date: string } | null;
  recent_workouts: { performed_at: string; exercises: string[] }[];
  habits: { name: string; category: string; current_streak: number; completed_today: boolean }[];
}

// Snapshot of what actually happened recently, injected into the coach
// chat's system prompt (see coachSystemPrompt) so Vi can reference real
// data instead of being told to "reference history" it was never given.
// Unlike aggregateWeeklyData (src/lib/weekly-review.ts), which scopes to
// one already-completed week for the AI-authored review, this is a rolling
// recent-activity view for an ongoing conversation.
export async function aggregateCoachContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CoachContext> {
  const since = daysAgo(14);
  const today = toDateOnly(new Date());

  const [{ data: streak }, { data: momentum }, { data: logs }, { data: habits }] = await Promise.all([
    supabase.from("streaks").select("current_streak, longest_streak").eq("user_id", userId).maybeSingle(),
    supabase
      .from("momentum_scores")
      .select("total_score, score_date")
      .eq("user_id", userId)
      .order("score_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_logs")
      .select("performed_at, set_logs(exercise_name)")
      .eq("user_id", userId)
      .gte("performed_at", since)
      .order("performed_at", { ascending: false })
      .limit(5),
    supabase
      .from("habits")
      .select("id, name, category, current_streak")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const habitIds = (habits ?? []).map((h) => h.id);
  const { data: completions } =
    habitIds.length > 0
      ? await supabase
          .from("habit_completion")
          .select("habit_id")
          .in("habit_id", habitIds)
          .eq("date", today)
          .eq("completed", true)
      : { data: [] };
  const completedToday = new Set((completions ?? []).map((c) => c.habit_id));

  return {
    streak: streak ?? null,
    momentum: momentum ?? null,
    recent_workouts: (logs ?? []).map((l) => ({
      performed_at: l.performed_at,
      exercises: Array.from(new Set(l.set_logs.map((s) => s.exercise_name))),
    })),
    habits: (habits ?? []).map((h) => ({
      name: h.name,
      category: h.category,
      current_streak: h.current_streak,
      completed_today: completedToday.has(h.id),
    })),
  };
}
