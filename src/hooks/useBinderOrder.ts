import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COMPANY_WIDE_DOCS, PER_DRIVER_DOCS } from '@/components/inspection/InspectionBinderTypes';

// Default order includes ALL company docs (including optional ones like Hazmat
// and Overweight/Oversize) so they remain visible in the admin Company tab.
// Driver-facing surfaces filter optional docs via `filterOptionalDocs` based on
// each driver's per-driver opt-in state.
const DEFAULT_COMPANY = COMPANY_WIDE_DOCS.map(d => d.key);
const DEFAULT_DRIVER = PER_DRIVER_DOCS.map(d => d.key);

export function useBinderOrder() {
  const [companyOrder, setCompanyOrder] = useState<string[]>(DEFAULT_COMPANY);
  const [driverOrder, setDriverOrder] = useState<string[]>(DEFAULT_DRIVER);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('inspection_binder_order' as any)
        .select('scope, doc_order');
      if (data) {
        for (const row of data as any[]) {
          const order = row.doc_order as string[];
          if (row.scope === 'company_wide' && Array.isArray(order)) {
            const saved = new Set(order);
            const merged = [...order, ...DEFAULT_COMPANY.filter(k => !saved.has(k))];
            setCompanyOrder(merged);
          }
          if (row.scope === 'per_driver' && Array.isArray(order)) {
            const saved = new Set(order);
            const merged = [...order, ...DEFAULT_DRIVER.filter(k => !saved.has(k))];
            setDriverOrder(merged);
          }
        }
      }
      setLoaded(true);
    })();
  }, []);

  const saveOrder = useCallback(async (scope: 'company_wide' | 'per_driver', order: string[]) => {
    if (scope === 'company_wide') setCompanyOrder(order);
    else setDriverOrder(order);

    await supabase
      .from('inspection_binder_order' as any)
      .update({ doc_order: order, updated_at: new Date().toISOString() } as any)
      .eq('scope', scope);
  }, []);

  return { companyOrder, driverOrder, loaded, saveOrder };
}
