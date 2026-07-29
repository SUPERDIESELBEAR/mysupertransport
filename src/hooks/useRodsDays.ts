import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isComplete, reconstructionDates, type RodsDay } from '@/lib/eld/rodsTypes';

/**
 * Loads the driver's current 8-day RODS window (today plus the previous 7).
 * Superseded rows are excluded — only the live record for each date is shown.
 */
export function useRodsDays(operatorId: string | null | undefined) {
  const [days, setDays] = useState<RodsDay[]>([]);
  const [loading, setLoading] = useState(true);
  const dates = useMemo(() => reconstructionDates(), []);

  const refresh = useCallback(async () => {
    if (!operatorId) { setDays([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('rods_days')
      .select('*')
      .eq('operator_id', operatorId)
      .neq('status', 'superseded')
      .gte('log_date', dates[dates.length - 1])
      .lte('log_date', dates[0])
      .order('log_date', { ascending: false });
    setDays((data ?? []) as unknown as RodsDay[]);
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