import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Founder-only gate for /admin. No admin role in the schema — for a 40-user
// alpha, an env-var allowlist is enough and avoids a schema change just to
// protect an internal tool. Set ADMIN_EMAILS to a comma-separated list.
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(supabase: SupabaseClient<Database>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    redirect("/dashboard");
  }
}
