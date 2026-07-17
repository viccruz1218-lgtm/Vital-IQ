"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CheckoutButton({ priceId, label }: { priceId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(false);
  }

  return (
    <Button onClick={go} disabled={loading} size="lg" className="w-full">
      {loading ? "Redirecting…" : label}
    </Button>
  );
}
