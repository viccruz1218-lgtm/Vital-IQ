import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import type { MomentumScore } from "@/types/database";

const PILLARS: { key: keyof MomentumScore; label: string }[] = [
  { key: "training_score", label: "Training" },
  { key: "habits_score", label: "Habits" },
  { key: "nutrition_score", label: "Nutrition" },
  { key: "recovery_score", label: "Recovery" },
  { key: "consistency_score", label: "Consistency" },
];

export function MomentumCard({ score }: { score: MomentumScore | null }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardLabel>Vital Momentum Score</CardLabel>
        <Link href="/dashboard/momentum" className="text-xs text-muted underline hover:text-foreground">
          Trend
        </Link>
      </div>
      <div className="mt-1 font-mono text-3xl text-pulse">
        {score?.total_score ?? "—"}
        <span className="text-base text-muted">/100</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {PILLARS.map((p) => {
          const raw = score ? (score[p.key] as number | null) : null;
          return (
            <div key={p.key} className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="text-muted">{p.label}</span>
              {raw === null ? (
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-2" />
              ) : (
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full bg-moss" style={{ width: `${Math.min(100, raw)}%` }} />
                </span>
              )}
              <span className="text-right font-mono text-muted">{raw === null ? "—" : raw}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
