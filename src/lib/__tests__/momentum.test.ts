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
  it("scores a perfect week at exactly 100 across all five pillars", async () => {
    const allSevenDays = ["2026-01-09", "2026-01-10", "2026-01-11", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15"];
    const supabase = createFakeSupabase({
      profiles: [{ id: USER_ID, schedule_days_per_week: 3 }],
      workout_logs: [
        { user_id: USER_ID, performed_at: "2026-01-13" },
        { user_id: USER_ID, performed_at: "2026-01-14" },
        { user_id: USER_ID, performed_at: "2026-01-15" },
      ],
      habits: [
        { id: "h1", user_id: USER_ID, category: "fitness", frequency: 7, status: "active" },
        { id: "h2", user_id: USER_ID, category: "nutrition", frequency: 7, status: "active" },
      ],
      habit_completion: allSevenDays.flatMap((date) => [
        { habit_id: "h1", date, completed: true, habits: { user_id: USER_ID, category: "fitness" } },
        { habit_id: "h2", date, completed: true, habits: { user_id: USER_ID, category: "nutrition" } },
      ]),
      check_ins: [{ user_id: USER_ID, check_in_date: "2026-01-15", energy_level: 5, soreness: 1 }],
      momentum_scores: [],
    });

    const result = await calculateMomentumScore(supabase, USER_ID);

    expect(result.training_score).toBe(100);
    expect(result.habits_score).toBe(100);
    expect(result.nutrition_score).toBe(100);
    expect(result.recovery_score).toBe(100);
    expect(result.consistency_score).toBe(100);
    expect(result.total_score).toBe(100);
  });

  it("scores a brand new user with no activity at all as 0, not a fake baseline", async () => {
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
    expect(result.consistency_score).toBe(0);
    // Unavailable, not a fabricated placeholder value.
    expect(result.habits_score).toBeNull();
    expect(result.nutrition_score).toBeNull();
    expect(result.recovery_score).toBeNull();
    expect(result.total_score).toBe(0);
  });

  it("calculates a realistic partial-completion week correctly, weighted 25/25/20/20/10", async () => {
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
        { habit_id: "h1", date: "2026-01-14", completed: true, habits: { user_id: USER_ID, category: "fitness" } },
        { habit_id: "h2", date: "2026-01-13", completed: true, habits: { user_id: USER_ID, category: "nutrition" } },
      ],
      check_ins: [
        { user_id: USER_ID, check_in_date: "2026-01-12", energy_level: 4, soreness: 2 },
        { user_id: USER_ID, check_in_date: "2026-01-13", energy_level: 2, soreness: 4 },
      ],
      momentum_scores: [],
    });

    const result = await calculateMomentumScore(supabase, USER_ID);

    expect(result.training_score).toBe(50); // 2 of 4 planned sessions
    expect(result.habits_score).toBe(67); // 2 of 3 planned completions
    expect(result.nutrition_score).toBe(50); // 1 of 2 planned completions
    expect(result.recovery_score).toBe(50); // avg energy 3, avg soreness 3 -> 50/50 -> 50
    expect(result.consistency_score).toBe(71); // 5 distinct active days / 7
    // 50*.25 + 67*.25 + 50*.20 + 50*.20 + 71*.10 = 56.35 -> 56
    expect(result.total_score).toBe(56);
  });

  it("never lets any pillar or the total exceed 100, even with an 8-day lookback window", async () => {
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

    expect(result.training_score).toBeLessThanOrEqual(100);
    expect(result.consistency_score).toBeLessThanOrEqual(100);
    expect(result.total_score).toBeLessThanOrEqual(100);
  });

  it("never touches a previously stored score for a different day", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: USER_ID, schedule_days_per_week: 3 }],
      workout_logs: [],
      habits: [],
      habit_completion: [],
      check_ins: [],
      momentum_scores: [
        {
          user_id: USER_ID,
          score_date: "2026-01-10",
          training_score: 80,
          habits_score: 90,
          nutrition_score: 70,
          recovery_score: 60,
          consistency_score: 85,
          total_score: 78,
        },
      ],
    });

    await calculateMomentumScore(supabase, USER_ID);

    const { data: historical } = await supabase
      .from("momentum_scores")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("score_date", "2026-01-10")
      .maybeSingle();

    expect(historical).toMatchObject({
      training_score: 80,
      habits_score: 90,
      nutrition_score: 70,
      recovery_score: 60,
      consistency_score: 85,
      total_score: 78,
    });
  });
});
