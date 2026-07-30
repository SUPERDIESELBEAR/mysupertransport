/**
 * The /roadside boot path must never be able to reach the Supabase client.
 *
 * A lint rule on the leaf files is not enough — a three-module-deep import
 * would slip past it. This walks the real import graph from the entry module
 * and fails on any transitive reach.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../..');
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'roadside/RoadsideEntry.tsx');

const FORBIDDEN = [
  '@/integrations/supabase/client',
  '@/integrations/supabase/types',
  '@supabase/supabase-js',
  '@/hooks/useAuth',
  // The roadside display path renders natively. Reaching the PDF library from
  // it would put a megabyte of parser on the one screen that must boot fast.
  'pdf-lib',
];

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package — not part of the local graph

  for (const ext of ['', ...EXTENSIONS]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = path.join(base, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)\s+([\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Value specifiers only.
 *
 * `import type { X } from '…'` erases at compile time, so treating it as a
 * reach would false-positive. The clause is skipped here rather than by
 * loosening the matcher, which would also hide real value imports. Inline
 * `{ type X }` members are irrelevant: the statement still emits a value
 * import unless every member is a type, and Vite/esbuild keeps the module in
 * that case only under verbatimModuleSyntax — so treat those as reaches.
 */
function specifiersOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const dynamic = m[3];
    if (dynamic) { out.push(dynamic); continue; }
    const clause = m[1] ?? '';
    const statement = m[0];
    // `import type …` / `export type …`
    if (/^(?:import|export)\s+type\s/.test(statement)) continue;
    // A clause made up entirely of `type` members also erases.
    const braced = clause.match(/\{([\s\S]*)\}/);
    if (braced && !/^\s*$/.test(braced[1])) {
      const members = braced[1].split(',').map((s) => s.trim()).filter(Boolean);
      const before = clause.slice(0, clause.indexOf('{')).replace(/[,\s]/g, '');
      if (!before && members.every((mem) => /^type\s/.test(mem))) continue;
    }
    if (m[2]) out.push(m[2]);
  }
  return out.filter(Boolean);
}

describe('roadside import graph', () => {
  it('never reaches the backend client or auth provider', () => {
    const seen = new Set<string>();
    const stack = [ENTRY];
    const violations: string[] = [];

    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);

      for (const spec of specifiersOf(file)) {
        if (FORBIDDEN.some((f) => spec === f || spec.startsWith(`${f}/`))) {
          violations.push(`${path.relative(ROOT, file)} imports ${spec}`);
          continue;
        }
        const resolved = resolveSpecifier(spec, file);
        if (resolved) stack.push(resolved);
      }
    }

    expect(violations).toEqual([]);
    // Sanity: the walk actually traversed the packet, not just the entry file.
    expect(seen.size).toBeGreaterThan(3);
  });

  it('still detects a value import of a forbidden module (walker not loosened)', () => {
    // Guards the type-only skip above: a plain value import must still trip.
    const tmp = path.join(SRC, 'lib/eld/offline/__tests__/__fixture_value_import.ts');
    fs.writeFileSync(tmp, "import { PDFDocument } from 'pdf-lib';\nexport const x = PDFDocument;\n");
    try {
      const specs = specifiersOf(tmp);
      expect(specs).toContain('pdf-lib');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('skips a type-only import', () => {
    const tmp = path.join(SRC, 'lib/eld/offline/__tests__/__fixture_type_import.ts');
    fs.writeFileSync(tmp, "import type { PDFDocument } from 'pdf-lib';\nexport type X = PDFDocument;\n");
    try {
      expect(specifiersOf(tmp)).not.toContain('pdf-lib');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('does not pull App.tsx into the roadside graph', () => {
    const seen = new Set<string>();
    const stack = [ENTRY];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of specifiersOf(file)) {
        const resolved = resolveSpecifier(spec, file);
        if (resolved) stack.push(resolved);
      }
    }
    expect([...seen].some((f) => f.endsWith('/src/App.tsx'))).toBe(false);
  });
});