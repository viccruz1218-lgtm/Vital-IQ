export type Goal =
  | "build_muscle"
  | "lose_fat"
  | "get_back_in_shape"
  | "improve_performance";

export type FitnessLevel = "beginner" | "intermediate" | "advanced";
export type CoachingTone = "direct" | "encouraging";
export type ChatContext = "onboarding" | "coach";
export type ChatRole = "user" | "assistant";
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

// NOTE: these are `type` aliases, not `interface`s, on purpose — with this
// version of @supabase/postgrest-js, feeding an `interface`-declared Row type
// into the generated Database.Tables shape makes `.insert()`/`.update()`
// silently resolve to `never` (deep conditional-type instantiation over an
// interface reference behaves differently than over a plain object type).

export type ExperimentGroup = "full" | "control";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: Goal | null;
  fitness_level: FitnessLevel | null;
  equipment: string[];
  schedule_days_per_week: number | null;
  injuries: string | null;
  coaching_tone: CoachingTone;
  onboarding_completed: boolean;
  // Vital Contract — who the user is becoming, and why.
  identity_statement: string | null;
  main_motivation: string | null;
  quit_pattern: string | null;
  // Alpha A/B assignment. "control" sees only the pre-existing workout
  // tracking experience; "full" gets the whole consistency engine.
  experiment_group: ExperimentGroup;
  // Cooldown for the Comeback System — set when a comeback message is sent
  // so an inactive user isn't messaged again every single night.
  last_comeback_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  context: ChatContext;
  role: ChatRole;
  content: string;
  created_at: string;
};

export type WorkoutPlan = {
  id: string;
  user_id: string;
  title: string;
  goal_summary: string | null;
  status: "active" | "archived";
  created_at: string;
};

export type PlanDay = {
  id: string;
  plan_id: string;
  day_label: string;
  order_index: number;
  created_at: string;
};

export type PlanExercise = {
  id: string;
  plan_day_id: string;
  order_index: number;
  exercise_name: string;
  target_sets: number;
  target_reps: string;
  notes: string | null;
  created_at: string;
};

export type WorkoutLog = {
  id: string;
  user_id: string;
  plan_day_id: string | null;
  performed_at: string;
  notes: string | null;
  created_at: string;
};

export type SetLog = {
  id: string;
  workout_log_id: string;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  created_at: string;
};

export type CheckIn = {
  id: string;
  user_id: string;
  check_in_date: string;
  energy_level: number | null;
  soreness: number | null;
  notes: string | null;
  created_at: string;
};

export type Streak = {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  updated_at: string;
};

export type Subscription = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  price_id: string | null;
  current_period_end: string | null;
  updated_at: string;
};

export type HabitCategory = "fitness" | "nutrition" | "lifestyle";
export type HabitDifficulty = "easy" | "medium" | "hard";
export type HabitStatus = "active" | "archived";

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  category: HabitCategory;
  frequency: number;
  difficulty: HabitDifficulty;
  current_streak: number;
  longest_streak: number;
  completion_rate: number;
  status: HabitStatus;
  created_at: string;
};

export type HabitCompletion = {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  created_at: string;
};

export type DaysSinceEventType = "workout" | "nutrition_habit" | "morning_routine" | "check_in";

export type DaysSinceEvent = {
  id: string;
  user_id: string;
  event_type: DaysSinceEventType;
  last_completed_date: string | null;
  current_days: number;
  last_notified_at_days: number | null;
  updated_at: string;
};

export type MomentumScore = {
  id: string;
  user_id: string;
  score_date: string;
  training_score: number;
  habits_score: number;
  nutrition_score: number;
  consistency_score: number;
  total_score: number;
  created_at: string;
};

export type AnalyticsEvent = {
  id: string;
  user_id: string | null;
  event_name: string;
  properties: Record<string, unknown>;
  created_at: string;
};

export type ProcessedStripeEvent = {
  event_id: string;
  processed_at: string;
};

