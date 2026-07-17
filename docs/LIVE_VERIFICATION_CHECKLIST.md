# Live Verification Checklist

Everything below has only been verified statically (code review, migration
review, and Vitest against an in-memory fake Supabase client — see
`src/lib/__tests__/fake-supabase.ts`). None of it has touched a real Postgres
instance, real Supabase Auth, real Stripe, or a real Anthropic API call.
This is the exact list of what to run once real credentials are connected,
before inviting the first alpha users.

For each item: what to do, and what a pass looks like.

---

## 1. Database / RLS

Run every migration `0001` through `0009` against a fresh Supabase project
(`supabase db push` or paste them into the SQL editor in order), then:

- [ ] **days_since_events write path** — as a real logged-in user (not
  service role), log a workout, complete a habit, or submit a check-in.
  Confirm a row appears/updates in `days_since_events` for that user. This
  was failing silently before migration `0009` — confirm it isn't anymore.
- [ ] **check_ins same-day resubmission** — submit a check-in twice in one
  day. The second submission should update the existing row (200), not
  fail with a 500.
- [ ] **habit_completion double-tap** — complete the same habit twice in a
  row quickly (or resend the same request). Second call should succeed
  (idempotent update), not 500.
- [ ] **momentum_scores write path** (already fixed in a prior pass, but
  re-confirm on a real project) — log a workout as a session-authenticated
  user and confirm a `momentum_scores` row is written immediately, not only
  after the nightly cron runs.
- [ ] **weekly_reviews immutability** — as a real user, attempt a direct
  `update` or `delete` on your own `weekly_reviews` row via the Supabase
  client with just the anon key + your session (not service role). It
  should be rejected — no update/delete policy exists for any non-service
  role.
- [ ] **profiles protected fields** — attempt a direct client-side update of
  `experiment_group` or `onboarding_completed` using a normal user session
  (not through the app's routes). Should raise `experiment_group cannot be
  modified directly` (the `protect_profile_admin_fields` trigger).
- [ ] **Cross-user isolation** — with two real test accounts, confirm
  neither can read the other's `habits`, `habit_completion`,
  `momentum_scores`, `weekly_reviews`, or `days_since_events` rows via the
  Supabase client directly (not just through the app UI).
- [ ] **workout_logs.plan_day_id index** — confirm it exists (`\d
  workout_logs` in `psql`, or the Supabase table editor's index list).

## 2. Authentication

- [ ] **Check the actual Supabase Auth setting**: Authentication → Providers
  → Email → "Confirm email" toggle. Note whether it's ON or OFF — this
  determines which of the next two paths you're actually testing.
- [ ] **Signup with confirmation ON**: sign up with a real email. You should
  land on a "Check your email" screen (not `/onboarding`, not bounced to
  `/login`). Click the confirmation link. Confirm you land on `/onboarding`
  with a live session.
- [ ] **Signup with confirmation OFF**: sign up. You should land directly on
  `/onboarding` with a live session, no email step.
- [ ] **Login** — wrong password shows a real error, not a blank/broken
  page. Correct password reaches `/dashboard`.
- [ ] **Logout** — session actually clears (confirm by trying to load
  `/dashboard` directly after logging out — should redirect to `/login`).
- [ ] **Password reset, happy path** — request a reset, click the emailed
  link, confirm you land on a live "Set a new password" form (not the
  "This link has expired" state), submit a new password, confirm you can
  log in with it.
- [ ] **Password reset, expired/reused link** — click an old/already-used
  reset link. Confirm you see "This link has expired" immediately, not a
  live form that fails after you submit.
- [ ] **Onboarding re-entry guard** — after completing onboarding, manually
  navigate to `/onboarding` again. Confirm you're redirected to
  `/dashboard`, not shown the onboarding chat again.
- [ ] **Protected routes** — while logged out, try loading `/dashboard`,
  `/dashboard/habits`, `/admin`, `/onboarding` directly by URL. All should
  redirect to `/login`.
- [ ] **Admin gate** — set `ADMIN_EMAILS` to a real address, confirm that
  account can reach `/admin`, and confirm a different real (non-admin)
  account is redirected away from `/admin`.

## 3. AI / Claude calls

- [ ] **Onboarding chat end-to-end** — complete a full onboarding
  conversation with a real Claude API key. Confirm `save_onboarding_profile`
  and `seed_starter_habits` actually fire, the profile fields land in the
  database correctly, and 1-2 habits get created (not more).
- [ ] **Coach chat** — ask Vi a few questions, confirm replies come back
  and are stored in `chat_messages`. Ask it to build/change a plan, confirm
  `generate_workout_plan` persists correctly.
- [ ] **Induced failure test** — temporarily set `ANTHROPIC_API_KEY` to an
  invalid value and try onboarding chat, coach chat, and workout plan
  generation. Confirm each returns a clean error response (502) with a
  human-readable message — not a raw 500/crash. Restore the real key
  afterward.
- [ ] **Rate limiting** — send 20+ messages within a minute on the same
  route (e.g. coach chat) and confirm the 21st is rejected with a 429 and a
  clear message, not silently processed.
- [ ] **Weekly review, real generation** — with a test account that has a
  full week of real activity, call `GET /api/weekly-review/current` (or
  visit `/dashboard/weekly-review`) and confirm a real Claude-authored
  review is generated, saved, and idempotent (calling it again returns the
  same row, doesn't re-call Claude — check Anthropic usage/dashboard to
  confirm no duplicate call).
- [ ] **Weekly review, empty week** — with a test account that logged
  nothing in the target week, confirm the review generates instantly with
  the deterministic empty-week content and does NOT show up as an Anthropic
  API call in your usage dashboard.
- [ ] **Comeback message, real send** — manually mark a test account
  inactive (or wait for real inactivity) and manually trigger the cron.
  Confirm exactly one comeback message is inserted into `chat_messages`,
  `last_comeback_sent_at` updates, and `comeback_message_sent` is tracked.

## 4. Cron

- [ ] **Manual trigger** — `curl -H "Authorization: Bearer $CRON_SECRET"
  https://<your-domain>/api/cron/nightly` against the deployed app. Confirm
  a 200 (or 500 only if you intentionally broke something), and read the
  JSON summary.
- [ ] **Vercel Function Logs** — after the manual trigger, check Vercel's
  logs for the `[cron/nightly] done — ...` summary line and confirm it's
  there (this is new — added during this pass specifically so a clean run
  is visible, not just failures).
- [ ] **Malformed auth rejected** — `curl` the same endpoint with no header,
  and with a wrong bearer token. Both should 401.
- [ ] **Sunday-only weekly review gate** — confirm `generateWeeklyReview` is
  only attempted when the server's UTC day-of-week is Sunday (check the
  JSON summary's `weekly_reviews_generated` count on a non-Sunday manual
  trigger — should be 0 unless you fake the date).
