import { describe, expect, it } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * THE WRAPPER RULE.
 *
 * A policy expression is evaluated by the planner once per statement when it
 * is written `(SELECT public.has_permission('x'))` — the planner turns it into
 * an InitPlan — and ONCE PER ROW when it is written `public.has_permission('x')`
 * bare. has_permission reads permission_actions, user_roles, role_permissions
 * and user_permission_exceptions, so a bare call on a list screen is four
 * lookups per row.
 *
 * Measured on 2026-09-21 over 5,000 rows in a throwaway transaction:
 *   bare call ............. 6.9 ms
 *   wrapped (SELECT ...) .. 1.1 ms
 *
 * Six times the cost on a table holding five thousand rows; loads and
 * fuel_transactions are heading for far more than that. This guard reads
 * pg_policies, not the migration files, for the reason recorded at the top of
 * definer-live-catalog.test.ts: a policy can be rewritten out of band.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("permission-wrapper-guard.test.ts LIVE CHECK DID NOT RUN", [
    "No PGHOST in the environment, so pg_policies could not be read. A green",
    "run WITHOUT this check is not evidence that every policy calling",
    "has_permission wraps it in (SELECT ...).",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so pg_policies could not be read",
});

/**
 * The detector, as SQL, shared by the live check and the negative-control
 * probe: a policy expression that mentions has_permission anywhere OTHER than
 * immediately inside a sub-SELECT. Postgres re-prints `(SELECT f())` with a
 * space after SELECT and an `AS` alias, which is why the pattern is loose.
 */
const BARE_CALL_QUERY = `
  WITH expressions AS (
    SELECT schemaname || '.' || tablename || ' / ' || policyname AS label,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies
  )
  SELECT label
    FROM expressions
   WHERE expr LIKE '%has_permission%'
     AND regexp_replace(expr, '\\( *SELECT +has_permission\\([^)]*\\)[^)]*\\)', '', 'g')
         LIKE '%has_permission%'
   ORDER BY label;
`;

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

describe("has_permission must never be called bare from a policy", () => {
  itLive("no live policy calls has_permission outside a sub-SELECT", () => {
    const bare = psql(BARE_CALL_QUERY);
    expect(
      bare,
      `These policies call has_permission bare, so it runs once per ROW ` +
        `instead of once per statement. Rewrite each as ` +
        `(SELECT public.has_permission('...')):\n  ${bare.join("\n  ")}`,
    ).toEqual([]);
  });

  itLive("at least one policy does call it — the guard has a subject", () => {
    const wrapped = psql(`
      SELECT schemaname || '.' || tablename || ' / ' || policyname
        FROM pg_policies
       WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%has_permission%'
       ORDER BY 1;
    `);
    expect(wrapped.length).toBeGreaterThan(0);
  });

  it("the detector recognises a bare call (negative control)", () => {
    // The same regexp the SQL uses, applied to the two forms Postgres prints.
    const strip = (expr: string) =>
      expr.replace(/\( *SELECT +has_permission\([^)]*\)[^)]*\)/g, "");
    const wrapped = "( SELECT has_permission('settlement.view'::text) AS has_permission)";
    const bare = "has_permission('settlement.view'::text)";
    expect(strip(wrapped)).not.toContain("has_permission");
    expect(strip(bare)).toContain("has_permission");
  });
});
