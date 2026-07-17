-- Stripe retries webhook deliveries on any non-2xx/slow response, and a
-- captured signed payload could in principle be replayed. Without tracking
-- which event.id has already been processed, checkout.session.completed
-- would re-fire the pro_upgrade analytics event on every retry, skewing the
-- admin dashboard's Free -> Pro conversion metric. Subscription-state
-- upserts are naturally idempotent (same fields overwrite), but the
-- analytics side-effect isn't, so this guards the whole handler.
create table public.processed_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;

-- No policies for 'authenticated'/'anon' — only the service-role webhook
-- handler ever touches this table, same pattern as subscriptions.
