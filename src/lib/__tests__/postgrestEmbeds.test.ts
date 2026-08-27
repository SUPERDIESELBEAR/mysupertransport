import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A PostgREST embed only resolves across a real foreign key. Columns that point
 * at `auth.users` (operators.user_id, equipment_receipts.uploaded_by, …) are NOT
 * a path into `public.profiles`, so an embed like
 * `operators!inner(profiles(first_name))` fails the entire request and the caller
 * silently gets zero rows — no thrown error, no visible symptom.
 *
 * This test enumerates every `.select()` embed in src/ AND in
 * supabase/functions/ and checks each parent -> child hop against the foreign
 * keys in the generated Supabase types.
 *
 * A select whose argument is not a plain literal is RESOLVED, not skipped:
 * concatenated literals are folded, module-level `const` strings are looked up
 * (following imports), templates interpolating those consts are substituted,
 * and a ternary between two literals is checked on both branches. Anything the
 * resolver still cannot read FAILS this test by name. A guard that quietly
 * walks past what it cannot read reports green while covering nothing — that
 * is how `operators(first_name)` and `operators.email` both survived.
 */

const SRC = path.resolve(__dirname, '../..');
const REPO = path.resolve(SRC, '..');
const FUNCTIONS = path.join(REPO, 'supabase/functions');
const TYPES = path.join(SRC, 'integrations/supabase/types.ts');
const ROOTS = [SRC, FUNCTIONS];

/**
 * Selects the resolver knowingly cannot read, each with a reason. Keep this
 * empty if at all possible: every entry is a hole, and an allowlist that grows
 * is how a guard becomes decorative.
 */
const UNREADABLE_ALLOWLIST: { at: string; reason: string }[] = [];

/** Parse table names and their FK targets out of the generated types file. */
function loadSchema() {
  const text = fs.readFileSync(TYPES, 'utf8');
  const tables = new Set<string>();
  // Table declarations sit at a fixed indentation inside Tables: { ... }
  for (const m of text.matchAll(/^ {6}([a-z0-9_]+): \{$/gm)) tables.add(m[1]);

  // foreignKeyName blocks carry the owning table implicitly (they appear inside
  // it), so walk linearly and track the most recent table header. `byColumn`
  // lets us resolve embeds written against the FK column name
  // (`operator:operator_id(...)`) rather than the table name.
  const fks = new Set<string>();
  const byColumn = new Map<string, string>();
  let current: string | null = null;
  let columns: string[] = [];
  for (const line of text.split('\n')) {
    const t = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (t) { current = t[1]; continue; }
    const c = /columns: \["([a-z0-9_]+)"\]/.exec(line);
    if (c) { columns = [c[1]]; continue; }
    const r = /referencedRelation: "([a-z0-9_]+)"/.exec(line);
    if (r && current) {
      fks.add(`${current}>${r[1]}`);
      fks.add(`${r[1]}>${current}`); // embeds resolve in both directions
      if (columns[0]) byColumn.set(`${current}.${columns[0]}`, r[1]);
      columns = [];
    }
  }
  // Column names per table, read from each table's Row: { ... } block. An FK
  // check alone does not catch `operators(driver_name, unit_number)` — the FK
  // is real, the column is not, and PostgREST fails the whole request just the
  // same. That shape shipped and made the reopened-logs panel render nothing.
  const columnsByTable = new Map<string, Set<string>>();
  let rowTable: string | null = null;
  let inRow = false;
  for (const line of text.split('\n')) {
    const t = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (t) { rowTable = t[1]; inRow = false; continue; }
    if (/^ {8}Row: \{$/.test(line)) { inRow = true; continue; }
    if (inRow && /^ {8}\}$/.test(line)) { inRow = false; continue; }
    // The type may wrap to the next line, so the colon can end the line.
    const c = /^ {10}([a-z0-9_]+)\??:( |$)/.exec(line);
    if (inRow && c && rowTable) {
      if (!columnsByTable.has(rowTable)) columnsByTable.set(rowTable, new Set());
      columnsByTable.get(rowTable)!.add(c[1]);
    }
  }

  return { tables, fks, byColumn, columnsByTable };
}

type Hop = { parent: string; child: string };
type Ref = { table: string; column: string };

/** Walk a select string's paren tree, yielding each parent -> child embed hop. */
function parseHops(select: string, root: string, tables: Set<string>, byColumn: Map<string, string>): Hop[] {
  const hops: Hop[] = [];
  const stack: string[] = [root];
  let token = '';
  for (let i = 0; i < select.length; i++) {
    const ch = select[i];
    if (ch === '(') {
      // Strip modifiers: alias:table!inner, table!left, table!fk_name
      const raw = token.split(',').pop()!.trim();
      const named = raw.includes(':') ? raw.split(':').pop()!.trim() : raw;
      const token2 = named.split('!')[0].trim();
      const parent = stack[stack.length - 1];
      // An embed can be written as the table name, or as the FK column that
      // points at it (`operator:operator_id(...)`). Anything else is a plain
      // column or an aggregate like count().
      const name = tables.has(token2) ? token2 : byColumn.get(`${parent}.${token2}`);
      if (name) {
        hops.push({ parent, child: name });
        stack.push(name);
      } else {
        stack.push(parent);
      }
      token = '';
    } else if (ch === ')') {
      if (stack.length > 1) stack.pop();
      token = '';
    } else {
      token += ch;
    }
  }
  return hops;
}

/**
 * Every plain column reference in a select, paired with the table it is read
 * from. Anything the parser cannot be certain about (`*`, json paths, casts,
 * aggregates, renamed embeds) is skipped rather than guessed at.
 */
function parseColumnRefs(select: string, root: string, tables: Set<string>, byColumn: Map<string, string>): Ref[] {
  const refs: Ref[] = [];
  const stack: string[] = [root];
  let token = '';
  const flush = () => {
    const raw = token.trim();
    token = '';
    if (!raw) return;
    const name = raw.includes(':') ? raw.split(':').pop()!.trim() : raw;
    if (!/^[a-z0-9_]+$/.test(name)) return; // *, ->, ::, count(), etc.
    // `table(count)` is the PostgREST row-count aggregate on an embed, not a column.
    if (name === 'count' && stack.length > 1) return;
    refs.push({ table: stack[stack.length - 1], column: name });
  };
  for (const ch of select) {
    if (ch === '(') {
      const raw = token.split(',').pop()!.trim();
      const named = raw.includes(':') ? raw.split(':').pop()!.trim() : raw;
      const bare = named.split('!')[0].trim();
      const parent = stack[stack.length - 1];
      const child = tables.has(bare) ? bare : byColumn.get(`${parent}.${bare}`);
      stack.push(child ?? parent);
      token = '';
    } else if (ch === ')') {
      flush();
      if (stack.length > 1) stack.pop();
    } else if (ch === ',') {
      flush();
    } else {
      token += ch;
    }
  }
  flush();
  return refs;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && p !== TYPES) {
      out.push(p);
    }
  }
  return out;
}

function allFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) if (fs.existsSync(root)) walk(root, out);
  return out;
}

function rel(file: string): string {
  return path.relative(REPO, file);
}

/** Text of the balanced argument list starting at the '(' index. */
function argumentAt(text: string, open: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * The one string literal an expression is, or null. The body must not close the
 * quote early: `'a' + 'b'` looks like one literal to a lazy regex, and folding
 * it into `a' + 'b` is how an embed stops being recognised as an embed.
 */
function literalOf(expr: string): string | null {
  const t = expr.trim();
  const quote = t[0];
  if (!quote || !['\'', '"', '`'].includes(quote) || t[t.length - 1] !== quote || t.length < 2) return null;
  const body = t.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') { i++; continue; }
    if (body[i] === quote) return null; // the literal ended before the expression did
  }
  if (quote === '`' && body.includes('${')) return null;
  return body;
}

/** Split an expression on a top-level delimiter, respecting quotes and nesting. */
function splitTopLevel(expr: string, delim: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      buf += ch;
      if (ch === '\\') { buf += expr[++i] ?? ''; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; buf += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === delim && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

/**
 * The initialiser expression of `const NAME = …` in this file, following a
 * named import when the const lives in another module. Function-local consts
 * count: what matters is that the text is statically readable.
 */
function constExpr(name: string, file: string, seen: Set<string>): { expr: string; file: string } | null {
  const key = `${file}|${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');

  const decl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*(?::[^=\\n]+)?=\\s*`).exec(text);
  if (decl) {
    const rest = text.slice(decl.index + decl[0].length);
    const end = /;\s*(?:\n|$)/.exec(rest);
    return { expr: rest.slice(0, end ? end.index : rest.length), file };
  }

  const imp = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(text);
  if (!imp) return null;
  let spec = imp[1];
  if (spec.startsWith('@/')) spec = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) spec = path.resolve(path.dirname(file), spec);
  else return null;
  for (const cand of [spec, `${spec}.ts`, `${spec}.tsx`, path.join(spec, 'index.ts'), path.join(spec, 'index.tsx')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      const v = constExpr(name, cand, seen);
      if (v) return v;
    }
  }
  return null;
}

