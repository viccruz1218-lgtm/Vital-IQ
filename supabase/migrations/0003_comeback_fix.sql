-- Fixes the Comeback System bug where any single Days Since counter
-- (e.g. a neglected "morning routine" habit) could fire a comeback message
-- even for an otherwise-active user. Comeback now fires based on overall
-- inactivity (see isUserInactive() in src/lib/days-since.ts), tracked here
-- with a cooldown so a still-inactive user isn't messaged every night.
alter table public.profiles
  add column last_comeback_sent_at timestamptz;

-- days_since_events.last_notified_at_days is no longer read by the Comeback
-- System (it drove the buggy per-counter trigger) — the column is left in
-- place since it's harmless and the table itself still powers the "Days
-- Since" display chips, which are unaffected by this fix.
