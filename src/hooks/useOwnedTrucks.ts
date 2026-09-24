import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OwnedTruck {
  operatorId: string;
  driverUserId: string | null;
  driverName: string;
  unitNumber: string | null;
}

export interface OwnedTrucksState {
  loaded: boolean;
  /** The signed-in person's OWN operator row (he drives it), if any. */
  ownOperatorId: string | null;
  /** Every truck he owns, one row per truck_owners link (P57: many allowed). */
  trucks: OwnedTruck[];
}

/**
 * Reads every truck a truck owner owns. Never `.maybeSingle()` — one owner
 * login may hold several truck_owners rows (P57). RLS lets him read the
 * operators and profiles of the units he owns.
 */
export function useOwnedTrucks(userId: string | null | undefined, enabled: boolean): OwnedTrucksState {
  const [state, setState] = useState<OwnedTrucksState>({ loaded: !enabled, ownOperatorId: null, trucks: [] });

  useEffect(() => {
    if (!enabled || !userId) { setState({ loaded: true, ownOperatorId: null, trucks: [] }); return; }
    let cancelled = false;
    setState(s => ({ ...s, loaded: false }));
    (async () => {
      const [{ data: own }, { data: links }] = await Promise.all([
        supabase.from('operators').select('id').eq('user_id', userId).maybeSingle(),
        supabase
          .from('truck_owners')
          .select('operator_id, created_at, operators:operator_id(user_id, unit_number)')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
      ]);
      const rows = (links ?? []) as any[];
      const driverIds = rows.map(r => r.operators?.user_id).filter(Boolean) as string[];
      const { data: profiles } = driverIds.length
        ? await supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', driverIds)
        : { data: [] as any[] };
      const nameOf = new Map<string, string>(
        (profiles ?? []).map((p: any) => [p.user_id, [p.first_name, p.last_name].filter(Boolean).join(' ').trim()]),
      );
      const trucks: OwnedTruck[] = rows.map(r => ({
        operatorId: r.operator_id,
        driverUserId: r.operators?.user_id ?? null,
        driverName: (r.operators?.user_id && nameOf.get(r.operators.user_id)) || 'Driver',
        unitNumber: r.operators?.unit_number ?? null,
      }));
      if (!cancelled) setState({ loaded: true, ownOperatorId: (own as any)?.id ?? null, trucks });
    })();
    return () => { cancelled = true; };
  }, [userId, enabled]);

  return state;
}
