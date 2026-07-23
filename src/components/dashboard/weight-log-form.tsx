"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WeightLogForm({ latestWeightKg }: { latestWeightKg: number | null }) {
  const router = useRouter();
  const [weight, setWeight] = useState(latestWeightKg ? String(latestWeightKg) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = Number(weight);
    if (!weight || Number.isNaN(value) || value < 30 || value > 300) {
      setError("Enter a weight between 30 and 300 kg.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight_kg: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Couldn't save that — try again.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-24"
        inputMode="decimal"
        placeholder="kg"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      <Button size="sm" onClick={submit} disabled={saving}>
        {saving ? "Saving…" : "Log today's weight"}
      </Button>
      {error && <span className="text-xs text-pulse">{error}</span>}
    </div>
  );
}
