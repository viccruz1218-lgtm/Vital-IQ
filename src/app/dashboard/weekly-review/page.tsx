import { createClient } from "@/lib/supabase/server";
import { getWeeklyReviewHistory, getPreviousWeekStart } from "@/lib/weekly-review";
import { requireFullExperience } from "@/lib/experiment";
import { Card, CardLabel } from "@/components/ui/card";
import { GenerateWeeklyReviewButton } from "@/components/dashboard/generate-weekly-review-button";
import { track } from "@/lib/analytics";

export default async function WeeklyReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await requireFullExperience(supabase, user.id);

  const history = await getWeeklyReviewHistory(supabase, user.id);
  const targetWeekStart = getPreviousWeekStart();
  const current = history.find((r) => r.week_start === targetWeekStart) ?? null;
  const past = history.filter((r) => r.week_start !== targetWeekStart);

  if (current) {
    await track(supabase, user.id, "weekly_review_opened", { week_start: current.week_start });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Weekly Review</h1>
        <p className="text-sm text-muted">
          Vi&rsquo;s read on your week — grounded in what you actually logged, generated once, never rewritten.
        </p>
      </div>

      {!current ? (
        <Card>
          <p className="mb-3 text-sm text-muted">
            No review yet for the week of {targetWeekStart} — one generates automatically every Sunday, or generate
            it now.
          </p>
          <GenerateWeeklyReviewButton />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-baseline justify-between">
              <CardLabel>Week of {current.week_start}</CardLabel>
              <span className="font-mono text-2xl text-pulse">{current.consistency_rate}%</span>
            </div>
            <p className="mt-3 text-sm">{current.patterns}</p>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardLabel>Wins</CardLabel>
              {current.wins.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No standout wins this week.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {current.wins.map((w, i) => (
                    <li key={i} className="text-moss">
                      + {w}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardLabel>Biggest obstacle</CardLabel>
              {current.friction_points.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing stood out as friction this week.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {current.friction_points.map((f, i) => (
                    <li key={i} className="text-pulse">
                      − {f}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="border-pulse">
            <CardLabel>Next week&rsquo;s focus</CardLabel>
            <p className="mt-2 text-sm">{current.next_week_focus}</p>
          </Card>
        </>
      )}

      {past.length > 0 && (
        <div>
          <CardLabel>Past reviews</CardLabel>
          <div className="mt-2 flex flex-col gap-2">
            {past.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Week of {r.week_start}</span>
                  <span className="font-mono text-muted">{r.consistency_rate}% consistency</span>
                </div>
                <p className="mt-1 text-sm text-muted">{r.next_week_focus}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
