import { describe, it, expect } from "vitest";
import {
  validateOnboardingProfileInput,
  validateSeedHabitInputs,
  validateGeneratedPlanInput,
} from "@/lib/ai/persona";

const VALID_ONBOARDING_INPUT = {
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
};

describe("validateOnboardingProfileInput", () => {
  it("accepts a well-formed tool_use input", () => {
    expect(validateOnboardingProfileInput(VALID_ONBOARDING_INPUT)).toEqual(VALID_ONBOARDING_INPUT);
  });

  it("rejects an invalid goal enum value", () => {
    expect(() => validateOnboardingProfileInput({ ...VALID_ONBOARDING_INPUT, goal: "get_rich" })).toThrow(/goal/);
  });

  it("rejects an out-of-range age", () => {
    expect(() => validateOnboardingProfileInput({ ...VALID_ONBOARDING_INPUT, age: 200 })).toThrow(/age/);
    expect(() => validateOnboardingProfileInput({ ...VALID_ONBOARDING_INPUT, age: 5 })).toThrow(/age/);
  });

  it("rejects equipment values outside the allowed list", () => {
    expect(() =>
      validateOnboardingProfileInput({ ...VALID_ONBOARDING_INPUT, equipment: ["home_gym_deluxe"] }),
    ).toThrow(/equipment/);
  });

  it("rejects a schedule_days_per_week outside 1-7", () => {
    expect(() =>
      validateOnboardingProfileInput({ ...VALID_ONBOARDING_INPUT, schedule_days_per_week: 0 }),
    ).toThrow(/schedule_days_per_week/);
    expect(() =>
      validateOnboardingProfileInput({ ...VALID_ONBOARDING_INPUT, schedule_days_per_week: 8 }),
    ).toThrow(/schedule_days_per_week/);
  });

  it("rejects a non-object", () => {
    expect(() => validateOnboardingProfileInput(null)).toThrow();
    expect(() => validateOnboardingProfileInput("nope")).toThrow();
  });
});

describe("validateSeedHabitInputs", () => {
  it("accepts a well-formed habits array", () => {
    const input = { habits: [{ name: "Drink water", category: "lifestyle", frequency: 5 }] };
    expect(validateSeedHabitInputs(input)).toEqual(input.habits);
  });

  it("rejects a missing habits array", () => {
    expect(() => validateSeedHabitInputs({})).toThrow(/habits array/);
  });

  it("rejects an invalid category", () => {
    expect(() =>
      validateSeedHabitInputs({ habits: [{ name: "x", category: "spiritual", frequency: 3 }] }),
    ).toThrow(/category/);
  });

  it("rejects a frequency outside 1-7", () => {
    expect(() =>
      validateSeedHabitInputs({ habits: [{ name: "x", category: "fitness", frequency: 0 }] }),
    ).toThrow(/frequency/);
    expect(() =>
      validateSeedHabitInputs({ habits: [{ name: "x", category: "fitness", frequency: 10 }] }),
    ).toThrow(/frequency/);
  });

  it("rejects an empty or non-string name", () => {
    expect(() =>
      validateSeedHabitInputs({ habits: [{ name: "", category: "fitness", frequency: 3 }] }),
    ).toThrow(/name/);
  });
});

describe("validateGeneratedPlanInput", () => {
  const VALID_PLAN = {
    title: "Push/Pull/Legs",
    goal_summary: "Build strength across all major lifts.",
    days: [
      {
        day_label: "Day 1 — Push",
        exercises: [{ exercise_name: "Barbell Bench Press", target_sets: 4, target_reps: "8-10" }],
      },
    ],
  };

  it("accepts a well-formed plan", () => {
    expect(validateGeneratedPlanInput(VALID_PLAN)).toEqual(VALID_PLAN);
  });

  it("rejects an empty days array", () => {
    expect(() => validateGeneratedPlanInput({ ...VALID_PLAN, days: [] })).toThrow(/days/);
  });

  it("rejects a day with no exercises", () => {
    expect(() =>
      validateGeneratedPlanInput({ ...VALID_PLAN, days: [{ day_label: "Day 1", exercises: [] }] }),
    ).toThrow(/exercises/);
  });

  it("rejects a non-numeric target_sets", () => {
    expect(() =>
      validateGeneratedPlanInput({
        ...VALID_PLAN,
        days: [
          {
            day_label: "Day 1",
            exercises: [{ exercise_name: "Squat", target_sets: "four" as unknown as number, target_reps: "8" }],
          },
        ],
      }),
    ).toThrow(/target_sets/);
  });
});
