import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-20">
      <div className="mb-16 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span>
      </div>

      <h1 className="max-w-xl font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
        Your coach is <span className="text-pulse">always on.</span>
      </h1>
      <p className="mt-4 max-w-md text-lg text-muted">
        VitalIQ is an AI coach that builds your training plan, tracks every set, and checks
        in daily — so you never train alone.
      </p>

      <div className="mt-8 flex gap-3">
        <Link href="/signup">
          <Button size="lg">Start training with Vi</Button>
        </Link>
        <Link href="/pricing">
          <Button size="lg" variant="outline">
            See pricing
          </Button>
        </Link>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardLabel>Coach</CardLabel>
          <p className="mt-1 text-sm">Vi messages first, every morning — no logging fatigue.</p>
        </Card>
        <Card>
          <CardLabel>Plan</CardLabel>
          <p className="mt-1 text-sm">A program that adapts session to session, not a static PDF.</p>
        </Card>
        <Card>
          <CardLabel>Progress</CardLabel>
          <p className="mt-1 text-sm">Progressive overload tracked automatically, lift by lift.</p>
        </Card>
      </div>
    </div>
  );
}
