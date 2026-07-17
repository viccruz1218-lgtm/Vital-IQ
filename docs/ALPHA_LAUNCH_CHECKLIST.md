# Alpha Launch Checklist

## Before first user

- [ ] **Supabase connected** — real project, all 9 migrations (`0001`-`0009`)
  applied in order, confirmed against `docs/LIVE_VERIFICATION_CHECKLIST.md`
  section 1.
- [ ] **Stripe test mode verified** — checkout, webhook delivery, webhook
  replay dedup, and cancellation all confirmed live (checklist section 5).
- [ ] **Cron verified** — manually triggered once, JSON summary and Vercel
  Function Logs both checked, malformed-auth rejection confirmed
  (checklist section 4).
- [ ] **Email auth verified** — confirmed whether the live project requires
  email confirmation, and walked the matching signup path end-to-end
  (checklist section 2).
- [ ] **RLS tested** — cross-user isolation confirmed with two real
  accounts; protected-field triggers confirmed (checklist section 1).
- [ ] **Signup tested** — real email, real password, correct redirect for
  whichever confirmation setting the live project actually has.
- [ ] **Onboarding tested** — full conversation with a real Claude key,
  `save_onboarding_profile` and `seed_starter_habits` both confirmed to
  land correctly, re-entry guard confirmed.
- [ ] **Habit completion tested** — create, complete, undo (same-day),
  archive — all confirmed against the real database, not the fake test
  client.
- [ ] **Momentum tested** — score appears after a real logged action (not
  only after the nightly cron), pillar breakdown looks sane, null pillars
  render as "not enough data" rather than blank.
- [ ] **Weekly Review tested** — one real generation with actual Claude
  output, one empty-week case, idempotency confirmed (second call doesn't
  regenerate).
- [ ] **Comeback tested** — one real trigger + send confirmed, cooldown
  confirmed (can't send twice in the same window).

**Do not invite the first alpha user until every box above is checked
against the real Supabase/Stripe/Anthropic project** — everything shipped
in this pass was verified against a fake in-memory database and mocked AI
client (see `src/lib/__tests__/fake-supabase.ts`), which is real verification
of the logic but not of the actual live systems.

## After launch

### Daily

- **Active users** — DAU from `/admin` (`analytics_events`, distinct users
  in the last 24h).
- **Consistency rate** — Weekly Consistency Rate from `/admin`, and whether
  the new ↑/↓-vs-prior-week indicator is moving in the right direction.
- **Bugs** — check Vercel Function Logs for anything logged by the
  `console.error` calls added throughout this pass (cron failures, AI call
  failures, webhook processing failures) — these are the errors that
  matter, distinct from expected per-user isolation errors.

### Weekly

- **Retention** — WAU from `/admin`, and whether users from week 1 are
  still showing up in week 2+ (`/admin/users`' `last_active` column,
  sorted).
- **User feedback** — whatever channel you're using outside the app (email,
  a shared doc, a Slack channel) — there's no in-app feedback mechanism
  built, so this has to be manual for the alpha.
- **Habit completion** — habit completion % from `/admin`, and per-user
  outliers (very low or suspiciously perfect) from `/admin/users`.
- **Where users break** — read `/admin/users` for anyone with a high
  `days_since_workout`/`days_since_check_in` who hasn't gotten (or hasn't
  responded to) a comeback message yet, and cross-check the Weekly Review
  history for recurring `friction_points` across users — that's the
  closest signal to "where the loop is breaking" until a dedicated
  `comeback_recovered` event exists (see the known-gaps section of the live
  verification checklist).
