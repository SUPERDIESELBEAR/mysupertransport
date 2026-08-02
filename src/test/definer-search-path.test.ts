import { describe, expect, it } from "vitest";
import { resolvedDefiners } from "./helpers/migrationFunctions";
import {
  LEGACY_MAX,
  LEGACY_PUBLIC_ONLY_PINS,
} from "./helpers/legacyPublicOnlyPins";

/**
 * Guards the conventions in docs/database-security-conventions.md.
 *
 * RESOLUTION: LAST DEFINITION WINS
 * --------------------------------
 * This guard used to scan every migration authored after a cutoff date and
 * flag any offending block it found. That flagged *superseded text*: a
 * function fixed in a later migration still reads defective in the earlier
 * file, forever. The cutoff constants are gone; every function is now
 * resolved to its final definition across the whole migration set (see
 * helpers/migrationFunctions.ts) and only that is checked.
 *
 * THIS GUARD READS FILES AND CANNOT SEE THE DATABASE
 * --------------------------------------------------
 * A function created, altered, or granted out of band is invisible here. That
 * is not hypothetical on this project — four SECURITY DEFINER functions were
 * live with NO search_path and anon EXECUTE while every migration on disk
 * read correct (docs/eld-mail-queue-acl-2026-08-01.md). Note that the
 * resolver finds ZERO unpinned definers in the files; the live catalog found
 * four. That gap is the whole argument for definer-live-catalog.test.ts,
 * which is the authority. This one is a fast pre-commit approximation.
 */


/** pgcrypto functions that live in `extensions`, not `pg_catalog`. */
const PGCRYPTO_FNS = [
  "gen_random_bytes",
  "digest",
  "hmac",
  "crypt",
  "gen_salt",
  "pgp_sym_encrypt",
  "pgp_sym_decrypt",
  "pgp_pub_encrypt",
  "pgp_pub_decrypt",
];

describe("database security conventions", () => {
  const definers = resolvedDefiners();

  it("resolves functions from the migration set", () => {
    expect(definers.length).toBeGreaterThan(0);
  });

  // --- allowlist integrity: three assertions -----------------------------

  it("the legacy allowlist never grows", () => {
    expect(
      LEGACY_PUBLIC_ONLY_PINS.length,
      `The legacy allowlist has ${LEGACY_PUBLIC_ONLY_PINS.length} entries but LEGACY_MAX is ${LEGACY_MAX}. ` +
        `This list may only shrink. If you are adding a function, pin it to ` +
        `"public, extensions" instead of exempting it.`,
    ).toBeLessThanOrEqual(LEGACY_MAX);
  });

  it("the legacy allowlist has no duplicate entries", () => {
    const seen = new Set<string>();
    const dupes = LEGACY_PUBLIC_ONLY_PINS.filter((e) => {
      if (seen.has(e)) return true;
      seen.add(e);
      return false;
    });
    expect(dupes, `duplicate allowlist entries:\n${dupes.join("\n")}`).toEqual(
      [],
    );
  });

  it("every legacy allowlist entry still describes a live offender", () => {
    // Forces the list to shrink. Once a function is repinned (or its
    // definition moves to a newer migration), its anchored entry stops
    // matching anything and must be deleted — which lowers LEGACY_MAX.
    const offenders = new Set(
      definers
        .filter((f) => !f.searchPath || !/\bextensions\b/.test(f.searchPath))
        .map((f) => `${f.file}::${f.signature}`),
    );
    const stale = LEGACY_PUBLIC_ONLY_PINS.filter((e) => !offenders.has(e));
    expect(
      stale,
      `These allowlist entries no longer match any non-compliant function.\n` +
        `They have been fixed or re-authored. Delete them and lower LEGACY_MAX ` +
        `to ${LEGACY_PUBLIC_ONLY_PINS.length - stale.length}:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  // --- the guards themselves ---------------------------------------------

  it("no SECURITY DEFINER function is left without a search_path pin", () => {
    // Severity note: this is the escalation shape, distinct from the
    // public-only pins above. It is NOT allowlistable.
    const offenders = definers
      .filter((f) => !f.searchPath)
      .map((f) => `${f.file}: ${f.signature} — no SET search_path`);

    expect(
      offenders,
      `A SECURITY DEFINER function with no search_path inherits the CALLER's. ` +
        `A caller can prepend a schema they control and have the body resolve ` +
        `to their objects while running as the owner.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("every SECURITY DEFINER function pins search_path to public, extensions", () => {
    const offenders = definers
      .filter((f) => f.searchPath && !/\bextensions\b/.test(f.searchPath))
      .filter((f) => !LEGACY_PUBLIC_ONLY_PINS.includes(`${f.file}::${f.signature}`))
      .map(
        (f) =>
          `${f.file}: ${f.signature} — search_path (${f.searchPath}) omits "extensions"`,
      );

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("never calls a pgcrypto function without the extensions. prefix", () => {
    const offenders: string[] = [];
    const bare = new RegExp(
      String.raw`(?<![.\w])(${PGCRYPTO_FNS.join("|")})\s*\(`,
      "gi",
    );

    // Call sites are checked per resolved function body, so a call removed by
    // a later rewrite is not reported against the file that once held it.
    for (const fn of resolvedDefiners()) {
      const matches = fn.block.match(bare);
      if (matches) {
        offenders.push(
          `${fn.file}: ${fn.signature} — unqualified ${[
            ...new Set(matches.map((m) => m.trim())),
          ].join(", ")} — use extensions.<fn>()`,
        );
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  /*
   * REMOVED: "never grants a table privilege to anon".
   *
   * It scanned migration text for GRANT ... TO anon, and it was wrong in both
   * directions. GRANTs are not last-definition-wins, so a grant later undone
   * by a REVOKE still read as an offence forever -- it flagged the
   * document_short_links grant that had already been revoked. And the
   * statement-spanning regex matched across `;` boundaries, reporting a
   * storage.objects POLICY with `TO anon, authenticated` as though it were a
   * table grant on an unrelated table three statements earlier.
   *
   * Table privileges are now asserted against the live catalog in
   * definer-live-catalog.test.ts, where "what is actually granted right now"
   * is a single query instead of an inference over text.
   */
});
