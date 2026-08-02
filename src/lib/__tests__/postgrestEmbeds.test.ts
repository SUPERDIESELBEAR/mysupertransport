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
  // it), so walk linearly and track the most recent table header.
  const fks = new Set<string>();
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const t = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (t) { current = t[1]; continue; }
    const r = /referencedRelation: "([a-z0-9_]+)"/.exec(line);
    if (r && current) {
      fks.add(`${current}>${r[1]}`);
      fks.add(`${r[1]}>${current}`); // embeds resolve in both directions
    }
  }
  return { tables, fks };
}

type Hop = { parent: string; child: string };

/** Walk a select string's paren tree, yielding each parent -> child embed hop. */
function parseHops(select: string, root: string, tables: Set<string>): Hop[] {
  const hops: Hop[] = [];
  const stack: string[] = [root];
  let token = '';
  for (let i = 0; i < select.length; i++) {
    const ch = select[i];
    if (ch === '(') {
      // Strip modifiers: alias:table!inner, table!left, table!fk_name
      const raw = token.split(',').pop()!.trim();
      const named = raw.includes(':') ? raw.split(':').pop()!.trim() : raw;
      const name = named.split('!')[0].trim();
      // Only a known table opening a nested field list is an embed; anything
      // else is a column or an aggregate like count().
      if (tables.has(name)) {
        hops.push({ parent: stack[stack.length - 1], child: name });
        stack.push(name);
      } else {
        stack.push(stack[stack.length - 1]);
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

// .from('table') … .select('literal') — the `…` allows chained calls in between.
const QUERY = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)([\s\S]{0,1500}?)\.select\(\s*(['"`])([\s\S]*?)\3/g;
// A .select() whose argument is not a plain literal (a variable, a template with
// ${}) can't be checked statically.
const DYNAMIC = /\.select\(\s*[^'"`)]/g;

describe('PostgREST embeds resolve across real foreign keys', () => {
  const { tables, fks } = loadSchema();

  it('parses the generated schema', () => {
    expect(tables.size).toBeGreaterThan(50);
    expect(fks.has('operators>applications')).toBe(true);
    expect(fks.has('operators>profiles')).toBe(false);
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
        for (const hop of parseHops(select, root, tables)) {
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
});
