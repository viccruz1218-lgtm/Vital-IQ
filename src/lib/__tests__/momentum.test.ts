import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { calculateMomentumScore } from "@/lib/momentum";

const USER_ID = "user-1";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateMomentumScore", () => {
  it("weights each pillar at exactly 25% and matches hand-computed scores", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: USER_ID, schedule_days_per_week: 4 }],
      workout_logs: [
        { user_id: USER_ID, performed_at: "2026-01-10" },
        { user_id: USER_ID, performed_at: "2026-01-11" },
      ],
      habits: [
        { id: "h1", user_id: USER_ID, category: "fitness", frequency: 3, status: "active" },
        { id: "h2", user_id: USER_ID, category: "nutrition", frequency: 2, status: "active" },
      ],
      habit_completion: [
        { habit_id: "h1", date: "2026-01-10", completed: true, habits: { user_id: USER_ID, category: "fitness" } },
        { habit_id: "h1", date: "2026-01-12", completed: true, habits: { user_id: USER_ID, category: "fitness" } },
        { habit_id: "h2", date: "2026-01-13", completed: true, habits: { user_id: USER_ID, category: "nutrition" } },
      ],
      check_ins: [{ user_id: USER_ID, check_in_date: "2026-01-14" }],
      momentum_scores: [],
    });

    const result = await calculateMomentumScore(supabase, USER_ID);

    // training: 2 workout days / 4 planned = 50
    expect(result.training_score).toBe(50);
    // habits (non-nutrition, h1 only): 2 completions / frequency 3 = 67
    expect(result.habits_score).toBe(67);
    // nutrition (h2 only): 1 completion / frequency 2 = 50
    expect(result.nutrition_score).toBe(50);
    // consistency: distinct active days {01-10,01-11,01-12,01-13,01-14} = 5 / 7 = 71
    expect(result.consistency_score).toBe(71);
    // total: pure average of the four pillars, no AI involved
    expect(result.total_score).toBe(60);
    expect(result.total_score).toBe(
      Math.round(
        result.training_score * 0.25 +
          result.habits_score * 0.25 +
          result.nutrition_score * 0.25 +
          result.consistency_score * 0.25,
      ),
    );
  });

  it("uses the neutral 50 baseline for habits/nutrition when a user has no habits yet (cold start)", async () => {
    const supabase = createFakeSupabase({
      profiles: [],
      workout_logs: [],
      habits: [],
      habit_completion: [],
      check_ins: [],
      momentum_scores: [],
    });

    const result = await calculateMomentumScore(supabase, USER_ID);

    expect(result.training_score).toBe(0);
    expect(result.habits_score).toBe(50);
    expect(result.nutrition_score).toBe(50);
    expect(result.consistency_score).toBe(0);
    expect(result.total_score).toBe(25);
  });

  it("clamps consistency at 100 even when every day in the 8-day lookback window is active", async () => {
    const allDates = Array.from({ length: 8 }, (_, i) => `2026-01-${String(8 + i).padStart(2, "0")}`);
    const supabase = createFakeSupabase({
      profiles: [{ id: USER_ID, schedule_days_per_week: 3 }],
      workout_logs: allDates.map((d) => ({ user_id: USER_ID, performed_at: d })),
      habits: [],
      habit_completion: [],
      check_ins: [],
      momentum_scores: [],
    });

    const result = await calculateMomentumScore(supabase, USER_ID);

    expect(result.consistency_score).toBeLessThanOrEqual(100);
    expect(result.training_score).toBeLessThanOrEqual(100);
  });
});
