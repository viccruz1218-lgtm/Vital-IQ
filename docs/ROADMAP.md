# VitalIQ MVP — Development Roadmap

## What's built (this repo, v0)

- Supabase auth (email/password) with a `proxy.ts` session guard on `/dashboard` and `/onboarding`
- `profiles` table auto-created per signup via a Postgres trigger, RLS on every table
- AI onboarding conversation (`/onboarding`) — Claude tool-use extracts goal, fitness level,
  age, height, weight, equipment, schedule, injuries, coaching tone into `profiles`
- Vi coach chat (`/dashboard/coach`) — persistent history in `chat_messages`, can call
  `generate_workout_plan` mid-conversation
- AI workout plan generation (`/api/workouts/generate`) — structured plan persisted to
  `workout_plans` / `plan_days` / `plan_exercises`
- Workout logging with progressive-overload comparison (`/dashboard/workout`,
  `/dashboard/workout/history`)
- Daily check-in + streak system (`/dashboard/checkin`, `streaks` table)
- Dashboard: today's workout, weekly adherence, streak, latest Vi message
- Stripe subscription checkout, billing portal, and webhook-driven status sync

## Before this can take real signups

1. **Supabase project** — run `supabase/migrations/0001_init.sql` against a real project,
   fill in `.env.local` from `.env.example` (URL, anon key, service role key).
2. **Anthropic API key** — set `ANTHROPIC_API_KEY`. Confirm `claude-opus-4-8` access on the
   account (used for both the coach conversation and structured extraction/plan generation —
   swap `FAST_MODEL` in `src/lib/ai/anthropic.ts` to a cheaper model once message volume
   makes that worth doing).
3. **Stripe** — create the monthly/yearly Prices in the Stripe dashboard, set
   `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_YEARLY`, point a webhook endpoint at
   `/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.*`,
   and set `STRIPE_WEBHOOK_SECRET`.
4. **Enforce the free-tier message cap.** The schema and chat routes don't yet block usage
   past 5 messages/day on the free plan — that's the entire monetization mechanism from the
   blueprint and is the highest-priority follow-up.
5. **Email confirmation copy** — Supabase's default confirmation email works but is
   unbranded; customize it in the Supabase dashboard before real users sign up.

## Next 90 days (post-launch)

| Weeks | Focus |
|---|---|
| 1–2 | Ship the above, invite 20–30 people from personal network for a manual/concierge beta |
| 3–4 | Add the free-tier message cap + upgrade prompt; fix whatever breaks from real usage |
| 5–6 | Food logging (calorie/macro targets, manual search) — the nutrition half of the loop |
| 7–8 | Push notifications: morning briefing, re-engagement after 3 quiet days |
| 9–10 | Wearable sync (HealthKit/Google Fit) for sleep/steps feeding the dashboard |
| 11–12 | Native app decision — only if web retention (D30) justifies the investment |

## Explicitly deferred (per the original blueprint)

Food photo analysis, grocery lists, progress photos, full gamification (levels/challenges),
social features, corporate wellness, supplements marketplace. None of these matter if the
core loop — talk to Vi daily, get a plan, log it, see progress — doesn't retain people first.
