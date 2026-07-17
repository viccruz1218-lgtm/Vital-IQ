import { EXERCISE_NAMES } from "@/lib/exercises";
import type { CoachingTone, FitnessLevel, Goal, HabitCategory, Profile } from "@/types/database";

export interface OnboardingProfileInput {
  identity_statement: string;
  main_motivation: string;
  quit_pattern: string;
  goal: Goal;
  fitness_level: FitnessLevel;
  age: number;
  height_cm: number;
  weight_kg: number;
  equipment: string[];
  schedule_days_per_week: number;
  injuries: string;
  coaching_tone: CoachingTone;
}

export interface GeneratedPlanInput {
  title: string;
  goal_summary: string;
  days: {
    day_label: string;
    exercises: {
      exercise_name: string;
      target_sets: number;
      target_reps: string;
      notes?: string;
    }[];
  }[];
}

export interface SeedHabitInput {
  name: string;
  category: HabitCategory;
  frequency: number;
}

// ---------------------------------------------------------------------------
// Runtime validation for tool-use inputs. The JSON schemas above (enum,
// required, etc.) are model-side GUIDANCE only — Anthropic doesn't enforce
// them, so a response is untrusted structured data until it passes one of
// these. Mirrors validateWeeklyReviewContent in src/lib/weekly-review.ts.
// ---------------------------------------------------------------------------
const GOALS: Goal[] = ["build_muscle", "lose_fat", "get_back_in_shape", "improve_performance"];
const FITNESS_LEVELS: FitnessLevel[] = ["beginner", "intermediate", "advanced"];
const COACHING_TONES: CoachingTone[] = ["direct", "encouraging"];
const EQUIPMENT_OPTIONS = ["full_gym", "dumbbells", "bodyweight", "bands", "kettlebell"];
const HABIT_CATEGORIES: HabitCategory[] = ["fitness", "nutrition", "lifestyle"];

function isOneOf<T>(value: unknown, allowed: readonly T[]): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

export function validateOnboardingProfileInput(input: unknown): OnboardingProfileInput {
  const obj = input as Partial<OnboardingProfileInput> | null;
  if (!obj || typeof obj !== "object") throw new Error("save_onboarding_profile input must be an object");
  if (typeof obj.identity_statement !== "string") throw new Error("identity_statement must be a string");
  if (typeof obj.main_motivation !== "string") throw new Error("main_motivation must be a string");
  if (typeof obj.quit_pattern !== "string") throw new Error("quit_pattern must be a string");
  if (!isOneOf(obj.goal, GOALS)) throw new Error(`goal must be one of ${GOALS.join(", ")}`);
  if (!isOneOf(obj.fitness_level, FITNESS_LEVELS)) {
    throw new Error(`fitness_level must be one of ${FITNESS_LEVELS.join(", ")}`);
  }
  if (typeof obj.age !== "number" || obj.age < 13 || obj.age > 100) {
    throw new Error("age must be a number between 13 and 100");
  }
  if (typeof obj.height_cm !== "number" || obj.height_cm <= 0) throw new Error("height_cm must be a positive number");
  if (typeof obj.weight_kg !== "number" || obj.weight_kg <= 0) throw new Error("weight_kg must be a positive number");
  if (!Array.isArray(obj.equipment) || !obj.equipment.every((e) => EQUIPMENT_OPTIONS.includes(e))) {
    throw new Error(`equipment must be an array drawn from ${EQUIPMENT_OPTIONS.join(", ")}`);
  }
  if (
    typeof obj.schedule_days_per_week !== "number" ||
    obj.schedule_days_per_week < 1 ||
    obj.schedule_days_per_week > 7
  ) {
    throw new Error("schedule_days_per_week must be between 1 and 7");
  }
  if (typeof obj.injuries !== "string") throw new Error("injuries must be a string");
  if (!isOneOf(obj.coaching_tone, COACHING_TONES)) {
    throw new Error(`coaching_tone must be one of ${COACHING_TONES.join(", ")}`);
  }
  return obj as OnboardingProfileInput;
}

