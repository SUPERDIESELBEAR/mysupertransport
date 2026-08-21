/**
 * Bundle-level backstop for the module-graph walk.
 *
 * The source walker can be fooled by a clever re-export; the emitted chunks
 * cannot. But reading `dist/` is only evidence if the build MATCHES the source:
 * a stale `dist/` would let these assertions pass against code that no longer
 * exists. So this suite is gated on an explicit signal (`RUN_BUNDLE_TESTS=1`,
 * or `CI`, where a build always precedes the tests) AND on a freshness check.
 * Missing or stale build: skip loudly locally, fail loudly in CI. Never assert
 * against a build of unknown age.
 */
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gatedDescribe, IS_CI } from '@/test/helpers/gate';

const ROOT = path.resolve(__dirname, '../../../../..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');

const OPTED_IN = process.env.RUN_BUNDLE_TESTS === '1' || IS_CI;

const WATCHED_FILES = ['index.html', 'vite.config.ts', 'package.json', 'tailwind.config.ts'];

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    const stamp = entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs;
    if (stamp > newest) newest = stamp;
  }
  return newest;
}

function buildState(): { ok: boolean; reason: string } {
  if (!fs.existsSync(ASSETS)) {
    return { ok: false, reason: 'no dist/assets — build before running the bundle tests' };
  }
  const chunks = fs.readdirSync(ASSETS).map((f) => fs.statSync(path.join(ASSETS, f)).mtimeMs);
  if (chunks.length === 0) {
    return { ok: false, reason: 'dist/assets is empty — build before running the bundle tests' };
  }
  const oldestChunk = Math.min(...chunks);

  let newestSource = newestMtime(path.join(ROOT, 'src'));
  for (const file of WATCHED_FILES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const stamp = fs.statSync(full).mtimeMs;
    if (stamp > newestSource) newestSource = stamp;
  }

  if (newestSource > oldestChunk) {
    return {
      ok: false,
      reason: 'dist/ is older than source — the build is stale, rebuild before running the bundle tests',
    };
  }
  return { ok: true, reason: '' };
}

const state = OPTED_IN
  ? buildState()
  : { ok: false, reason: 'bundle tests are opt-in — set RUN_BUNDLE_TESTS=1 (CI sets it via CI) after a build' };

function chunkFiles(): string[] {
  return fs.readdirSync(ASSETS)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(ASSETS, f));
}

/** Chunks that contain the roadside packet, found by a marker string it renders. */
function roadsideChunks(): string[] {
  return chunkFiles().filter((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return src.includes('No records stored on this device')
      || src.includes('roadside-native-grid');
  });
}

gatedDescribe(
  'roadside bundle',
  {
    enabled: state.ok,
    reason: state.reason,
    details: [
      'These assertions read emitted chunks. A stale or absent build',
      'would assert against code that no longer matches the source,',
      'so they are skipped rather than run against unknown output.',
    ],
    // Only required once opted in: an un-opted-in local run is a deliberate skip.
    required: IS_CI,
  },
  () => {
    it('emits the roadside packet into its own chunk(s)', () => {
      expect(roadsideChunks().length).toBeGreaterThan(0);
    });

    it('contains no pdf-lib and no Supabase client code', () => {
      for (const file of roadsideChunks()) {
        const src = fs.readFileSync(file, 'utf8');
        // pdf-lib fingerprints
        expect(src).not.toContain('PDFDocument');
        expect(src).not.toContain('%PDF-1.7');
        // supabase-js fingerprints
        expect(src).not.toContain('supabase.co/auth/v1');
        expect(src).not.toContain('GoTrueClient');
      }
    });
  },
);
