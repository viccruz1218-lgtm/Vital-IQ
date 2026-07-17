import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Deliberately simple, dependency-free rate limiting for every endpoint that
// calls the Anthropic API (chat, onboarding, plan generation) — the actual
// cost/abuse risk this app has. Counts an "ai_call" analytics_events row
// rather than chat_messages, because not every AI-backed endpoint writes to
// chat_messages (workout plan generation doesn't) — a limiter keyed on a
// table a given route never writes to would never trip for that route.
// Callers must track("ai_call") themselves right before calling Anthropic;
// see src/app/api/coach/chat, onboarding/chat, workouts/generate.
const PER_MINUTE_LIMIT = 20;
const PER_DAY_LIMIT = 200;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

export async function checkAiRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RateLimitResult> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: lastMinuteCount } = await supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_name", "ai_call")
    .gte("created_at", oneMinuteAgo);

  if ((lastMinuteCount ?? 0) >= PER_MINUTE_LIMIT) {
    return { allowed: false, reason: "Too many requests — please slow down for a minute." };
  }

  const { count: lastDayCount } = await supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_name", "ai_call")
    .gte("created_at", oneDayAgo);

  if ((lastDayCount ?? 0) >= PER_DAY_LIMIT) {
    return { allowed: false, reason: "You've reached today's usage limit — try again tomorrow." };
  }

  return { allowed: true };
}
