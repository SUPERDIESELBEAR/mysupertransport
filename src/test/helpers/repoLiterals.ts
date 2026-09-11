/**
 * Shared repository scanner for the reachability guards.
 *
 * These guards answer "does anything CALL this?", which no other guard in this
 * project asks. Everything else here asks whether something is CORRECT.
 *
 * WHAT COUNTS AS A REPOSITORY CALLER
 *
 * Any single- or double-quoted string literal equal to the name, anywhere in
 * non-test source under `src/` or `supabase/functions/`. Deliberately broad,
 * because the call forms in this codebase are not uniform:
 *
 *   supabase.rpc('name', {...})
 *   (supabase.rpc as any)('name', {...})
 *   supabase.rpc('name' as any, {...})
 *   const fn = cond ? 'name_a' : 'name_b'; supabase.rpc(fn)   // settlementConfig.ts
 *
 * A narrower `rpc\(['"]name` regex was tried first and produced FIVE false
 * findings against functions the app really does call. A guard that cries wolf
 * gets switched off, so breadth wins over precision here: the cost of a false
 * NEGATIVE (a caller we credit that is really a comment) is one missed finding;
 * the cost of a false POSITIVE is the whole guard being ignored.
 *
 * Backticks are NOT matched, on purpose. `get_user_roles` was mentioned exactly
 * once in the tree — inside a `//` comment in
 * supabase/functions/_shared/email/auth.ts, backtick-quoted — and a comment is
 * not a caller. That distinction is what turned it into a finding, and the
 * function was dropped on 2026-09-11.
 *
 * WHAT DOES NOT COUNT: `*.test.*`, `__tests__/`, `src/test/`, and the generated
 * `src/integrations/supabase/types.ts`. A function referenced only by the tests
 * that assert it exists is not called by the product.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const REPO_ROOTS = ["src", "supabase/functions"] as const;

const EXCLUDED_DIRS = new Set(["node_modules", "dist", "__tests__", ".git"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function isExcludedFile(rel: string): boolean {
  return (
    /\.(test|spec)\.[jt]sx?$/.test(rel) ||
    rel.startsWith("src/test/") ||
    rel === "src/integrations/supabase/types.ts"
  );
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry)) out.push(full);
  }
}

/** Every non-test source file the guards consider a possible call site. */
export function sourceFiles(): string[] {
  const found: string[] = [];
  for (const root of REPO_ROOTS) walk(root, found);
  return found
    .map((f) => relative(process.cwd(), f).split("\\").join("/"))
    .filter((rel) => !isExcludedFile(rel));
}

let cache: Map<string, string[]> | null = null;

/**
 * name -> the files that contain it as a quoted string literal.
 * Built once per process; the tree is walked a single time.
 */
export function literalIndex(): Map<string, string[]> {
  if (cache) return cache;
  const index = new Map<string, string[]>();
  const pattern = /['"]([A-Za-z_][A-Za-z0-9_]{2,})['"]/g;
  for (const file of sourceFiles()) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (const m of text.matchAll(pattern)) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const list = index.get(name);
      if (list) list.push(file);
      else index.set(name, [file]);
    }
  }
  cache = index;
  return index;
}

/** Files that reference `name` as a quoted string literal. */
export function callersOf(name: string): string[] {
  return literalIndex().get(name) ?? [];
}

/** Read one file, or '' when it is missing. */
export function readSource(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
