import Link from "next/link";
import { updatePassword } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-8 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span>
      </Link>
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Set a new password</h1>
        <p className="mb-6 text-sm text-muted">Make it something Vi can&apos;t guess.</p>

        {error && (
          <p className="mb-4 rounded-md border border-pulse/30 bg-pulse/10 px-3 py-2 text-sm text-pulse">
            {error}
          </p>
        )}

        <form action={updatePassword} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
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
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
