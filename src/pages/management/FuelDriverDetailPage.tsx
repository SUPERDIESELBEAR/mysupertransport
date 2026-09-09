/**
 * PER-DRIVER FUEL DETAIL — the management-facing view.
 *
 * What the owner reaches for when a driver questions a number: one driver, his
 * transactions, most recent first, with the settlement period printed on every
 * row and pending fuel shown but unmistakably not deducted.
 *
 * MANAGEMENT AND OWNER ONLY. This screen renders inside the management portal
 * and adds NO operator-facing route and NO policy. The driver's own version is
 * a later pass — operators see only their own data, and that boundary deserves
 * its own pass rather than being added incidentally here.
 *
 * Every figure comes from `src/lib/fuel/fuelDriverDetail.ts`, which in turn
 * takes its buckets from `fuelBucketLines`. This file computes no money.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Fuel } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/loadFormat';
import { fetchOperatorOptions, operatorLabel } from '@/lib/fuel/fuelOperators';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import { loadSettlementSettings } from '@/lib/settlementRun';
import {
  NOT_YET_DEDUCTED_LABEL, buildDriverRows, filterByPeriod, periodOptions, summarizeDriverRows,
  type FuelDriverRow, type FuelDriverTotals, type FuelDriverTransaction, type SettledFuelIndex,
} from '@/lib/fuel/fuelDriverDetail';

const TXN_SELECT =
  'id, invoice_no, invoice_date, merchant_name, city, state, total_amount, '
  + 'fuel_discount_amount, diesel_amount, diesel_gallons, reconciliation_ok, '
  + 'reconciliation_delta, fuel_transaction_lines(line_type, amount)';

/** The work week comes from the SAME loader the settlement run uses. */
async function fetchWorkWeekStartDow(): Promise<number> {
  const settings = await loadSettlementSettings(supabase);
  return settings.work_week_start_dow || SETTLEMENT_SETTINGS_DEFAULTS.work_week_start_dow;
}


async function fetchDriverFuel(operatorId: string): Promise<FuelDriverTransaction[]> {
  const { data, error } = await supabase
    .from('fuel_transactions')
    .select(TXN_SELECT)
    .eq('operator_id', operatorId)
    .order('invoice_date', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as FuelDriverTransaction[];
}

/**
 * WHICH TRANSACTIONS WERE ACTUALLY DEDUCTED, read from the money's own record:
 * a `settlement_line_items` row naming `fuel_transactions` as its source. Never
 * inferred from a date — a period can have passed without a settlement running.
 */
async function fetchSettledIndex(ids: string[]): Promise<SettledFuelIndex> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('settlement_line_items')
    .select('source_id, settlements(id, period_start, period_end, payday, status)')
    .eq('source_table', 'fuel_transactions')
    .in('source_id', ids);
  if (error) throw error;
  const index: SettledFuelIndex = {};
  for (const row of (data ?? []) as any[]) {
    const s = Array.isArray(row.settlements) ? row.settlements[0] : row.settlements;
    if (!row.source_id || !s) continue;
    index[row.source_id] = {
      settlementId: s.id,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      payday: s.payday ?? null,
      status: s.status ?? null,
    };
  }
  return index;
}

const money = (n: number) => (n ? formatCurrency(n) : '—');

