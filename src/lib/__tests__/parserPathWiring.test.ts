import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Every parser check must be REACHABLE from both the create path and the
 * revision path — not merely implemented.
 *
 * Three failures of exactly this shape surfaced in one night: `saveLoadReferences`
 * with no caller, verbatim verification absent from the revision path entirely,
 * and an anchor-miss log nothing read. Each was correct code with no invocation
 * on the path that mattered, and the unit tests missed all three because they
 * call the functions directly.
 *
 * So this test does not test behaviour. It discovers functions tagged
 * `@parser-check` anywhere in the tree, walks the import graph out from each
 * entry point, and asserts the name is called somewhere reachable from both.
 */

const SRC = resolve(__dirname, '../..');

const ENTRY_POINTS: { name: string; file: string }[] = [
  { name: 'create',   file: 'pages/dispatch/CreateLoadPage.tsx' },
  { name: 'revision', file: 'components/dispatch/loadDetail/RevisedRateConModal.tsx' },
];

const CODE = /\.(ts|tsx)$/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (CODE.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Tagged exports: `@parser-check` in a JSDoc immediately above an export. */
function discoverChecks(): { name: string; file: string }[] {
  const found: { name: string; file: string }[] = [];
  for (const file of walkFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('@parser-check')) return;
      for (let j = i + 1; j < Math.min(i + 14, lines.length); j++) {
        const m = lines[j].match(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/);
        if (m) { found.push({ name: m[1], file }); break; }
      }
    });
  }
  return found;
}

/** Resolves an `@/`-style or relative import to a real file, or null. */
function resolveImport(spec: string, fromFile: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/')
    ? join(SRC, spec.slice(2))
    : resolve(dirname(fromFile), spec);
  for (const candidate of [
    base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch { /* not this one */ }
  }
  return null;
}

/** Every project file reachable by import from an entry point. */
function reachableFrom(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    let source: string;
    try { source = readFileSync(file, 'utf8'); } catch { continue; }
    seen.set(file, source);

    const specs = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const spec of specs) {
      const target = resolveImport(spec, file);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

/** A call, not just a mention: `name(` or `name (`, excluding its own definition. */
function isCalledIn(name: string, source: string, file: string, definedIn: string): boolean {
  const call = new RegExp(`\\b${name}\\s*\\(`);
  if (file === definedIn) {
    // Ignore the declaration itself, but a self-recursive helper still counts.
    const withoutDecl = source.replace(
      new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\s*[(=]`, 'g'), '',
    );
    return call.test(withoutDecl);
  }
  return call.test(source);
}

describe('parser checks are wired into both load paths', () => {
  const checks = discoverChecks();

  it('finds the tagged checks', () => {
    expect(checks.length).toBeGreaterThan(0);
  });

  const graphs = ENTRY_POINTS.map(e => ({
    ...e,
    files: reachableFrom(join(SRC, e.file)),
  }));

  it.each(graphs.map(g => [g.name, g] as const))(
    'the %s path reaches every tagged check',
    (_name, graph) => {
      const missing = checks.filter(check =>
        ![...graph.files].some(([file, source]) =>
          isCalledIn(check.name, source, file, check.file)));

      expect(
        missing.map(m => m.name),
        `not called anywhere reachable from ${graph.file}`,
      ).toEqual([]);
    },
  );
});
