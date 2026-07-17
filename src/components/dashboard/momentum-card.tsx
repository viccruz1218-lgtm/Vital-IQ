import { Card, CardLabel } from "@/components/ui/card";
import type { MomentumScore } from "@/types/database";

const PILLARS: { key: keyof MomentumScore; label: string }[] = [
  { key: "training_score", label: "Training" },
  { key: "habits_score", label: "Habits" },
  { key: "nutrition_score", label: "Nutrition" },
  { key: "consistency_score", label: "Consistency" },
];

export function MomentumCard({ score }: { score: MomentumScore | null }) {
  return (
    <Card>
      <CardLabel>Vital Momentum Score</CardLabel>
      <div className="mt-1 font-mono text-3xl text-pulse">
        {score?.total_score ?? "—"}
        <span className="text-base text-muted">/100</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {PILLARS.map((p) => {
          const value = score ? (score[p.key] as number) : 0;
          return (
            <div key={p.key} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-2 text-xs">
              <span className="text-muted">{p.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full bg-moss" style={{ width: `${Math.min(100, value)}%` }} />
              </span>
              <span className="text-right font-mono text-muted">{value}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
