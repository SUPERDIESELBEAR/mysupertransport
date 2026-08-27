import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Shared resolver for the migration-file security guards.
 *
 * WHY THIS EXISTS
 * ---------------
 * The guards used to scan every migration file authored after a cutoff date
 * and flag any offending `CREATE FUNCTION` block they found. That is wrong:
 * a migration file is *history*. If a function shipped with a defect on
 * Monday and was repinned on Tuesday, Monday's file still contains the
 * defective text forever, and a guard that reads it reports a red for an
 * object that no longer exists in that form.
 *
 * False reds accumulate until people stop reading the guard, which is worse
 * than having no guard at all. So: **last definition wins**. Every function
 * is resolved to its final definition across the whole migration set, and
 * only that definition is checked.
 *
 * This also removes the need for the CUTOFF constants the guards used to
 * carry. A pre-cutoff function that was never re-authored resolves to its
 * original (possibly non-compliant) text and is handled by an explicit,
 * shrink-only allowlist — visible, counted, and anchored to the migration it
 * came from, rather than hidden behind a date.
 *
 * LIMITS
 * ------
 * Since it began reading `ALTER FUNCTION ... SET search_path`, this resolver
 * no longer describes the migration *text*; it describes the state the
 * migration set RESOLVES TO. That is a change in what it means, not just what
 * it parses, and it is why a repin no longer has to re-author a body to clear
 * a guard.
 *
 * This reads *files*. It cannot see a function created, altered, or granted
 * out of band — which has actually happened on this database; see
 * docs/eld-mail-queue-acl-2026-08-01.md. The authoritative check is
 * definer-live-catalog.test.ts, which reads `pg_proc`. Treat this resolver as
 * a fast pre-commit approximation, not as proof. That file's
 * "every live public-only pin is accounted for" test cross-checks the two, so
 * the gap between them is declared (LIVE_ONLY_PUBLIC_PINS) rather than silent.
 */

export const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "../../../supabase/migrations",
);

/**
 * Migrations staged in a draft. A draft cannot run DDL against the shared
 * database, so schema work lands here first and applies on accept. Guards that
 * read migration TEXT must still see it, otherwise a staged function ships
 * unchecked.
 */
export const DRAFT_MIGRATIONS_ROOT = path.resolve(__dirname, "../../../.lovable/drafts");

/** Concatenated SQL of every staged draft migration, comments stripped. */
export function stagedMigrationSql(): string {
  const out: string[] = [];
  let drafts: string[] = [];
  try {
    drafts = readdirSync(DRAFT_MIGRATIONS_ROOT);
  } catch {
    return "";
  }
  for (const draft of drafts) {
    const dir = path.join(DRAFT_MIGRATIONS_ROOT, draft, "migrations");
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      continue;
    }
    for (const f of files) out.push(readFileSync(path.join(dir, f), "utf8"));
  }
  return stripComments(out.join("\n"));
}

export interface ResolvedFunction {
  /** `public.enqueue_email(text, jsonb)` — the resolution key. */
  signature: string;
  /** `public.enqueue_email` */
  name: string;
  /** Migration file holding the *final* definition. */
  file: string;
  /** Full `CREATE FUNCTION ... $$ ... $$` text of the final definition. */
  block: string;
  /** Whether that final definition is SECURITY DEFINER. */
  isDefiner: boolean;
  /** Value of `SET search_path`, or undefined when absent. */
  searchPath?: string;
}

