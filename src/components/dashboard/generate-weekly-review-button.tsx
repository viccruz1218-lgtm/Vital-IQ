"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GenerateWeeklyReviewButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function generate() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/weekly-review/current");
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-pulse">Couldn&rsquo;t generate this week&rsquo;s review — try again.</p>}
      <Button onClick={generate} disabled={loading} size="sm" className="w-fit">
        {loading ? "Analyzing your week…" : "Generate this week's review"}
      </Button>
    </div>
  );
}
