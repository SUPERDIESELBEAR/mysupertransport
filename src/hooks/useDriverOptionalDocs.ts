import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OPTIONAL_COMPANY_DOCS } from '@/components/inspection/InspectionBinderTypes';

/**
 * Returns the set of optional company doc names a driver has opted into
 * (Hazmat, Overweight/Oversize, etc.). Empty set = none enabled (default).
 *
 * Pass driverUserId = null to skip the fetch.
 */
export function useDriverOptionalDocs(driverUserId: string | null | undefined) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const fetchEnabled = useCallback(async () => {
    if (!driverUserId) {
      setEnabled(new Set());
      setLoaded(true);
      return;
    }
    const { data } = await supabase
      .from('driver_optional_docs' as any)
      .select('doc_name, enabled')
      .eq('driver_id', driverUserId);
    const next = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      if (row.enabled) next.add(row.doc_name);
    }
    setEnabled(next);
    setLoaded(true);
  }, [driverUserId]);

  useEffect(() => { fetchEnabled(); }, [fetchEnabled]);

  /** Toggle one optional doc on/off for this driver. */
  const setOptional = useCallback(async (docName: string, on: boolean) => {
    if (!driverUserId) return;
    if (!OPTIONAL_COMPANY_DOCS.includes(docName)) return;
    if (on) {
      await supabase
        .from('driver_optional_docs' as any)
        .upsert({ driver_id: driverUserId, doc_name: docName, enabled: true } as any, {
          onConflict: 'driver_id,doc_name',
        });
      setEnabled(prev => new Set(prev).add(docName));
    } else {
      // Soft-disable: keep the row but mark enabled=false so we preserve any audit/history.
      // Actually delete the row — existing uploaded files in inspection_documents are untouched.
      await supabase
        .from('driver_optional_docs' as any)
        .delete()
        .eq('driver_id', driverUserId)
        .eq('doc_name', docName);
      setEnabled(prev => {
        const next = new Set(prev);
        next.delete(docName);
        return next;
      });
    }
  }, [driverUserId]);

  return { enabled, loaded, setOptional, refresh: fetchEnabled };
}
