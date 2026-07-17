-- Phase 1: Core Identity Loop — Vital Contract, Habit Engine, Days Since,
-- Momentum Score, Comeback System, plus a lightweight internal event log.

-- ---------------------------------------------------------------------------
-- Vital Contract fields, added directly to profiles (not a new table) —
-- they're 1:1 per user identity/onboarding data, same as the columns
-- already there (goal, fitness_level, schedule_days_per_week, injuries).
-- experiment_group drives the alpha A/B: 'full' gets the whole consistency
-- engine, 'control' sees only the pre-existing workout tracking experience.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column identity_statement text,
  add column main_motivation text,
  add column quit_pattern text,
  add column experiment_group text not null default 'full'
    check (experiment_group in ('full', 'control'));

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null check (category in ('fitness', 'nutrition', 'lifestyle')),
  frequency int not null check (frequency between 1 and 7),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  current_streak int not null default 0,
  longest_streak int not null default 0,
  completion_rate numeric not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create index habits_user_status_idx on public.habits (user_id, status);

alter table public.habits enable row level security;

create policy "habits: select own" on public.habits
  for select using (auth.uid() = user_id);
create policy "habits: insert own" on public.habits
  for insert with check (auth.uid() = user_id);
create policy "habits: update own" on public.habits
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Habit Completion
-- ---------------------------------------------------------------------------
create table public.habit_completion (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null default current_date,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

create index habit_completion_habit_idx on public.habit_completion (habit_id, date);

alter table public.habit_completion enable row level security;

create policy "habit_completion: select own" on public.habit_completion
  for select using (
    exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );
create policy "habit_completion: insert own" on public.habit_completion
  for insert with check (
    exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Days Since Events — one live row per user per tracked behavior
-- ---------------------------------------------------------------------------
create table public.days_since_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in ('workout', 'nutrition_habit', 'morning_routine', 'check_in')
  ),
  last_completed_date date,
  current_days int not null default 0,
  last_notified_at_days int, -- prevents re-firing the same threshold daily
  updated_at timestamptz not null default now(),
  unique (user_id, event_type)
);

alter table public.days_since_events enable row level security;

create policy "days_since_events: select own" on public.days_since_events
  for select using (auth.uid() = user_id);

-- Written only by the server (service role in the cron job) — no insert/update
-- policy granted to end users directly.

-- ---------------------------------------------------------------------------
-- Momentum Scores — deterministic, one row per user per day
-- ---------------------------------------------------------------------------
create table public.momentum_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score_date date not null default current_date,
  training_score int not null,
  habits_score int not null,
  nutrition_score int not null,
  consistency_score int not null,
  total_score int not null,
  created_at timestamptz not null default now(),
  unique (user_id, score_date)
);

create index momentum_scores_user_date_idx on public.momentum_scores (user_id, score_date desc);

alter table public.momentum_scores enable row level security;

create policy "momentum_scores: select own" on public.momentum_scores
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Analytics events — lightweight internal log (no third-party dependency
-- yet). Exportable to PostHog later without changing the write path.
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index analytics_events_user_name_idx on public.analytics_events (user_id, event_name, created_at);

alter table public.analytics_events enable row level security;

create policy "analytics_events: select own" on public.analytics_events
  for select using (auth.uid() = user_id);
create policy "analytics_events: insert own" on public.analytics_events
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Randomize experiment_group at signup — "randomize after signup, do not
-- let users choose." A straight 50/50 coin flip; stratifying the alpha
-- cohort by fitness level/schedule (per the validation plan) is done by
-- the founder at recruiting time, not in this trigger.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, experiment_group)
  values (new.id, new.email, case when random() < 0.5 then 'full' else 'control' end);
  return new;
end;
$$;
