import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

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