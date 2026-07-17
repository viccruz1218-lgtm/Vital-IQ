import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// IMPORTANT SCOPE NOTE: this only statically checks that the trigger SQL
// exists and covers the columns it's supposed to. It does NOT execute the
// trigger against a real Postgres instance, so it cannot prove RLS is
// actually enforced at runtime — that requires a live Supabase project
// (e.g. a local `supabase start` + `psql` run attempting a direct update as
// the `authenticated` role and asserting it raises). Treat this as a guard
// against the migration file itself regressing, not as a substitute for that
// live check before the alpha launch.

function readMigration(filename: string) {
  return readFileSync(join(__dirname, "..", filename), "utf8");
}

describe("0004_profiles_security.sql (static check)", () => {
  const sql = readMigration("0004_profiles_security.sql");

  it("defines a before-update trigger on public.profiles", () => {
    expect(sql).toMatch(/create trigger protect_profile_admin_fields/i);
    expect(sql).toMatch(/before update on public\.profiles/i);
  });

  it("gates the check on the caller not being the service role", () => {
    expect(sql).toMatch(/auth\.role\(\)\s*<>\s*'service_role'/);
  });

  it("protects all three admin-only fields", () => {
    for (const column of ["experiment_group", "onboarding_completed", "last_comeback_sent_at"]) {
      expect(sql).toContain(column);
    }
  });
});

describe("0001_init.sql profiles policy (static check)", () => {
  const sql = readMigration("0001_init.sql");

  it("still restricts profile updates to the owning user", () => {
    expect(sql).toMatch(/auth\.uid\(\)\s*=\s*id/);
  });
});

describe("0007_momentum_recovery_pillar.sql (static check)", () => {
  const sql = readMigration("0007_momentum_recovery_pillar.sql");

  it("adds an insert policy for momentum_scores scoped to the owner", () => {
    expect(sql).toMatch(/create policy "momentum_scores: insert own" on public\.momentum_scores/);
    expect(sql).toMatch(/for insert with check \(auth\.uid\(\) = user_id\)/);
  });

  it("adds an update policy for momentum_scores scoped to the owner", () => {
    expect(sql).toMatch(/create policy "momentum_scores: update own" on public\.momentum_scores/);
  });

  it("allows habits_score/nutrition_score to be null and adds recovery_score", () => {
    expect(sql).toMatch(/alter column habits_score drop not null/);
    expect(sql).toMatch(/alter column nutrition_score drop not null/);
    expect(sql).toMatch(/add column recovery_score int/);
  });
});

describe("0008_weekly_reviews.sql (static check)", () => {
  const sql = readMigration("0008_weekly_reviews.sql");

  it("creates weekly_reviews with RLS enabled", () => {
    expect(sql).toMatch(/create table public\.weekly_reviews/);
    expect(sql).toMatch(/alter table public\.weekly_reviews enable row level security/);
  });

  it("grants select and insert scoped to the owning user", () => {
    expect(sql).toMatch(/create policy "weekly_reviews: select own" on public\.weekly_reviews\s+for select using \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/create policy "weekly_reviews: insert own" on public\.weekly_reviews\s+for insert with check \(auth\.uid\(\) = user_id\)/);
  });

  it("grants no update or delete policy — reviews are immutable once created", () => {
    expect(sql).not.toMatch(/for update/i);
    expect(sql).not.toMatch(/for delete/i);
  });
});

describe("0009_alpha_readiness_rls_fixes.sql (static check)", () => {
  const sql = readMigration("0009_alpha_readiness_rls_fixes.sql");

  it("grants insert and update on days_since_events scoped to the owner", () => {
    expect(sql).toMatch(/create policy "days_since_events: insert own" on public\.days_since_events/);
    expect(sql).toMatch(/create policy "days_since_events: update own" on public\.days_since_events/);
  });

  it("grants update on check_ins scoped to the owner", () => {
    expect(sql).toMatch(/create policy "check_ins: update own" on public\.check_ins/);
  });

  it("grants update on habit_completion scoped through the owning habit", () => {
    expect(sql).toMatch(/create policy "habit_completion: update own" on public\.habit_completion/);
  });

  it("adds an index on workout_logs.plan_day_id", () => {
    expect(sql).toMatch(/create index workout_logs_plan_day_idx on public\.workout_logs \(plan_day_id\)/);
  });
});
