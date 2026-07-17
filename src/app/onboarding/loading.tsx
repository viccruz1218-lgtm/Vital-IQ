export default function OnboardingLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-3 px-6">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      <div className="h-20 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}
