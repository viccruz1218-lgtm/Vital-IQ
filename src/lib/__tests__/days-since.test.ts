import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { isUserInactive, isDueForComeback } from "@/lib/days-since";

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

describe("isDueForComeback", () => {
  it("is false during the cooldown window even if the user is inactive", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [],
      check_ins: [],
      chat_messages: [],
      habits: [],
      habit_completion: [],
    });

    // Sent 3 days ago — inside the 7-day cooldown.
    const due = await isDueForComeback(supabase, USER_ID, "2026-01-12T00:00:00Z");
    expect(due).toBe(false);
  });

  it("is true again once the cooldown has fully elapsed and inactivity persists", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [],
      check_ins: [],
      chat_messages: [],
      habits: [],
      habit_completion: [],
    });

    // Sent 8 days ago — cooldown has elapsed.
    const due = await isDueForComeback(supabase, USER_ID, "2026-01-07T00:00:00Z");
    expect(due).toBe(true);
  });

  it("is false when never sent before but the user is active", async () => {
    const supabase = createFakeSupabase({
      workout_logs: [{ user_id: USER_ID, performed_at: "2026-01-14" }],
      check_ins: [],
      chat_messages: [],
      habits: [],
      habit_completion: [],
    });

    const due = await isDueForComeback(supabase, USER_ID, null);
    expect(due).toBe(false);
  });
});
