export default function DashboardLoading() {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <div className="h-6 w-32 animate-pulse rounded bg-surface-2" />
      <div className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
      <div className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}
