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
