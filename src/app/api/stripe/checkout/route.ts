import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// The only two prices this app is allowed to check out — never trust a
// client-supplied priceId directly, or a direct API call could open a
// checkout session for an arbitrary Stripe price.
const ALLOWED_PRICE_IDS = [process.env.STRIPE_PRICE_ID_MONTHLY, process.env.STRIPE_PRICE_ID_YEARLY].filter(
  (id): id is string => Boolean(id),
);

export async function POST(request: Request) {
  const { priceId } = (await request.json()) as { priceId: string };
  if (!priceId) return NextResponse.json({ error: "priceId is required" }, { status: 400 });
  if (!ALLOWED_PRICE_IDS.includes(priceId)) {
    return NextResponse.json({ error: "Unknown priceId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stripe = getStripe();

  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existingSub?.stripe_customer_id ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    // subscriptions has no insert/update policy for the authenticated role
    // (by design — see migration 0001) so this write must use the
    // service-role client, or it's silently rejected by RLS and the
    // customer ID never reaches the database for the webhook to find later.
    const serviceRoleSupabase = createServiceRoleClient();
    const { error: subError } = await serviceRoleSupabase
      .from("subscriptions")
      .upsert({ user_id: user.id, stripe_customer_id: customerId, status: "none" });
    if (subError) {
      return NextResponse.json({ error: `Failed to initialize billing: ${subError.message}` }, { status: 500 });
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/dashboard/settings?checkout=success`,
    cancel_url: `${siteUrl}/pricing?checkout=cancelled`,
    client_reference_id: user.id,
  });

  return NextResponse.json({ url: session.url });
}
