import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-8 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span>
      </Link>
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
        <p className="mb-6 text-sm text-muted">
          We&apos;ll email you a link to set a new one.
        </p>

        {sent ? (
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form action={requestPasswordReset} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <Button type="submit" size="lg" className="mt-2 w-full">
              Send reset link
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
