-- M2 completeness pass on Habits + Streaks + Days Since: habit_completion
-- previously had select/insert only, so a mis-tapped habit could never be
-- undone. Scoped to TODAY only — this is a correction mechanism, not a way
-- to rewrite completion history that momentum/admin-metrics already read.
create policy "habit_completion: delete own today" on public.habit_completion
  for delete using (
    date = current_date
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

-- Archiving a habit reuses the existing "habits: update own" policy — no
-- new policy needed, just an API route (see src/app/api/habits/[id]/route.ts).
