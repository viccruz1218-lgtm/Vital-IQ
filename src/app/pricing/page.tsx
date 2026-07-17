import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { CheckoutButton } from "@/components/dashboard/checkout-button";

export default function PricingPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-16">
      <Link href="/" className="mb-10 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span>
      </Link>
      <h1 className="mb-2 font-display text-3xl font-semibold">Your coach is always on.</h1>
      <p className="mb-10 text-muted">Pick a plan. Cancel anytime.</p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card>
          <CardLabel>Free</CardLabel>
          <div className="mt-2 mb-4 font-display text-2xl">$0</div>
          <ul className="mb-6 space-y-2 text-sm text-muted">
            <li>5 coach messages/day</li>
            <li>Manual workout &amp; nutrition logging</li>
            <li>1 active goal</li>
          </ul>
        </Card>
        <Card className="border-pulse">
          <CardLabel>Premium — monthly</CardLabel>
          <div className="mt-2 mb-4 font-display text-2xl">$19.99/mo</div>
          <ul className="mb-6 space-y-2 text-sm text-muted">
            <li>Unlimited coach chat</li>
            <li>Adaptive weekly re-planning</li>
            <li>Full progress analytics</li>
          </ul>
          <CheckoutButton priceId={process.env.STRIPE_PRICE_ID_MONTHLY ?? ""} label="Start Premium" />
        </Card>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Prefer annual?{" "}
        <span className="text-foreground">$119/yr</span> — about $9.92/mo, billed once a year.
      </p>
    </div>
  );
}
