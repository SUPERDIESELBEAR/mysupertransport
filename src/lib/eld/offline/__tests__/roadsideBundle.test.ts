/**
 * Bundle-level backstop for the module-graph walk.
 *
 * The source walker can be fooled by a clever re-export; the emitted chunks
 * cannot. Reads `dist/` when it exists (CI builds before testing) and skips
 * otherwise, so a local `vitest run` stays fast.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../..');
const DIST = path.join(ROOT, 'dist');
const hasDist = fs.existsSync(path.join(DIST, 'assets'));

function chunkFiles(): string[] {
  return fs.readdirSync(path.join(DIST, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(DIST, 'assets', f));
}

/** Chunks that contain the roadside packet, found by a marker string it renders. */
function roadsideChunks(): string[] {
  return chunkFiles().filter((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return src.includes('No records stored on this device')
      || src.includes('roadside-native-grid');
  });
}

describe.skipIf(!hasDist)('roadside bundle', () => {
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
});