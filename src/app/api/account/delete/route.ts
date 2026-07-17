import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Cancel any live Stripe subscriptions first — otherwise the account and
  // all its data disappear here while Stripe keeps billing an orphaned customer.
  if (sub?.stripe_customer_id) {
    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: sub.stripe_customer_id,
      status: "all",
    });
    await Promise.all(
      subscriptions.data
        .filter((s) => ["active", "trialing", "past_due"].includes(s.status))
        .map((s) => stripe.subscriptions.cancel(s.id)),
    );
  }

  // Deleting the auth user cascades through every table that references
  // auth.users(id) on delete cascade — see supabase/migrations/0001_init.sql
  // and 0002_consistency_engine.sql.
  const serviceRoleSupabase = createServiceRoleClient();
  const { error } = await serviceRoleSupabase.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
