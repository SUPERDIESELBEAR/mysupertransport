import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * A management user who is not the owner has no reason to open an ownership
 * screen unprompted, so the pending transfer has to come find them. This hook
 * backs the Management banner and the conditional Settings entry.
 */
export function usePendingOwnerTransfer() {
  const { user } = useAuth();
  const [pendingForMe, setPendingForMe] = useState(false);

  useEffect(() => {
    if (!user?.id) { setPendingForMe(false); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('owner_transfers')
        .select('id')
        .eq('status', 'pending')
        .eq('to_user_id', user.id)
        .limit(1);
      if (!cancelled) setPendingForMe(!!data && data.length > 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return pendingForMe;
}
