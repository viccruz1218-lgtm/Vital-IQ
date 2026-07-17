import { createClient } from "@/lib/supabase/server";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { Card, CardLabel } from "@/components/ui/card";

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardLabel>{label}</CardLabel>
      <div className="mt-1 font-mono text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export default async function AdminMetricsPage() {
  const supabase = await createClient();
  const metrics = await getAdminMetrics(supabase);

  if (metrics.totalAlphaUsers === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-xl font-semibold">Alpha metrics</h1>
        <Card>
          <p className="text-sm text-muted">
            No alpha users have completed onboarding yet — metrics will populate once the first cohort signs up.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Alpha metrics</h1>
        <p className="text-sm text-muted">{metrics.totalAlphaUsers} alpha users onboarded.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Weekly Consistency Rate"
          value={`${metrics.weeklyConsistencyRate}%`}
          hint={(() => {
            const delta = metrics.weeklyConsistencyRate - metrics.weeklyConsistencyRatePreviousWeek;
            const trend = delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${Math.abs(delta)}` : "flat";
            return `${trend} vs. prior week (${metrics.weeklyConsistencyRatePreviousWeek}%)`;
          })()}
        />
        <MetricCard label="DAU" value={String(metrics.dau)} hint="active in last 24h" />
        <MetricCard label="WAU" value={String(metrics.wau)} hint="active in last 7d" />
        <MetricCard
          label="Free → Pro"
          value={`${metrics.freeToProConversionPct}%`}
          hint="of all alpha users"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Habit completion" value={`${metrics.habitCompletionPct}%`} hint="last 7 days" />
        <MetricCard label="Workout completion" value={`${metrics.workoutCompletionPct}%`} hint="last 7 days" />
        <MetricCard
          label="Avg momentum"
          value={metrics.averageMomentum === null ? "—" : String(metrics.averageMomentum)}
          hint="most recent score per user"
        />
        <MetricCard
          label="Comeback success"
          value={metrics.comebackSuccessRate === null ? "—" : `${metrics.comebackSuccessRate}%`}
          hint={`${metrics.comebackMessagesSent} sent, re-engaged within 3 days`}
        />
      </div>
    </div>
  );
}
