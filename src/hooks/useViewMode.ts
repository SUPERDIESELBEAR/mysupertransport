import { useCallback, useEffect, useState } from 'react';
import type { ViewMode } from '@/components/ui/ViewModeToggle';

/**
 * URL-first, localStorage-fallback view mode hook.
 *
 * On mount: ?mode= → localStorage[storageKey] → defaultMode
 * On set:   updates state, localStorage, and URL (history replace)
 */
export function useViewMode(
  storageKey: string,
  urlParam: string = 'mode',
  defaultMode: ViewMode = 'cards',
): [ViewMode, (m: ViewMode) => void] {
  const read = (): ViewMode => {
    if (typeof window === 'undefined') return defaultMode;
    const url = new URLSearchParams(window.location.search).get(urlParam);
    if (url === 'cards' || url === 'table') return url;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'cards' || stored === 'table') return stored;
    return defaultMode;
  };

  const [mode, setModeState] = useState<ViewMode>(read);

  // Re-read once on mount in case SSR/hydration mismatch.
  useEffect(() => {
    const next = read();
    if (next !== mode) setModeState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch { /* storage unavailable — ignore */ }
      try {
        const url = new URL(window.location.href);
        if (next === defaultMode) {
          url.searchParams.delete(urlParam);
        } else {
          url.searchParams.set(urlParam, next);
        }
        window.history.replaceState({}, '', url.toString());
      } catch { /* ignore */ }
    },
    [storageKey, urlParam, defaultMode],
  );

  return [mode, setMode];
}

export default useViewMode;