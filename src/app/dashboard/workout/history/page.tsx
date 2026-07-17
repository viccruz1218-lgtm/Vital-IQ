import { createClient } from "@/lib/supabase/server";
import { getExerciseHistory } from "@/lib/overload";
import { Card, CardLabel } from "@/components/ui/card";

export default async function WorkoutHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: logs } = await supabase
    .from("workout_logs")
    .select("id, performed_at, set_logs(exercise_name, set_number, reps, weight_kg)")
    .eq("user_id", user.id)
    .order("performed_at", { ascending: false })
    .limit(20);

  const exerciseNames = Array.from(
    new Set((logs ?? []).flatMap((l) => l.set_logs.map((s) => s.exercise_name))),
  );

  const trends = await Promise.all(
    exerciseNames.map(async (name) => ({
      name,
      history: await getExerciseHistory(supabase, user.id, name),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">History</h1>
        <p className="text-sm text-muted">Progressive overload, tracked automatically per exercise.</p>
      </div>

      <div className="grid gap-4">
        {trends
          .filter((t) => t.history.length > 1)
          .map((t) => {
            const first = t.history[0];
            const last = t.history[t.history.length - 1];
            const delta = last.maxWeight - first.maxWeight;
            return (
              <Card key={t.name}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-medium">{t.name}</h3>
                  <span className={`font-mono text-sm ${delta > 0 ? "text-pulse" : "text-muted"}`}>
                    {delta > 0 ? "+" : ""}
                    {delta}kg since first logged
                  </span>
                </div>
                <div className="mt-2 flex gap-3 overflow-x-auto font-mono text-xs text-muted">
                  {t.history.map((point) => (
                    <div key={point.date} className="flex flex-col items-center">
                      <span className="text-foreground">{point.maxWeight}kg</span>
                      <span>{point.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
      </div>

      <div>
        <CardLabel>Sessions</CardLabel>
        <div className="mt-2 flex flex-col gap-2">
          {(logs ?? []).map((log) => (
            <Card key={log.id}>
              <div className="mb-1 font-mono text-xs text-muted">{log.performed_at}</div>
              <ul className="text-sm">
                {log.set_logs.map((s, i) => (
                  <li key={i}>
                    {s.exercise_name}: {s.reps} × {s.weight_kg}kg
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {(!logs || logs.length === 0) && (
            <p className="text-sm text-muted">No sessions logged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
