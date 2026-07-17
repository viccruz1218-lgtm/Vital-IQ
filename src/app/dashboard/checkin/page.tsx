"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

function ScaleInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-9 w-9 rounded-md border text-sm font-medium ${
              value === n
                ? "border-pulse bg-pulse text-pulse-fg"
                : "border-border bg-surface text-muted hover:bg-surface-2"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CheckinPage() {
  const router = useRouter();
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(3);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setSaving(true);
    await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ energy_level: energy, soreness, notes }),
    });
    setSaving(false);
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <Card>
        <p className="text-sm">Logged. Streak updated — see you tomorrow.</p>
      </Card>
    );
  }

  return (
    <div className="flex max-w-sm flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Daily check-in</h1>
        <p className="text-sm text-muted">Thirty seconds. Vi uses this to adjust your plan.</p>
      </div>
      <ScaleInput label="Energy today (1-5)" value={energy} onChange={setEnergy} />
      <ScaleInput label="Soreness (1-5)" value={soreness} onChange={setSoreness} />
      <div>
        <Label>Anything Vi should know?</Label>
        <Textarea
          className="mt-1.5"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>
      <Button onClick={submit} disabled={saving}>
        {saving ? "Saving…" : "Check in"}
      </Button>
    </div>
  );
}