/**
 * Every concrete string an expression can evaluate to: literals, concatenations,
 * templates over resolvable names, ternaries (both branches), and identifiers
 * bound to any of those. `null` means the resolver could not read it, which is
 * a failure, not a skip.
 */
function resolveExpr(expr: string, file: string, seen = new Set<string>()): string[] | null {
  const t = expr.trim().replace(/\s*\/\/[^\n]*$/gm, '').trim();
  if (t === '') return [''];

  const lit = literalOf(t);
  if (lit !== null) return [lit];

  // Ternary between two resolvable branches: cond ? 'a' : 'b'
  const parenless = /^\((.*)\)$/s.exec(t);
  if (parenless) {
    const inner = resolveExpr(parenless[1], file, seen);
    if (inner) return inner;
  }
  const q = splitTopLevel(t, '?');
  if (q.length === 2) {
    const branches = splitTopLevel(q[1], ':');
    if (branches.length === 2) {
      const a = resolveExpr(branches[0], file, seen);
      const b = resolveExpr(branches[1], file, seen);
      if (a && b) return [...a, ...b];
    }
  }

  // Template interpolating resolvable names: `a, b(${CONST})`
  const tpl = /^`([\s\S]*)`$/.exec(t);
  if (tpl) {
    let out: string[] = [''];
    let ok = true;
    const pieces = tpl[1].split(/\$\{([^}]*)\}/g);
    pieces.forEach((piece, i) => {
      if (!ok) return;
      if (i % 2 === 0) { out = out.map((s) => s + piece); return; }
      const vals = resolveExpr(piece, file, new Set(seen));
      if (!vals) { ok = false; return; }
      out = out.flatMap((s) => vals.map((v) => s + v));
    });
    return ok ? out : null;
  }

  // 'a' + 'b' + NAME
  const parts = splitTopLevel(t, '+');
  if (parts.length > 1) {
    let out: string[] = [''];
    for (const part of parts) {
      const vals = resolveExpr(part, file, new Set(seen));
      if (!vals) return null;
      out = out.flatMap((s) => vals.map((v) => s + v));
    }
    return out;
  }

  if (/^[A-Za-z_$][\w$]*$/.test(t)) {
    const found = constExpr(t, file, seen);
    if (found) return resolveExpr(found.expr, found.file, seen);
  }
  return null;
}

/**
 * The select string(s) from a `.select(...)` argument list. The optional second
 * argument (`{ count: 'exact', head: true }`) is not part of the column list.
 */
function resolveSelectArg(args: string, file: string): string[] | null {
  const first = splitTopLevel(args, ',')[0] ?? '';
  return resolveExpr(first, file);
}

type Site = { file: string; line: number; root: string | null; selects: string[] | null; raw: string };

const FROM = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g;

/**
 * Every `.select(` in a file, paired with the table it reads from — the
 * nearest preceding `.from('table')` with no other `.select(` in between, so
 * long `.insert({...}).select(...)` chains still resolve.
 */
