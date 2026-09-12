import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * LIVE STORAGE BUCKET CAPS — THIS GUARD IS GREEN, AND IT IS THE ONLY CHECK OVER
 * A SETTING THAT LIVES NOWHERE IN THIS REPOSITORY.
 *
 * Writes to `storage.buckets` are rejected in this project, so a bucket's
 * file_size_limit can only be set by the storage tool against the live database.
 * Four caps (inspection-documents, driver-uploads, broker-documents,
 * rate-con-ingest) exist live and in no migration. Rebuild from migrations and
 * they are gone, and nothing would say they had ever been set.
 *
 * `docs/storage-bucket-limits.md` is the intent; this file is the check. Any
 * name it reports is a LIVE DISAGREEMENT between the two: a cap changed out of
 * band, a cap lost in a rebuild, or a cap set without the document being
 * updated in the same pass. It is not inherited noise.
 *
 * null is asserted explicitly. An uncapped bucket and a bucket missing from the
 * record must never read the same.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("storage-bucket-limits.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST in the environment, so storage.buckets could not be read.",
    "Nothing else in this repository records a bucket's file_size_limit, so a",
    "green run without this file is not evidence that any cap is in place.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so storage.buckets could not be read",
  details: ["Only this check sees a bucket cap set, changed, or lost out of band."],
});

/**
 * Intended file_size_limit per bucket, in bytes. `null` means deliberately
 * uncapped and pending an owner decision — see the ranked exposure table in
 * docs/storage-bucket-limits.md. Keep this map and that document in one pass.
 */
const INTENDED: Record<string, number | null> = {
  "application-documents": null,
  "application-revision-replies": null,
  avatars: null,
  "broker-documents": 25_000_000, // decimal MB, not MiB — recorded, not yet aligned
  "dot-consultant-attachments": null,
  "driver-uploads": 26_214_400, // 25 MiB, matches validateLoadDocumentFile / validateBinderFile
  "eld-notices": null,
  "fleet-documents": null,
  "ica-signatures": null,
  "inspection-documents": 20_971_520, // 25 MiB, matches validateBinderFile
  "load-documents": null,
  "message-attachments": 10_485_760, // the only cap also written in a migration
  "operator-documents": null,
  "passenger-auth-executed": null,
  "passenger-auth-signatures": null,
  "pei-documents": null,
  "rate-con-ingest": 30_000_000, // server-side email ingest only
  "resource-library": null,
  "rods-logs": null,
  "service-logos": null,
  signatures: null,
};

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function liveLimits(): Record<string, number | null> {
  const rows = psql(
    "select id || '|' || coalesce(file_size_limit::text, 'null') from storage.buckets order by id",
  );
  const out: Record<string, number | null> = {};
  for (const row of rows) {
    const [id, value] = row.split("|");
    out[id] = value === "null" ? null : Number(value);
  }
  return out;
}

describe("live storage bucket size limits", () => {
  itLive("the record names exactly the buckets that exist", () => {
    const live = Object.keys(liveLimits()).sort();
    expect(live).toEqual(Object.keys(INTENDED).sort());
  });

  itLive("every bucket's live cap matches the recorded intention", () => {
    const live = liveLimits();
    const drift = Object.entries(INTENDED)
      .filter(([id]) => id in live)
      .filter(([id, want]) => live[id] !== want)
      .map(([id, want]) => `${id}: live ${live[id] ?? "null"}, recorded ${want ?? "null"}`);
    expect(drift, drift.join("\n")).toEqual([]);
  });

  itLive("the four caps that exist in no migration are still in place", () => {
    const live = liveLimits();
    const lost = ["inspection-documents", "driver-uploads", "broker-documents", "rate-con-ingest"]
      .filter((id) => live[id] == null)
      .map((id) => `${id} has no cap — it exists in no migration, so a rebuild drops it silently`);
    expect(lost, lost.join("\n")).toEqual([]);
  });
});
