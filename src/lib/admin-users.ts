import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExperimentGroup, SubscriptionStatus } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgoDateOnly(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return toDateOnly(d);
}

function daysSince(dateOnly: string | null): number | null {
  if (!dateOnly) return null;
  const msPerDay = 86_400_000;
  return Math.max(0, Math.round((Date.now() - new Date(dateOnly + "T00:00:00Z").getTime()) / msPerDay));
}

export interface FounderUserRow {
  id: string;
  email: string;
  full_name: string | null;
  signup_date: string;
  experiment_group: ExperimentGroup;
  weekly_consistency_pct: number;
  current_momentum: number | null;
  days_since_workout: number | null;
  days_since_check_in: number | null;
  last_active: string | null;
  subscription_status: SubscriptionStatus;
}

// Founder-only, per-user rollup for the alpha ops dashboard. Computed live
// from source tables rather than the nightly-recomputed days_since_events —
// this view is for a founder watching for churn signals, so freshness
// matters more here than it does for the once-a-night Comeback System.
export async function getFounderUserRows(supabase: SupabaseClient<Database>): Promise<FounderUserRow[]> {
  const weekAgo = daysAgoDateOnly(7);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, created_at, experiment_group, schedule_days_per_week")
    .eq("onboarding_completed", true);

  const userIds = (profiles ?? []).map((p) => p.id);
  if (userIds.length === 0) return [];

  const [
    { data: habits },
    { data: workoutLogsAll },
    { data: checkInsAll },
    { data: momentumRows },
    { data: subs },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from("habits").select("id, user_id, frequency").eq("status", "active").in("user_id", userIds),
    supabase.from("workout_logs").select("user_id, performed_at").in("user_id", userIds).order("performed_at", { ascending: false }),
    supabase.from("check_ins").select("user_id, check_in_date").in("user_id", userIds).order("check_in_date", { ascending: false }),
    supabase.from("momentum_scores").select("user_id, total_score, score_date").in("user_id", userIds).order("score_date", { ascending: false }),
    supabase.from("subscriptions").select("user_id, status").in("user_id", userIds),
    supabase.from("analytics_events").select("user_id, created_at").in("user_id", userIds).order("created_at", { ascending: false }).limit(5000),
  ]);

  const habitIds = (habits ?? []).map((h) => h.id);
  const { data: recentCompletions } =
    habitIds.length > 0
      ? await supabase
          .from("habit_completion")
          .select("habit_id, date")
          .in("habit_id", habitIds)
          .eq("completed", true)
          .gte("date", weekAgo)
      : { data: [] };

  const habitIdToUser = new Map((habits ?? []).map((h) => [h.id, h.user_id]));
  const plannedHabitsByUser = new Map<string, number>();
  for (const h of habits ?? []) plannedHabitsByUser.set(h.user_id, (plannedHabitsByUser.get(h.user_id) ?? 0) + h.frequency);

  const completedHabitsByUser = new Map<string, number>();
  for (const c of recentCompletions ?? []) {
    const userId = habitIdToUser.get(c.habit_id);
    if (!userId) continue;
    completedHabitsByUser.set(userId, (completedHabitsByUser.get(userId) ?? 0) + 1);
  }

  const workoutDaysByUser = new Map<string, Set<string>>();
  const lastWorkoutByUser = new Map<string, string>();
  for (const w of workoutLogsAll ?? []) {
    const dateOnly = w.performed_at.slice(0, 10);
    if (dateOnly >= weekAgo) {
      const set = workoutDaysByUser.get(w.user_id) ?? new Set<string>();
      set.add(dateOnly);
      workoutDaysByUser.set(w.user_id, set);
    }
    if (!lastWorkoutByUser.has(w.user_id)) lastWorkoutByUser.set(w.user_id, dateOnly);
  }

  const lastCheckInByUser = new Map<string, string>();
  for (const c of checkInsAll ?? []) {
    if (!lastCheckInByUser.has(c.user_id)) lastCheckInByUser.set(c.user_id, c.check_in_date);
  }

  const momentumByUser = new Map<string, number>();
  for (const m of momentumRows ?? []) {
    if (!momentumByUser.has(m.user_id)) momentumByUser.set(m.user_id, m.total_score);
  }

  const subscriptionByUser = new Map<string, SubscriptionStatus>();
  for (const s of subs ?? []) subscriptionByUser.set(s.user_id, s.status);

  const lastActiveByUser = new Map<string, string>();
  for (const e of recentEvents ?? []) {
    if (e.user_id && !lastActiveByUser.has(e.user_id)) lastActiveByUser.set(e.user_id, e.created_at);
  }

  return (profiles ?? []).map((p) => {
    const plannedHabits = plannedHabitsByUser.get(p.id) ?? 0;
    const completedHabits = completedHabitsByUser.get(p.id) ?? 0;
    const plannedWorkouts = p.schedule_days_per_week || 3;
    const completedWorkouts = workoutDaysByUser.get(p.id)?.size ?? 0;
    const totalPlanned = plannedHabits + plannedWorkouts;
    const totalCompleted = completedHabits + completedWorkouts;

    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      signup_date: p.created_at,
      experiment_group: p.experiment_group,
      weekly_consistency_pct: totalPlanned > 0 ? Math.min(100, Math.round((totalCompleted / totalPlanned) * 100)) : 0,
      current_momentum: momentumByUser.get(p.id) ?? null,
      days_since_workout: daysSince(lastWorkoutByUser.get(p.id) ?? null),
      days_since_check_in: daysSince(lastCheckInByUser.get(p.id) ?? null),
      last_active: lastActiveByUser.get(p.id) ?? null,
      subscription_status: subscriptionByUser.get(p.id) ?? "none",
    };
  });
}
