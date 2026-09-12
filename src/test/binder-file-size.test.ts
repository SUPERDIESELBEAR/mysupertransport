import { describe, it, expect } from 'vitest';
import { validateBinderFile, MAX_BINDER_BYTES, BINDER_FILE_HINT } from '@/lib/binderUpload';

/**
 * Binder rows had NO client size check and NO bucket cap until 2026-09-12 — the one
 * upload path in the app with no limit at all. These assert the limit exists, refuses
 * an oversized file with a readable message, and that the sentence shown on screen
 * names the same figure the code enforces.
 */
const fileOf = (mb: number, name = 'inspection.pdf') =>
  ({ name, size: Math.round(mb * 1024 * 1024), type: 'application/pdf' }) as File;

describe('binder upload size limit', () => {
  it('enforces 25 MB', () => {
    expect(MAX_BINDER_BYTES).toBe(25 * 1024 * 1024);
  });

  it('refuses a 30 MB file and names the size and the limit', () => {
    const err = validateBinderFile(fileOf(30));
    expect(err).toBe('inspection.pdf is 30.0 MB. The limit is 25 MB.');
  });

  it('refuses a file just over the limit', () => {
    expect(validateBinderFile(fileOf(25.1))).toMatch(/limit is 25 MB/);
  });

  it('accepts a large but legal scanner PDF', () => {
    expect(validateBinderFile(fileOf(24.5))).toBeNull();
    expect(validateBinderFile(fileOf(0.4))).toBeNull();
  });

  it('states the enforced figure in the sentence shown on screen', () => {
    expect(BINDER_FILE_HINT).toContain('25 MB');
  });
});
