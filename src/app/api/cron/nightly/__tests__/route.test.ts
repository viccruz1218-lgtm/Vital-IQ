import { describe, it, expect, vi, beforeEach } from "vitest";

// Verifies the cron route's fault-isolation contract: one user's momentum
// calculation throwing, or one user's comeback evaluation throwing, must
// never stop the batch or affect any other user's result. The actual
// momentum/comeback math is covered separately in momentum.test.ts and
// days-since.test.ts — this test only exercises the route's control flow.

const { fakeSupabase, calculateMomentumScoreMock, isDueForComebackMock } = vi.hoisted(() => {
  const profiles = [
    { id: "user-ok", onboarding_completed: true, last_comeback_sent_at: null },
    { id: "user-momentum-fails", onboarding_completed: true, last_comeback_sent_at: null },
    { id: "user-comeback-fails", onboarding_completed: true, last_comeback_sent_at: null },
  ];
  return {
    fakeSupabase: { profiles, chat_messages: [] as Record<string, unknown>[], analytics_events: [] as Record<string, unknown>[] },
    calculateMomentumScoreMock: vi.fn(async (_supabase: unknown, userId: string) => {
      if (userId === "user-momentum-fails") throw new Error("momentum boom");
      return {};
    }),
    isDueForComebackMock: vi.fn(async (_supabase: unknown, userId: string) => {
      if (userId === "user-comeback-fails") throw new Error("comeback boom");
      return userId === "user-ok";
    }),
  };
});

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/lib/__tests__/fake-supabase");
  return { createServiceRoleClient: () => createFakeSupabase(fakeSupabase) };
});

vi.mock("@/lib/momentum", () => ({ calculateMomentumScore: calculateMomentumScoreMock }));

vi.mock("@/lib/days-since", () => ({
  recomputeAllDaysSince: vi.fn(async () => {}),
  isDueForComeback: isDueForComebackMock,
  markComebackSent: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropic: () => ({
    messages: { create: vi.fn(async () => ({ content: [{ type: "text", text: "Hey, come back." }] })) },
  }),
  COACH_MODEL: "claude-opus-4-8",
}));

vi.mock("@/lib/analytics", () => ({ track: vi.fn(async () => {}) }));

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/cron/nightly", () => {
  it("rejects requests without the correct bearer secret", async () => {
    const { GET } = await import("@/app/api/cron/nightly/route");
    const res = await GET(new Request("http://localhost/api/cron/nightly"));
    expect(res.status).toBe(401);
  });

  it("isolates per-user failures so one bad user never blocks the rest of the batch", async () => {
    const { GET } = await import("@/app/api/cron/nightly/route");
    const res = await GET(
      new Request("http://localhost/api/cron/nightly", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed_users).toBe(3);
    expect(body.momentum_ok).toBe(2);
    expect(body.momentum_errors).toBe(1);
    expect(body.comeback_sent).toBe(1);
    expect(body.comeback_errors).toBe(1);
    expect(body.errors).toHaveLength(2);
    expect(body.errors.map((e: { userId: string }) => e.userId).sort()).toEqual(
      ["user-comeback-fails", "user-momentum-fails"].sort(),
    );
  });
});