function selectSites(file: string): Site[] {
  const text = fs.readFileSync(file, 'utf8');
  const froms = [...text.matchAll(FROM)].map((m) => ({ index: m.index!, table: m[1] }));
  const sites: Site[] = [];
  const re = /\.select\(/g;
  let prevSelect = -1;
  for (const m of text.matchAll(re)) {
    const at = m.index!;
    const candidates = froms.filter((f) => f.index < at && f.index > prevSelect);
    const root = candidates.length ? candidates[candidates.length - 1].table : null;
    // `textarea.select()` and prose in comments are not PostgREST queries. A
    // rootless `.select(` only counts when a client is in view just above it;
    // anything with a root is checked regardless.
    if (!root && !/supabase|\.from\(/.test(text.slice(Math.max(0, at - 300), at))) {
      prevSelect = at;
      continue;
    }
    const arg = argumentAt(text, at + '.select'.length);
    const raw = (arg ?? '').replace(/\s+/g, ' ').trim();
    sites.push({
      file,
      line: text.slice(0, at).split('\n').length,
      root,
      selects: arg === null ? null : resolveSelectArg(arg, file),
      raw: raw.slice(0, 120),
    });
    prevSelect = at;
  }
  return sites;
}

describe('PostgREST embeds resolve across real foreign keys', () => {
  const { tables, fks, byColumn, columnsByTable } = loadSchema();

  it('parses the generated schema', () => {
    expect(tables.size).toBeGreaterThan(50);
    expect(fks.has('operators>applications')).toBe(true);
    expect(fks.has('operators>profiles')).toBe(false);
    expect(byColumn.get('onboard_assignment_sheets.operator_id')).toBe('operators');
  });

  it('parses columns per table', () => {
    expect(columnsByTable.get('operators')?.has('unit_number')).toBe(true);
    expect(columnsByTable.get('operators')?.has('driver_name')).toBe(false);
    expect(columnsByTable.get('profiles')?.has('first_name')).toBe(true);
  });

  const sites = allFiles().flatMap(selectSites);
  const readable = sites.filter((s) => s.root && s.selects);

  it('reads every select it finds, in src/ and in supabase/functions/', () => {
    // A select the resolver cannot read is a hole in the guard, so it fails
    // here by name instead of being counted as coverage.
    const unreadable = sites
      .filter((s) => !s.selects || !s.root)
      .filter((s) => !UNREADABLE_ALLOWLIST.some((a) => a.at === `${rel(s.file)}:${s.line}`))
      .map((s) =>
        `${rel(s.file)}:${s.line} — ${!s.root ? 'no .from() root found' : 'select argument not statically resolvable'}` +
        `: .select(${s.raw}). Hoist the column list to a module-level const, or extend the resolver.`,
      );

    console.log(`[select-scan] ${sites.length} selects found, ${readable.length} read, ${unreadable.length} unreadable`);
    expect(unreadable).toEqual([]);
    // The scan must actually be reaching both roots.
    expect(sites.some((s) => s.file.startsWith(FUNCTIONS))).toBe(true);
    expect(sites.length).toBeGreaterThan(600);
  });

  it('selects no column that does not exist on the table it is read from', () => {
    const failures: string[] = [];
    let checked = 0;

    for (const site of readable) {
      for (const select of site.selects!) {
        for (const ref of parseColumnRefs(select, site.root!, tables, byColumn)) {
          const cols = columnsByTable.get(ref.table);
          if (!cols) continue; // view or unknown relation — nothing to check against
          checked++;
          if (!cols.has(ref.column)) {
            failures.push(
              `${rel(site.file)}:${site.line} — ${ref.table}.${ref.column} does not exist. ` +
              `PostgREST rejects the whole request, so the caller silently gets nothing.`,
            );
          }
        }
      }
    }

    console.log(`[column-check] ${checked} column references verified`);
    expect(checked).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  });

  it('has no embed across a table pair with no foreign key', () => {
    const failures: string[] = [];
    let checked = 0;

    for (const site of readable) {
      for (const select of site.selects!) {
        for (const hop of parseHops(select, site.root!, tables, byColumn)) {
          checked++;
          if (!fks.has(`${hop.parent}>${hop.child}`)) {
            failures.push(
              `${rel(site.file)}:${site.line} — ${hop.parent} -> ${hop.child} has no foreign key. ` +
              `PostgREST cannot resolve this embed and the query returns nothing. ` +
              `Do a second read keyed on the id column instead (see src/lib/profileNames.ts).`,
            );
          }
        }
      }
    }

    console.log(`[embed-check] ${checked} embed hops verified`);
    expect(checked).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  });

  it('flags the shapes that were silently broken', () => {
    const bad = parseHops('unit_number, profiles(first_name)', 'operators', tables, byColumn);
    expect(bad).toContainEqual({ parent: 'operators', child: 'profiles' });
    expect(fks.has('operators>profiles')).toBe(false);

    const nested = parseHops('id, operators!inner(unit_number, profiles(first_name))', 'eld_devices', tables, byColumn);
    // The hop is checked against its own parent, not the root table.
    expect(nested).toContainEqual({ parent: 'operators', child: 'profiles' });

    const receipts = parseHops('id, profiles(first_name)', 'equipment_receipts', tables, byColumn);
    expect(fks.has(`${receipts[0].parent}>${receipts[0].child}`)).toBe(false);

    // …and does not flag a real FK, in either direction.
    expect(fks.has('eld_malfunction_events>profiles')).toBe(true);
    expect(fks.has('operators>onboarding_status')).toBe(true);
  });
});
