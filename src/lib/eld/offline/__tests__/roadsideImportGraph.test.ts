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

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiersOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) out.push(m[1] ?? m[2]);
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