import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Gate for pages that only exist in the "full" arm of the alpha experiment
// (Coach, Habits). Control-group users are redirected rather than shown an
// empty page — the nav already hides these links, this is defense in depth
// so a direct URL visit can't cross the experiment boundary.
export async function requireFullExperience(supabase: SupabaseClient<Database>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("experiment_group")
    .eq("id", userId)
    .single();

  if (profile?.experiment_group === "control") {
    redirect("/dashboard");
  }
}
