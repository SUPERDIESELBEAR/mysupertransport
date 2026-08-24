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

describe("live grant / policy parity", () => {
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

  itLive("parser_diagnostics is writable by signed-in staff", () => {
    // The table the bad audit accused. Asserted directly so the record of what
    // was actually true is executable, not a sentence in a doc.
    const rows = psql(
      "select has_table_privilege('authenticated', 'public.parser_diagnostics', 'INSERT')::text",
    );
    expect(rows).toEqual(["true"]);
  });
});
