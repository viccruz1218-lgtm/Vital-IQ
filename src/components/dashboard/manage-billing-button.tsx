"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(false);
  }

  return (
    <Button size="sm" variant="secondary" onClick={open} disabled={loading}>
      {loading ? "Opening…" : "Manage billing"}
    </Button>
  );
}
