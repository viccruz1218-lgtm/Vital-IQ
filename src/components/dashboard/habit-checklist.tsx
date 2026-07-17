"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardLabel } from "@/components/ui/card";
import type { Habit } from "@/types/database";

interface HabitWithStatus extends Habit {
  completedToday: boolean;
}

export function HabitChecklist({ habits }: { habits: HabitWithStatus[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());
  const [justUndone, setJustUndone] = useState<Set<string>>(new Set());
  const [errorHabitId, setErrorHabitId] = useState<string | null>(null);

  async function toggle(habitId: string, currentlyDone: boolean) {
    if (pending) return;
    setPending(habitId);
    setErrorHabitId(null);
    try {
      const res = await fetch(`/api/habits/${habitId}/complete`, { method: currentlyDone ? "DELETE" : "POST" });
      if (!res.ok) throw new Error("failed");
      if (currentlyDone) {
        setJustUndone((prev) => new Set(prev).add(habitId));
        setJustCompleted((prev) => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
      } else {
        setJustCompleted((prev) => new Set(prev).add(habitId));
        setJustUndone((prev) => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
      }
      router.refresh();
    } catch {
      setErrorHabitId(habitId);
    } finally {
      setPending(null);
    }
  }

  if (habits.length === 0) {
    return (
      <Card>
        <CardLabel>Habits</CardLabel>
        <p className="mt-1 text-sm text-muted">No habits yet — ask Vi to help you start one.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardLabel>Today&rsquo;s habits</CardLabel>
      <ul className="mt-2 flex flex-col gap-2">
        {habits.map((h) => {
          const done = (h.completedToday || justCompleted.has(h.id)) && !justUndone.has(h.id);
          return (
            <li key={h.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={pending === h.id}
                  onClick={() => toggle(h.id, done)}
                  aria-label={done ? `Undo ${h.name}` : `Mark ${h.name} complete`}
                  title={done ? "Tap to undo" : undefined}
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[0.6rem] disabled:opacity-50 ${
                    done
                      ? "border-pulse bg-pulse text-pulse-fg"
                      : "border-border bg-surface text-transparent hover:border-pulse"
                  }`}
                >
                  ✓
                </button>
                <span className={`text-sm ${done ? "text-muted line-through" : ""}`}>{h.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {errorHabitId === h.id && (
                  <span className="text-xs text-pulse">Couldn&rsquo;t save — try again</span>
                )}
                <span className="font-mono text-xs text-muted">
                  {h.current_streak > 0 ? `${h.current_streak}d streak` : `${h.frequency}x/wk`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