- [ ] **Concurrent trigger** — fire the cron endpoint twice in quick
  succession (two terminal tabs, near-simultaneous `curl`). Confirm no
  duplicate comeback messages are sent to the same user, and if two
  requests race on the same user's weekly review, one succeeds cleanly and
  the other returns the same saved row rather than erroring.

## 5. Stripe (test mode)

- [ ] **Checkout** — complete a real Stripe test-mode checkout with a test
  card. Confirm `subscriptions` gets a row with the real customer/
  subscription IDs and `pro_upgrade` is tracked in `analytics_events`.
- [ ] **Webhook delivery** — use the Stripe CLI (`stripe listen --forward-to
  <url>/api/stripe/webhook`) or the dashboard's webhook test-send feature to
  confirm `checkout.session.completed`, `customer.subscription.updated`,
  and `customer.subscription.deleted` all land and update `subscriptions`
  correctly.
- [ ] **Webhook replay** — resend the same webhook event from the Stripe
  dashboard (or CLI) twice. Confirm the second delivery is deduplicated
  (`processed_stripe_events`) and doesn't double-track `pro_upgrade`.
- [ ] **Invalid signature** — `curl` the webhook endpoint with a bogus
  `stripe-signature` header. Confirm 400, not a crash.
- [ ] **Cancellation** — cancel the test subscription from the Stripe
  dashboard, confirm the webhook updates `subscriptions.status` correctly.

## 6. Analytics / admin dashboard

- [ ] Load `/admin` with real data and confirm every number renders (no
  crashes on null/zero data with a fresh project).
- [ ] Confirm the new Weekly Consistency Rate trend indicator (↑/↓ vs. prior
  week) shows a sensible number once there are two weeks of real data.
- [ ] Load `/admin/users`, confirm the founder table sorts correctly by
  every column with real user rows.

---

## Known gaps this checklist does NOT close

These require product/business judgment, not just live testing, and were
intentionally left out of the "fix only critical issues" pass:

- `comeback_recovered` isn't tracked as its own event — recovery is only
  inferred after the fact from other activity events (see
  `src/lib/admin-metrics.ts`'s `comebackSuccessRate`).
- `pro_upgrade` isn't tracked on subscription reactivation without a
  `client_reference_id` (an edge case: `customer.subscription.updated`
  firing for a resubscribe that didn't go through a fresh checkout session).
- Cron headroom (`maxDuration = 300`) was sized for the current alpha scale
  (up to ~40 users, up to 2 sequential Claude calls each on Sundays) — revisit
  before the cohort grows meaningfully past that.
