-- M4: Weekly Review — a reflection loop over the just-completed week
-- (Sunday-Saturday, matching the week boundary dashboard/page.tsx already
-- uses for "sessions this week"). One row per user per week.
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  wins text[] not null default '{}',
  friction_points text[] not null default '{}',
  patterns text not null default '',
  next_week_focus text not null default '',
  momentum_snapshot jsonb not null default '{}',
  consistency_rate int not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index weekly_reviews_user_week_idx on public.weekly_reviews (user_id, week_start desc);

alter table public.weekly_reviews enable row level security;

create policy "weekly_reviews: select own" on public.weekly_reviews
  for select using (auth.uid() = user_id);
create policy "weekly_reviews: insert own" on public.weekly_reviews
  for insert with check (auth.uid() = user_id);

-- Deliberately no update/delete policy for any role but service_role
-- (which bypasses RLS entirely) — a weekly review is a historical record
-- of what Vi observed at generation time and must never be editable
-- afterward, by the user or by a later recompute.
