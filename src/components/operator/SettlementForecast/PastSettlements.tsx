import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  formatLongDay, formatMoney, getWorkWeekFor, toDateStr, parseLocalDate,
} from '@/lib/settlementMath';

interface Props {
  operatorId: string;
  payPercentage: number;
}

type Bucket = {
  payday: string;
  weekStart: string;
  weekEnd: string;
  loads: number;
  fuel: number;
  advances: number;
  repair: number;
  other: number;
  net: number;
};

export default function PastSettlements({ operatorId, payPercentage }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buckets, setBuckets] = useState<Bucket[]>([]);

  const today = toDateStr(new Date());
  const currentPayday = getWorkWeekFor(today).payday;

  const load = async () => {
    setLoading(true);
    const [loadsRes, expRes, dedRes] = await Promise.all([
      supabase.from('forecast_loads')
        .select('delivery_date, load_rate')
        .eq('operator_id', operatorId)
        .lt('delivery_date', getWorkWeekFor(today).weekStart),
      supabase.from('forecast_expenses')
        .select('expense_date, expense_type, amount')
        .eq('operator_id', operatorId)
        .lt('expense_date', getWorkWeekFor(today).weekStart),
      supabase.from('forecast_deductions')
        .select('payday_date, amount, installment_total')
        .eq('operator_id', operatorId)
        .lt('payday_date', currentPayday),
    ]);
    setLoading(false);

    const map = new Map<string, Bucket>();
    const ensure = (payday: string) => {
      let b = map.get(payday);
      if (!b) {
        const w = getWorkWeekFor(payday); // payday isn't a delivery date but getWorkWeekFor will still produce a weekly bucket from any date
        // Better: derive weekStart/weekEnd by reversing 14 days from the payday
        const wkEnd = toDateStr(new Date(parseLocalDate(payday).getTime() - 14 * 86400_000));
        const wkStart = toDateStr(new Date(parseLocalDate(wkEnd).getTime() - 6 * 86400_000));
        b = {
          payday, weekStart: wkStart, weekEnd: wkEnd,
          loads: 0, fuel: 0, advances: 0, repair: 0, other: 0, net: 0,
        };
        // Suppress unused-var warning
        void w;
        map.set(payday, b);
      }
      return b;
    };

    for (const l of loadsRes.data ?? []) {
      const w = getWorkWeekFor(l.delivery_date);
      const b = ensure(w.payday);
      b.loads += Number(l.load_rate);
    }
    for (const e of expRes.data ?? []) {
      const w = getWorkWeekFor(e.expense_date);
      const b = ensure(w.payday);
      if (e.expense_type === 'fuel') b.fuel += Number(e.amount);
      else if (e.expense_type === 'advance') b.advances += Number(e.amount);
    }
    for (const d of dedRes.data ?? []) {
      const b = ensure(d.payday_date);
      if (d.installment_total && d.installment_total > 1) b.repair += Number(d.amount);
      else b.other += Number(d.amount);
    }

    const arr = Array.from(map.values()).map((b) => ({
      ...b,
      net: b.loads * (payPercentage / 100) - b.fuel - b.advances - b.repair - b.other,
    }));
    arr.sort((a, b) => b.payday.localeCompare(a.payday)); // newest first
    setBuckets(arr);
  };

  useEffect(() => {
    if (open && buckets.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Past Settlements</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="p-4">
          {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}
          {!loading && buckets.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No past settlements yet.
            </p>
          )}
          {!loading && buckets.length > 0 && (
            <div className="space-y-2">
              {buckets.map((b) => (
                <div key={b.payday} className="border rounded-md p-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{formatLongDay(b.payday)}</p>
                      <p className="text-xs text-muted-foreground">
                        Gross {formatMoney(b.loads * (payPercentage / 100))} · Fuel −{formatMoney(b.fuel)}
                        {b.advances > 0 && ` · Adv −${formatMoney(b.advances)}`}
                        {b.repair > 0 && ` · Repair −${formatMoney(b.repair)}`}
                        {b.other > 0 && ` · Other −${formatMoney(b.other)}`}
                      </p>
                    </div>
                    <p className={`font-bold ${b.net >= 0 ? 'text-status-complete' : 'text-destructive'}`}>
                      {formatMoney(b.net)}
                    </p>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={load}>
                Refresh
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
