import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import {
  aggregateWeeklyData,
  validateWeeklyReviewContent,
  generateWeeklyReview,
  getWeeklyReviewHistory,
  getPreviousWeekStart,
} from "@/lib/weekly-review";

// "Now" is frozen to a Wednesday; getPreviousWeekStart() resolves to
// 2026-01-11 (a Sunday), the most recently fully-completed week
// (2026-01-11 through 2026-01-17).
const NOW = "2026-01-21T12:00:00Z";
const WEEK_START = "2026-01-11";

const anthropicCreateMock = vi.fn();
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: anthropicCreateMock } }),
  COACH_MODEL: "claude-opus-4-8",
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  anthropicCreateMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPreviousWeekStart", () => {
  it("resolves to the most recently completed Sunday-start week", () => {
    expect(getPreviousWeekStart()).toBe(WEEK_START);
  });
});

describe("aggregateWeeklyData", () => {
  it("aggregates exactly the requested user's data within the week window, correctly", async () => {
    const supabase = createFakeSupabase({
      profiles: [
        {
          id: "user-1",
          schedule_days_per_week: 4,
          identity_statement: "I am becoming someone who trains consistently.",
          quit_pattern: "I stop when work gets busy.",
          goal: "lose_fat",
        },
        { id: "user-2", schedule_days_per_week: 5 },
      ],
      workout_logs: [
        { user_id: "user-1", performed_at: "2026-01-12" },
        { user_id: "user-1", performed_at: "2026-01-14" },
        { user_id: "user-1", performed_at: "2026-01-20" }, // outside the week — must be excluded
        { user_id: "user-2", performed_at: "2026-01-13" }, // another user — must never leak in
      ],
      habits: [
        { id: "h1", user_id: "user-1", name: "Lift weights", category: "fitness", frequency: 3, status: "active" },
        { id: "h2", user_id: "user-1", name: "Meal prep", category: "nutrition", frequency: 2, status: "active" },
        { id: "h3", user_id: "user-2", name: "Other user's habit", category: "fitness", frequency: 5, status: "active" },
      ],
      habit_completion: [
        { habit_id: "h1", date: "2026-01-12", completed: true },
        { habit_id: "h1", date: "2026-01-15", completed: true },
        { habit_id: "h2", date: "2026-01-13", completed: true },
        { habit_id: "h3", date: "2026-01-12", completed: true }, // user-2's — must never leak in
      ],
      check_ins: [
        { user_id: "user-1", check_in_date: "2026-01-12", energy_level: 4, soreness: 2 },
        { user_id: "user-1", check_in_date: "2026-01-16", energy_level: 3, soreness: 3 },
        { user_id: "user-2", check_in_date: "2026-01-13", energy_level: 5, soreness: 1 },
      ],
      days_since_events: [
        { user_id: "user-1", event_type: "workout", current_days: 1 },
        { user_id: "user-2", event_type: "workout", current_days: 9 },
      ],
      momentum_scores: [
        { user_id: "user-1", score_date: "2026-01-12", total_score: 60 },
        { user_id: "user-1", score_date: "2026-01-15", total_score: 70 },
        { user_id: "user-1", score_date: "2026-01-20", total_score: 90 }, // outside the week
      ],
    });

    const data = await aggregateWeeklyData(supabase, "user-1", WEEK_START);

    expect(data.week_start).toBe(WEEK_START);
    expect(data.week_end).toBe("2026-01-17");
    expect(data.identity_statement).toBe("I am becoming someone who trains consistently.");
    expect(data.quit_pattern).toBe("I stop when work gets busy.");
    expect(data.goal).toBe("lose_fat");

    expect(data.workouts_planned).toBe(4);
    expect(data.workouts_completed).toBe(2);

    expect(data.habits).toEqual([
      { name: "Lift weights", category: "fitness", planned: 3, completed: 2 },
      { name: "Meal prep", category: "nutrition", planned: 2, completed: 1 },
    ]);

    // (2 workouts + 3 habit completions) / (4 planned workouts + 5 planned habits) = 5/9 = 56%
    expect(data.consistency_rate).toBe(56);

    expect(data.check_ins).toEqual([
      { date: "2026-01-12", energy_level: 4, soreness: 2 },
      { date: "2026-01-16", energy_level: 3, soreness: 3 },
    ]);
    expect(data.days_since).toEqual([{ event_type: "workout", current_days: 1 }]);
    expect(data.momentum).toEqual([
      { score_date: "2026-01-12", total_score: 60 },
      { score_date: "2026-01-15", total_score: 70 },
    ]);
  });

  it("handles a user with no habits/workouts/check-ins gracefully, without fabricating data", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: "user-1", schedule_days_per_week: 3 }],
      workout_logs: [],
      habits: [],
      habit_completion: [],
      check_ins: [],
      days_since_events: [],
      momentum_scores: [],
    });

    const data = await aggregateWeeklyData(supabase, "user-1", WEEK_START);

    expect(data.workouts_completed).toBe(0);
    expect(data.habits).toEqual([]);
    expect(data.check_ins).toEqual([]);
    expect(data.consistency_rate).toBe(0);
  });
});

