import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Is this operator a demo (sandbox) driver?
 *
 * Used by the surfaces that generate artifacts with no record row of their own
 * — the blank 8-day packet, for instance. Anything that renders from a
 * `rods_days` or `eld_malfunction_events` row must read `is_demo` off that row
 * instead: the flag is stamped at insert and frozen, so the record stays
 * correctly marked even if the operator is later cleared to live.
 */
export function useIsDemoOperator(operatorId: string | null | undefined): boolean {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (!operatorId) { setIsDemo(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('operators')
        .select('is_demo')
        .eq('id', operatorId)
        .maybeSingle();
      if (!cancelled) setIsDemo(data?.is_demo === true);
    })();
    return () => { cancelled = true; };
  }, [operatorId]);

  return isDemo;
}
