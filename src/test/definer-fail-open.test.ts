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

/**
 * Anything that reads "who is calling". A condition mentioning one of these
 * is an authorization predicate, not business logic.
 */
const AUTHZ_SOURCES =
  /\buser_roles\b|\bhas_role\s*\(|\bis_staff\s*\(|auth\.uid\s*\(|current_setting\s*\(|request\.jwt/i;

/**
 * Values that read as "nothing to see here" when returned from the
 * non-matching branch of an authorization check: the caller gets a plausible
 * answer instead of a refusal.
 */
const BENIGN_VALUE = /^(0|0::[a-z ]+|false|null|''|'\{\}'(::jsonb)?)$/i;

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

/**
 * Every `CASE ... END` expression in the body, innermost-aware.
 *
 * `END IF`, `END LOOP` and `END CASE` are plpgsql block terminators, not the
 * end of a CASE *expression*, so they are skipped when balancing. `END CASE`
 * does close a plpgsql CASE statement, which is the same shape for our
 * purposes, so it counts.
 */
function caseExpressions(block: string): string[] {
  const out: string[] = [];
  const stack: number[] = [];
  const re = /\b(CASE|END)\b(\s+(IF|LOOP|CASE))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const word = m[1].toUpperCase();
    const follower = m[3]?.toUpperCase();
    if (word === "CASE") {
      stack.push(m.index);
      continue;
    }
    // END IF / END LOOP close a plpgsql control block, not a CASE expression.
    if (follower === "IF" || follower === "LOOP") continue;
    const start = stack.pop();
    if (start !== undefined) {
      out.push(block.slice(start, m.index + m[0].length));
    }
  }
  return out;
}

/** Text of the final top-level ELSE branch, or `null` when there is none. */
function elseBranch(caseExpr: string): string | null {
  const idx = caseExpr.toUpperCase().lastIndexOf("ELSE");
  if (idx === -1) return null;
  return caseExpr
    .slice(idx + 4)
    .replace(/\bEND\b[\s\S]*$/i, "")
    .trim();
}

/**
 * Authorization checks whose refusal path yields a value instead of raising.
 *
 * The shape:
 *
 *   SELECT CASE WHEN EXISTS (SELECT 1 FROM user_roles ...)
 *          THEN (SELECT count(*) ...)
 *          ELSE 0
 *          END
 *
 * count_unused_resume_tokens shipped exactly this on 2026-08-01 — written to
 * REPLACE a silently-empty direct table read, and reproducing the defect one
 * layer down. An unauthorized caller cannot tell "you may not see this" from
 * "there are none", and neither can the UI.
 */
function benignAuthzDefaults(block: string): string[] {
  const out: string[] = [];
  for (const expr of caseExpressions(block)) {
    if (!AUTHZ_SOURCES.test(expr)) continue;
    if (/\bRAISE\b/i.test(expr)) continue;
    const branch = elseBranch(expr);
    // No ELSE at all is worse, not better: a CASE with no match yields NULL.
    const value = branch === null ? "NULL (implicit — no ELSE)" : branch;
    if (branch !== null && !BENIGN_VALUE.test(branch)) continue;
    out.push(value);
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

  it("no authorization check refuses by returning a benign value", () => {
    const offenders: string[] = [];

    for (const fn of definers) {
      for (const value of benignAuthzDefaults(fn.block)) {
        offenders.push(
          `${fn.file}: ${fn.signature} — authorization check yields ` +
            `${value} on the refusal path instead of raising. The caller ` +
            `cannot distinguish "not permitted" from "no rows", and neither ` +
            `can the UI. Use a positive refuse: permit inside the IF, ` +
            `RAISE EXCEPTION after it.`,
        );
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});