-- Locks down the profile fields that must only ever change through trusted
-- server code (using the service-role client), never through a client
-- holding just the anon key + a user's session — which is what the
-- existing "for update using (auth.uid() = id)" policy allowed, since RLS
-- policies restrict which ROWS can be touched, not which COLUMNS.
--
-- Protected: experiment_group (the alpha A/B assignment), onboarding_completed
-- (must only flip true once the Vital Contract tool-use actually completes),
-- and last_comeback_sent_at (the Comeback System's own cooldown state).
--
-- auth.role() reports 'service_role' when a request is authenticated with
-- the service-role key (used by trusted server code — the onboarding route,
-- the nightly cron), and 'authenticated'/'anon' otherwise. A request made
-- directly via the Supabase JS client with just the anon key + a user's
-- session, bypassing the app's own routes entirely, is 'authenticated' and
-- gets rejected here.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.experiment_group is distinct from old.experiment_group then
      raise exception 'experiment_group cannot be modified directly';
    end if;
    if new.onboarding_completed is distinct from old.onboarding_completed then
      raise exception 'onboarding_completed cannot be modified directly';
    end if;
    if new.last_comeback_sent_at is distinct from old.last_comeback_sent_at then
      raise exception 'last_comeback_sent_at cannot be modified directly';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_admin_fields
  before update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- Note: public.subscriptions already has no insert/update policy for the
-- authenticated role (see 0001_init.sql) — subscription status was already
-- correctly writable only via the service-role client. The accompanying
-- code change fixes a real bug this review surfaced: the checkout route was
-- calling that upsert with the per-session client, which RLS was silently
-- rejecting, meaning a paying user's Stripe customer ID never actually
-- reached the database. See src/app/api/stripe/checkout/route.ts.
