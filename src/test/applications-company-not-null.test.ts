import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * PASS 3e: every table in the applications and PEI families carries a NOT NULL
 * company_id, filled only by a stamp trigger. A row without a carrier cannot be
 * stored, and the stamp trigger must still be attached and enabled on each.
 */
const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner("applications-company-not-null.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so NOT NULL on the eleven family tables was not verified.",
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live catalog could not be read",
  details: ["Only a live read can see a constraint dropped out of band."],
});
function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

const ROOTS = ["application_invites", "applications"];
const CHILDREN = [
  "application_correction_fields",
  "application_correction_requests",
  "application_document_history",
  "application_interview_notes",
  "application_revision_attachments",
  "pei_accidents",
  "pei_request_events",
  "pei_requests",
  "pei_responses",
];
const ALL = [...ROOTS, ...CHILDREN].sort();

describe("applications family: company_id NOT NULL (3e)", () => {
  itLive("all eleven tables have company_id NOT NULL", () => {
    const rows = psql(`SELECT table_name || ':' || is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND column_name='company_id'
        AND table_name IN (${ALL.map((t) => `'${t}'`).join(",")}) ORDER BY table_name;`);
    expect(rows).toEqual(ALL.map((t) => `${t}:NO`));
  });

  itLive("each table still has its enabled stamp trigger", () => {
    const rows = psql(`SELECT c.relname || ':' || p.proname || ':' || t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal
        AND p.proname IN ('stamp_application_company','stamp_child_company_from_parent')
      ORDER BY c.relname;`);
    const expected = ALL.map((t) =>
      `${t}:${ROOTS.includes(t) ? "stamp_application_company" : "stamp_child_company_from_parent"}:O`);
    expect(rows).toEqual(expected);
  });
});
