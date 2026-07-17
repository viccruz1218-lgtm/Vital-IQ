import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// A minimal, in-memory stand-in for the real Supabase query builder — just
// enough of the chain (eq/gte/lte/lt/in/order/limit/single/maybeSingle/
// upsert/insert/update) to exercise the actual business logic in
// momentum.ts, habits.ts, streak.ts, days-since.ts, etc. against realistic
// data shapes, without a live Postgres connection.
//
// This verifies the logic these functions implement (weights, cold-start
// baselines, streak walk-back, cooldown windows, fault isolation) — it does
// NOT verify anything Postgres itself enforces (RLS policies, the
// protect_profile_admin_fields trigger, foreign-key cascades). Those require
// a live database and are out of scope here; see
// supabase/migrations/__tests__/rls-protection.test.ts for what IS checked
// about them statically.

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type FakeError = { message: string; code?: string };
type ForceErrors = Partial<Record<string, FakeError>>;

function getPath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Row)[key];
  }, row);
}

export function createFakeSupabase(
  tables: Tables,
  forceErrors: ForceErrors = {},
  authUser: { id: string } | null = null,
) {
  function from(table: string) {
    const tableRows = (tables[table] ??= []);

    let rows: Row[] = [...tableRows];
    let countMode = false;
    let pendingUpdate: Row | null = null;
    let pendingDelete = false;
    let returnRepresentation = false;

    const query = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) countMode = true;
        returnRepresentation = true;
        return query;
      },
      or(filterExpr: string) {
        // Minimal parser for the specific shapes this codebase emits:
        // comma-separated "col.op.value" clauses, OR'd together. Not a
        // general PostgREST filter-string parser.
        const clauses = filterExpr.split(",").map((clause) => {
          const [col, op, val] = clause.split(".");
          return { col, op, val };
        });
        rows = rows.filter((r) =>
          clauses.some(({ col, op, val }) => {
            const actual = getPath(r, col);
            if (op === "is") return val === "null" ? actual == null : String(actual) === val;
            if (op === "lt") return (actual as string) < val;
            if (op === "gt") return (actual as string) > val;
            return false;
          }),
        );
        return query;
      },
      eq(col: string, val: unknown) {
        rows = rows.filter((r) => getPath(r, col) === val);
        return query;
      },
      is(col: string, val: null | boolean) {
        rows = rows.filter((r) => getPath(r, col) === val);
        return query;
      },
      neq(col: string, val: unknown) {
        rows = rows.filter((r) => getPath(r, col) !== val);
        return query;
      },
      gte(col: string, val: unknown) {
        rows = rows.filter((r) => (getPath(r, col) as string | number) >= (val as string | number));
        return query;
      },
      lte(col: string, val: unknown) {
        rows = rows.filter((r) => (getPath(r, col) as string | number) <= (val as string | number));
        return query;
      },
      lt(col: string, val: unknown) {
        rows = rows.filter((r) => (getPath(r, col) as string | number) < (val as string | number));
        return query;
      },
      gt(col: string, val: unknown) {
        rows = rows.filter((r) => (getPath(r, col) as string | number) > (val as string | number));
        return query;
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter((r) => vals.includes(getPath(r, col)));
        return query;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        const dir = opts?.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const av = getPath(a, col) as string | number;
          const bv = getPath(b, col) as string | number;
          return av > bv ? dir : av < bv ? -dir : 0;
        });
        return query;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return query;
      },
      single() {
        const forced = forceErrors[`${table}.single`];
        if (forced) return Promise.resolve({ data: null, error: forced });
        return Promise.resolve(
          rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows found" } },
        );
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
        const forced = forceErrors[`${table}.upsert`];
        if (forced) {
          rows = [];
          (query as { __forcedError?: FakeError }).__forcedError = forced;
          return query;
        }
        const items = Array.isArray(payload) ? payload : [payload];
        const conflictCols = opts?.onConflict?.split(",") ?? [];
        for (const item of items) {
          const existingIdx =
            conflictCols.length > 0
              ? tableRows.findIndex((r) => conflictCols.every((c) => getPath(r, c) === getPath(item, c)))
              : -1;
          if (existingIdx >= 0) tableRows[existingIdx] = { ...tableRows[existingIdx], ...item };
          else tableRows.push({ ...item });
        }
        rows = [...tableRows];
        return query;
      },
      insert(payload: Row | Row[]) {
        const forced = forceErrors[`${table}.insert`];
        if (forced) {
          rows = [];
          (query as { __forcedError?: FakeError }).__forcedError = forced;
          return query;
        }
        const items = Array.isArray(payload) ? payload : [payload];
        // event_id is the one naturally-keyed column this test double knows
        // about (processed_stripe_events.event_id is a real primary key) —
        // simulate the unique-violation Postgres would raise, since the
        // webhook idempotency logic branches on error.code === "23505".
        for (const item of items) {
          if (item.event_id !== undefined && tableRows.some((r) => r.event_id === item.event_id)) {
            (query as { __forcedError?: { message: string; code: string } }).__forcedError = {
              message: "duplicate key value violates unique constraint",
              code: "23505",
            };
            rows = [];
            return query;
          }
        }
        for (const item of items) tableRows.push({ id: item.id ?? `gen-${tableRows.length}`, ...item });
        rows = [...tableRows];
        return query;
      },
      update(patch: Row) {
        pendingUpdate = patch;
        return query;
      },
      delete() {
        // Deferred, like update() — real callers always chain .delete()
        // BEFORE .eq()/.is() filters (e.g. .delete().eq("id", x)), so acting
        // immediately here would delete the whole unfiltered table instead
        // of just the rows the subsequent filters narrow down to.
        pendingDelete = true;
        return query;
      },
      then(resolve: (v: { data: Row[] | null; error: FakeError | null; count?: number }) => void) {
        const forcedError = (query as { __forcedError?: FakeError }).__forcedError;
        if (forcedError) {
          resolve({ data: null, error: forcedError });
          return;
        }
        if (pendingUpdate) {
          for (const r of rows) Object.assign(r, pendingUpdate);
          resolve({ data: returnRepresentation ? rows : null, error: null });
          return;
        }
        if (pendingDelete) {
          for (const r of rows) {
            const idx = tableRows.indexOf(r);
            if (idx >= 0) tableRows.splice(idx, 1);
          }
          resolve({ data: returnRepresentation ? rows : null, error: null });
          return;
        }
        resolve({ data: rows, error: null, count: countMode ? rows.length : undefined });
      },
    };

    return query;
  }

  return {
    from,
    auth: { getUser: async () => ({ data: { user: authUser } }) },
  } as unknown as SupabaseClient<Database>;
}
