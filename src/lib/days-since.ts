import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DaysSinceEventType } from "@/types/database";

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / msPerDay);
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

// Call whenever the matching action happens (a workout logged, a
// nutrition-category habit completed, a morning-routine habit completed,
// a check-in submitted) — resets that counter to zero. This purely drives
// the "Days Since" display chips now; see isUserInactive() below for what
// actually decides whether a Comeback message fires.
export async function touchDaysSinceEvent(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventType: DaysSinceEventType,
) {
  const today = toDateOnly(new Date());
  await supabase.from("days_since_events").upsert(
    {
      user_id: userId,
      event_type: eventType,
      last_completed_date: today,
      current_days: 0,
    },
    { onConflict: "user_id,event_type" },
  );
}

// Nightly job: recompute current_days for every row whose last_completed_date
// is before today. Rows are created lazily on first touch, so there is
// nothing to increment for a behavior that has never happened yet.
export async function recomputeAllDaysSince(supabase: SupabaseClient<Database>) {
  const today = toDateOnly(new Date());
  const { data: rows } = await supabase
    .from("days_since_events")
    .select("id, last_completed_date")
    .lt("last_completed_date", today);

  for (const row of rows ?? []) {
    if (!row.last_completed_date) continue;
    const days = daysBetween(row.last_completed_date, today);
    await supabase.from("days_since_events").update({ current_days: days, updated_at: new Date().toISOString() }).eq("id", row.id);
  }
}

// ---------------------------------------------------------------------------
// Comeback System — fixed. This checks OVERALL inactivity across every
// meaningful signal (workout, check-in, coach conversation, habit
// completion), not any single Days Since counter. A neglected habit in one
// category must never fire a comeback for an otherwise-active user.
// ---------------------------------------------------------------------------
const INACTIVITY_THRESHOLD_DAYS = 7;

export async function isUserInactive(
  supabase: SupabaseClient<Database>,
  userId: string,
  thresholdDays: number = INACTIVITY_THRESHOLD_DAYS,
): Promise<boolean> {
  const since = isoDaysAgo(thresholdDays);
  const sinceDate = since.slice(0, 10);

  const { count: recentWorkouts } = await supabase
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("performed_at", sinceDate);
  if ((recentWorkouts ?? 0) > 0) return false;

  const { count: recentCheckIns } = await supabase
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("check_in_date", sinceDate);
  if ((recentCheckIns ?? 0) > 0) return false;

  // Only the user's own messages count as interaction — an assistant-authored
  // row (including a prior comeback message) must never reset this clock,
  // or sending a comeback message would make the user look "active" again
  // the very next night.
  const { count: recentMessages } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("context", "coach")
    .eq("role", "user")
    .gte("created_at", since);
  if ((recentMessages ?? 0) > 0) return false;

  const { data: habits } = await supabase.from("habits").select("id").eq("user_id", userId).eq("status", "active");
  const habitIds = (habits ?? []).map((h) => h.id);
  if (habitIds.length > 0) {
    const { count: recentCompletions } = await supabase
      .from("habit_completion")
      .select("id", { count: "exact", head: true })
      .in("habit_id", habitIds)
      .eq("completed", true)
      .gte("date", sinceDate);
    if ((recentCompletions ?? 0) > 0) return false;
  }

  return true;
}

// A user is due for a comeback message only if they're genuinely inactive
// AND haven't already been sent one within the same threshold window — this
// is the cooldown that keeps a still-inactive user from being messaged
// every single night.
export async function isDueForComeback(
  supabase: SupabaseClient<Database>,
  userId: string,
  lastComebackSentAt: string | null,
): Promise<boolean> {
  if (lastComebackSentAt) {
    const daysSinceLastComeback = daysBetween(lastComebackSentAt.slice(0, 10), toDateOnly(new Date()));
    if (daysSinceLastComeback < INACTIVITY_THRESHOLD_DAYS) return false;
  }
  return isUserInactive(supabase, userId);
}

export async function markComebackSent(supabase: SupabaseClient<Database>, userId: string) {
  await supabase.from("profiles").update({ last_comeback_sent_at: new Date().toISOString() }).eq("id", userId);
}
