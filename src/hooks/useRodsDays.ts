import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isComplete, reconstructionDates, type RodsDay } from '@/lib/eld/rodsTypes';
import { roadsideDb } from '@/lib/eld/offline/db';

/**
 * Loads the driver's current 8-day RODS window (today plus the previous 7).
 * Superseded rows are excluded — only the live record for each date is shown.
 *
 * The cache is overlaid on the server rows so a locally-signed day appears as
 * `syncing` until the queue confirms it, and terminal failure states (`stalled`,
 * `rejected`) surface before the server copy does.
 */
export function useRodsDays(operatorId: string | null | undefined) {
  const [days, setDays] = useState<RodsDay[]>([]);
  const [loading, setLoading] = useState(true);
  const dates = useMemo(() => reconstructionDates(), []);

  const refresh = useCallback(async () => {
    if (!operatorId) { setDays([]); setLoading(false); return; }
    setLoading(true);
    const [serverRes, cached] = await Promise.all([
      supabase
        .from('rods_days')
        .select('*')
        .eq('operator_id', operatorId)
        .neq('status', 'superseded')
        .gte('log_date', dates[dates.length - 1])
        .lte('log_date', dates[0])
        .order('log_date', { ascending: false }),
      roadsideDb.rods_days_cache.toArray(),
    ]);
    const serverRows = (serverRes.data ?? []) as unknown as RodsDay[];
    const cachedById = new Map<string, typeof cached[0]>();
    for (const c of cached) {
      if (c.operator_id === operatorId && c.day?.id) cachedById.set(c.day.id, c);
    }
    const merged = serverRows.map((d) => {
      const c = cachedById.get(d.id);
      if (!c) return d;
      return {
        ...d,
        // Only local-state fields matter for the overlay. The server row is the
        // source of truth for everything else; the cache is authoritative only
        // for the four sync state fields.
        local_certified_at: c.local_certified_at,
        unsynced: c.unsynced,
        sync_rejected: c.sync_rejected,
        sync_stalled: c.sync_stalled,
      };
    });
    setDays(merged);
    setLoading(false);
  }, [operatorId, dates]);

  useEffect(() => { void refresh(); }, [refresh]);

  const byDate = useMemo(() => {
    const map = new Map<string, RodsDay>();
    for (const d of days) {
      // A draft amendment and its still-certified original can both be live for
      // one date. The draft is what the driver is working on, so it wins here.
      const existing = map.get(d.log_date);
      if (!existing || d.status === 'draft') map.set(d.log_date, d);
    }
    return map;
  }, [days]);

  const completeCount = dates.filter((d) => isComplete(byDate.get(d))).length;

  return {
    dates,
    days,
    byDate,
    completeCount,
    reconstructionComplete: completeCount === dates.length,
    loading,
    refresh,
  };
}