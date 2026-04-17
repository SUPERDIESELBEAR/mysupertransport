import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COMPANY_WIDE_DOCS, PER_DRIVER_DOCS, isOptionalCompanyDoc } from '@/components/inspection/InspectionBinderTypes';

// Defaults exclude optional company docs (Hazmat, Overweight/Oversize) so they
// are NOT auto-injected into the binder order. They only appear for drivers
// who explicitly opt in (handled at the consumer/render level).
const DEFAULT_COMPANY = COMPANY_WIDE_DOCS.filter(d => !isOptionalCompanyDoc(d.key)).map(d => d.key);
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
            // Strip out any optional docs from saved order so they stay hidden by default
            const cleaned = order.filter(k => !isOptionalCompanyDoc(k));
            const saved = new Set(cleaned);
            const merged = [...cleaned, ...DEFAULT_COMPANY.filter(k => !saved.has(k))];
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
