import { cn } from "@/lib/utils";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface p-5", className)}
      {...props}
    />
  );
}

export function CardLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono text-[0.68rem] uppercase tracking-[0.1em] text-muted",
        className,
      )}
      {...props}
    />
  );
}