// Minimal Supabase `Database` shape — enough for typed `.from("table")` calls
// without needing a live project to run `supabase gen types` against yet.
// `Relationships: []` on every table is required by @supabase/postgrest-js's
// GenericTable constraint, not actual foreign-key metadata.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Partial<ChatMessage> & { user_id: string; context: ChatContext; role: ChatRole; content: string };
        Update: Partial<ChatMessage>;
        Relationships: [];
      };
      workout_plans: {
        Row: WorkoutPlan;
        Insert: Partial<WorkoutPlan> & { user_id: string; title: string };
        Update: Partial<WorkoutPlan>;
        Relationships: [];
      };
      plan_days: {
        Row: PlanDay;
        Insert: Partial<PlanDay> & { plan_id: string; day_label: string };
        Update: Partial<PlanDay>;
        Relationships: [
          {
            foreignKeyName: "plan_days_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_exercises: {
        Row: PlanExercise;
        Insert: Partial<PlanExercise> & {
          plan_day_id: string;
          exercise_name: string;
          target_sets: number;
          target_reps: string;
        };
        Update: Partial<PlanExercise>;
        Relationships: [
          {
            foreignKeyName: "plan_exercises_plan_day_id_fkey";
            columns: ["plan_day_id"];
            isOneToOne: false;
            referencedRelation: "plan_days";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_logs: {
        Row: WorkoutLog;
        Insert: Partial<WorkoutLog> & { user_id: string };
        Update: Partial<WorkoutLog>;
        Relationships: [
          {
            foreignKeyName: "workout_logs_plan_day_id_fkey";
            columns: ["plan_day_id"];
            isOneToOne: false;
            referencedRelation: "plan_days";
            referencedColumns: ["id"];
          },
        ];
      };
      set_logs: {
        Row: SetLog;
        Insert: Partial<SetLog> & {
          workout_log_id: string;
          exercise_name: string;
          set_number: number;
          reps: number;
          weight_kg: number;
        };
        Update: Partial<SetLog>;
        Relationships: [
          {
            foreignKeyName: "set_logs_workout_log_id_fkey";
            columns: ["workout_log_id"];
            isOneToOne: false;
            referencedRelation: "workout_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      check_ins: {
        Row: CheckIn;
        Insert: Partial<CheckIn> & { user_id: string };
        Update: Partial<CheckIn>;
        Relationships: [];
      };
      streaks: {
        Row: Streak;
        Insert: Partial<Streak> & { user_id: string };
        Update: Partial<Streak>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & { user_id: string };
        Update: Partial<Subscription>;
        Relationships: [];
      };
      habits: {
        Row: Habit;
        Insert: Partial<Habit> & {
          user_id: string;
          name: string;
          category: HabitCategory;
          frequency: number;
        };
        Update: Partial<Habit>;
        Relationships: [];
      };
      habit_completion: {
        Row: HabitCompletion;
        Insert: Partial<HabitCompletion> & { habit_id: string };
        Update: Partial<HabitCompletion>;
        Relationships: [
          {
            foreignKeyName: "habit_completion_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      days_since_events: {
        Row: DaysSinceEvent;
        Insert: Partial<DaysSinceEvent> & { user_id: string; event_type: DaysSinceEventType };
        Update: Partial<DaysSinceEvent>;
        Relationships: [];
      };
      momentum_scores: {
        Row: MomentumScore;
        Insert: Partial<MomentumScore> & {
          user_id: string;
          training_score: number;
          habits_score: number;
          nutrition_score: number;
          consistency_score: number;
          total_score: number;
        };
        Update: Partial<MomentumScore>;
        Relationships: [];
      };
      analytics_events: {
        Row: AnalyticsEvent;
        Insert: Partial<AnalyticsEvent> & { event_name: string };
        Update: Partial<AnalyticsEvent>;
        Relationships: [];
      };
      processed_stripe_events: {
        Row: ProcessedStripeEvent;
        Insert: Partial<ProcessedStripeEvent> & { event_id: string };
        Update: Partial<ProcessedStripeEvent>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
