import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { checkAiRateLimit } from "@/lib/rate-limit";

const USER_ID = "user-1";

function messagesAt(count: number, isoTime: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    user_id: USER_ID,
    role: "user",
    created_at: isoTime,
  }));
}

describe("checkAiRateLimit", () => {
  it("allows a user with no recent messages", async () => {
    const supabase = createFakeSupabase({ chat_messages: [] });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("blocks once 20 messages were sent in the last minute", async () => {
    const supabase = createFakeSupabase({
      chat_messages: messagesAt(20, new Date().toISOString()),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/slow down/i);
  });

  it("does not count another user's messages toward this user's limit", async () => {
    const supabase = createFakeSupabase({
      chat_messages: messagesAt(20, new Date().toISOString()).map((m) => ({ ...m, user_id: "someone-else" })),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("blocks once the daily cap is hit even if under the per-minute limit", async () => {
    const oldButWithinDay = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const supabase = createFakeSupabase({
      chat_messages: messagesAt(200, oldButWithinDay),
    });
    const result = await checkAiRateLimit(supabase, USER_ID);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/today's message limit/i);
  });
});
