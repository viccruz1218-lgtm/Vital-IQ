import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { completeHabit } from "@/lib/habits";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("completeHabit", () => {
  it("extends the streak across consecutive completed days", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h1", longest_streak: 5 }],
      habit_completion: [
        { habit_id: "h1", date: "2026-01-13", completed: true },
        { habit_id: "h1", date: "2026-01-14", completed: true },
      ],
    });

    const result = await completeHabit(supabase, "h1");

    expect(result.current_streak).toBe(3);
    expect(result.completion_rate).toBe(0.1);
  });

  it("resets the streak to 1 after a gap in completions", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h1", longest_streak: 0 }],
      habit_completion: [{ habit_id: "h1", date: "2026-01-10", completed: true }],
    });

    const result = await completeHabit(supabase, "h1");

    expect(result.current_streak).toBe(1);
    expect(result.completion_rate).toBe(0.07);
  });

  it("throws instead of silently succeeding when the completion write fails", async () => {
    const supabase = createFakeSupabase(
      { habits: [{ id: "h1", longest_streak: 0 }], habit_completion: [] },
      { "habit_completion.upsert": { message: "constraint violation" } },
    );

    await expect(completeHabit(supabase, "h1")).rejects.toMatchObject({ message: "constraint violation" });
  });
});
