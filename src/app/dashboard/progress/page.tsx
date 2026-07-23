import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMomentumHistory } from "@/lib/momentum";
import { getExerciseHistory } from "@/lib/overload";
import { getWeeklyReviewHistory } from "@/lib/weekly-review";
import { Card, CardLabel } from "@/components/ui/card";
import { WeightLogForm } from "@/components/dashboard/weight-log-form";

// A single composed view over data that otherwise lives on 4 separate pages
// (Momentum, Weekly Review, Workout History, Check-in) — this doesn't
// replace those pages, it's a summary with links out to each for the full
// detail. Weight tracking (new — see migration 0010) lives only here.
export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: streak }, { data: weightLogs }, { data: recentSessions }] = await Promise.all([
    supabase.from("profiles").select("experiment_group").eq("id", user.id).single(),
    supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("weight_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("logged_date", { ascending: true })
      .limit(60),
    supabase
      .from("workout_logs")
      .select("id, performed_at, set_logs(exercise_name, reps, weight_kg)")
      .eq("user_id", user.id)
      .order("performed_at", { ascending: false })
      .limit(10),
  ]);

  const isFull = profile?.experiment_group !== "control";

  const [momentumHistory, weeklyReviews] = await Promise.all([
    isFull ? getMomentumHistory(supabase, user.id, 30) : Promise.resolve([]),
    isFull ? getWeeklyReviewHistory(supabase, user.id, 8) : Promise.resolve([]),
  ]);

  const exerciseNames = Array.from(
    new Set((recentSessions ?? []).flatMap((s) => s.set_logs.map((set) => set.exercise_name))),
  ).slice(0, 3);
  const overloadTrends = await Promise.all(
    exerciseNames.map(async (name) => ({ name, history: await getExerciseHistory(supabase, user.id, name) })),
  );

  const weights = weightLogs ?? [];
  const latestWeight = weights.at(-1)?.weight_kg ?? null;
  const weightMin = weights.length > 0 ? Math.min(...weights.map((w) => w.weight_kg)) : 0;
  const weightMax = weights.length > 0 ? Math.max(...weights.map((w) => w.weight_kg)) : 0;
  const weightRange = Math.max(1, weightMax - weightMin);

  const momentumMax = Math.max(100, ...momentumHistory.map((h) => h.total_score));
  const currentMomentum = momentumHistory.at(-1) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Progress</h1>
        <p className="text-sm text-muted">Workout history, weight, momentum, and consistency in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardLabel>Streak</CardLabel>
          <div className="mt-1 font-mono text-3xl text-pulse">{streak?.current_streak ?? 0}</div>
          <div className="text-xs text-muted">days · best {streak?.longest_streak ?? 0}</div>
        </Card>
        {isFull ? (
          <Card>
            <CardLabel>Momentum</CardLabel>
            <div className="mt-1 font-mono text-3xl">
              {currentMomentum ? currentMomentum.total_score : "—"}
              <span className="text-lg text-muted">/100</span>
            </div>
            <Link href="/dashboard/momentum" className="text-xs text-muted underline">
              Full breakdown
            </Link>
          </Card>
        ) : (
          <Card>
            <CardLabel>Consistency rate</CardLabel>
            <div className="mt-1 font-mono text-3xl">{weeklyReviews[0]?.consistency_rate ?? "—"}%</div>
            <div className="text-xs text-muted">last completed week</div>
          </Card>
        )}
      </div>

      {isFull && momentumHistory.length > 0 && (
        <Card>
          <CardLabel>Momentum trend — last {momentumHistory.length} days</CardLabel>
          <div className="mt-3 flex h-24 items-end gap-1">
            {momentumHistory.map((h) => (
              <div key={h.score_date} className="flex h-full flex-1 items-end" title={`${h.score_date}: ${h.total_score}`}>
                <div
                  className="w-full rounded-t bg-pulse"
                  style={{ height: `${Math.max(2, (h.total_score / momentumMax) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <CardLabel>Weight</CardLabel>
          {latestWeight && <span className="font-mono text-sm text-muted">{latestWeight}kg latest</span>}
        </div>
        <WeightLogForm latestWeightKg={latestWeight} />
        {weights.length > 1 ? (
          <div className="mt-4 flex h-20 items-end gap-1">
            {weights.map((w) => (
              <div key={w.id} className="flex h-full flex-1 items-end" title={`${w.logged_date}: ${w.weight_kg}kg`}>
                <div
                  className="w-full rounded-t bg-moss"
                  style={{ height: `${Math.max(4, ((w.weight_kg - weightMin) / weightRange) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Log your weight a few times to start seeing a trend.</p>
        )}
      </Card>

      <Card>
        <CardLabel>Workout history</CardLabel>
        {overloadTrends.filter((t) => t.history.length > 1).length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {recentSessions && recentSessions.length > 0
              ? "Log one more session to start seeing progress trends here."
              : "No sessions logged yet."}
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {overloadTrends
              .filter((t) => t.history.length > 1)
              .map((t) => {
                const first = t.history[0];
                const last = t.history[t.history.length - 1];
                const delta = last.maxWeight - first.maxWeight;
                return (
                  <div key={t.name} className="flex items-baseline justify-between text-sm">
                    <span>{t.name}</span>
                    <span className={`font-mono ${delta > 0 ? "text-pulse" : "text-muted"}`}>
                      {delta > 0 ? "+" : ""}
                      {delta}kg since first logged
                    </span>
                  </div>
                );
              })}
          </div>
        )}
        <Link href="/dashboard/workout/history" className="mt-3 inline-block text-xs text-muted underline">
          Full session history
        </Link>
      </Card>

      {isFull && (
        <Card>
          <CardLabel>Consistency — recent weeks</CardLabel>
          {weeklyReviews.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No completed weeks yet.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {weeklyReviews.map((r) => (
                <div key={r.week_start} className="flex justify-between">
                  <span className="text-muted">{r.week_start}</span>
                  <span className="font-mono">{r.consistency_rate}%</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/weekly-review" className="mt-3 inline-block text-xs text-muted underline">
            Full weekly reviews
          </Link>
        </Card>
      )}
    </div>
  );
}