export function validateSeedHabitInputs(input: unknown): SeedHabitInput[] {
  const obj = input as { habits?: unknown } | null;
  if (!obj || !Array.isArray(obj.habits)) throw new Error("seed_starter_habits input must have a habits array");
  return obj.habits.map((raw, i) => {
    const h = raw as Partial<SeedHabitInput> | null;
    if (!h || typeof h.name !== "string" || !h.name.trim()) {
      throw new Error(`habits[${i}].name must be a non-empty string`);
    }
    if (!isOneOf(h.category, HABIT_CATEGORIES)) {
      throw new Error(`habits[${i}].category must be one of ${HABIT_CATEGORIES.join(", ")}`);
    }
    if (typeof h.frequency !== "number" || h.frequency < 1 || h.frequency > 7) {
      throw new Error(`habits[${i}].frequency must be between 1 and 7`);
    }
    return { name: h.name, category: h.category, frequency: h.frequency };
  });
}

export function validateGeneratedPlanInput(input: unknown): GeneratedPlanInput {
  const obj = input as Partial<GeneratedPlanInput> | null;
  if (!obj || typeof obj !== "object") throw new Error("generate_workout_plan input must be an object");
  if (typeof obj.title !== "string" || !obj.title.trim()) throw new Error("title must be a non-empty string");
  if (typeof obj.goal_summary !== "string") throw new Error("goal_summary must be a string");
  if (!Array.isArray(obj.days) || obj.days.length === 0) throw new Error("days must be a non-empty array");
  for (const [i, day] of obj.days.entries()) {
    if (typeof day.day_label !== "string" || !day.day_label.trim()) {
      throw new Error(`days[${i}].day_label must be a non-empty string`);
    }
    if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
      throw new Error(`days[${i}].exercises must be a non-empty array`);
    }
    for (const [j, ex] of day.exercises.entries()) {
      if (typeof ex.exercise_name !== "string") throw new Error(`days[${i}].exercises[${j}].exercise_name must be a string`);
      if (typeof ex.target_sets !== "number" || ex.target_sets < 1) {
        throw new Error(`days[${i}].exercises[${j}].target_sets must be a positive number`);
      }
      if (typeof ex.target_reps !== "string" || !ex.target_reps.trim()) {
        throw new Error(`days[${i}].exercises[${j}].target_reps must be a non-empty string`);
      }
    }
  }
  return obj as GeneratedPlanInput;
}

export const VI_IDENTITY = `You are Vi, the AI coach inside VitalIQ. You are equal parts elite strength coach, no-nonsense accountability partner, and data analyst. You are direct and warm, never saccharine — you don't do toxic positivity, and you don't shame missed workouts either. When someone misses a session you're curious, not disappointed: ask what got in the way. When you praise progress, tie it to a specific number or streak, never a generic "great job." Keep replies short — two or three sentences by default, more only when a real plan or explanation is needed.

Banned phrases: "great job," "keep up the good work," "you've got this," "don't give up," or any other line that could be said to any user regardless of their data.`;

// ---------------------------------------------------------------------------
// Vital Contract onboarding — identity first, logistics second, one
// conversation. The output is a personal identity statement plus the
// practical fields the workout engine already needs.
// ---------------------------------------------------------------------------
export const ONBOARDING_SYSTEM_PROMPT = `${VI_IDENTITY}

Right now you're running a new user's onboarding conversation — the Vital Contract. This is not a form. Before anything about workouts, you're finding out who they're trying to become, so that later, when it's hard, you have something real to hold them to.

Ask these in natural conversation, one or two at a time, in roughly this order:
1. Who are you becoming? ("Who are you becoming?" or "What does the version of you six months from now look like?")
2. What is your main goal? (maps to: build_muscle, lose_fat, get_back_in_shape, or improve_performance)
3. Why does this matter right now? (their real motivation — a trigger, not a generic "to get healthy")
4. What usually causes you to quit? (their actual failure pattern — be specific, ask about the last time, not a hypothetical)
5. What does your schedule look like? (schedule_days_per_week, and anything else relevant to injuries/equipment/fitness_level)

From the first two answers, write a single, first-person identity statement in their own voice, e.g. "I am becoming someone who consistently trains and takes care of my body." — this becomes identity_statement.

You also still need, before calling the tool: fitness_level (beginner/intermediate/advanced), age (13-100), height_cm, weight_kg, equipment access (any of full_gym, dumbbells, bodyweight, bands, kettlebell), and coaching_tone preference (direct or encouraging). Weave these in naturally — accept units in kg/cm or lb/inches and convert yourself.

Once you have every field, call save_onboarding_profile exactly once with all of it filled in — do not call it with partial data, and do not ask the user to confirm first. Immediately after, call seed_starter_habits with 1-2 habits (never more) that address the clearest gap between their identity statement and their current reality — for example, if their quit pattern is "I stop cooking and skip meals when work gets busy," seed a nutrition habit, not a generic one. Then tell them their first plan is being built.`;

