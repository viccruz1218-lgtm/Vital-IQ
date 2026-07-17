# VitalIQ Build Execution Plan v1

Phase 1 (Core Identity Loop) is built. This is what shipped, what's left in the
first 30 days, and how alpha launch works. Strategy lives in the earlier docs
in this repo's conversation history — this one only covers what unblocks
building.

## 1. What shipped this pass

- Vital Contract onboarding (identity statement, main motivation, quit
  pattern, folded into the existing onboarding conversation)
- Habit Engine (create, complete, streaks, completion rate)
- Days Since tracking (workout, nutrition habit, morning routine, check-in)
- Vital Momentum Score (deterministic, 4-pillar, no AI in the calculation)
- Basic Comeback System (single 7-day trigger, delivered as a Vi message)
- Alpha experiment scaffolding (`experiment_group` on profiles, randomized
  at signup, gates Coach/Habits/Momentum/Days-Since behind the "full" arm)
- Internal analytics event log (no third-party dependency yet)

## 2. Database migrations

`supabase/migrations/0002_consistency_engine.sql` — run this against the
Supabase project after `0001_init.sql`. Adds:

- `profiles.identity_statement`, `main_motivation`, `quit_pattern`,
  `experiment_group` (randomized 50/50 at signup via the updated
  `handle_new_user()` trigger)
- `habits`, `habit_completion`
- `days_since_events`
- `momentum_scores`
- `analytics_events`

All new tables have RLS scoped to `auth.uid()`; `days_since_events` and
`momentum_scores` are written only by server code (no end-user insert/update
policy), matching the existing `subscriptions` pattern.

## 3. Frontend components

| Component | Path | Notes |
|---|---|---|
| `MomentumCard` | `src/components/dashboard/momentum-card.tsx` | Presentational — 4-pillar breakdown |
| `DaysSinceCard` | `src/components/dashboard/days-since-card.tsx` | Presentational — calm styling, no alarm red until 7d+ |
| `HabitChecklist` | `src/components/dashboard/habit-checklist.tsx` | Client — one-tap complete, optimistic UI + `router.refresh()` |
| `CreateHabitForm` | `src/components/dashboard/create-habit-form.tsx` | Client — manual habit creation |
| `/dashboard/habits` page | `src/app/dashboard/habits/page.tsx` | Full habit list + create form, gated to the "full" arm |
| `/dashboard` page | `src/app/dashboard/page.tsx` | Extended: renders Momentum/Days-Since/Habits only for `experiment_group !== "control"` |

## 4. API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/habits` | GET, POST | List active habits / create a habit |
| `/api/habits/[id]/complete` | POST | Mark complete, recompute streak + momentum, touch Days Since |
| `/api/momentum` | GET | 30-day score history |
| `/api/momentum/today` | GET | Today's score, computed on demand if missing |
| `/api/days-since` | GET | All live counters for the current user |
| `/api/cron/nightly` | GET (Vercel Cron only) | Recomputes Days Since + Momentum for every user, fires Comeback messages |

## 5. AI prompt updates (`src/lib/ai/persona.ts`)

- `ONBOARDING_SYSTEM_PROMPT` — rewritten around the Vital Contract flow
  (identity → goal → motivation → quit pattern → schedule), calls
  `save_onboarding_profile` then `seed_starter_habits` (1-2 habits max)
- `coachSystemPrompt()` — now includes identity statement, main motivation,
  and quit pattern in every coach conversation's context
- `comebackSystemPrompt()` — new; single-tier 7-day message, banned-phrase
  list enforced in the prompt itself

## 6. Analytics events (`analytics_events` table, via `src/lib/analytics.ts`)

`onboarding_completed`, `habit_created` (tagged `source: onboarding_seed` or
`manual`), `habit_completed`, `workout_logged`, `check_in_submitted`,
`vi_conversation`, `comeback_message_sent`, `app_opened`. Weekly Consistency
Rate, D7/D30, and comeback recovery rate are all computable from this table
plus `habit_completion` / `workout_logs` — no separate tracking needed.

## 7. First 30 days — what's left

Everything above is Week 1's actual scope, done ahead of schedule since the
underlying auth/DB/workout/billing infrastructure already existed. What's
left before alpha:

- **Remaining Week 1-2 work:** dogfood the full loop personally for at least
  a few real days; fix whatever the founder's own usage surfaces before any
  outside user sees it.
- **Week 3:** wire `CRON_SECRET` and the Vercel Cron schedule in a real
  deployment; verify a simulated 7-day-inactive test account actually
  receives the comeback message end-to-end.
- **Week 4:** build the 40-user recruiting list (Part 8), stratify by
  fitness level / schedule / prior app experience before randomizing, and
  confirm the `experiment_group` split lands close to 20/20 once real
  signups start (the trigger is a coin flip, not a hard-guaranteed split —
  spot-check after the first 10-15 signups and manually rebalance if it's
  drifted past ~60/40).

## 8. Alpha launch checklist

Launch once, not before, all of the following are true:

- [ ] A new user can complete the Vital Contract and land on a dashboard
      with an identity statement saved
- [ ] A new user can create a habit and mark it complete, and the streak
      updates immediately
- [ ] A workout can be generated and logged, and progressive overload still
      works (unchanged from before this pass — regression-check it)
- [ ] The Momentum Score renders with a sane number on day one for a brand
      new account (no divide-by-zero, no blank pillars)
- [ ] A manually-backdated `days_since_events` row set to 7+ produces a
      Comeback message on the next cron run, and the banned-phrase list
      (streak/failed/broken/restart from zero) is honored
- [ ] A `control`-group test account cannot reach `/dashboard/coach` or
      `/dashboard/habits` even by direct URL
- [ ] `CRON_SECRET` is set in production and the nightly job is scheduled

Do not wait for anything beyond this list — no polish pass, no Weekly
Review, no tiered Comeback System. Those are explicitly deferred.

## 9. User feedback system

- **Weekly interview**, every alpha user, same cadence for both experiment
  arms — see the interview questions already defined in the validation plan.
- **In-app pulse:** none built yet — for 40 users, a personal weekly message
  (email or text) asking two questions is faster to ship than a survey
  widget and won't contaminate the frozen experiment UI.
- **Churn signal:** a lapsed user (Days Since ≥ 14 with no return) triggers
  a personal founder outreach, not just the automated Comeback message —
  the automated message is the product being tested; the personal follow-up
  is how the founder learns why it did or didn't work.
