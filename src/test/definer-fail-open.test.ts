import { describe, expect, it } from "vitest";
import { resolvedDefiners } from "./helpers/migrationFunctions";

/**
 * Guards rule 5 of docs/database-security-conventions.md: authorization
 * predicates are written as a positive refuse, never as a negated permit,
 * and every operand that can be NULL is wrapped in coalesce().
 *
 * The shape this catches:
 *
 *   IF NOT (current_setting('request.jwt.claims', true)::json->>'role'
 *           = 'service_role') THEN RAISE EXCEPTION ...
 *
 * With no JWT the comparison is NULL, `NOT NULL` is NULL, and `IF NULL THEN`
 * never fires — the guard silently permits. purge_rods_day shipped exactly
 * this on 2026-07-31.
 *
 * The heuristic is deliberately narrow (negated conditions mentioning a
 * session/claim source, minus coalesce) so it stays actionable.
 *
 * RESOLUTION: LAST DEFINITION WINS
 * --------------------------------
 * Shares the resolver in helpers/migrationFunctions.ts with
 * definer-search-path.test.ts, and for a sharper reason than that one. This
 * guard's failure mode is the worse of the two: a SUPERSEDED fail-open guard
 * flagged red is noise that trains people to skip the output, and a LIVE
 * fail-open guard then goes unread behind it. purge_rods_day is the exact
 * case — the fail-open version is still sitting in its original migration
 * file and would be reported forever under a cutoff scan, while the fixed
 * definition is the one actually deployed.
 *
 * The CUTOFF constant is gone with it. A pre-cutoff function that was never
 * re-authored is now checked on its merits instead of being skipped for
 * being old.
 *
 * Same blind spot as its sibling: this reads files, not the database. See
 * definer-live-catalog.test.ts for the authoritative check.
 */

/** Sources whose value can be NULL at runtime and so poison a negation. */
const NULLABLE_SOURCES =
  /current_setting\s*\(|request\.jwt|session_user|current_user/i;

/** Every `IF NOT ...` / `IF ... NOT (...)` condition up to its THEN. */
function negatedConditions(block: string): string[] {
  const out: string[] = [];
  const re = /\bIF\b([\s\S]{0,600}?)\bTHEN\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const cond = m[1];
    if (/\bNOT\b/i.test(cond)) out.push(cond);
  }
  return out;
}

describe("SECURITY DEFINER guards are not fail-open", () => {
  const definers = resolvedDefiners();

  it("resolves functions from the migration set", () => {
    expect(definers.length).toBeGreaterThan(0);
  });

  it("no negated guard reads a nullable session source without coalesce", () => {
    const offenders: string[] = [];

    for (const fn of definers) {
      for (const cond of negatedConditions(fn.block)) {
        if (!NULLABLE_SOURCES.test(cond)) continue;
        // `IS DISTINCT FROM` is NULL-safe, and coalesce() is the fix.
        if (/\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM\b/i.test(cond)) continue;
        if (/\bcoalesce\s*\(/i.test(cond)) continue;
        offenders.push(
          `${fn.file}: ${fn.signature} — negated guard on a nullable session source without coalesce: IF ${cond
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 140)} THEN`,
        );
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});