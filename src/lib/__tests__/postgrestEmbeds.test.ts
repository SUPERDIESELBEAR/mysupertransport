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
 * This test enumerates every literal `.select()` embed in src/ and checks each
 * parent -> child hop against the foreign keys in the generated Supabase types.
 */

const SRC = path.resolve(__dirname, '../..');
const TYPES = path.join(SRC, 'integrations/supabase/types.ts');

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

// .from('table') … .select('literal'). The gap must not swallow another query:
// without excluding `.from(`/`.select(` the regex pairs one statement's table
// with a later statement's select and reports phantom hops.
const QUERY = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)((?:(?!\.from\(|\.select\()[\s\S]){0,400}?)\.select\(\s*(['"`])([\s\S]*?)\3/g;
// A .select() whose argument is not a plain literal (a variable, a template with
// ${}) can't be checked statically.
const DYNAMIC = /\.select\(\s*[^'"`)]/g;

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

  it('selects no column that does not exist on the table it is read from', () => {
    const failures: string[] = [];
    let checked = 0;

    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(QUERY)) {
        const [root, select] = [m[1], m[4]];
        if (select.includes('${')) continue;
        const line = text.slice(0, m.index!).split('\n').length;
        for (const ref of parseColumnRefs(select, root, tables, byColumn)) {
          const cols = columnsByTable.get(ref.table);
          if (!cols) continue; // view or unknown relation — nothing to check against
          checked++;
          if (!cols.has(ref.column)) {
            failures.push(
              `${path.relative(SRC, file)}:${line} — ${ref.table}.${ref.column} does not exist. ` +
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
    let skipped = 0;

    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      skipped += (text.match(DYNAMIC) ?? []).length;
      for (const m of text.matchAll(QUERY)) {
        const [root, select] = [m[1], m[4]];
        if (select.includes('${')) { skipped++; continue; }
        const line = text.slice(0, m.index!).split('\n').length;
        for (const hop of parseHops(select, root, tables, byColumn)) {
          checked++;
          if (!fks.has(`${hop.parent}>${hop.child}`)) {
            failures.push(
              `${path.relative(SRC, file)}:${line} — ${hop.parent} -> ${hop.child} has no foreign key. ` +
              `PostgREST cannot resolve this embed and the query returns nothing. ` +
              `Do a second read keyed on the id column instead (see src/lib/profileNames.ts).`,
            );
          }
        }
      }
    }

    // Visibility into coverage loss from selects this check can't read.
    console.log(`[embed-check] ${checked} embed hops verified, ${skipped} dynamic selects skipped`);
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
