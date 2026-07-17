import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { checkAiRateLimit } from "@/lib/rate-limit";

const USER_ID = "user-1";

function aiCallsAt(count: number, isoTime: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    user_id: USER_ID,
    event_name: "ai_call",
    created_at: isoTime,
  }));
}

describe("checkAiRateLimit", () => {
  it("allows a user with no recent AI calls", async () => {
    const supabase = createFakeSupabase({ analytics_events: [] });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("blocks once 20 AI calls were made in the last minute", async () => {
    const supabase = createFakeSupabase({
      analytics_events: aiCallsAt(20, new Date().toISOString()),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/slow down/i);
  });

  it("does not count another user's AI calls toward this user's limit", async () => {
    const supabase = createFakeSupabase({
      analytics_events: aiCallsAt(20, new Date().toISOString()).map((e) => ({ ...e, user_id: "someone-else" })),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("does not count other event types toward the limit", async () => {
    const supabase = createFakeSupabase({
      analytics_events: aiCallsAt(20, new Date().toISOString()).map((e) => ({ ...e, event_name: "app_opened" })),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("blocks once the daily cap is hit even if under the per-minute limit", async () => {
    const oldButWithinDay = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const supabase = createFakeSupabase({
      analytics_events: aiCallsAt(200, oldButWithinDay),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/today's usage limit/i);
  });
});
