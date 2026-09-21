/**
 * Archiving an applicant is NOT denying them: archived applicants may be hired
 * later, so they must land in their own Archived tab and must never trigger the
 * applicant denial email.
 *
 * These checks fail against the old behaviour, where handleArchiveFromHold wrote
 * review_status = 'denied' and the Applications page had no Archived tab.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { readSource } from "./helpers/repoLiterals";

const PIPELINE = "src/pages/staff/PipelineDashboard.tsx";
const PORTAL = "src/pages/management/ManagementPortal.tsx";
const DRAWER = "src/components/management/ApplicationReviewDrawer.tsx";
const MIGRATIONS = ".lovable/drafts/var_01m327q9n4eqd9mzz6h503r8en/migrations";

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

describe("staged database change", () => {
  const files = (() => {
    try { return readdirSync(MIGRATIONS); } catch { return []; }
  })();

  it("adds the archived value to review_status", () => {
    const enumFile = files.find((f) => f.includes("review_status_archived"));
    expect(enumFile).toBeTruthy();
    expect(readSource(`${MIGRATIONS}/${enumFile}`)).toMatch(/ADD VALUE IF NOT EXISTS 'archived'/);
  });

  it("backfills the pipeline-archived rows in a later migration", () => {
    const backfill = files.find((f) => f.includes("backfill_archived_applicants"));
    expect(backfill).toBeTruthy();
    const sql = readSource(`${MIGRATIONS}/${backfill}`);
    expect(sql).toContain("[Archived from pipeline]%");
    expect(sql).toMatch(/SET review_status = 'archived'/);
    // The backfill must sort after the enum migration.
    expect(backfill! > files.find((f) => f.includes("review_status_archived"))!).toBe(true);
  });
});
