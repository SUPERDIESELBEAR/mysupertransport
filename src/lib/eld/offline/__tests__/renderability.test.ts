import { describe, expect, it, vi } from 'vitest';
import { PROBE_TIMEOUT_MS, probeRenderability } from '../renderability';

describe('renderability probe', () => {
  it('treats a PDF as renderable without a canvas decode', async () => {
    const r = await probeRenderability(new ArrayBuffer(8), 'application/pdf');
    expect(r.renderable).toBe(true);
  });

  it('treats a non-image, non-PDF file as not renderable', async () => {
    const r = await probeRenderability(new ArrayBuffer(8), 'application/octet-stream');
    expect(r.renderable).toBe(false);
  });

  it('reports not renderable when the decode rejects (HEIC on Chrome)', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    const r = await probeRenderability(new ArrayBuffer(8), 'image/heic');
    expect(r.renderable).toBe(false);
    expect(r.display_bytes).toBeNull();
    vi.unstubAllGlobals();
  });

  it('reports not renderable when the decode never settles, within the timeout', async () => {
    vi.stubGlobal('createImageBitmap', () => new Promise(() => { /* hangs forever */ }));
    const started = Date.now();
    const r = await probeRenderability(new ArrayBuffer(8), 'image/heic');
    const elapsed = Date.now() - started;
    expect(r.renderable).toBe(false);
    expect(elapsed).toBeLessThan(PROBE_TIMEOUT_MS + 750);
    vi.unstubAllGlobals();
  }, 10_000);

  it('probes a window of hanging files in parallel, not serially', async () => {
    vi.stubGlobal('createImageBitmap', () => new Promise(() => { /* hangs forever */ }));
    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => probeRenderability(new ArrayBuffer(8), 'image/heic')),
    );
    const elapsed = Date.now() - started;
    expect(results.every((r) => !r.renderable)).toBe(true);
    // Serial probing would cost 8 x the timeout.
    expect(elapsed).toBeLessThan(PROBE_TIMEOUT_MS * 2);
    vi.unstubAllGlobals();
  }, 30_000);
});