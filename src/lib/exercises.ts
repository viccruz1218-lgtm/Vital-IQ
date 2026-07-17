export interface ExerciseDef {
  name: string;
  category: "push" | "pull" | "legs" | "core" | "cardio";
  equipment: ("full_gym" | "dumbbells" | "bodyweight" | "bands" | "kettlebell")[];
}

// Curated MVP exercise library. Kept as a static list (not a DB table) so the
// AI plan generator has a fixed vocabulary to select from — Vi is instructed
// to only ever name exercises from this list.
export const EXERCISE_LIBRARY: ExerciseDef[] = [
  { name: "Barbell Back Squat", category: "legs", equipment: ["full_gym"] },
  { name: "Barbell Front Squat", category: "legs", equipment: ["full_gym"] },
  { name: "Goblet Squat", category: "legs", equipment: ["dumbbells", "kettlebell"] },
  { name: "Bodyweight Squat", category: "legs", equipment: ["bodyweight"] },
  { name: "Barbell Deadlift", category: "legs", equipment: ["full_gym"] },
  { name: "Romanian Deadlift", category: "legs", equipment: ["full_gym", "dumbbells"] },
  { name: "Bulgarian Split Squat", category: "legs", equipment: ["dumbbells", "bodyweight"] },
  { name: "Walking Lunge", category: "legs", equipment: ["dumbbells", "bodyweight"] },
  { name: "Leg Press", category: "legs", equipment: ["full_gym"] },
  { name: "Leg Curl Machine", category: "legs", equipment: ["full_gym"] },
  { name: "Standing Calf Raise", category: "legs", equipment: ["full_gym", "dumbbells", "bodyweight"] },
  { name: "Hip Thrust", category: "legs", equipment: ["full_gym", "dumbbells"] },

  { name: "Barbell Bench Press", category: "push", equipment: ["full_gym"] },
  { name: "Incline Barbell Bench Press", category: "push", equipment: ["full_gym"] },
  { name: "Dumbbell Bench Press", category: "push", equipment: ["dumbbells"] },
  { name: "Incline Dumbbell Press", category: "push", equipment: ["dumbbells"] },
  { name: "Push-Up", category: "push", equipment: ["bodyweight"] },
  { name: "Overhead Barbell Press", category: "push", equipment: ["full_gym"] },
  { name: "Seated Dumbbell Shoulder Press", category: "push", equipment: ["dumbbells"] },
  { name: "Lateral Raise", category: "push", equipment: ["dumbbells", "bands"] },
  { name: "Cable Tricep Pushdown", category: "push", equipment: ["full_gym"] },
  { name: "Dip", category: "push", equipment: ["full_gym", "bodyweight"] },
  { name: "Close-Grip Bench Press", category: "push", equipment: ["full_gym"] },

  { name: "Pull-Up", category: "pull", equipment: ["full_gym", "bodyweight"] },
  { name: "Lat Pulldown", category: "pull", equipment: ["full_gym"] },
  { name: "Barbell Row", category: "pull", equipment: ["full_gym"] },
  { name: "One-Arm Dumbbell Row", category: "pull", equipment: ["dumbbells"] },
  { name: "Seated Cable Row", category: "pull", equipment: ["full_gym"] },
  { name: "Face Pull", category: "pull", equipment: ["full_gym", "bands"] },
  { name: "Barbell Bicep Curl", category: "pull", equipment: ["full_gym"] },
  { name: "Dumbbell Bicep Curl", category: "pull", equipment: ["dumbbells", "bands"] },
  { name: "Band Pull-Apart", category: "pull", equipment: ["bands"] },
  { name: "Inverted Row", category: "pull", equipment: ["bodyweight"] },

  { name: "Plank", category: "core", equipment: ["bodyweight"] },
  { name: "Hanging Leg Raise", category: "core", equipment: ["full_gym", "bodyweight"] },
  { name: "Cable Crunch", category: "core", equipment: ["full_gym"] },
  { name: "Russian Twist", category: "core", equipment: ["bodyweight", "dumbbells"] },
  { name: "Dead Bug", category: "core", equipment: ["bodyweight"] },
  { name: "Ab Wheel Rollout", category: "core", equipment: ["bodyweight"] },

  { name: "Kettlebell Swing", category: "cardio", equipment: ["kettlebell"] },
  { name: "Rowing Machine", category: "cardio", equipment: ["full_gym"] },
  { name: "Stationary Bike", category: "cardio", equipment: ["full_gym"] },
  { name: "Jump Rope", category: "cardio", equipment: ["bodyweight"] },
  { name: "Burpee", category: "cardio", equipment: ["bodyweight"] },
];

export const EXERCISE_NAMES = EXERCISE_LIBRARY.map((e) => e.name);