function TotalsCard({
  title, tone, note, totals,
}: { title: string; tone: 'settled' | 'pending'; note: string; totals: FuelDriverTotals }) {
  return (
    <Card className={tone === 'pending' ? 'border-amber-400 bg-amber-50/60' : 'border-border'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {totals.count} transaction{totals.count === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-semibold">{formatCurrency(totals.total)}</div>
        <p className="text-xs text-muted-foreground">{note}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between"><dt>Fuel</dt><dd>{money(totals.fuel)}</dd></div>
          <div className="flex justify-between"><dt>Cash advance</dt><dd>{money(totals.cashAdvance)}</dd></div>
          <div className="flex justify-between"><dt>Repairs</dt><dd>{money(totals.repair)}</dd></div>
          <div className="flex justify-between"><dt>Other</dt><dd>{money(totals.other)}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd>{money(totals.discount)}</dd></div>
          <div className="flex justify-between"><dt>Gallons</dt><dd>{totals.gallons || '—'}</dd></div>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ row }: { row: FuelDriverRow }) {
  return (
    <tr
      data-testid="fuel-driver-row"
      data-deducted={row.deducted ? 'yes' : 'no'}
      className={row.deducted ? 'border-b' : 'border-b bg-amber-50/60'}
    >
      <td className="p-2 whitespace-nowrap">{row.dateLabel}</td>
      <td className="p-2">
        <div className="font-medium">{row.merchantName ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{row.location ?? '—'}</div>
      </td>
      <td className="p-2 text-right">{money(row.fuel)}</td>
      <td className="p-2 text-right">{money(row.cashAdvance)}</td>
      <td className="p-2 text-right">{money(row.repair)}</td>
      <td className="p-2 text-right">{money(row.other)}</td>
      <td className="p-2 text-right">{money(row.discount)}</td>
      <td className="p-2 text-right font-medium">{formatCurrency(row.total)}</td>
      <td className="p-2 text-right">{row.gallons || '—'}</td>
      <td className="p-2 text-right">{row.costPerGallon ? `$${row.costPerGallon.toFixed(3)}` : '—'}</td>
      <td className="p-2 whitespace-nowrap">
        {row.deducted ? (
          <span className="text-xs">{row.periodLabel}</span>
        ) : (
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            {NOT_YET_DEDUCTED_LABEL}
          </Badge>
        )}
        {!row.reconciliationOk && (
          <span className="ml-2 inline-flex items-center text-xs text-destructive">
            <AlertTriangle className="mr-1 h-3 w-3" /> flagged at import
          </span>
        )}
      </td>
    </tr>
  );
}

export default function FuelDriverDetailPage() {
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('all');

  const operators = useQuery({ queryKey: ['fuel-operator-options'], queryFn: fetchOperatorOptions });
  const dow = useQuery({ queryKey: ['settlement-work-week-dow'], queryFn: fetchWorkWeekStartDow });

  const txns = useQuery({
    queryKey: ['fuel-driver-detail', operatorId],
    queryFn: () => fetchDriverFuel(operatorId as string),
    enabled: Boolean(operatorId),
  });

  const ids = useMemo(() => (txns.data ?? []).map((t) => t.id), [txns.data]);
  const settled = useQuery({
    queryKey: ['fuel-driver-settled', operatorId, ids.length],
    queryFn: () => fetchSettledIndex(ids),
    enabled: Boolean(operatorId) && txns.isSuccess,
  });

  const allRows = useMemo(
    () => buildDriverRows(
      txns.data ?? [],
      settled.data ?? {},
      dow.data ?? SETTLEMENT_SETTINGS_DEFAULTS.work_week_start_dow,
    ),
    [txns.data, settled.data, dow.data],
  );

  const rows = useMemo(
    () => filterByPeriod(allRows, period === 'all' ? null : period),
    [allRows, period],
  );
  const summary = useMemo(() => summarizeDriverRows(rows), [rows]);
  const periods = useMemo(() => periodOptions(allRows), [allRows]);

  const loading = Boolean(operatorId) && (txns.isLoading || settled.isLoading);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px]">
          <label className="mb-1 block text-xs text-muted-foreground">Driver</label>
          <Select value={operatorId ?? ''} onValueChange={(v) => { setOperatorId(v); setPeriod('all'); }}>
            <SelectTrigger><SelectValue placeholder="Select a driver" /></SelectTrigger>
            <SelectContent>
              {(operators.data ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>{operatorLabel(o)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[240px]">
          <label className="mb-1 block text-xs text-muted-foreground">Settlement period</label>
          <Select value={period} onValueChange={setPeriod} disabled={!operatorId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All periods</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!operatorId && (
        <Card><CardContent className="flex items-center gap-2 py-8 text-muted-foreground">
          <Fuel className="h-4 w-4" /> Select a driver to see his fuel purchases.
        </CardContent></Card>
      )}

      {loading && <Skeleton className="h-64 w-full" />}

      {operatorId && !loading && rows.length === 0 && (
        <Card><CardContent className="py-8 text-muted-foreground" data-testid="fuel-driver-empty">
          No fuel purchases recorded for this driver.
        </CardContent></Card>
      )}

      {operatorId && !loading && rows.length > 0 && (
        <>
          {/* Two cards, never one figure. Deducted money and not-yet-deducted
              money are different facts and are never added together. */}
          <div className="grid gap-3 md:grid-cols-2">
            <TotalsCard
              title="Deducted from settlements"
              tone="settled"
              note="Already taken out of a settlement."
              totals={summary.settled}
            />
            <TotalsCard
              title="Not yet deducted"
              tone="pending"
              note="Bought, but not taken out of any check yet."
              totals={summary.pending}
            />
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs">
                  <tr className="text-left">
                    <th className="p-2">Date</th>
                    <th className="p-2">Where</th>
                    <th className="p-2 text-right">Fuel</th>
                    <th className="p-2 text-right">Cash advance</th>
                    <th className="p-2 text-right">Repairs</th>
                    <th className="p-2 text-right">Other</th>
                    <th className="p-2 text-right">Discount</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-right">Gallons</th>
                    <th className="p-2 text-right">$/gal</th>
                    <th className="p-2">Deducted on</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => <Row key={r.id} row={r} />)}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
