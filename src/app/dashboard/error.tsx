"use client";

import { Card, CardLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex max-w-md flex-col gap-4">
      <Card>
        <CardLabel>Something went wrong</CardLabel>
        <p className="mt-2 text-sm text-muted">
          This page hit an unexpected error. Your data is safe — try again.
        </p>
        <Button size="sm" className="mt-4" onClick={reset}>
          Try again
        </Button>
        {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      </Card>
    </div>
  );
}
