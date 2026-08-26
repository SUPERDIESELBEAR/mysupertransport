import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDbError } from '@/lib/dbError';

/**
 * Open count for the rate-con ingest inbox: the only notification the shared
 * queue gets. Parsed items and items needing manual retrieval both count;
 * 'received' / 'pending_parse' are transient (the ingest function is still
 * working) and count too — a dispatcher should see that mail arrived.
 */
export function useRateConInboxCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { count: n, error } = await supabase
      .from('rate_con_ingest_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['received', 'pending_parse', 'parsed', 'needs_manual']);
    if (error) {
      logDbError('rate con inbox count', error);
      return;
    }
    setCount(n ?? 0);
  }, []);

  useEffect(() => {
    void refresh();
    // Unique per mount. A fixed channel name breaks when the badge is mounted
    // twice (desktop sidebar + mobile nav, or a StrictMode remount): the second
    // `.on()` lands on the already-subscribed shared channel and throws, which
    // took the whole portal down.
    const channel = supabase
      .channel(`rate-con-inbox-count-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rate_con_ingest_queue',
      }, () => { void refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return count;
}
