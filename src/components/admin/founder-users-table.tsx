"use client";

import { useMemo, useState } from "react";
import type { FounderUserRow } from "@/lib/admin-users";

type SortKey = keyof FounderUserRow;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "full_name", label: "Name" },
  { key: "signup_date", label: "Signup" },
  { key: "experiment_group", label: "Group" },
  { key: "weekly_consistency_pct", label: "WCR %" },
  { key: "current_momentum", label: "Momentum" },
  { key: "days_since_workout", label: "Days since workout" },
  { key: "days_since_check_in", label: "Days since check-in" },
  { key: "last_active", label: "Last active" },
  { key: "subscription_status", label: "Subscription" },
];

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls sort last regardless of direction
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function FounderUsersTable({ rows }: { rows: FounderUserRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("weekly_consistency_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            {COLUMNS.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-3 py-2 font-mono text-xs uppercase tracking-wide text-muted">
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  {col.label}
                  {sortKey === col.key && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
              <td className="whitespace-nowrap px-3 py-2">{row.email}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.full_name ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.signup_date.slice(0, 10)}</td>
              <td className="whitespace-nowrap px-3 py-2 capitalize">{row.experiment_group}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.weekly_consistency_pct}%</td>
              <td className="whitespace-nowrap px-3 py-2">{row.current_momentum ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {row.days_since_workout === null ? "Never" : row.days_since_workout}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {row.days_since_check_in === null ? "Never" : row.days_since_check_in}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {row.last_active ? new Date(row.last_active).toLocaleString() : "Never"}
              </td>
              <td className="whitespace-nowrap px-3 py-2 capitalize">{row.subscription_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-4 text-sm text-muted">No alpha users yet.</p>}
    </div>
  );
}
