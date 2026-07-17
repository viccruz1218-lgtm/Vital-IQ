import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

const NAV = [
  { href: "/admin", label: "Metrics" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  await requireAdmin(supabase);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl">
      <nav className="flex w-52 flex-none flex-col gap-1 border-r border-border px-4 py-6">
        <Link href="/admin" className="mb-6 font-display text-base font-semibold">
          Vital<span className="text-pulse">IQ</span> <span className="text-muted">admin</span>
        </Link>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/dashboard"
          className="mt-auto rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
        >
          ← Back to app
        </Link>
      </nav>
      <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
