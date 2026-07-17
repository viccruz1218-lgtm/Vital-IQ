import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTodaysWorkout } from "@/lib/todays-workout";
import { Card, CardLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MomentumCard } from "@/components/dashboard/momentum-card";
import { DaysSinceCard } from "@/components/dashboard/days-since-card";
import { HabitChecklist } from "@/components/dashboard/habit-checklist";
import { track } from "@/lib/analytics";
import type { DaysSinceEvent, Habit, MomentumScore } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await track(supabase, user.id, "app_opened", { surface: "dashboard" });

  const [{ data: profile }, { data: streak }, todaysWorkout, { data: lastCoachMsg }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
    getTodaysWorkout(supabase, user.id),
    supabase
      .from("chat_messages")
      .select("content")
      .eq("user_id", user.id)
      .eq("context", "coach")
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const { count: sessionsThisWeek } = await supabase
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("performed_at", weekStart.toISOString().slice(0, 10));

  const targetDays = profile?.schedule_days_per_week ?? 3;
  const adherencePct = Math.min(100, Math.round(((sessionsThisWeek ?? 0) / targetDays) * 100));
  const isFull = profile?.experiment_group !== "control";

  // Consistency-engine data only fetched/rendered for the "full" arm — the
  // control arm sees the pre-existing workout-tracking experience only.
  let momentumScore: MomentumScore | null = null;
  let daysSinceEvents: DaysSinceEvent[] = [];
  let habitsWithStatus: (Habit & { completedToday: boolean })[] = [];

  if (isFull) {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: score }, { data: events }, { data: habits }] = await Promise.all([
      supabase.from("momentum_scores").select("*").eq("user_id", user.id).eq("score_date", today).maybeSingle(),
      supabase.from("days_since_events").select("*").eq("user_id", user.id),
      supabase.from("habits").select("*").eq("user_id", user.id).eq("status", "active"),
    ]);

    momentumScore = score ?? null;
    daysSinceEvents = events ?? [];
    if (momentumScore) {
      await track(supabase, user.id, "momentum_viewed", { total_score: momentumScore.total_score });
    }

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
    const completedIds = new Set((completions ?? []).map((c) => c.habit_id));
    habitsWithStatus = (habits ?? []).map((h) => ({ ...h, completedToday: completedIds.has(h.id) }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">
          {profile?.full_name ? `Welcome back, ${profile.full_name}` : "Welcome back"}
        </h1>
        <p className="text-sm text-muted">Here&rsquo;s where things stand today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardLabel>Streak</CardLabel>
          <div className="mt-1 font-mono text-3xl text-pulse">{streak?.current_streak ?? 0}</div>
          <div className="text-xs text-muted">days · best {streak?.longest_streak ?? 0}</div>
        </Card>
        <Card>
          <CardLabel>This week</CardLabel>
          <div className="mt-1 font-mono text-3xl">{adherencePct}%</div>
          <div className="text-xs text-muted">
            {sessionsThisWeek ?? 0} of {targetDays} sessions
          </div>
        </Card>
        <Card>
          <CardLabel>Goal</CardLabel>
          <div className="mt-1 text-sm capitalize">{(profile?.goal ?? "—").replaceAll("_", " ")}</div>
          <div className="text-xs text-muted capitalize">{profile?.fitness_level ?? ""}</div>
        </Card>
      </div>

      {isFull && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MomentumCard score={momentumScore} />
          <DaysSinceCard events={daysSinceEvents} />
        </div>
      )}

      <Card>
        <CardLabel>Today&rsquo;s workout</CardLabel>
        {todaysWorkout ? (
          <>
            <h3 className="mt-1 mb-2 font-display text-lg">{todaysWorkout.day.day_label}</h3>
            <ul className="mb-3 space-y-1 text-sm text-muted">
              {todaysWorkout.day.plan_exercises.map((ex) => (
                <li key={ex.id}>
                  {ex.exercise_name} — {ex.target_sets} × {ex.target_reps}
                </li>
              ))}
            </ul>
            <Link href="/dashboard/workout">
              <Button size="sm">Start session</Button>
            </Link>
          </>
        ) : isFull ? (
          <div className="mt-2">
            <p className="mb-3 text-sm text-muted">No active plan yet — ask Vi to build one.</p>
            <Link href="/dashboard/coach">
              <Button size="sm">Talk to Vi</Button>
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No active plan yet.</p>
        )}
      </Card>

      {isFull && (
        <>
          <HabitChecklist habits={habitsWithStatus} />

          <Card>
            <CardLabel>From Vi</CardLabel>
            <p className="mt-1 text-sm">
              {lastCoachMsg?.content ?? "Say hi to Vi to get a plan built and start getting daily coaching."}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
