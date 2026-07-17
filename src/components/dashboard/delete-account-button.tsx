"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Something went wrong — try again.");
    setLoading(false);
  }

  if (!confirming) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-pulse/30 text-pulse hover:bg-pulse/10"
        onClick={() => setConfirming(true)}
      >
        Delete account
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        This permanently deletes your account, plans, habits, and history. This can&apos;t be undone.
      </p>
      {error && <p className="text-sm text-pulse">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-pulse/30 text-pulse hover:bg-pulse/10"
          onClick={confirmDelete}
          disabled={loading}
        >
          {loading ? "Deleting…" : "Yes, permanently delete"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