describe("generateWeeklyReview — empty week handling", () => {
  it("produces a deterministic review without calling the AI when nothing was logged", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: "user-1", schedule_days_per_week: 3 }],
      workout_logs: [],
      habits: [{ id: "h1", user_id: "user-1", name: "Drink water", category: "lifestyle", frequency: 5, status: "active" }],
      habit_completion: [],
      check_ins: [],
      days_since_events: [],
      momentum_scores: [],
      weekly_reviews: [],
    });

    const review = await generateWeeklyReview(supabase, "user-1", WEEK_START);

    expect(anthropicCreateMock).not.toHaveBeenCalled();
    expect(review.wins).toEqual([]);
    expect(review.friction_points.length).toBeGreaterThan(0);
    expect(review.next_week_focus).toContain("Drink water");
    expect(review.consistency_rate).toBe(0);
  });
});

describe("validateWeeklyReviewContent — AI output schema validation", () => {
  it("accepts a well-formed tool_use input", () => {
    const valid = {
      wins: ["Completed 3 of 3 planned lifts"],
      friction_points: ["Missed meal prep twice"],
      patterns: "Training was consistent; nutrition lagged behind.",
      next_week_focus: "Prep meals on Sunday before the week starts.",
    };
    expect(validateWeeklyReviewContent(valid)).toEqual(valid);
  });

  it("rejects a non-object", () => {
    expect(() => validateWeeklyReviewContent(null)).toThrow();
    expect(() => validateWeeklyReviewContent("a string")).toThrow();
  });

  it("rejects wins that isn't a string array", () => {
    expect(() =>
      validateWeeklyReviewContent({
        wins: "not an array",
        friction_points: [],
        patterns: "x",
        next_week_focus: "x",
      }),
    ).toThrow(/wins/);
    expect(() =>
      validateWeeklyReviewContent({
        wins: [1, 2, 3],
        friction_points: [],
        patterns: "x",
        next_week_focus: "x",
      }),
    ).toThrow(/wins/);
  });

  it("rejects a missing patterns or next_week_focus field", () => {
    expect(() =>
      validateWeeklyReviewContent({ wins: [], friction_points: [], next_week_focus: "x" }),
    ).toThrow(/patterns/);
    expect(() =>
      validateWeeklyReviewContent({ wins: [], friction_points: [], patterns: "x" }),
    ).toThrow(/next_week_focus/);
  });
});

describe("weekly review access scoping", () => {
  it("getWeeklyReviewHistory only ever returns the requesting user's own reviews", async () => {
    const supabase = createFakeSupabase({
      weekly_reviews: [
        { id: "r1", user_id: "user-1", week_start: "2026-01-04", consistency_rate: 50, wins: [], friction_points: [], patterns: "", next_week_focus: "" },
        { id: "r2", user_id: "user-2", week_start: "2026-01-04", consistency_rate: 90, wins: [], friction_points: [], patterns: "", next_week_focus: "" },
      ],
    });

    const history = await getWeeklyReviewHistory(supabase, "user-1");

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("r1");
  });
});

describe("generateWeeklyReview — historical immutability", () => {
  it("returns the existing review unchanged instead of regenerating it", async () => {
    const existing = {
      id: "existing-review",
      user_id: "user-1",
      week_start: WEEK_START,
      wins: ["Original win"],
      friction_points: ["Original friction"],
      patterns: "Original pattern text",
      next_week_focus: "Original focus",
      momentum_snapshot: { scores: [] },
      consistency_rate: 42,
    };
    const supabase = createFakeSupabase({
      profiles: [{ id: "user-1", schedule_days_per_week: 3 }],
      workout_logs: [{ user_id: "user-1", performed_at: "2026-01-12" }], // would NOT be an empty week
      habits: [],
      habit_completion: [],
      check_ins: [],
      days_since_events: [],
      momentum_scores: [],
      weekly_reviews: [existing],
    });

    const result = await generateWeeklyReview(supabase, "user-1", WEEK_START);

    expect(result).toMatchObject(existing);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });
});
