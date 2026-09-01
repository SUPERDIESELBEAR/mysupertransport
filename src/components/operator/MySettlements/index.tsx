/**
 * Driver settlement view — the container. Reads ONLY the driver's own rows;
 * every table below is self-scoped at the database, so a query for anyone
 * else's settlement returns nothing regardless of what the client asks for.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import SettlementList from './SettlementList';
import type { DriverRmDeposit, DriverSettlement } from './settlementView';
import type { SettlementStatus } from '@/lib/settlementConfig';

interface Props {
  operatorId: string;
  onReady?: () => void;
}

export default function MySettlements({ operatorId, onReady }: Props) {
  const [loading, setLoading] = useState(true);
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [rmDeposit, setRmDeposit] = useState<DriverRmDeposit | null>(null);
  const readyFired = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);
    const sb = supabase as any;
    const [settleRes, rmRes] = await Promise.all([
      sb.from('settlements')
        .select('id, period_start, period_end, payday, status, net_amount, hold_reason, '
          + 'settlement_line_items(id, line_type, amount, description), '
          + 'settlement_withheld_loads(id, load_number, message, outstanding)')
        .eq('operator_id', operatorId)
        .order('period_start', { ascending: false }),
      sb.rpc('my_rm_deposit'),
    ]);

    const rows = (settleRes?.data ?? []) as any[];
    setSettlements(rows.map((r) => ({
      id: r.id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payday: r.payday ?? null,
      status: r.status as SettlementStatus,
      netAmount: Number(r.net_amount ?? 0),
      holdReason: r.hold_reason ?? null,
      lines: (r.settlement_line_items ?? []).map((l: any) => ({
        id: l.id,
        lineType: l.line_type,
        amount: Number(l.amount ?? 0),
        description: l.description ?? '',
      })),
      withheld: (r.settlement_withheld_loads ?? []).map((w: any) => ({
        id: w.id,
        loadNumber: w.load_number,
        message: w.message,
        outstanding: (w.outstanding ?? []) as string[],
      })),
    })));

    const rm = Array.isArray(rmRes?.data) ? rmRes.data[0] : rmRes?.data;
    setRmDeposit(rm
      ? { currentBalance: Number(rm.current_balance ?? 0), targetAmount: rm.target_amount == null ? null : Number(rm.target_amount) }
      : null);

    setLoading(false);
    if (!readyFired.current) { readyFired.current = true; onReady?.(); }
  }, [operatorId, onReady]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  return <SettlementList settlements={settlements} rmDeposit={rmDeposit} loading={loading} />;
}
