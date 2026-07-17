"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardLabel } from "@/components/ui/card";
import type { PlanExercise } from "@/types/database";

interface SetRow {
  reps: string;
  weight: string;
}

interface OverloadResult {
  exercise_name: string;
  previousBest: { reps: number; weight_kg: number } | null;
  thisSessionBest: { reps: number; weight_kg: number } | null;
}

interface Props {
  planDayId: string;
  dayLabel: string;
  exercises: PlanExercise[];
}

export function WorkoutLogger({ planDayId, dayLabel, exercises }: Props) {
  const router = useRouter();
  const [sets, setSets] = useState<Record<string, SetRow[]>>(() =>
    Object.fromEntries(
      exercises.map((ex) => [
        ex.id,
        Array.from({ length: ex.target_sets }, () => ({ reps: "", weight: "" })),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ overload: OverloadResult[] } | null>(null);

  function updateSet(exId: string, index: number, field: keyof SetRow, value: string) {
    setSets((prev) => {
      const next = { ...prev, [exId]: [...prev[exId]] };
      next[exId][index] = { ...next[exId][index], [field]: value };
      return next;
    });
  }

  function addSet(exId: string) {
    setSets((prev) => ({ ...prev, [exId]: [...prev[exId], { reps: "", weight: "" }] }));
  }

  async function finish() {
    setSaving(true);
    const payload = exercises.flatMap((ex) =>
      sets[ex.id]
        .filter((s) => s.reps !== "" && s.weight !== "")
        .map((s, i) => ({
          exercise_name: ex.exercise_name,
          set_number: i + 1,
          reps: Number(s.reps),
          weight_kg: Number(s.weight),
        })),
    );

    if (payload.length === 0) {
      setSaving(false);
      return;
    }

    const res = await fetch("/api/workouts/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planDayId, sets: payload }),
    });
    const data = await res.json();
    setResult(data);
    setSaving(false);
    router.refresh();
  }

  if (result) {
    return (
      <Card>
        <CardLabel>Session logged</CardLabel>
        <h3 className="mt-1 mb-3 font-display text-lg">{dayLabel} — done</h3>
        <ul className="space-y-2 text-sm">
          {result.overload.map((o) => {
            const improved =
              o.previousBest && o.thisSessionBest && o.thisSessionBest.weight_kg > o.previousBest.weight_kg;
            return (
              <li key={o.exercise_name}>
                <span className="font-medium">{o.exercise_name}</span>
                {o.previousBest ? (
                  <span className={improved ? "text-pulse" : "text-muted"}>
                    {" "}
                    — {o.thisSessionBest?.weight_kg}kg today vs {o.previousBest.weight_kg}kg last time
                    {improved ? " · new best" : ""}
                  </span>
                ) : (
                  <span className="text-muted"> — first time logging this one</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">{dayLabel}</h1>
      {exercises.map((ex) => (
        <Card key={ex.id}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-medium">{ex.exercise_name}</h3>
            <span className="font-mono text-xs text-muted">
              target {ex.target_sets} × {ex.target_reps}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {sets[ex.id].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
                <Input
                  className="w-20"
                  inputMode="numeric"
                  placeholder="reps"
                  value={s.reps}
                  onChange={(e) => updateSet(ex.id, i, "reps", e.target.value)}
                />
                <Input
                  className="w-24"
                  inputMode="decimal"
                  placeholder="kg"
                  value={s.weight}
                  onChange={(e) => updateSet(ex.id, i, "weight", e.target.value)}
                />
              </div>
            ))}
            <button
              onClick={() => addSet(ex.id)}
              className="w-fit text-xs text-muted underline"
              type="button"
            >
              + add set
            </button>
          </div>
        </Card>
      ))}
      <Button onClick={finish} disabled={saving} size="lg">
        {saving ? "Saving…" : "Finish workout"}
      </Button>
    </div>
  );
}
