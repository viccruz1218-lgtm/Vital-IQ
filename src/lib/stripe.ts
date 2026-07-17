import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}
