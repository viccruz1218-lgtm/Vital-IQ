import { describe, it, expect, vi, beforeEach } from "vitest";

// Verifies two regressions found during the engineering review:
// 1. The onboarding_completed write must go through the SERVICE-ROLE client,
//    not the per-session client — onboarding_completed is a protected column
//    (see supabase/migrations/0004_profiles_security.sql) that a
//    session-scoped write would silently fail to update against a real DB.
// 2. The AI rate limit must be enforced before the Anthropic call is made.

const { sessionTables, serviceRoleTables, anthropicCreateMock } = vi.hoisted(() => ({
  sessionTables: {
    profiles: [] as Record<string, unknown>[],
    chat_messages: [] as Record<string, unknown>[],
    habits: [] as Record<string, unknown>[],
    analytics_events: [] as Record<string, unknown>[],
  },
  serviceRoleTables: {
    profiles: [{ id: "user-1" }] as Record<string, unknown>[],
  },
  anthropicCreateMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/lib/__tests__/fake-supabase");
  return {
    createClient: async () => createFakeSupabase(sessionTables, {}, { id: "user-1" }),
    createServiceRoleClient: () => createFakeSupabase(serviceRoleTables),
  };
});

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: anthropicCreateMock } }),
  COACH_MODEL: "claude-opus-4-8",
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionTables.profiles = [];
  sessionTables.chat_messages = [];
  sessionTables.habits = [];
  sessionTables.analytics_events = [];
  serviceRoleTables.profiles = [{ id: "user-1" }];
});

describe("POST /api/onboarding/chat", () => {
  it("rejects once the caller is over the AI rate limit, without calling Anthropic", async () => {
    // 20 AI calls in the last minute already — at the limit.
    sessionTables.analytics_events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      user_id: "user-1",
      event_name: "ai_call",
      created_at: new Date().toISOString(),
    }));

    const { POST } = await import("@/app/api/onboarding/chat/route");
    const res = await POST(
      new Request("http://localhost/api/onboarding/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hi" }),
      }),
    );

    expect(res.status).toBe(429);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("writes onboarding_completed through the service-role client, not the session client", async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "save_onboarding_profile",
          input: {
            identity_statement: "I am becoming someone who trains consistently.",
            main_motivation: "My knees hurt more every year I wait.",
            quit_pattern: "I stop when life gets stressful.",
            goal: "get_back_in_shape",
            fitness_level: "beginner",
            age: 34,
            height_cm: 178,
            weight_kg: 82,
            equipment: ["dumbbells"],
            schedule_days_per_week: 3,
            injuries: "",
            coaching_tone: "direct",
          },
        },
      ],
    });

    const { POST } = await import("@/app/api/onboarding/chat/route");
    const res = await POST(
      new Request("http://localhost/api/onboarding/chat", {
        method: "POST",
        body: JSON.stringify({ message: "I want to get back in shape." }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.onboardingCompleted).toBe(true);
    expect(serviceRoleTables.profiles[0]).toMatchObject({ onboarding_completed: true });
    // The session-scoped store must never have received this write — that's
    // exactly the bug the service-role refactor fixed.
    expect(sessionTables.profiles).toHaveLength(0);
  });
});
