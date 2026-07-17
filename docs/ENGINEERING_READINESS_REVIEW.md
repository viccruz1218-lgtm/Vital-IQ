# VitalIQ Engineering Readiness Review v1

Conducted against the real codebase in this repo — every finding below was
verified by reading the actual file, not recalled from memory. Where I say
"confirmed," I mean I re-read the code just now and reproduced the reasoning.

**Important caveat that applies to this entire review:** nothing in this repo
has been deployed to a real environment or connected to a live Supabase
project yet. Every check below is local build/lint/read-through verification.
Several items (cron delivery, Stripe webhook delivery, RLS behavior under
real concurrent load) can only be *fully* confirmed against a live deploy —
this review tells you what to fix before that first real deploy, not that
the fixes have been proven against production traffic.

---

## PART 1 — MVP Readiness Checklist

| Area | Item | Status | Reason | Priority | Est. fix |
|---|---|---|---|---|---|
| **Auth** | Signup / login / logout | PASS | Works, session refresh via `proxy.ts` confirmed | — | — |
| **Auth** | Signed-in user can still view `/login`/`/signup` | WARNING | No redirect-away-if-authenticated guard | Low | 15 min |
| **Auth** | Password reset | FAIL | No forgot-password flow exists anywhere | Should Fix | 2-3 hrs (Supabase has this built in) |
| **Auth** | Account deletion | FAIL | No self-serve deletion route or UI exists at all | Should Fix | ~1 day (delete + Stripe cancel + data purge) |
| **Database** | RLS enabled on every table | PASS | Confirmed across both migrations | — | — |
| **Database** | `profiles` column-level write protection | **FAIL** | `for update using (auth.uid() = id)` has no column restriction — a user can call the Supabase client directly and rewrite their own `experiment_group` or `onboarding_completed` | **Critical** | 1-2 hrs (trigger to lock those columns to service-role only) |
| **Database** | Cascade deletes | PASS (untested) | `on delete cascade` wired everywhere, but never exercised since no deletion UI exists | Should Fix | covered by account deletion work |
| **Database** | Unique constraints (habit_completion, momentum_scores, days_since_events) | PASS | Confirmed in migration | — | — |
| **API** | Manual input validation only, no schema validation | WARNING | Routes cast `as {...}` and do ad-hoc null checks; zod is a dependency but unused in any route | Should Fix | ~1 day to add zod schemas to the 6 mutation routes |
| **API** | `/api/stripe/checkout` accepts arbitrary `priceId` | **FAIL** | No server-side allowlist — a direct API call can create a checkout session for any Stripe price ID | **Critical** | 30 min |
| **API** | Rate limiting | **FAIL** | None exists anywhere in the codebase — confirmed via grep | **Critical** | 3-4 hrs (per-user sliding window) |
| **AI** | Onboarding's displayed first message is stale | **FAIL** | `onboarding/page.tsx`'s hardcoded greeting still asks the old "build muscle, lose fat..." question — not the Vital Contract's "who are you becoming" flow the backend prompt now runs | **Critical** | 10 min |
| **AI** | No try/catch around any `anthropic.messages.create` call | WARNING | A Claude API failure (rate limit, network) throws unhandled, returns a bare 500, and the frontend shows no error message beyond clearing "Vi is typing…" | Should Fix | ~2 hrs across 4 routes |
| **AI** | Duplicate starter-habit seeding | WARNING | `seed_starter_habits` has no code-level guard against firing more than once — relies entirely on prompt wording | Should Fix | 1 hr (check `onboarding_completed` before allowing re-seed) |
| **Dashboard/Habits/Momentum** | Functional, confirmed via build + local smoke test | PASS | Renders correctly for both experiment arms | — | — |
| **Dashboard/Habits/Momentum** | No `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere | **FAIL** | Confirmed via filesystem search — zero exist in `src/app` | Should Fix | 2-3 hrs for basic coverage |
| **Days Since** | Timezone handling | WARNING | All date math is server-UTC (`toISOString().slice(0,10)`), not user-local — see Part 3 | Should Fix | Needs a design decision, not a quick patch |
| **Comeback** | Trigger fires on ANY single counter, not overall inactivity | **FAIL** | See Part 3 — contradicts the comeback prompt's own "near-total inactivity" framing | **Critical** | 1-2 hrs |
| **Comeback** | No delivery mechanism beyond the in-app chat thread | **FAIL** | The message lands in `chat_messages`; there's no push/email to tell a dormant user it's there — the exact users it targets have no reason to open the app and see it | Should Fix (real fix is bigger) | Push notifications is a multi-day effort; see Part 10 |
| **Cron** | No per-user error isolation | **FAIL** | A single thrown error (bad AI call, bad row) inside the nightly loop aborts processing for every remaining user that run | **Critical** | 1 hr (wrap each user in try/catch, log and continue) |
| **Analytics** | Coverage gaps against the requested event list | WARNING | See Part 8 for the specific missing events | Should Fix | ~2-3 hrs |
| **Stripe** | Webhook uses `.update()`, not a true upsert | WARNING | If no `subscriptions` row exists for a `stripe_customer_id`, the update silently matches zero rows with no error surfaced | Should Fix | 30 min (log a warning when `count === 0`) |
| **Stripe** | No `subscription_started`/`subscription_cancelled` analytics events | WARNING | Webhook never calls `track()` | Should Fix | 30 min |
| **Security** | Webhook signature verification | PASS | Confirmed correct | — | — |
| **Security** | Cron secret fails closed if unset | PASS | Confirmed — no secret means no access, not open access | — | — |
| **Security** | Free-tier usage caps | **FAIL** | Every blueprint discussed a 5-message/day free cap; it was never implemented — every user currently has unlimited AI access regardless of subscription status | Should Fix (before real paid launch) | Tied to rate limiting work above |
| **Deployment** | Nothing deployed to a live environment yet | **FAIL** | This entire review is local-only; a real Supabase project + Vercel deploy + a live cron firing is still required | **Critical** | See BUILD_EXECUTION_PLAN.md's alpha checklist |

---

## PART 2 — End-to-End Test Plan

| Flow | Steps | Expected result | Failure conditions to watch for |
|---|---|---|---|
| New signup | Sign up with email/password → confirm email → land on onboarding | Session created, `profiles` row auto-created via trigger with a randomized `experiment_group` | Signup succeeds but no profile row appears (trigger failed silently) |
| Returning login | Log in with existing credentials | Redirected to `/dashboard`, correct experiment-arm UI shown | Wrong arm's UI renders (nav/dashboard gating bug) |
| Onboarding | Answer identity/goal/motivation/quit-pattern/schedule questions in the chat | `save_onboarding_profile` and `seed_starter_habits` both fire once; dashboard shows the new identity statement | Habits seeded twice; `onboardingCompleted` never flips true |
| Starter habits | Complete onboarding | 1-2 habits appear on the Habits page and dashboard checklist, matching the conversation's stated gap | Zero habits seeded, or more than 2 |
| Workout logging | Log a session with sets/reps/weight | `workout_logs`/`set_logs` rows created, Momentum recalculates, Days Since "workout" resets to 0 | Momentum doesn't update same-session; Days Since stays stale |
| Habit completion | Tap complete on a habit already done today | Second tap is a no-op (idempotent), streak unchanged | A duplicate `habit_completion` row appears, or the streak double-increments |
| Momentum Score | Complete a habit, refresh dashboard | Score visibly changes without a full page reload feeling broken | Score doesn't update until the next day (stale until cron runs) |
| Days Since counters | Backdate a test row's `last_completed_date` 8 days, run the cron manually | `current_days` reads 8, comeback trigger fires once | Counter doesn't increment; trigger fires every night instead of once |
| Comeback trigger | Same as above, then check `chat_messages` | One assistant message appears, no banned phrases, references the identity statement | Message fires for a user who worked out yesterday but has one stale habit counter (see Part 3) |
| Experiment assignment | Create 10 test signups | Roughly half land in `full`, half in `control`; a `control` account cannot reach `/dashboard/coach` or `/dashboard/habits` by direct URL | Split is wildly skewed (possible with n=10, expected — don't over-read small-sample noise); or a control user can still reach a gated page |
| Subscription upgrade | Click upgrade, complete Stripe test checkout | `subscriptions` row updates to `active`, settings page reflects Premium | Webhook fires but no row updates (customer ID mismatch); price used doesn't match what was clicked |
| Dashboard refresh | Complete an action, hard-refresh the page | State reflects the action, no flash of stale data | Stale habit/momentum data briefly shown then corrects (hydration mismatch) |
| Logout | Click sign out | Session cleared, redirected to `/login`, `/dashboard` now redirects away | Session cookie persists, stale dashboard still loads from cache |
| Account deletion | N/A — feature doesn't exist | — | **This test cannot currently be run — flag as a hard gap, not a passing/failing test** |

---

## PART 3 — Bug Hunt

**Confirmed, real issues found in the actual code:**

- **Onboarding's displayed first message is stale.** `src/app/onboarding/page.tsx` hardcodes a greeting asking about build_muscle/lose_fat/etc. — the exact question the Vital Contract rewrite was supposed to replace with "who are you becoming." The backend prompt was updated; the frontend's canned opener wasn't. Every new user's first impression is currently wrong.
- **Comeback fires per-counter, not per-user-inactivity.** `getUsersDueForComeback()` in `lib/days-since.ts` adds a user to the notify list if *any single* `days_since_events` row (workout, nutrition_habit, morning_routine, or check_in) crosses 7 days — not when the user is broadly inactive. A user who worked out yesterday but hasn't logged a "morning routine" habit in 8 days gets a full "I noticed you've been away" message, which is both factually wrong and undermines trust in a product whose entire pitch is "never hallucinates your history."
- **Cron has no per-user fault isolation.** `src/app/api/cron/nightly/route.ts` runs the momentum-recalculation loop and the comeback loop as plain `for` loops with no try/catch. One bad row or one Anthropic hiccup partway through aborts the rest of that night's run for every remaining user — silently, since the route just returns whatever it got to before throwing.
- **No re-entry guard on `/onboarding`.** A user who already completed onboarding can navigate back to `/onboarding` (the proxy only checks "is logged in," not "has already onboarded") and run the conversation again, potentially re-seeding duplicate starter habits and overwriting their identity statement.
- **`profiles` RLS allows a client to rewrite its own `experiment_group`.** Confirmed — the `for update using (auth.uid() = id)` policy has no `with check` restricting which columns change. Anyone with the (public, by design) anon key and a little curiosity can flip themselves from `control` to `full` directly against Supabase, bypassing the app entirely. This is both a security and a data-integrity problem for the validation experiment specifically.
- **`priceId` in `/api/stripe/checkout` is unvalidated.** Whatever string the client sends becomes the Stripe line item. The UI only ever sends the two real price IDs, but the route itself trusts the input.

**Real edge cases worth tracking, not necessarily "bugs" yet:**

- **Timezone.** All Days Since / Momentum / "this week" math uses `new Date().toISOString().slice(0,10)` — server UTC, not the user's local calendar day. A user near midnight in most US timezones is already living in "tomorrow" by UTC, which can silently break a streak that, from their perspective, they hadn't missed yet.
- **Mid-week habit creation deflates its own Momentum contribution.** A habit created two days ago is scored against its full weekly `frequency` target immediately — there's no proration for habits that haven't existed a full week, so a brand-new habit can look artificially "behind."
- **No AI-call error handling.** If `anthropic.messages.create` throws in the coach chat, onboarding chat, plan generation, or comeback generation, the route throws unhandled. The frontend's `finally` block does clear the "typing" indicator, but the user sees no reply and no error — just silence.
- **Race condition on rapid double-tap.** Tapping "complete" on the same habit twice quickly is safe (the unique constraint on `habit_completion` makes the second write a no-op), but it does trigger a redundant full Momentum recalculation — wasteful, not incorrect.
- **Hydration / loading states.** No `loading.tsx` anywhere means a slow Supabase round-trip on any dashboard route just shows a blank page until the server component resolves — no skeleton, no spinner.
- **No error boundaries.** No `error.tsx` anywhere means any unhandled render-time exception falls through to Next's default error page, with no "something went wrong, try again" recovery UI.
- **Multiple tabs / back button.** Never explicitly tested. Given every mutation triggers `router.refresh()` rather than optimistic local state merging, a second tab left open won't reflect a completion made in the first tab until it's refreshed or navigated — expected Next.js behavior, not a bug, but worth knowing before a user reports "my streak didn't update" while looking at a stale tab.
- **Offline handling.** None exists — a fetch failure from a dropped connection just fails the request; there's no retry or offline banner.
- **Mobile viewport.** Never tested in this review. The Tailwind layout is responsive by convention (flex/grid, no fixed pixel widths spotted), but nothing has been verified on an actual narrow viewport.

---

## PART 4 — Database Consistency Review

- **Duplicate records:** prevented correctly everywhere a unique constraint exists (`habit_completion(habit_id, date)`, `momentum_scores(user_id, date)`, `days_since_events(user_id, event_type)`, `subscriptions(user_id)` as primary key). No gaps found here.
- **Foreign keys / cascade deletes:** consistently `on delete cascade` from every child table back to `auth.users` or its parent row. Correct in principle, entirely untested in practice since no deletion path exists yet (see Part 1).
- **Indexes:** present on the actual hot-path query columns (`habits(user_id, status)`, `habit_completion(habit_id, date)`, `momentum_scores(user_id, date desc)`, `analytics_events(user_id, event_name, created_at)`). Nothing obviously missing for current query patterns.
- **RLS:** enabled everywhere; the one real gap is the `profiles` column-level issue already flagged twice above — it's the single most important database fix in this review.
- **Transactions / atomic updates:** **there are none.** Every multi-step write (log a workout → touch Days Since → recalculate Momentum → track an event) is a sequence of independent Supabase calls, not a transaction. If the process crashes between steps (e.g., the server restarts mid-request), a workout could be logged without Momentum ever updating for it. At 40 alpha users this is a low-probability failure mode, not a launch blocker — but it's worth knowing it's not atomic before treating any single pillar's score as gospel.
- **Denormalized streak/momentum fields:** the update path is centralized (all writes to `habits.current_streak`/`longest_streak`/`completion_rate` go through `completeHabit()`, all writes to `momentum_scores` go through `calculateMomentumScore()`) — this is the right pattern and keeps drift risk low as long as nothing else is ever added that writes those columns directly.
- **Analytics events:** append-only, no consistency risk beyond the coverage gaps in Part 8.
- **AI memory:** there is no dedicated AI memory table in this codebase yet (the "AI Memory" system discussed in earlier planning docs was never built — Vi's context comes from live queries against profiles/habits/chat history, not a separate memory store). Nothing to audit for consistency here because it doesn't exist; worth noting so nobody assumes it's silently drifting somewhere.

---

## PART 5 — AI Quality Review

- **Remembers correctly:** confirmed by design — `coachSystemPrompt()` pulls identity statement, motivation, quit pattern, goal, and stats fresh from the `profiles` row on every call. No caching layer to go stale.
- **Never hallucinates history:** the prompt is structured to only ever reference data explicitly injected into context — there's no mechanism by which Vi could fabricate a specific number, since specific numbers aren't offered unless they're really in the prompt. The one place this promise is currently *broken* is the comeback bug above: the message's framing ("I noticed you've been away") can be factually wrong for a user who was active in every way except one stale habit counter — that's not hallucination, but it is Vi confidently saying something untrue about the user's real behavior.
- **Never generic motivation:** `VI_IDENTITY` explicitly bans "great job," "keep it up," "you've got this," "don't give up." No code-level enforcement checks the actual output against this list — it's prompt-only. Worth a periodic spot-check of real generated messages once alpha starts, not a blocker.
- **Never breaks character / banned phrases:** same caveat — enforced by instruction, not validated in code. Recommend logging comeback messages (already done, via the chat_messages insert) and periodically grepping for banned phrases as a cheap QA habit during alpha.
- **Handles empty histories:** the Momentum calculation explicitly defaults to a neutral baseline (50) rather than 0 when a pillar has no data — a deliberate, confirmed-correct cold-start design.
- **Handles inactive users:** partially — the comeback bug means "inactive" is currently measured incorrectly, but the intent and prompt design (no shame language, identity-referencing, one small ask) are sound once the trigger logic is fixed.
- **Handles new users:** onboarding conversation is designed to build the full profile before any workout plan is generated; confirmed the tool-use flow doesn't allow partial saves.
- **Handles failed workouts / missed habits:** the habit-coaching prompt in `persona.ts` (from the prior build pass) includes right-sizing logic for habits under 40% completion — this exists in the prompt but I did not find a scheduled job that actually runs this check and prompts Vi to act on it. **This is a real gap**: the difficulty-adjustment logic described in the persona is currently unreachable — nothing calls it. Flag as a "should fix" if it matters for the 30-day alpha window, since a habit that's failing for 3 weeks will just keep failing silently with no adjustment offered.

---

## PART 6 — Performance Review

- **Dashboard query count:** roughly 8-9 Supabase round trips per load for a "full" arm user (profile, streak, today's workout — itself a few queries, last coach message, sessions-this-week count, momentum score, days-since events, habits, today's completions). Not slow at 40 users; worth batching if this scales to hundreds.
- **N+1 queries:** none found in the new Phase 1 code specifically. The one place with real N+1 shape is `calculateMomentumScore()`'s two sequential `categoryScore()` calls (habits, then nutrition) — only 2 extra round trips, not a real N+1, but could be combined into one query with a `category` filter if it ever matters.
- **Momentum recalculation cost:** the real performance note worth acting on — every single habit completion, workout log, and check-in triggers a *full* momentum recalculation (6-8 queries) synchronously, inline in the request. A user who logs 5 habits in a row in one sitting triggers 5 full recalculations back-to-back. Not a problem at today's scale; worth debouncing (e.g., recalculate at most once per minute per user, or move it to a background job) before it's load-bearing for hundreds of concurrent users.
- **Caching:** none exists, none is needed yet — nothing here is expensive enough at 40 users to justify the complexity.
- **Server vs. Client Components:** used correctly and consistently — data-heavy pages are server components, interactive pieces (`HabitChecklist`, `CreateHabitForm`, `CoachChat`) are client components. No unnecessary "use client" found.
- **Bundle size / images:** nothing unusual — no large client-side dependencies were added in this pass, no images are used yet.
- **Streaming:** not used anywhere (no `loading.tsx`, see Part 1) — also means no partial-render benefit is being captured on slower connections.
- **AI request latency:** onboarding and coach chat are synchronous, non-streamed Claude calls — a slow model response blocks the whole request. Given message lengths here are short, this is an acceptable MVP tradeoff, not worth the complexity of streaming yet.
- **Cron efficiency:** the nightly job does one query for all stale Days Since rows, then a loop of individual updates — fine at current scale (a few dozen users), would need batching well before hundreds.

None of the above are launch blockers for a 40-user alpha. The one worth actually doing before wider beta is debouncing momentum recalculation.

---

## PART 7 — Security Review

| Area | Finding |
|---|---|
| Authentication | Solid — Supabase Auth + proxy session refresh, confirmed working |
| Authorization / RLS | **Gap confirmed**: `profiles` allows unrestricted column writes to any field on your own row, including `experiment_group` and `onboarding_completed`. This is the single most important fix in this whole review. |
| API permissions | Every route correctly checks `auth.getUser()` before acting — no route found that skips this |
| Prompt injection | Vi's system prompts don't grant tool access to anything destructive (habit creation, plan generation, profile fields) — worst case of a successful injection is a user tricking Vi into writing a weird habit name or a bad plan, not a security breach. Low risk as scoped today. |
| Rate limiting | **None exists.** Every AI-backed endpoint has unbounded request volume per user. This is both a cost risk and an abuse vector. |
| Subscription enforcement | Free-tier caps were designed in every planning document and never implemented in code — there is currently no functional difference in AI access between free and paid users. |
| Experiment group security | **Confirmed broken** — see the RLS finding above; this is the literal "Experiment group security" line item asked about, and it fails. |
| SQL injection | Not applicable — all queries go through the Supabase client's parameterized query builder, no raw SQL string concatenation anywhere in application code. |
| XSS | No `dangerouslySetInnerHTML` or raw HTML injection found anywhere — React's default escaping covers this. |
| CSRF | Next.js Route Handlers + same-site cookies via Supabase Auth provide reasonable default protection; no custom CSRF token exists, but none of the mutating routes are exploitable via a simple cross-site form post since they require a valid session cookie AND are JSON-only POSTs (not form-encoded), which most CSRF vectors can't easily forge. Acceptable for MVP. |
| Secrets / env vars | Confirmed clean — only `NEXT_PUBLIC_`-prefixed vars are used client-side; service role key, Claude key, and Stripe secret are all server-only. |
| Webhook validation | Stripe webhook correctly verifies the signature before processing — confirmed. |
| Data exposure | No route was found returning another user's data — every query is scoped by `user_id`/`auth.uid()`, and RLS backs that up as defense in depth (aside from the profiles column gap). |

---

## PART 8 — Analytics Review

Requested minimum event set vs. what's actually implemented:

| Event | Status |
|---|---|
| `signup` | **Missing** — no `track()` call in the sign-up server action |
| `login` | **Missing** — no `track()` call in the sign-in server action |
| `onboarding_complete` | Implemented (as `onboarding_completed`) |
| `habit_created` | Implemented |
| `habit_completed` | Implemented |
| `workout_logged` | Implemented |
| `check_in` | Implemented (as `check_in_submitted`) |
| `momentum_view` | **Missing** — dashboard views aren't distinguished from a momentum-specific view |
| `dashboard_view` | **Missing** — implemented as `app_opened` with `surface: "dashboard"`, which covers the intent but not the exact name; decide whether to rename or treat as equivalent |
| `vi_message` | Implemented (as `vi_conversation`) |
| `days_since_trigger` | **Missing** — only the 7-day comeback fire is tracked; no event distinguishes a 3-day or 14-day-style threshold crossing (moot until those tiers exist, see the Founder Execution Plan's phased comeback design) |
| `comeback_sent` | Implemented (as `comeback_message_sent`) |
| `subscription_started` | **Missing** — Stripe webhook never calls `track()` |
| `subscription_cancelled` | **Missing** — same gap |
| `weekly_review_view` | **Not applicable** — Weekly Review was never built in this pass; correctly out of scope, not a bug |

**Can the current events calculate what's needed?**

- **Weekly Consistency Rate:** yes — `habit_completion` + `workout_logs` timestamps are sufficient without any dedicated event.
- **Activation:** yes, once `signup` is added — `onboarding_completed` + `habit_created` already cover the rest.
- **Retention:** partially — `app_opened` gives daily-active data, but without `login`/`signup` timestamped events, cohort-day-zero anchoring has to be inferred from `auth.users.created_at` instead of a clean event, which works but is one extra join away from convenient.
- **Conversion:** **no** — without `subscription_started`, conversion rate has to be computed by diffing `subscriptions.status` snapshots over time rather than a clean funnel event. Fixable in 30 minutes; worth doing before real conversion numbers matter.
- **AI usage:** yes — `vi_conversation` is sufficient.
- **Comeback success:** partially — `comeback_message_sent` exists, but there's no distinct "user returned after a comeback message" event; recovery has to be inferred by checking whether `days_since_events.current_days` reset to 0 sometime after a `comeback_message_sent` row. Workable, not clean.

---

## PART 9 — Final Pre-Launch TODO List

### Critical (block alpha launch)

1. Fix the stale onboarding greeting in `onboarding/page.tsx` (10 min)
2. Lock `profiles.experiment_group` and `profiles.onboarding_completed` against direct client writes (trigger or column-level check) (1-2 hrs)
3. Fix the Comeback trigger to require overall inactivity, not any single counter (1-2 hrs)
4. Add per-user try/catch isolation in the nightly cron job (1 hr)
5. Validate `priceId` server-side against an allowlist in `/api/stripe/checkout` (30 min)
6. Add basic rate limiting to the AI-backed endpoints (3-4 hrs)
7. Deploy to a real Supabase project + Vercel, run the actual alpha launch checklist from `BUILD_EXECUTION_PLAN.md` against a live environment (remaining item, not a code fix)

### Should Fix (before wider beta, not before a 10-person alpha)

- Add a re-entry guard on `/onboarding` for already-completed users
- Add `loading.tsx`/`error.tsx` for the dashboard route group
- Add try/catch around all `anthropic.messages.create` calls with a user-facing fallback message
- Add the missing analytics events (`signup`, `login`, `subscription_started`, `subscription_cancelled`)
- Fix the Stripe webhook to log/alert when an update matches zero rows
- Add password reset
- Enforce (or explicitly decide to defer) free-tier usage caps before any paid marketing push
- Wire up the already-written habit difficulty-adjustment logic to an actual scheduled job

### Nice to Have

- Debounce/batch Momentum recalculation instead of running it inline on every action
- Account deletion self-service flow
- Timezone-aware date math for Days Since / Momentum (bigger design decision, not a quick patch)
- Prorate Momentum's habit/nutrition pillars for habits created mid-week
- Mobile viewport pass
- Redirect-away-if-authenticated on `/login`/`/signup`

---

## PART 10 — The Last 20% That Eliminates 80% of Launch Risk

If this were my startup, I would not spend the remaining engineering time on
anything in the Nice to Have list, and I'd be honest that most of it doesn't
matter yet. The 20% that actually matters is narrower than it looks:

**Fix the four things that would embarrass the product in front of a real
user in the first five minutes:** the stale onboarding greeting, the
comeback message that can lie about someone's real activity, the cron job
that can silently stop working for everyone after one bad night, and the
`profiles` RLS gap. None of these are hard — combined, they're under a
day of work — but every one of them directly contradicts the one thing this
product is supposed to prove: that Vi is trustworthy, data-driven, and
never wrong about what actually happened. A comeback message that's
factually incorrect isn't a minor bug for this specific company — it's the
one failure mode that falsifies the entire premise being tested. I'd fix
that one first, today, before anything else on this list.

Second: rate limiting and the price-ID validation aren't about polish,
they're about not finding out the hard way that a bored alpha user (or a bot
that found the API surface) can run up an unbounded Claude bill or buy a
subscription at a price you never offered. Neither takes long. Both are the
kind of gap that's invisible right up until the day it isn't.

Everything else — password reset, account deletion, timezone precision,
loading skeletons, debounced momentum — is real, legitimate technical debt,
and none of it is what determines whether 10 alpha users decide this product
is worth using. I would explicitly *not* build the push notification fix
before alpha, even though it's arguably the most consequential gap in this
whole review (the Comeback System literally cannot reach the people it's
for). The founder's own manual outreach — already the fallback documented in
`BUILD_EXECUTION_PLAN.md` — covers that gap for 10-40 people. Building real
push infrastructure for an experiment this small would be solving a problem
at a scale the company hasn't earned yet.

The honest challenge to the whole plan: this review found a comeback logic
bug and an RLS bug specifically *because* someone finally looked hard at the
code instead of trusting that "it typechecks and lints" meant "it's correct."
Neither of those would have been caught by any test that was actually run
before now, because no test plan existed until this document. Before adding
anything else to this roadmap, I'd run the Part 2 test plan against a real
deployed environment with real test accounts — not local dev, not
imagination — because that's the only way to find the next version of these
same two bugs before an actual user does.
