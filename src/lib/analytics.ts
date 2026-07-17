import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Lightweight internal event log — no third-party dependency required to
// start measuring Weekly Consistency Rate and activation. The write path
// (one insert, one table) stays the same if this is later mirrored into
// PostHog or another analytics tool; only the destination would change.
export async function track(
  supabase: SupabaseClient<Database>,
  userId: string | null,
  eventName: string,
  properties: Record<string, unknown> = {},
) {
  await supabase.from("analytics_events").insert({
    user_id: userId,
    event_name: eventName,
    properties,
  });
}
