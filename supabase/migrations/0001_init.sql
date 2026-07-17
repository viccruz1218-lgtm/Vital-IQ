-- VitalIQ MVP schema
-- Run against a Supabase Postgres project (SQL editor or `supabase db push`).

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users, holds onboarding data
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  age int check (age between 13 and 100),
  height_cm numeric check (height_cm between 100 and 250),
  weight_kg numeric check (weight_kg between 30 and 300),
  goal text check (goal in ('build_muscle', 'lose_fat', 'get_back_in_shape', 'improve_performance')),
  fitness_level text check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  equipment text[] not null default '{}', -- e.g. {full_gym, dumbbells, bodyweight}
  schedule_days_per_week int check (schedule_days_per_week between 1 and 7),
  injuries text, -- free text notes on injuries/limitations, null if none
  coaching_tone text not null default 'direct' check (coaching_tone in ('direct', 'encouraging')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a blank profile row the moment a user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- chat_messages: shared transcript store for the onboarding conversation
-- and ongoing "Vi" coach chat, distinguished by `context`.
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  context text not null check (context in ('onboarding', 'coach')),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_user_context_idx on public.chat_messages (user_id, context, created_at);

alter table public.chat_messages enable row level security;

create policy "chat_messages: select own" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "chat_messages: insert own" on public.chat_messages
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- workout_plans / plan_days / plan_exercises: the AI-generated program
-- ---------------------------------------------------------------------------
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  goal_summary text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create index workout_plans_user_status_idx on public.workout_plans (user_id, status);

alter table public.workout_plans enable row level security;

create policy "workout_plans: select own" on public.workout_plans
  for select using (auth.uid() = user_id);
create policy "workout_plans: insert own" on public.workout_plans
  for insert with check (auth.uid() = user_id);
create policy "workout_plans: update own" on public.workout_plans
  for update using (auth.uid() = user_id);

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  day_label text not null, -- e.g. "Day 1 — Push"
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index plan_days_plan_idx on public.plan_days (plan_id, order_index);

alter table public.plan_days enable row level security;

create policy "plan_days: select own" on public.plan_days
  for select using (
    exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid())
  );
create policy "plan_days: insert own" on public.plan_days
  for insert with check (
    exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid())
  );

create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days (id) on delete cascade,
  order_index int not null default 0,
  exercise_name text not null,
  target_sets int not null,
  target_reps text not null, -- e.g. "8-12" or "AMRAP"
  notes text,
  created_at timestamptz not null default now()
);

create index plan_exercises_day_idx on public.plan_exercises (plan_day_id, order_index);

alter table public.plan_exercises enable row level security;

create policy "plan_exercises: select own" on public.plan_exercises
  for select using (
    exists (
      select 1 from public.plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = plan_day_id and p.user_id = auth.uid()
    )
  );
create policy "plan_exercises: insert own" on public.plan_exercises
  for insert with check (
    exists (
      select 1 from public.plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = plan_day_id and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- workout_logs / set_logs: what the user actually did
-- ---------------------------------------------------------------------------
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_day_id uuid references public.plan_days (id) on delete set null,
  performed_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index workout_logs_user_date_idx on public.workout_logs (user_id, performed_at desc);

alter table public.workout_logs enable row level security;

create policy "workout_logs: select own" on public.workout_logs
  for select using (auth.uid() = user_id);
create policy "workout_logs: insert own" on public.workout_logs
  for insert with check (auth.uid() = user_id);
create policy "workout_logs: update own" on public.workout_logs
  for update using (auth.uid() = user_id);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  exercise_name text not null,
  set_number int not null,
  reps int not null check (reps >= 0),
  weight_kg numeric not null check (weight_kg >= 0),
  created_at timestamptz not null default now()
);

create index set_logs_workout_idx on public.set_logs (workout_log_id);
create index set_logs_exercise_idx on public.set_logs (exercise_name);

alter table public.set_logs enable row level security;

create policy "set_logs: select own" on public.set_logs
  for select using (
    exists (select 1 from public.workout_logs w where w.id = workout_log_id and w.user_id = auth.uid())
  );
create policy "set_logs: insert own" on public.set_logs
  for insert with check (
    exists (select 1 from public.workout_logs w where w.id = workout_log_id and w.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- check_ins: daily check-in feeding the streak
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  check_in_date date not null default current_date,
  energy_level int check (energy_level between 1 and 5),
  soreness int check (soreness between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, check_in_date)
);

alter table public.check_ins enable row level security;

create policy "check_ins: select own" on public.check_ins
  for select using (auth.uid() = user_id);
create policy "check_ins: insert own" on public.check_ins
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- streaks: one row per user, updated whenever a check-in or workout log lands
-- ---------------------------------------------------------------------------
create table public.streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date,
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

create policy "streaks: select own" on public.streaks
  for select using (auth.uid() = user_id);
create policy "streaks: upsert own" on public.streaks
  for insert with check (auth.uid() = user_id);
create policy "streaks: update own" on public.streaks
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- subscriptions: Stripe billing state
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none' check (
    status in ('none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete')
  ),
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: select own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Note: subscriptions rows are written only by the Stripe webhook handler
-- using the service-role key, which bypasses RLS — no insert/update policy
-- is granted to end users on purpose.
