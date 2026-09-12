import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FILE SIZE TIER GUARD — EXPECTED GREEN.
 *
 * This project enforces exactly three upload size tiers:
 *   10 MB  `validateFile.ts`      — phone photos and single-page scans
 *   20 MB  `rateConfirmation.ts`  — multi-page broker rate confirmations
 *   25 MB  `loadDocuments.ts` and `binderUpload.ts` — scanner PDFs
 *
 * A fourth tier appearing here is NEW and unresolved: either fold it into an
 * existing tier or declare it below with a reason, in the same pass that adds it.
 * Every declared constant must also carry a comment explaining its tier, so the
 * next person does not have to guess which limit a screen should state.
 */
const DECLARED = new Map<string, number>([
  ['src/lib/validateFile.ts::MAX_FILE_SIZE_BYTES', 10],
  ['src/lib/rateConfirmation.ts::MAX_RATECON_BYTES', 20],
  ['src/lib/loadDocuments.ts::MAX_LOAD_DOC_BYTES', 25],
  ['src/lib/binderUpload.ts::MAX_BINDER_BYTES', 25],
]);

const ALLOWED_TIERS = [10, 20, 25];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('file size tiers', () => {
  const files = walk('src');
  const found: { key: string; mb: number; hasReason: boolean }[] = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const re = /export const (MAX_[A-Z0-9_]*(?:BYTES|SIZE))\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const before = src.slice(0, m.index);
      found.push({
        key: `${file.replace(/\\/g, '/')}::${m[1]}`,
        mb: Number(m[2]),
        hasReason: /SIZE LIMIT/.test(before.slice(-1400)),
      });
    }
  }

  it('declares every file-size constant in the tier table', () => {
    const undeclared = found.filter(f => !DECLARED.has(f.key)).map(f => `${f.key} (${f.mb} MB)`);
    expect(undeclared).toEqual([]);
  });

  it('keeps every constant on one of the three allowed tiers', () => {
    const offTier = found.filter(f => !ALLOWED_TIERS.includes(f.mb)).map(f => `${f.key} (${f.mb} MB)`);
    expect(offTier).toEqual([]);
  });

  it('matches the declared megabyte value for each constant', () => {
    const mismatched = found
      .filter(f => DECLARED.has(f.key) && DECLARED.get(f.key) !== f.mb)
      .map(f => `${f.key} is ${f.mb} MB, declared ${DECLARED.get(f.key)} MB`);
    expect(mismatched).toEqual([]);
  });

  it('requires a recorded reason above each constant', () => {
    const unreasoned = found.filter(f => !f.hasReason).map(f => f.key);
    expect(unreasoned).toEqual([]);
  });

  it('finds every constant the tier table declares', () => {
    const missing = [...DECLARED.keys()].filter(k => !found.some(f => f.key === k));
    expect(missing).toEqual([]);
  });
});
