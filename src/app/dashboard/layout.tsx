import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Home", fullOnly: false },
  { href: "/dashboard/coach", label: "Coach", fullOnly: true },
  { href: "/dashboard/habits", label: "Habits", fullOnly: true },
  { href: "/dashboard/momentum", label: "Momentum", fullOnly: true },
  { href: "/dashboard/weekly-review", label: "Weekly Review", fullOnly: true },
  { href: "/dashboard/workout", label: "Workout", fullOnly: false },
  { href: "/dashboard/workout/history", label: "History", fullOnly: false },
  { href: "/dashboard/checkin", label: "Check-in", fullOnly: false },
  { href: "/dashboard/settings", label: "Settings", fullOnly: false },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, experiment_group")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/onboarding");

  const isControl = profile.experiment_group === "control";
  const nav = NAV.filter((item) => !item.fullOnly || !isControl);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col md:flex-row">
      {/* Below md: a horizontally-scrollable top bar — the fixed 208px
          sidebar used to be the only nav and was unusable at phone widths. */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex-none font-display text-base font-semibold">
          Vital<span className="text-pulse">IQ</span>
        </Link>
        <div className="flex flex-1 gap-1 overflow-x-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-none whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <form action={signOut} className="flex-none">
          <Button type="submit" variant="ghost" size="sm" className="px-2.5">
            Sign out
          </Button>
        </form>
      </div>

      <nav className="hidden w-52 flex-none flex-col gap-1 border-r border-border px-4 py-6 md:flex">
        <Link href="/dashboard" className="mb-6 font-display text-base font-semibold">
          Vital<span className="text-pulse">IQ</span>
        </Link>
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
        <form action={signOut} className="mt-auto pt-4">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-2.5">
            Sign out
          </Button>
        </form>
      </nav>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
