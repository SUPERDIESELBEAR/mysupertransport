/**
 * Archiving an applicant is NOT denying them: archived applicants may be hired
 * later, so they must land in their own Archived tab and must never trigger the
 * applicant denial email.
 *
 * These checks fail against the old behaviour, where handleArchiveFromHold wrote
 * review_status = 'denied' and the Applications page had no Archived tab.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readSource } from "./helpers/repoLiterals";
import { appliedMigrationSql } from "./helpers/migrationFunctions";

const PIPELINE = "src/pages/staff/PipelineDashboard.tsx";
const PORTAL = "src/pages/management/ManagementPortal.tsx";
const DRAWER = "src/components/management/ApplicationReviewDrawer.tsx";

describe("archiving from the onboarding pipeline", () => {
  const src = readSource(PIPELINE);

  it("writes the archived outcome, not denied", () => {
    expect(src).toContain("review_status: 'archived'");
  });

  it("does not file the archived applicant as denied", () => {
    expect(src).not.toContain("review_status: 'denied'");
  });

  it("never routes an archive through the denial email function", () => {
    const archiveBlock = src.slice(
      src.indexOf("handleArchiveFromHold"),
      src.indexOf("handleArchiveFromHold") + 4000,
    );
    expect(archiveBlock).not.toContain("deny-application");
  });
});

describe("Applications page", () => {
  const src = readSource(PORTAL);

  it("offers an Archived tab", () => {
    expect(src).toContain("'archived', 'all', 'invited'");
  });

  it("accepts ?status=archived as a deep link", () => {
    expect(src).toContain("'denied','archived','all','invited'");
  });

  it("archives without sending the applicant an email", () => {
    const block = src.slice(src.indexOf("const handleArchive ="), src.indexOf("const handleUnarchive ="));
    expect(block).toContain("review_status: 'archived'");
    expect(block).not.toContain("functions.invoke");
  });

  it("can move an archived applicant back to Pending", () => {
    const block = src.slice(src.indexOf("const handleUnarchive ="));
    expect(block).toContain("review_status: 'pending'");
  });

  it("styles archived neutrally rather than as a rejection", () => {
    expect(src).toMatch(/archived: 'bg-muted/);
  });
});

describe("review drawer", () => {
  const src = readSource(DRAWER);

  it("exposes an Archive action", () => {
    expect(src).toContain("review-action-archive");
  });

  it("shows the reason panel for archived applicants too", () => {
    expect(src).toContain("app.review_status === 'archived'");
  });

  it("offers a way back out of the Archived tab", () => {
    expect(src).toContain("review-action-unarchive");
  });
});

/**
 * The database change, as APPLIED.
 *
 * This block used to read two files staged under
 * `.lovable/drafts/<id>/migrations`. The draft was accepted on 2026-09-21: the
 * enum change was applied as `drizzle/migrations/0022_review_status_archived.sql`
 * and the staged file was deleted, so the test threw ENOENT while the change it
 * asserts was live — a red for correct work, which is how a guard earns the right
 * to be ignored. The enum is now read through the shared migration reader, and
 * the backfill — which was applied as a one-off data statement, not a migration,
 * because seeding rows is not DDL — is asserted against the live table instead of
 * against a file that never existed in the repository.
 */
describe("applied database change", () => {
  const psql = (sql: string) =>
    execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" })
      .split("\n").map((l) => l.trim()).filter(Boolean);

  it("adds the archived value to review_status", () => {
    expect(appliedMigrationSql("review_status_archived")).toMatch(
      /ADD VALUE IF NOT EXISTS 'archived'/,
    );
  });

  it("carries the archived value on the live enum", () => {
    expect(psql(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'review_status'`)).toContain("archived");
  });

  it("moved the pipeline-archived rows off denied and stripped the note prefix", () => {
    // 50 rows were carried over; none may be left filed as a denial.
    expect(psql(`SELECT count(*)::text FROM public.applications
      WHERE review_status = 'denied' AND reviewer_notes LIKE '[Archived from pipeline]%'`))
      .toEqual(["0"]);
    const [archived] = psql(
      `SELECT count(*)::text FROM public.applications WHERE review_status = 'archived'`,
    );
    expect(Number(archived)).toBeGreaterThan(0);
  });
});
