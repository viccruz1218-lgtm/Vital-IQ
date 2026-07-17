import Link from "next/link";
import { signIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-8 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span>
      </Link>
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted">Vi has been keeping notes.</p>

        {reset && (
          <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
            Password updated — sign in with your new password.
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-md border border-pulse/30 bg-pulse/10 px-3 py-2 text-sm text-pulse">
            {error}
          </p>
        )}

        <form action={signIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" size="lg" className="mt-2 w-full">
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        New to VitalIQ?{" "}
        <Link href="/signup" className="text-foreground underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
