import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Deliberately simple, dependency-free rate limiting for the AI-backed
// endpoints — the actual cost/abuse risk this app has, per the engineering
// readiness review. Measures the exact resource being protected (user
// messages already stored in chat_messages) instead of standing up a new
// table or an external service like Upstash. Not a tiered free/paid limit —
// just an abuse/cost backstop, generous enough not to interrupt normal use.
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
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo);

  if ((lastMinuteCount ?? 0) >= PER_MINUTE_LIMIT) {
    return { allowed: false, reason: "Too many messages — please slow down for a minute." };
  }

  const { count: lastDayCount } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", oneDayAgo);

  if ((lastDayCount ?? 0) >= PER_DAY_LIMIT) {
    return { allowed: false, reason: "You've reached today's message limit — try again tomorrow." };
  }

  return { allowed: true };
}
