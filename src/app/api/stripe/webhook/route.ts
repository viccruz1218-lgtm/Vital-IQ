import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics";
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
  const fields = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: STATUS_MAP[subscription.status] ?? "none",
    price_id: item?.price.id ?? null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  // .update() only touches a row that already exists for this customer. If
  // the checkout route's earlier upsert never landed (or this customer was
  // created another way), matching zero rows here used to mean the
  // subscription status was silently dropped — no error, no retry, Stripe
  // gets a 200 and moves on. Recover the user_id from the Stripe customer's
  // metadata (set at customer creation, see
  // src/app/api/stripe/checkout/route.ts) and upsert directly instead.
  const { data: updated, error } = await supabase
    .from("subscriptions")
    .update(fields)
    .eq("stripe_customer_id", customerId)
    .select("user_id");
  if (error) throw error;
  if (updated && updated.length > 0) return;

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  const userId = !customer.deleted ? customer.metadata?.user_id : undefined;
  if (!userId) {
    throw new Error(`No subscriptions row and no user_id metadata for Stripe customer ${customerId}`);
  }

  const { error: upsertError } = await supabase.from("subscriptions").upsert({ user_id: userId, ...fields });
  if (upsertError) throw upsertError;
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

  // Stripe retries on any non-2xx/slow response, and a captured signed
  // payload could in principle be replayed. Subscription-state upserts are
  // naturally idempotent, but the pro_upgrade analytics side-effect below
  // isn't — claim this event.id before doing any work; a unique-violation
  // means another delivery already handled it (or is handling it right now).
  const dedupeSupabase = createServiceRoleClient();
  const { error: dedupeError } = await dedupeSupabase
    .from("processed_stripe_events")
    .insert({ event_id: event.id });
  if (dedupeError) {
    if (dedupeError.code === "23505") {
      return NextResponse.json({ received: true, deduplicated: true });
    }
    console.error("[stripe/webhook] failed to record event id:", dedupeError);
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.customer && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertFromSubscription(session.customer as string, subscription);
          if (session.client_reference_id) {
            await track(dedupeSupabase, session.client_reference_id, "pro_upgrade", {
              price_id: subscription.items.data[0]?.price.id ?? null,
            });
          }
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
  } catch (err) {
    console.error(`[stripe/webhook] failed to process ${event.type} (${event.id}):`, err);
    // Release the claim so a legitimate Stripe retry can reprocess this
    // event instead of being permanently deduplicated against a failed
    // attempt that never actually did the work.
    await dedupeSupabase.from("processed_stripe_events").delete().eq("event_id", event.id);
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
