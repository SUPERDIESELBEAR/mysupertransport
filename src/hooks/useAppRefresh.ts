import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

declare const __BUILD_VERSION__: string;

function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.includes('lovableproject.com') ||
    host.includes('id-preview--')
  );
}

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Soft-refresh hook: re-pulls profile/roles and invalidates all React Query
 * caches in place so the user gets fresh data without a full page reload
 * (no white flash, scroll position and open modals preserved).
 *
 * Returns { refresh, refreshing, hardReload }.
 */
export function useAppRefresh() {
  const { refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Check for a newer published build first (skip on dev/preview hosts).
      if (!isPreviewHost()) {
        const remote = await fetchRemoteVersion();
        if (remote && remote !== __BUILD_VERSION__) {
          toast.dismiss('version-update');
          toast.success('Loading latest version…', { id: 'version-reload' });
          window.location.reload();
          return;
        }
      }
      await Promise.all([
        refreshProfile?.(),
        queryClient.invalidateQueries(),
      ]);
      toast.success('Up to date');
    } catch (err) {
      console.error('[useAppRefresh] failed', err);
      toast.error("Couldn't refresh — check your connection");
    } finally {
      // small delay so the spinner is visible even on fast networks
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [refreshing, refreshProfile, queryClient]);

  const hardReload = useCallback(() => {
    window.location.reload();
  }, []);

  return { refresh, refreshing, hardReload };
}