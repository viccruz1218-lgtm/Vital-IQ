import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { isUserInactive, claimComebackSlot } from "@/lib/days-since";

const USER_ID = "user-1";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isUserInactive", () => {
  it("is true when there is no activity of any kind in the window", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [],
      check_ins: [],
      chat_messages: [],
      habits: [],
      habit_completion: [],
    });

    expect(await isUserInactive(supabase, USER_ID)).toBe(true);
  });

  it("is false when the user logged a workout in the window", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [{ user_id: USER_ID, performed_at: "2026-01-12" }],
      check_ins: [],
      chat_messages: [],
      habits: [],
      habit_completion: [],
    });

    expect(await isUserInactive(supabase, USER_ID)).toBe(false);
  });

  it("is false when the user completed a habit in the window", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [],
      check_ins: [],
      chat_messages: [],
      habits: [{ id: "h1", user_id: USER_ID, status: "active" }],
      habit_completion: [{ habit_id: "h1", date: "2026-01-13", completed: true }],
    });

    expect(await isUserInactive(supabase, USER_ID)).toBe(false);
  });

  it("does NOT count a prior comeback message (role=assistant) as activity", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [],
      check_ins: [],
      chat_messages: [
        { user_id: USER_ID, context: "coach", role: "assistant", created_at: "2026-01-14T00:00:00Z" },
      ],
      habits: [],
      habit_completion: [],
    });

    // A message sent BY Vi, not the user, must never reset the inactivity
    // clock — otherwise a comeback message would make the cron think the
    // user is active again the very next night.
    expect(await isUserInactive(supabase, USER_ID)).toBe(true);
  });

  it("is false when the user actually messaged the coach in the window", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [],
      check_ins: [],
      chat_messages: [
        { user_id: USER_ID, context: "coach", role: "user", created_at: "2026-01-14T00:00:00Z" },
      ],
      habits: [],
      habit_completion: [],
    });

    expect(await isUserInactive(supabase, USER_ID)).toBe(false);
  });
});

describe("claimComebackSlot", () => {
  it("claims successfully when never sent before", async () => {
    const supabase = createFakeSupabase({ profiles: [{ id: USER_ID, last_comeback_sent_at: null }] });
    expect(await claimComebackSlot(supabase, USER_ID)).toBe(true);
  });

  it("refuses to claim during the cooldown window", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: USER_ID, last_comeback_sent_at: "2026-01-12T00:00:00.000Z" }], // 3 days ago
    });
    expect(await claimComebackSlot(supabase, USER_ID)).toBe(false);
  });

  it("claims again once the cooldown has fully elapsed", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: USER_ID, last_comeback_sent_at: "2026-01-07T00:00:00.000Z" }], // 8 days ago
    });
    expect(await claimComebackSlot(supabase, USER_ID)).toBe(true);
  });

  it("only lets ONE of two concurrent/overlapping cron runs claim the same night", async () => {
    // Models the exact race the cron used to have: two overlapping
    // invocations both see the user as due, but only the first UPDATE can
    // match the (is-null-or-stale) WHERE clause — the second sees the row
    // the first one already wrote and correctly loses the race.
    const supabase = createFakeSupabase({ profiles: [{ id: USER_ID, last_comeback_sent_at: null }] });

    const firstRun = await claimComebackSlot(supabase, USER_ID);
    const secondRun = await claimComebackSlot(supabase, USER_ID);

    expect(firstRun).toBe(true);
    expect(secondRun).toBe(false);
  });
});