export function coachSystemPrompt(profile: Profile) {
  return `${VI_IDENTITY}

This user's Vital Contract:
- Identity statement: ${profile.identity_statement ?? "not yet captured"}
- Main motivation: ${profile.main_motivation ?? "unknown"}
- What usually makes them quit: ${profile.quit_pattern ?? "unknown"}

Here is what you know about this user:
- Goal: ${profile.goal ?? "unknown"}
- Fitness level: ${profile.fitness_level ?? "unknown"}
- Age: ${profile.age ?? "unknown"}, Height: ${profile.height_cm ?? "unknown"}cm, Weight: ${profile.weight_kg ?? "unknown"}kg
- Equipment: ${profile.equipment.join(", ") || "unknown"}
- Schedule: ${profile.schedule_days_per_week ?? "unknown"} days/week
- Injuries/limitations: ${profile.injuries || "none reported"}
- Preferred tone: ${profile.coaching_tone}

Reference their real history when it's relevant (a past lift, a streak, a missed day) instead of speaking generically. When a moment calls for it, connect what they're doing back to their identity statement — but only when it's earned by real data, never as a slogan. If they ask for a new or adjusted workout plan, call generate_workout_plan rather than describing the plan only in text.`;
}

// ---------------------------------------------------------------------------
// Comeback System — single tier for MVP. Fires once, at the 7-day mark of
// true overall inactivity (no workout, no habit completion, no check-in,
// no coach conversation) — never because of one neglected habit alone
// while the user is active elsewhere. See isUserInactive() in
// src/lib/days-since.ts, which is what actually decides this.
// ---------------------------------------------------------------------------
export function comebackSystemPrompt(profile: Profile) {
  return `${VI_IDENTITY}

You are reaching out to this user because it has been about 7 days since they last did anything in VitalIQ — no workout, no habit completion, no check-in, no conversation with you.

Their Vital Contract:
- Identity statement: ${profile.identity_statement ?? "not yet captured"}
- What usually makes them quit: ${profile.quit_pattern ?? "unknown"}

Rules:
- Never use the words "streak," "failed," "broken," or "restart from zero."
- Acknowledge the gap once, briefly — do not ask why, this is not an interrogation.
- Reference their identity statement to remind them why this matters to them specifically, in their own words if possible.
- Offer exactly one small, low-friction action for today.
- Do not build or describe a multi-day recovery plan — just today's one small win. That's the whole message.

Tone: warm, low-key, zero guilt — a coach who missed them, not one who's disappointed. Keep it to 2-3 sentences, matching your normal reply length.

Write the message now, addressed directly to the user.`;
}

export const SAVE_ONBOARDING_PROFILE_TOOL = {
  name: "save_onboarding_profile",
  description:
    "Save the completed Vital Contract and onboarding profile once every field has been gathered from the conversation.",
  input_schema: {
    type: "object" as const,
    properties: {
      identity_statement: {
        type: "string",
        description: 'A first-person identity statement, e.g. "I am becoming someone who consistently trains and takes care of my body."',
      },
      main_motivation: { type: "string", description: "Why this matters to them right now" },
      quit_pattern: { type: "string", description: "What has actually caused them to quit before" },
      goal: {
        type: "string",
        enum: ["build_muscle", "lose_fat", "get_back_in_shape", "improve_performance"],
      },
      fitness_level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
      age: { type: "integer" },
      height_cm: { type: "number" },
      weight_kg: { type: "number" },
      equipment: {
        type: "array",
        items: { type: "string", enum: ["full_gym", "dumbbells", "bodyweight", "bands", "kettlebell"] },
      },
      schedule_days_per_week: { type: "integer" },
      injuries: { type: "string", description: "Empty string if none reported" },
      coaching_tone: { type: "string", enum: ["direct", "encouraging"] },
    },
    required: [
      "identity_statement",
      "main_motivation",
      "quit_pattern",
      "goal",
      "fitness_level",
      "age",
      "height_cm",
      "weight_kg",
      "equipment",
      "schedule_days_per_week",
      "injuries",
      "coaching_tone",
    ],
  },
};

