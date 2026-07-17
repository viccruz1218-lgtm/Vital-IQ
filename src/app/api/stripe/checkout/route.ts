import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { priceId } = (await request.json()) as { priceId: string };
  if (!priceId) return NextResponse.json({ error: "priceId is required" }, { status: 400 });

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
    await supabase
      .from("subscriptions")
      .upsert({ user_id: user.id, stripe_customer_id: customerId, status: "none" });
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
