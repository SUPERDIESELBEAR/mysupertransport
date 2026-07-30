import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Guards the conventions in docs/database-security-conventions.md.
 *
 * Migrations written before the 2026-07-30 security audit are grandfathered:
 * their defects were corrected by later migrations, and rewriting history
 * would only churn the file list. Anything authored from the cutoff onward
 * must comply.
 */
const CUTOFF = "20260730180000";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

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

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.match(/^\d+/)?.[0] ?? "0") >= CUTOFF)
    .sort();
}

/** Strips `--` line comments so commented-out SQL never trips the guard. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Splits a migration into its `CREATE FUNCTION ... $function$/$$ ... $$` bodies. */
function functionBlocks(sql: string): string[] {
  const blocks: string[] = [];
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?AS\s+(\$[a-zA-Z_]*\$)[\s\S]*?\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) blocks.push(m[0]);
  return blocks;
}

describe("database security conventions", () => {
  const files = migrationFiles();

  it("finds migrations to lint", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every SECURITY DEFINER function pins search_path to public, extensions", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const sql = stripComments(
        readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
      );
      for (const block of functionBlocks(sql)) {
        if (!/SECURITY\s+DEFINER/i.test(block)) continue;

        const name =
          block.match(/FUNCTION\s+([a-z0-9_.]+)\s*\(/i)?.[1] ?? "(unnamed)";
        const searchPath = block.match(
          /SET\s+search_path\s*(?:=|TO)\s*([^\n]*)/i,
        )?.[1];

        if (!searchPath) {
          offenders.push(`${file}: ${name} — no SET search_path`);
          continue;
        }
        if (!/\bextensions\b/.test(searchPath)) {
          offenders.push(
            `${file}: ${name} — search_path (${searchPath.trim()}) omits "extensions"`,
          );
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("never calls a pgcrypto function without the extensions. prefix", () => {
    const offenders: string[] = [];
    const bare = new RegExp(
      String.raw`(?<![.\w])(${PGCRYPTO_FNS.join("|")})\s*\(`,
      "gi",
    );

    for (const file of files) {
      const sql = stripComments(
        readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
      );
      // A CREATE EXTENSION / function *definition* named the same way is fine;
      // we only care about call sites, which the lookbehind on "." already
      // narrows to unqualified references.
      const matches = sql.match(bare);
      if (matches) {
        offenders.push(
          `${file}: unqualified ${[...new Set(matches.map((m) => m.trim()))].join(", ")} — use extensions.<fn>()`,
        );
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("never grants a table privilege to anon", () => {
    const offenders: string[] = [];
    // The only sanctioned anon table privileges:
    //  - INSERT ON applications (the public job-application form)
    //  - SELECT ON faq         (published owner-operator FAQs, row-filtered
    //                           by a TO public policy)
    const ALLOWED = [
      /GRANT\s+INSERT\s+ON\s+public\.applications\s+TO\s+anon/i,
      /GRANT\s+SELECT\s+ON\s+public\.faq\s+TO\s+anon/i,
    ];

    for (const file of files) {
      const sql = stripComments(
        readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
      );
      const grants = sql.match(/GRANT[\s\S]*?TO\s+[^;]*\banon\b[^;]*;/gi) ?? [];
      for (const g of grants) {
        if (/GRANT\s+(USAGE|EXECUTE)\b/i.test(g)) continue;
        if (ALLOWED.some((re) => re.test(g))) continue;
        offenders.push(`${file}: ${g.replace(/\s+/g, " ").trim()}`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});