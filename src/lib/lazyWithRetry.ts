import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'superdrive_chunk_reloaded_at';
const RELOAD_COOLDOWN_MS = 30_000;

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? '');
  return (
    /dynamically imported module/i.test(msg) ||
    /Loading chunk/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg)
  );
}

/**
 * React.lazy with recovery for stale build chunks.
 * After a new deploy, old chunk filenames 404 — retry once, then hard-reload
 * (at most once per cooldown window) so the client picks up the new build.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;

      // One quiet retry — covers transient network blips.
      try {
        return await factory();
      } catch (retryErr) {
        let last = 0;
        try {
          last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        } catch {
          // storage unavailable — fall through to reload attempt
        }
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          try {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          } catch {
            // ignore
          }
          window.location.reload();
          // Never resolves; the page is going away.
          return await new Promise<{ default: T }>(() => {});
        }
        throw retryErr;
      }
    }
  });
}