/** Strips `--` line comments so commented-out SQL never trips a guard. */
export function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Migration files in applied order. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Splits a top-level comma list, respecting nesting and quotes. */
function splitTopLevel(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (const ch of args) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * Words that begin a *type*, so a parameter written bare (no name) is not
 * mistaken for `name type` and truncated.
 */
const TYPE_LEADING = new Set([
  "bigint",
  "bigserial",
  "bit",
  "boolean",
  "bool",
  "bytea",
  "char",
  "character",
  "date",
  "daterange",
  "decimal",
  "double",
  "float",
  "float4",
  "float8",
  "inet",
  "int",
  "int2",
  "int4",
  "int8",
  "integer",
  "interval",
  "json",
  "jsonb",
  "money",
  "numeric",
  "real",
  "record",
  "serial",
  "smallint",
  "text",
  "time",
  "timestamp",
  "timestamptz",
  "timetz",
  "tsquery",
  "tsvector",
  "uuid",
  "varchar",
  "vector",
  "void",
  "xml",
]);

const TYPE_ALIASES: Record<string, string> = {
  int: "integer",
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  bool: "boolean",
  // `float` with no precision is `double precision` in Postgres. Without this
  // the resolver keys match_staff_help_knowledge as (vector, integer, float)
  // while pg_proc reports (vector, integer, double precision) — one function
  // counted as two, so a repin would leave an allowlist entry the stale-entry
  // check cannot resolve.
  float: "double precision",
  float4: "real",
  float8: "double precision",
  varchar: "character varying",
  timestamptz: "timestamp with time zone",
  timetz: "time with time zone",
  decimal: "numeric",
};

function normalizeType(raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ").toLowerCase();
  // Drop length/precision modifiers: varchar(255) -> varchar, numeric(10,2) -> numeric
  t = t.replace(/\(\s*\d+\s*(,\s*\d+\s*)?\)/g, "");
  // Normalize array suffixes: `text []` / `text[3]` -> `text[]`
  t = t.replace(/\s*\[\s*\d*\s*\]/g, "[]");
  const arraySuffix = t.endsWith("[]") ? "[]" : "";
  if (arraySuffix) t = t.slice(0, -2).trim();
  t = TYPE_ALIASES[t] ?? t;
  return t + arraySuffix;
}

/** `(_day_id uuid, _reason text DEFAULT NULL)` -> `uuid, text` */
export function normalizeArgs(rawArgs: string): string {
  const inner = rawArgs.trim();
  if (!inner) return "";
  return splitTopLevel(inner)
    .map((param) => {
      let p = param.trim();
      if (!p) return "";
      // OUT/INOUT params are not part of the identifying signature in
      // Postgres for DROP purposes, but keeping them is harmless for our
      // resolution as long as we do it consistently. Only the mode word goes.
      p = p.replace(/^\s*(IN|OUT|INOUT|VARIADIC)\s+/i, "");
      // Strip DEFAULT / `=` initialisers.
      p = p.replace(/\s+DEFAULT\s+[\s\S]*$/i, "");
      p = p.replace(/\s*=\s*[\s\S]*$/, "");
      p = p.trim();
      if (!p) return "";

      const tokens = p.split(/\s+/);
      if (tokens.length > 1) {
        const first = tokens[0].toLowerCase().replace(/\[\s*\]$/, "");
        // `text[]` alone, `timestamp with time zone`, `character varying`:
        // the first token already starts a type, so nothing is a param name.
        if (!TYPE_LEADING.has(first)) {
          const withoutName = tokens.slice(1).join(" ").trim();
          if (withoutName) p = withoutName;
        }
      }
      return normalizeType(p);
    })
    .filter(Boolean)
    .join(", ");
}

function qualify(name: string): string {
  const n = name.trim().toLowerCase().replace(/"/g, "");
  return n.includes(".") ? n : `public.${n}`;
}

/** Finds the matching close paren for the `(` at `open`. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Resolves every function in the migration set to its FINAL definition.
 *
 * Keyed by `schema.name(argtypes)` so overloads are tracked separately —
 * `purge_rods_day(uuid, text)` and `purge_rods_day(uuid, text, text)` are two
 * objects and repinning one must not silence the other.
 *
 * `DROP FUNCTION` removes the entry, so a function dropped and never
 * recreated stops being checked rather than lingering as a phantom red.
 */
export function resolveMigrationFunctions(): Map<string, ResolvedFunction> {
  const resolved = new Map<string, ResolvedFunction>();

  for (const file of migrationFiles()) {
    const sql = stripComments(
      readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    );

    // --- CREATE [OR REPLACE] FUNCTION ---------------------------------
    const createRe =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z0-9_."]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      const name = qualify(m[1]);
      const open = m.index + m[0].length - 1;
      const close = matchParen(sql, open);
      if (close === -1) continue;

      const args = normalizeArgs(sql.slice(open + 1, close));

      // Body: from the header through the matching dollar-quote pair.
      const rest = sql.slice(close + 1);
      const bodyMatch = rest.match(/AS\s+(\$[a-zA-Z_]*\$)([\s\S]*?)\1/i);
      const block = bodyMatch
        ? sql.slice(m.index, close + 1 + (bodyMatch.index ?? 0) + bodyMatch[0].length)
        : sql.slice(m.index, close + 1 + Math.min(rest.length, 2000));

      const header = bodyMatch
        ? rest.slice(0, bodyMatch.index ?? 0)
        : rest.slice(0, 2000);

      const signature = `${name}(${args})`;
      const searchPath = header.match(
        /SET\s+search_path\s*(?:=|TO)\s*([^\n]*)/i,
      )?.[1];

      resolved.set(signature, {
        signature,
        name,
        file,
        block,
        isDefiner: /SECURITY\s+DEFINER/i.test(header),
        searchPath: searchPath?.trim(),
      });

      createRe.lastIndex = close + 1;
    }

    // --- ALTER FUNCTION ... SET search_path ----------------------------
    // A pin can be corrected without re-authoring the body. Reading only
    // CREATE headers made the guard describe a state the database was no
    // longer in — it kept reporting functions whose pin had been repaired by
    // ALTER, which is how a guard earns the right to be ignored.
    const alterRe =
      /ALTER\s+FUNCTION\s+([a-z0-9_."]+)\s*\(/gi;
    let a: RegExpExecArray | null;
    while ((a = alterRe.exec(sql)) !== null) {
      const name = qualify(a[1]);
      const open = a.index + a[0].length - 1;
      const close = matchParen(sql, open);
      if (close === -1) continue;
      const args = normalizeArgs(sql.slice(open + 1, close));
      const tail = sql.slice(close + 1, close + 400);
      const stop = tail.indexOf(";");
      const clause = stop === -1 ? tail : tail.slice(0, stop);
      const pin = clause.match(/SET\s+search_path\s*(?:=|TO)\s*(.*)/i)?.[1];
      alterRe.lastIndex = close + 1;
      if (!pin) continue;
      const existing = resolved.get(`${name}(${args})`);
      if (existing) existing.searchPath = pin.trim();
    }

    // --- DROP FUNCTION -------------------------------------------------
    const dropRe =
      /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-z0-9_."]+)\s*(\()?/gi;
    let d: RegExpExecArray | null;
    while ((d = dropRe.exec(sql)) !== null) {
      const name = qualify(d[1]);
      if (!d[2]) {
        // `DROP FUNCTION foo;` with no arg list — drop every overload.
        for (const key of [...resolved.keys()]) {
          if (key.startsWith(`${name}(`)) resolved.delete(key);
        }
        continue;
      }
      const open = d.index + d[0].length - 1;
      const close = matchParen(sql, open);
      if (close === -1) continue;
      const args = normalizeArgs(sql.slice(open + 1, close));
      resolved.delete(`${name}(${args})`);
      dropRe.lastIndex = close + 1;
    }
  }

  return resolved;
}

/** Only the SECURITY DEFINER survivors, sorted for stable output. */
export function resolvedDefiners(): ResolvedFunction[] {
  return [...resolveMigrationFunctions().values()]
    .filter((f) => f.isDefiner)
    .sort((a, b) => a.signature.localeCompare(b.signature));
}