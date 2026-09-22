import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * LIVE GRANT / POLICY PARITY — THIS FILE IS THE AUTHORITY.
 *
 * policy-grant-parity.test.ts reads migration text. This one calls
 * public.grant_parity_report(), which reads pg_policy and has_table_privilege
 * at call time. The distinction is the whole point: migration text can read
 * correct while the database is not, and a checked-in snapshot of the catalog
 * has exactly the same weakness — it is a file, and files go stale.
 *
 * It also exists because of a bad audit source. On 2026-08-23 a query against
 * information_schema.role_table_grants reported "no grants" on
 * parser_diagnostics. That view only exposes grants the CALLING role is party
 * to, so it reads empty for nearly every table in this database. An audit query
 * that returns empty for almost everything is not evidence of anything, and a
 * migration written on top of it would have granted privileges that were
 * already there while the real defect went unfixed.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("grant-parity-live.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST in the environment, so grant_parity_report() could not be",
    "called. The migration-text parity test is NOT a substitute: it cannot",
    "see a grant made or revoked out of band. A green run without this file",
    "is not evidence that policies and grants agree.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live catalog could not be read",
  details: ["Only this check sees grants made outside the migration files."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * 2026-09-18: the report call is UNGATED again, deliberately.
 *
 * The sandbox psql session connects as the role `sandbox_exec` (current_user and
 * session_user both). Migration 0004 wrote
 * `GRANT EXECUTE ... TO sandbox_exec` yet the live ACL kept naming only
 * `sandbox_exec_<project>`, so the call went on raising
 * `permission denied for function grant_parity_report` and the 2026-09-17 2200
 * pass gated it. Migration 0008 re-granted with a quoted identifier; the ACL now
 * names the bare role and has_function_privilege() reads true. The gate is gone
 * on purpose: if the privilege is ever lost again this file must go RED, not
 * quietly skip. Never grant this to `authenticated`, `anon` or PUBLIC — the
 * report reads every table's grants.
 */
describe("live grant / policy parity", () => {
  /**
   * 2026-09-22: why the privilege kept vanishing, and what now restores it.
   *
   * It was LOST, not mis-made. The sandbox DROPS AND RECREATES the bare role
   * `sandbox_exec`, and a grant is attached to a role OID, so 0004's and 0008's
   * grants went with it — which is why both read true when applied and false
   * days later. There is no durable target to grant to instead: both sandbox
   * roles belong to no group at all, default privileges do not reach a role that
   * does not exist yet, and event triggers do not fire for CREATE ROLE.
   *
   * Migration 0032 added public.regrant_sandbox_parity_execute(), which restores
   * EXECUTE to the sandbox roles only; 0033 schedules it HOURLY and revokes it
   * from every client role. This test must NOT call it: 0032 briefly granted it
   * to PUBLIC so it could, and definer-live-catalog and function-reachability
   * both refused that, rightly — a definer function executable by
   * `authenticated` is executable by the whole driver population, and a test is
   * not a caller.
   *
   * The consequence to know: for up to an hour after a role recreation this file
   * goes RED. That is the intended behaviour. Do NOT gate, skip or allowlist it
   * — re-run after the hourly job, or apply the grant in a migration. A skipped
   * parity check is indistinguishable from a passing one, which is the whole
   * reason this file exists.
   */
  itLive("grant_parity_report() exists and is readable from the catalog", () => {
    const rows = psql(
      "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "where n.nspname = 'public' and p.proname = 'grant_parity_report'",
    );
    expect(rows).toEqual(["1"]);
  });

  itLive("no public table admits a role its grants do not", () => {
    const offenders = psql(
      "select table_name || ' | ' || role_name || ' | ' || command || ' | ' || detail " +
        "from public.grant_parity_report() order by 1",
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });


  itLive("parser_diagnostics is written only through the definer RPC", () => {
    // The table the bad audit accused of missing grants. It had them; the real
    // 42501 came from the column default calling current_profile_id(), which a
    // default evaluates as the CALLER and `authenticated` may not execute. The
    // fix moved the write behind a definer RPC, so the correct end state is the
    // INVERSE of what this test used to assert: no client INSERT, EXECUTE on
    // the function instead. Kept executable rather than written as prose.
    const rows = psql(
      "select has_table_privilege('authenticated', 'public.parser_diagnostics', 'INSERT')::text " +
        "|| ' ' || has_function_privilege('authenticated', 'public.log_parser_diagnostics(jsonb)', 'EXECUTE')::text " +
        "|| ' ' || has_function_privilege('authenticated', 'public.current_profile_id()', 'EXECUTE')::text",
    );
    expect(rows).toEqual(["false true false"]);
  });
});
