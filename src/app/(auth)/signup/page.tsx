import Link from "next/link";
import { signUp } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkEmail?: string }>;
}) {
  const { error, checkEmail } = await searchParams;

  if (checkEmail) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
        <Link href="/" className="mb-8 font-display text-lg font-semibold">
          Vital<span className="text-pulse">IQ</span>
        </Link>
        <Card>
          <h1 className="mb-1 text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-muted">
            We sent you a confirmation link — click it to activate your account and start onboarding.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-8 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span>
      </Link>
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Start training with Vi</h1>
        <p className="mb-6 text-sm text-muted">
          Two minutes of setup, then your coach takes it from there.
        </p>

        {error && (
          <p className="mb-4 rounded-md border border-pulse/30 bg-pulse/10 px-3 py-2 text-sm text-pulse">
            {error}
          </p>
        )}

        <form action={signUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="lg" className="mt-2 w-full">
            Create account
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already training?{" "}
        <Link href="/login" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
