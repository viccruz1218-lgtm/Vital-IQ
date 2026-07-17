import { createClient } from "@/lib/supabase/server";
import { getFounderUserRows } from "@/lib/admin-users";
import { FounderUsersTable } from "@/components/admin/founder-users-table";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const rows = await getFounderUserRows(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Alpha users</h1>
        <p className="text-sm text-muted">{rows.length} onboarded — click a column to sort.</p>
      </div>
      <FounderUsersTable rows={rows} />
    </div>
  );
}
