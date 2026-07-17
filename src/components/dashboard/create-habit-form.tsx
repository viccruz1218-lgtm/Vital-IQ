"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { HabitCategory } from "@/types/database";

export function CreateHabitForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<HabitCategory>("fitness");
  const [frequency, setFrequency] = useState(3);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, frequency }),
      });
      setName("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="habit-name">Habit</Label>
        <Input
          id="habit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Drink water"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-category">Category</Label>
          <select
            id="habit-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as HabitCategory)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-pulse"
          >
            <option value="fitness">Fitness</option>
            <option value="nutrition">Nutrition</option>
            <option value="lifestyle">Lifestyle</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-frequency">Times/week</Label>
          <Input
            id="habit-frequency"
            type="number"
            min={1}
            max={7}
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
          />
        </div>
      </div>
      <Button type="submit" disabled={saving} size="sm" className="w-fit">
        {saving ? "Adding…" : "Add habit"}
      </Button>
    </form>
  );
}
