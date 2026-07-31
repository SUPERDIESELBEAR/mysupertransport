import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

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
 */
const CUTOFF = "20260731140000";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** Sources whose value can be NULL at runtime and so poison a negation. */
const NULLABLE_SOURCES =
  /current_setting\s*\(|request\.jwt|session_user|current_user/i;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.match(/^\d+/)?.[0] ?? "0") >= CUTOFF)
    .sort();
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function functionBlocks(sql: string): string[] {
  const blocks: string[] = [];
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?AS\s+(\$[a-zA-Z_]*\$)[\s\S]*?\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) blocks.push(m[0]);
  return blocks;
}

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
  const files = migrationFiles();

  it("no negated guard reads a nullable session source without coalesce", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const sql = stripComments(
        readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
      );
      for (const block of functionBlocks(sql)) {
        if (!/SECURITY\s+DEFINER/i.test(block)) continue;
        const name =
          block.match(/FUNCTION\s+([a-z0-9_.]+)\s*\(/i)?.[1] ?? "(unnamed)";

        for (const cond of negatedConditions(block)) {
          if (!NULLABLE_SOURCES.test(cond)) continue;
          // `IS DISTINCT FROM` is NULL-safe, and coalesce() is the fix.
          if (/\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM\b/i.test(cond)) continue;
          if (/\bcoalesce\s*\(/i.test(cond)) continue;
          offenders.push(
            `${file}: ${name} — negated guard on a nullable session source without coalesce: IF ${cond
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 140)} THEN`,
          );
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});