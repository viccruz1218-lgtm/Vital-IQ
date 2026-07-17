import { createClient } from "@/lib/supabase/server";
import { getMomentumHistory } from "@/lib/momentum";
import { requireFullExperience } from "@/lib/experiment";
import { Card, CardLabel } from "@/components/ui/card";
import type { MomentumScore } from "@/types/database";

const PILLARS: { key: keyof MomentumScore; label: string; weight: string }[] = [
  { key: "training_score", label: "Training", weight: "25%" },
  { key: "habits_score", label: "Habits", weight: "25%" },
  { key: "nutrition_score", label: "Nutrition", weight: "20%" },
  { key: "recovery_score", label: "Recovery", weight: "20%" },
  { key: "consistency_score", label: "Consistency", weight: "10%" },
];

function pillarValue(score: MomentumScore, key: keyof MomentumScore): number | null {
  return score[key] as number | null;
}

export default async function MomentumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await requireFullExperience(supabase, user.id);

  const history = await getMomentumHistory(supabase, user.id, 30);
  const current = history.at(-1) ?? null;
  const previous = history.length > 1 ? history[history.length - 2] : null;

  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-xl font-semibold">Momentum</h1>
        <Card>
          <p className="text-sm text-muted">
            No score yet — log a workout, complete a habit, or check in to get your first Momentum Score.
          </p>
        </Card>
      </div>
    );
  }

  const improved: { label: string; delta: number }[] = [];
  const dropped: { label: string; delta: number }[] = [];
  if (previous) {
    for (const p of PILLARS) {
      const now = pillarValue(current, p.key);
      const before = pillarValue(previous, p.key);
      if (now === null || before === null) continue;
      const delta = now - before;
      if (delta > 0) improved.push({ label: p.label, delta });
      else if (delta < 0) dropped.push({ label: p.label, delta });
    }
  }

  const maxScore = Math.max(100, ...history.map((h) => h.total_score));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Momentum</h1>
        <p className="text-sm text-muted">Deterministic — computed from your logged activity, not by Vi.</p>
      </div>

      <Card>
        <CardLabel>Current score</CardLabel>
        <div className="mt-1 font-mono text-4xl text-pulse">
          {current.total_score}
          <span className="text-lg text-muted">/100</span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {PILLARS.map((p) => {
            const value = pillarValue(current, p.key);
            return (
              <div key={p.key} className="grid grid-cols-[6rem_1fr_2.5rem_3rem] items-center gap-2 text-sm">
                <span className="text-muted">{p.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  {value !== null && (
                    <span className="block h-full bg-moss" style={{ width: `${Math.min(100, value)}%` }} />
                  )}
                </span>
                <span className="text-right font-mono">{value === null ? "—" : value}</span>
                <span className="text-right font-mono text-xs text-muted">{p.weight}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {previous && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardLabel>What improved</CardLabel>
            {improved.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing moved up since last time.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {improved.map((i) => (
                  <li key={i.label} className="flex justify-between">
                    <span>{i.label}</span>
                    <span className="font-mono text-moss">+{i.delta}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardLabel>What dropped</CardLabel>
            {dropped.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing dropped since last time.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {dropped.map((d) => (
                  <li key={d.label} className="flex justify-between">
                    <span>{d.label}</span>
                    <span className="font-mono text-pulse">{d.delta}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card>
        <CardLabel>Trend — last {history.length} day{history.length === 1 ? "" : "s"}</CardLabel>
        <div className="mt-3 flex h-32 items-end gap-1">
          {history.map((h) => (
            <div
              key={h.score_date}
              className="flex h-full flex-1 items-end"
              title={`${h.score_date}: ${h.total_score}`}
            >
              <div
                className="w-full rounded-t bg-pulse"
                style={{ height: `${Math.max(2, (h.total_score / maxScore) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs text-muted">
          <span>{history[0]?.score_date}</span>
          <span>{current.score_date}</span>
        </div>
      </Card>
    </div>
  );
}
