import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import type { WeeklyReview } from "@/types/database";

export function WeeklyReviewCard({ review }: { review: WeeklyReview | null }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardLabel>Weekly Review</CardLabel>
        <Link href="/dashboard/weekly-review" className="text-xs text-muted underline hover:text-foreground">
          {review ? "View" : "Generate"}
        </Link>
      </div>
      {review ? (
        <>
          <div className="mt-1 font-mono text-2xl">
            {review.consistency_rate}%
            <span className="text-sm text-muted"> consistency, week of {review.week_start}</span>
          </div>
          <p className="mt-2 text-sm">
            <span className="text-muted">Next focus: </span>
            {review.next_week_focus}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">
          No review yet — one generates automatically each Sunday, or view the page to generate it now.
        </p>
      )}
    </Card>
  );
}
