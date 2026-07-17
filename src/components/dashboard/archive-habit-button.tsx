"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveHabitButton({ habitId, habitName }: { habitId: string; habitName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState(false);

  async function archive() {
    setArchiving(true);
    setError(false);
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setError(true);
      setArchiving(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted underline hover:text-foreground"
      >
        Archive
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      {error && <span className="text-pulse">Couldn&rsquo;t archive — try again</span>}
      <button type="button" onClick={archive} disabled={archiving} className="text-pulse underline">
        {archiving ? "Archiving…" : `Archive "${habitName}"?`}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={archiving}
        className="text-muted underline"
      >
        Cancel
      </button>
    </span>
  );
}
