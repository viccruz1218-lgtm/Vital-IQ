import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "@/types/database";

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  unpaid: "past_due",
};

async function upsertFromSubscription(customerId: string, subscription: Stripe.Subscription) {
  const supabase = createServiceRoleClient();
  const item = subscription.items.data[0];

  await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: subscription.id,
      status: STATUS_MAP[subscription.status] ?? "none",
      price_id: item?.price.id ?? null,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.customer && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await upsertFromSubscription(session.customer as string, subscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertFromSubscription(subscription.customer as string, subscription);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