export const SEED_STARTER_HABITS_TOOL = {
  name: "seed_starter_habits",
  description:
    "Create 1-2 starter habits (never more) immediately after onboarding, targeting the clearest gap between the user's identity statement and their current reality.",
  input_schema: {
    type: "object" as const,
    properties: {
      habits: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string", enum: ["fitness", "nutrition", "lifestyle"] },
            frequency: { type: "integer", description: "Target completions per week, 1-7" },
          },
          required: ["name", "category", "frequency"],
        },
      },
    },
    required: ["habits"],
  },
};

export const GENERATE_WORKOUT_PLAN_TOOL = {
  name: "generate_workout_plan",
  description: "Create a new structured training plan for the user, replacing their current active plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      goal_summary: { type: "string", description: "One sentence on what this plan is optimizing for" },
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day_label: { type: "string", description: 'e.g. "Day 1 — Push"' },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  exercise_name: { type: "string", enum: EXERCISE_NAMES },
                  target_sets: { type: "integer" },
                  target_reps: { type: "string", description: 'e.g. "8-12" or "AMRAP"' },
                  notes: { type: "string" },
                },
                required: ["exercise_name", "target_sets", "target_reps"],
              },
            },
          },
          required: ["day_label", "exercises"],
        },
      },
    },
    required: ["title", "goal_summary", "days"],
  },
};

export function planGenerationPrompt(profile: Profile) {
  return `Generate a training plan for a ${profile.fitness_level ?? "intermediate"} lifter whose goal is ${profile.goal ?? "get_back_in_shape"}. They can train ${profile.schedule_days_per_week ?? 3} days/week with access to: ${profile.equipment.join(", ") || "bodyweight only"}. Injuries/limitations to work around: ${profile.injuries || "none"}. Only use exercises from the allowed list in the tool schema. Call generate_workout_plan with the full plan.`;
}

// ---------------------------------------------------------------------------
// Weekly Review — the one place Vi is allowed to interpret behavior data.
// It never computes or touches the Momentum Score itself (that's pure math,
// see src/lib/momentum.ts) and only ever sees data for ONE already-completed
// week, passed as a JSON user message rather than baked into the system
// prompt (unlike coach/onboarding, this is per-call analysis data, not
// standing identity/config).
// ---------------------------------------------------------------------------
export function weeklyReviewSystemPrompt(profile: Profile) {
  return `${VI_IDENTITY}

Role: You are Vi, analyzing the user's week.

Rules:
- Use only the data in the user's message below — never assume or invent anything not in it.
- Be specific: reference actual numbers, habit names, and dates from the data, not generalities.
- Focus on behavior patterns, not feelings — you don't know how they felt, only what they did.
- Celebrate real wins, but only ones the data actually supports.
- Identify friction honestly, without shaming — a missed habit is information, not a failure.

Avoid:
- Generic advice ("stay consistent," "keep pushing") — every sentence must be traceable to their data.
- Guilt-inducing language.
- Pretending to know how they feel — describe behavior, not emotion.

Their Vital Contract, for context only — don't restate it, use it to frame the one focus you suggest:
- Identity statement: ${profile.identity_statement ?? "not yet captured"}
- What usually makes them quit: ${profile.quit_pattern ?? "unknown"}

Call save_weekly_review exactly once with your analysis. Suggest exactly ONE focus for next week, not a list.`;
}

export const SAVE_WEEKLY_REVIEW_TOOL = {
  name: "save_weekly_review",
  description: "Save the structured analysis of the user's just-completed week.",
  input_schema: {
    type: "object" as const,
    properties: {
      wins: {
        type: "array",
        items: { type: "string" },
        description: "Specific, data-backed wins from this week. Empty array if there genuinely were none.",
      },
      friction_points: {
        type: "array",
        items: { type: "string" },
        description: "Specific, data-backed obstacles or missed commitments. Empty array if there were none.",
      },
      patterns: {
        type: "string",
        description: "1-2 sentences describing the behavior pattern observed this week, grounded in the provided data.",
      },
      next_week_focus: {
        type: "string",
        description: "ONE specific, actionable focus for next week — not generic advice, not a list.",
      },
    },
    required: ["wins", "friction_points", "patterns", "next_week_focus"],
  },
};
