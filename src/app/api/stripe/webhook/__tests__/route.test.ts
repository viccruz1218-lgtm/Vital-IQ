import { describe, it, expect, vi, beforeEach } from "vitest";

// Verifies the webhook idempotency fix found during the pre-alpha security
// audit: Stripe retries on any non-2xx/slow response, and a captured signed
// payload could in principle be replayed. Without event.id dedup,
// checkout.session.completed would re-track "pro_upgrade" on every retry.

const { tables, constructEventMock, trackMock } = vi.hoisted(() => ({
  tables: {
    subscriptions: [] as Record<string, unknown>[],
    processed_stripe_events: [] as Record<string, unknown>[],
    analytics_events: [] as Record<string, unknown>[],
  },
  constructEventMock: vi.fn(),
  trackMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/lib/__tests__/fake-supabase");
  return { createServiceRoleClient: () => createFakeSupabase(tables) };
});

vi.mock("@/lib/analytics", () => ({ track: trackMock }));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: vi.fn(async () => ({ id: "sub_1", status: "active", items: { data: [] } })) },
    customers: { retrieve: vi.fn(async () => ({ deleted: false, metadata: { user_id: "user-1" } })) },
  }),
}));

function fakeEvent(id: string) {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: { customer: "cus_1", subscription: "sub_1", client_reference_id: "user-1" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tables.subscriptions = [];
  tables.processed_stripe_events = [];
  tables.analytics_events = [];
});

describe("POST /api/stripe/webhook idempotency", () => {
  it("processes a new event and records its event_id", async () => {
    constructEventMock.mockReturnValue(fakeEvent("evt_1"));
    const { POST } = await import("@/app/api/stripe/webhook/route");

    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=fake" },
        body: "{}",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deduplicated).toBeUndefined();
    expect(tables.processed_stripe_events.map((e) => e.event_id)).toEqual(["evt_1"]);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a replayed/retried event instead of reprocessing it", async () => {
    constructEventMock.mockReturnValue(fakeEvent("evt_2"));
    const { POST } = await import("@/app/api/stripe/webhook/route");

    const request = () =>
      POST(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "t=1,v1=fake" },
          body: "{}",
        }),
      );

    const first = await request();
    const second = await request();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.deduplicated).toBe(true);
    // Only the FIRST delivery should have actually tracked pro_upgrade —
    // this is the exact bug the fix targets.
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it("releases the claim on processing failure so a genuine retry can reprocess", async () => {
    constructEventMock.mockReturnValue(fakeEvent("evt_3"));
    trackMock.mockRejectedValueOnce(new Error("boom"));
    const { POST } = await import("@/app/api/stripe/webhook/route");

    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=fake" },
        body: "{}",
      }),
    );

    expect(res.status).toBe(500);
    // The claim must be released, not left dangling, or a legitimate Stripe
    // retry of this same failed event would be silently deduplicated away.
    expect(tables.processed_stripe_events).toHaveLength(0);
  });
});
