import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importWithRetry, isChunkLoadError } from '@/lib/lazyWithRetry';

describe('dynamic import recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('recognizes the Vite module error reported by the preview', () => {
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /node_modules/.vite/deps/chunk.js'))).toBe(true);
  });

  it('retries a transient chunk failure once', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: 'loaded' });

    await expect(importWithRetry(factory)).resolves.toEqual({ default: 'loaded' });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated module errors', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('module initialization failed'));

    await expect(importWithRetry(factory)).rejects.toThrow('module initialization failed');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('returns the second chunk error during the reload cooldown', async () => {
    sessionStorage.setItem('superdrive_chunk_reloaded_at', String(Date.now()));
    const factory = vi.fn()
      .mockRejectedValueOnce(new TypeError('error loading dynamically imported module'))
      .mockRejectedValueOnce(new TypeError('retry also failed'));

    await expect(importWithRetry(factory)).rejects.toThrow('retry also failed');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});