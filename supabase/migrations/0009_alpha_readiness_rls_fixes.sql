-- Alpha readiness audit: the same RLS write-policy gap already found and
-- fixed for momentum_scores in migration 0007 exists in three more tables.
-- Each is called with the SESSION client (not service-role) from a
-- user-triggered route, and none of those call sites check the returned
-- error, so the write was either silently dropped or surfaced as an
-- unexplained 500 depending on whether it hit insert or update.

-- days_since_events: had select-only. touchDaysSinceEvent() upserts via the
-- session client from checkin/route.ts, workouts/log/route.ts, and
-- habits/[id]/complete/route.ts — every user-triggered "Days Since" touch
-- was being silently rejected by RLS.
create policy "days_since_events: insert own" on public.days_since_events
  for insert with check (auth.uid() = user_id);
create policy "days_since_events: update own" on public.days_since_events
  for update using (auth.uid() = user_id);

-- check_ins: had select+insert only. The upsert's onConflict path (a
-- same-day check-in resubmission) requires an UPDATE policy, which never
-- existed — this one surfaces as a real 500, unlike the silent case above.
create policy "check_ins: update own" on public.check_ins
  for update using (auth.uid() = user_id);

-- habit_completion: had select+insert+delete(today only). Same upsert/
-- onConflict gap — completing an already-completed day again (a double
-- tap or client retry) hits the UPDATE path and fails RLS.
create policy "habit_completion: update own" on public.habit_completion
  for update using (
    exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

-- workout_logs.plan_day_id has a correct FK + on delete set null, but no
-- index — src/lib/todays-workout.ts filters .in("plan_day_id", ...) on
-- every dashboard/workout page load, and every plan_days cascade has to
-- scan this table to null out the reference.
create index workout_logs_plan_day_idx on public.workout_logs (plan_day_id);
