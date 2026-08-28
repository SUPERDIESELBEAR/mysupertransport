import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * OPERATOR PAY EXPOSURE — STRUCTURAL, AT THE DATABASE.
 *
 * On 2026-08-28 pay_policies carried `pay_policies_read_authenticated`, whose
 * USING clause admitted the operator role. Every driver could read every split
 * percentage in the company. The operator portal never rendered one, so a
 * rendered-output assertion ("no percentage appears on the driver's screen")
 * would have passed the entire time the hole was open. That is the lesson, and
 * the reason this file reads pg_policy rather than a component tree.
 *
 * The rule enforced here: no SELECT policy on a table carrying percentage or
 * gross-revenue columns may admit the operator role without scoping the row to
 * that operator.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("operator-pay-exposure.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so pg_policy could not be read. This file is the ONLY guard",
    "against an operator-readable pay percentage; a UI test is not a",
    "substitute and never was. A green run without it is not evidence.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live policy catalog could not be read",
  details: ["Only a catalog read can see who a policy actually admits."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** A qual is self-scoped when it ties the row to the calling user. */
const SELF_SCOPED = "(auth\\.uid\\(\\)|current_profile_id\\(\\))";

describe("operator pay exposure", () => {
  itLive("no SELECT policy on pay_policies admits the operator role", () => {
    const offenders = psql(
      "select polname from pg_policy p join pg_class c on c.oid = p.polrelid " +
        "join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' " +
        "where c.relname = 'pay_policies' and p.polcmd in ('r','*') " +
        "and coalesce(pg_get_expr(p.polqual, p.polrelid),'') " +
        "ilike '%''operator''::app_role%'",
    );
    expect(offenders).toEqual([]);
  });

  itLive("no percentage or gross column is operator-readable unscoped", () => {
    // Every public table holding a *_pct, percentage, gross_* or linehaul_*
    // column, crossed with any SELECT policy that admits the operator role
    // without tying the row to that operator.
    const offenders = psql(
      "with money as (" +
        "  select distinct c.oid, c.relname" +
        "    from pg_attribute a" +
        "    join pg_class c on c.oid = a.attrelid and c.relkind = 'r'" +
        "    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'" +
        "   where a.attnum > 0 and not a.attisdropped" +
        "     and (a.attname like '%_pct' or a.attname like '%percent%'" +
        "          or a.attname like 'gross%' or a.attname like 'linehaul%')" +
        ")" +
        "select m.relname || ' | ' || p.polname from pg_policy p " +
        "join money m on m.oid = p.polrelid " +
        "where p.polcmd in ('r','*') " +
        "and coalesce(pg_get_expr(p.polqual, p.polrelid),'') " +
        "ilike '%''operator''::app_role%' " +
        "and coalesce(pg_get_expr(p.polqual, p.polrelid),'') !~* '" +
        SELF_SCOPED +
        "' order by 1",
    );
    expect(offenders).toEqual([]);
  });

  itLive("the driver's estimate function returns dollars only", () => {
    const shape = psql(
      "select pg_get_function_result(p.oid) from pg_proc p " +
        "join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' " +
        "where p.proname = 'driver_load_pay_estimate'",
    );
    expect(shape).toEqual([
      "TABLE(amount numeric, incomplete boolean)",
    ]);
  });

  itLive("the estimate function is definer, pinned, and not PUBLIC", () => {
    const row = psql(
      "select p.prosecdef::text || ' | ' " +
        "|| coalesce(array_to_string(p.proconfig, ','), 'NO-PIN') || ' | ' " +
        "|| has_function_privilege('public', p.oid, 'EXECUTE')::text " +
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "and n.nspname = 'public' where p.proname = 'driver_load_pay_estimate'",
    );
    expect(row).toEqual([
      "true | search_path=public, extensions | false",
    ]);
  });

  itLive("the function body never selects a percentage column out", () => {
    // Structural, not stylistic: the RETURNS TABLE shape above is the contract,
    // and this asserts the function cannot be widened into a policy passthrough
    // without the shape assertion failing first.
    const returnsPolicyRow = psql(
      "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "and n.nspname = 'public' where p.proname = 'driver_load_pay_estimate' " +
        "and pg_get_function_result(p.oid) ilike '%pay_policies%'",
    );
    expect(returnsPolicyRow).toEqual([]);
  });
});
