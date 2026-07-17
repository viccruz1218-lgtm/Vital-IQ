-- M3: Momentum Score revision — 5 pillars (Training 25% / Habits 25% /
-- Nutrition 20% / Recovery 20% / Consistency 10%) instead of the original
-- 4 equal-weighted pillars, plus a fix for a real bug found on review.

-- habits_score/nutrition_score/recovery_score can now legitimately be
-- absent (no active habits in that category yet, no check-ins yet) —
-- calculateMomentumScore excludes unavailable pillars from the weighted
-- average rather than faking a value, so these must allow null.
alter table public.momentum_scores
  alter column habits_score drop not null,
  alter column nutrition_score drop not null,
  add column recovery_score int;

-- BUG FIX: momentum_scores had select-own only — no insert/update policy
-- for the authenticated role. calculateMomentumScore's upsert() is called
-- with the per-session client from checkin/route.ts, workouts/log/route.ts,
-- and habits/[id]/complete/route.ts, and none of those call sites checked
-- the returned error — so every user-triggered momentum recompute was
-- silently rejected by RLS all along. The score only ever actually
-- persisted once nightly, via the cron's service-role client. Since the
-- values themselves are entirely server-computed from the user's own data
-- (never client-supplied), letting a user's own session write their own
-- computed row is safe — same trust model as habits/habit_completion.
create policy "momentum_scores: insert own" on public.momentum_scores
  for insert with check (auth.uid() = user_id);
create policy "momentum_scores: update own" on public.momentum_scores
  for update using (auth.uid() = user_id);
