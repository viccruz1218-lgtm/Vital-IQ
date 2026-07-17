import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function daysAgoDateOnly(n: number) {
  return toDateOnly(new Date(daysAgo(n)));
}

const COMEBACK_FOLLOWUP_WINDOW_DAYS = 3;

export interface AdminMetrics {
  totalAlphaUsers: number;
  dau: number;
  wau: number;
  weeklyConsistencyRate: number;
  weeklyConsistencyRatePreviousWeek: number;
  habitCompletionPct: number;
  workoutCompletionPct: number;
  averageMomentum: number | null;
  comebackSuccessRate: number | null;
  comebackMessagesSent: number;
  freeToProConversionPct: number;
}

// All aggregates are computed cohort-wide (across every alpha user with
// onboarding_completed = true), not averaged per-user — a straight ratio of
// totals is the more honest read at 40-user scale, where a couple of users
// with very few habits would otherwise skew a per-user average.
export async function getAdminMetrics(supabase: SupabaseClient<Database>): Promise<AdminMetrics> {
  const today = toDateOnly(new Date());
  const weekAgo = daysAgoDateOnly(7);
  const oneDayAgoIso = daysAgo(1);
  const oneWeekAgoIso = daysAgo(7);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, schedule_days_per_week")
    .eq("onboarding_completed", true);
  const userIds = (profiles ?? []).map((p) => p.id);
  const totalAlphaUsers = userIds.length;

  if (totalAlphaUsers === 0) {
    return {
      totalAlphaUsers: 0,
      dau: 0,
      wau: 0,
      weeklyConsistencyRate: 0,
      weeklyConsistencyRatePreviousWeek: 0,
      habitCompletionPct: 0,
      workoutCompletionPct: 0,
      averageMomentum: null,
      comebackSuccessRate: null,
      comebackMessagesSent: 0,
      freeToProConversionPct: 0,
    };
  }

  // --- DAU / WAU: distinct users with ANY analytics event in the window.
  const [{ data: dailyEvents }, { data: weeklyEvents }] = await Promise.all([
    supabase.from("analytics_events").select("user_id").gte("created_at", oneDayAgoIso),
    supabase.from("analytics_events").select("user_id").gte("created_at", oneWeekAgoIso),
  ]);
  const dau = new Set((dailyEvents ?? []).map((e) => e.user_id)).size;
  const wau = new Set((weeklyEvents ?? []).map((e) => e.user_id)).size;

  // --- Habit completion %: completions this week / planned (sum of active
  // habit frequencies) across the cohort.
  const { data: habits } = await supabase
    .from("habits")
    .select("id, user_id, frequency")
    .eq("status", "active")
    .in("user_id", userIds);
  const habitIds = (habits ?? []).map((h) => h.id);
  const habitsPlanned = (habits ?? []).reduce((sum, h) => sum + h.frequency, 0);

  const { count: habitsCompletedCount } =
    habitIds.length > 0
      ? await supabase
          .from("habit_completion")
          .select("id", { count: "exact", head: true })
          .in("habit_id", habitIds)
          .eq("completed", true)
          .gte("date", weekAgo)
          .lte("date", today)
      : { count: 0 };
  const habitsCompleted = habitsCompletedCount ?? 0;
  const habitCompletionPct = habitsPlanned > 0 ? Math.min(100, Math.round((habitsCompleted / habitsPlanned) * 100)) : 0;

  // --- Workout completion %: distinct (user, day) workout sessions this week
  // / planned (sum of each user's schedule_days_per_week, default 3).
  const workoutsPlanned = (profiles ?? []).reduce((sum, p) => sum + (p.schedule_days_per_week || 3), 0);
  const { data: workoutLogs } = await supabase
    .from("workout_logs")
    .select("user_id, performed_at")
    .in("user_id", userIds)
    .gte("performed_at", weekAgo);
  const workoutDaysCompleted = new Set((workoutLogs ?? []).map((w) => `${w.user_id}|${w.performed_at.slice(0, 10)}`))
    .size;
  const workoutCompletionPct =
    workoutsPlanned > 0 ? Math.min(100, Math.round((workoutDaysCompleted / workoutsPlanned) * 100)) : 0;

  // --- Weekly Consistency Rate: the blended North Star metric — habits and
  // workout sessions are both "commitments" toward the same weekly promise.
  const totalPlanned = habitsPlanned + workoutsPlanned;
  const totalCompleted = habitsCompleted + workoutDaysCompleted;
  const weeklyConsistencyRate = totalPlanned > 0 ? Math.min(100, Math.round((totalCompleted / totalPlanned) * 100)) : 0;

  // --- Same metric, previous 8-day window (immediately preceding the one
  // above) — the one comparison the admin dashboard was missing to actually
  // answer "is VitalIQ changing behavior over time?" rather than just
  // showing a single snapshot. Uses today's planned counts as the
  // denominator for both windows since historical "planned" snapshots
  // aren't tracked — an accepted simplification, same one admin-users.ts
  // already makes for per-user WCR.
  const previousWeekStart = daysAgoDateOnly(15);
  const previousWeekEnd = daysAgoDateOnly(8);
  const { count: habitsCompletedPreviousCount } =
    habitIds.length > 0
      ? await supabase
          .from("habit_completion")
          .select("id", { count: "exact", head: true })
          .in("habit_id", habitIds)
          .eq("completed", true)
          .gte("date", previousWeekStart)
          .lte("date", previousWeekEnd)
      : { count: 0 };
  const { data: previousWorkoutLogs } = await supabase
    .from("workout_logs")
    .select("user_id, performed_at")
    .in("user_id", userIds)
    .gte("performed_at", previousWeekStart)
    .lte("performed_at", previousWeekEnd);
  const previousWorkoutDaysCompleted = new Set(
    (previousWorkoutLogs ?? []).map((w) => `${w.user_id}|${w.performed_at.slice(0, 10)}`),
  ).size;
  const previousTotalCompleted = (habitsCompletedPreviousCount ?? 0) + previousWorkoutDaysCompleted;
  const weeklyConsistencyRatePreviousWeek =
    totalPlanned > 0 ? Math.min(100, Math.round((previousTotalCompleted / totalPlanned) * 100)) : 0;

  // --- Average Momentum: each user's most recent score (not strictly
  // "today", since the nightly cron may not have run yet for the day).
  const { data: momentumRows } = await supabase
    .from("momentum_scores")
    .select("user_id, total_score, score_date")
    .in("user_id", userIds)
    .order("score_date", { ascending: false });
  const latestByUser = new Map<string, number>();
  for (const row of momentumRows ?? []) {
    if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row.total_score);
  }
  const momentumValues = [...latestByUser.values()];
  const averageMomentum =
    momentumValues.length > 0 ? Math.round(momentumValues.reduce((a, b) => a + b, 0) / momentumValues.length) : null;

  // --- Comeback success rate: of every comeback message ever sent, what %
  // had ANY other activity event within the follow-up window afterward.
  const { data: comebackEvents } = await supabase
    .from("analytics_events")
    .select("user_id, created_at")
    .eq("event_name", "comeback_message_sent");
  let comebackSuccesses = 0;
  for (const c of comebackEvents ?? []) {
    if (!c.user_id) continue;
    const followUpDeadline = new Date(new Date(c.created_at).getTime() + COMEBACK_FOLLOWUP_WINDOW_DAYS * 86_400_000).toISOString();
    const { count } = await supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", c.user_id)
      .neq("event_name", "comeback_message_sent")
      .gt("created_at", c.created_at)
      .lte("created_at", followUpDeadline);
    if ((count ?? 0) > 0) comebackSuccesses += 1;
  }
  const comebackMessagesSent = (comebackEvents ?? []).length;
  const comebackSuccessRate =
    comebackMessagesSent > 0 ? Math.round((comebackSuccesses / comebackMessagesSent) * 100) : null;

  // --- Free -> Pro conversion: cohort users with an active/trialing sub.
  const { data: subs } = await supabase.from("subscriptions").select("user_id, status").in("user_id", userIds);
  const proCount = (subs ?? []).filter((s) => s.status === "active" || s.status === "trialing").length;
  const freeToProConversionPct = Math.round((proCount / totalAlphaUsers) * 100);

  return {
    totalAlphaUsers,
    dau,
    wau,
    weeklyConsistencyRate,
    weeklyConsistencyRatePreviousWeek,
    habitCompletionPct,
    workoutCompletionPct,
    averageMomentum,
    comebackSuccessRate,
    comebackMessagesSent,
    freeToProConversionPct,
  };
}
