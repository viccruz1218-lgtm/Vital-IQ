"use client";

import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Card>
        <CardLabel>Something went wrong</CardLabel>
        <p className="mt-2 text-sm text-muted">
          An unexpected error occurred. Try again, or head back home.
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ size: "sm", variant: "secondary" })}>
            Go home
          </Link>
        </div>
        {error.digest && <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>}
      </Card>
    </div>
  );
}
