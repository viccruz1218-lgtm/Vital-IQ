import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Card>
        <CardLabel>404</CardLabel>
        <p className="mt-2 text-sm text-muted">This page doesn&apos;t exist.</p>
        <Link href="/" className={buttonVariants({ size: "sm", variant: "secondary", className: "mt-4" })}>
          Go home
        </Link>
      </Card>
    </div>
  );
}
