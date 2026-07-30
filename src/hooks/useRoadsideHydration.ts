import { useEffect } from 'react';
import { hydrateRoadsideCache } from '@/lib/eld/offline/hydrate';

/**
 * Refreshes local_meta and the roadside cache on every successful
 * authenticated load, so identity, timezone, and ELD document bytes are
 * present before Pass B's sync layer exists. Re-runs on foreground so a name
 * or terminal change propagates without a reinstall.
 */
export function useRoadsideHydration(operatorId: string | null | undefined, driverName: string | null | undefined) {
  useEffect(() => {
    if (!operatorId || !driverName) return;
    const run = () => { void hydrateRoadsideCache(operatorId, driverName); };
    run();
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [operatorId, driverName]);
}