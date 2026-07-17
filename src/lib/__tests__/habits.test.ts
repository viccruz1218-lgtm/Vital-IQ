import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { completeHabit, uncompleteHabit, resetStaleHabitStreaks } from "@/lib/habits";

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

describe("uncompleteHabit", () => {
  it("removes today's completion and recomputes the streak from the day before, not zero", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h1", longest_streak: 5 }],
      habit_completion: [
        { habit_id: "h1", date: "2026-01-13", completed: true },
        { habit_id: "h1", date: "2026-01-14", completed: true },
        { habit_id: "h1", date: "2026-01-15", completed: true }, // today
      ],
    });

    const result = await uncompleteHabit(supabase, "h1");

    // 01-13 and 01-14 are still a consecutive run — undoing today must not
    // collapse this to 0 just because today itself is no longer complete.
    expect(result.current_streak).toBe(2);
    expect(result.completion_rate).toBe(0.07);
  });

  it("drops the streak to 0 when undoing the only completion", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h1", longest_streak: 0 }],
      habit_completion: [{ habit_id: "h1", date: "2026-01-15", completed: true }],
    });

    const result = await uncompleteHabit(supabase, "h1");

    expect(result.current_streak).toBe(0);
    expect(result.completion_rate).toBe(0);
  });

  it("never lowers longest_streak below a past peak", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h1", longest_streak: 5 }],
      habit_completion: [{ habit_id: "h1", date: "2026-01-15", completed: true }],
    });

    await uncompleteHabit(supabase, "h1");

    const habit = (await supabase.from("habits").select("*").eq("id", "h1").maybeSingle()).data as {
      longest_streak: number;
    };
    expect(habit.longest_streak).toBe(5);
  });
});

describe("resetStaleHabitStreaks", () => {
  it("zeroes the streak for a habit not completed yesterday or today", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h1", status: "active", current_streak: 5 }],
      habit_completion: [{ habit_id: "h1", date: "2026-01-10", completed: true }],
    });

    await resetStaleHabitStreaks(supabase);

    const habit = (await supabase.from("habits").select("*").eq("id", "h1").maybeSingle()).data as {
      current_streak: number;
    };
    expect(habit.current_streak).toBe(0);
  });

  it("leaves a habit alone if it was completed yesterday", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h2", status: "active", current_streak: 3 }],
      habit_completion: [{ habit_id: "h2", date: "2026-01-14", completed: true }], // yesterday
    });

    await resetStaleHabitStreaks(supabase);

    const habit = (await supabase.from("habits").select("*").eq("id", "h2").maybeSingle()).data as {
      current_streak: number;
    };
    expect(habit.current_streak).toBe(3);
  });

  it("does not touch archived habits", async () => {
    const supabase = createFakeSupabase({
      habits: [{ id: "h3", status: "archived", current_streak: 5 }],
      habit_completion: [],
    });

    await resetStaleHabitStreaks(supabase);

    const habit = (await supabase.from("habits").select("*").eq("id", "h3").maybeSingle()).data as {
      current_streak: number;
    };
    expect(habit.current_streak).toBe(5);
  });
});
