import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/card";
import { ManageBillingButton } from "@/components/dashboard/manage-billing-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const isPremium = subscription?.status === "active" || subscription?.status === "trialing";

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="font-display text-xl font-semibold">Settings</h1>

      <Card>
        <CardLabel>Profile</CardLabel>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Goal</dt>
            <dd className="capitalize">{(profile?.goal ?? "—").replaceAll("_", " ")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Level</dt>
            <dd className="capitalize">{profile?.fitness_level ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Schedule</dt>
            <dd>{profile?.schedule_days_per_week ?? "—"} days/week</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Coaching tone</dt>
            <dd className="capitalize">{profile?.coaching_tone}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardLabel>Subscription</CardLabel>
        <p className="mt-1 text-sm">
          {isPremium ? "VitalIQ Premium — active" : "Free plan"}
        </p>
        {isPremium ? (
          <div className="mt-3">
            <ManageBillingButton />
          </div>
        ) : (
          <Link href="/pricing" className="mt-3 inline-block text-sm text-pulse underline">
            Upgrade to Premium
          </Link>
        )}
      </Card>
    </div>
  );
}
