-- Phase 3 core-experience gap: there was no body-weight-over-time tracking
-- anywhere — profiles.weight_kg is set once at onboarding and never
-- updated. This adds a dedicated log table, mirroring check_ins' shape
-- (one row per user per day, RLS-scoped to the owner).

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null default current_date,
  weight_kg numeric not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, logged_date)
);

alter table public.weight_logs enable row level security;

create policy "weight_logs: select own" on public.weight_logs
  for select using (auth.uid() = user_id);
create policy "weight_logs: insert own" on public.weight_logs
  for insert with check (auth.uid() = user_id);
-- Same-day upsert (re-logging today's weight) needs an update policy, same
-- gap migration 0009 fixed for check_ins/habit_completion/days_since_events.
create policy "weight_logs: update own" on public.weight_logs
  for update using (auth.uid() = user_id);

create index weight_logs_user_date_idx on public.weight_logs (user_id, logged_date);
