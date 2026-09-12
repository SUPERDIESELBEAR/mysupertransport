/**
 * COST PER GALLON BY LOCATION — management and owner only.
 *
 * Three groupings of the same purchases: truck stop, state, and derived chain.
 * Every figure comes from `src/lib/fuel/fuelLocationReport.ts`; this file
 * computes no money and holds no mapping.
 *
 * REPORT ONLY. No fleet benchmark, no "above average" flag — the owner chose
 * report only on 2026-09-09 and comparison stays on the HELD list.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronsUpDown, Fuel, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/loadFormat';
import {
  INDEPENDENT_CHAIN, UNRECOGNISED_CHAIN, buildFuelLocationReport, defaultDateRange,
  locationSortValue,
  type FuelLocationGroup, type FuelLocationTransaction,
} from '@/lib/fuel/fuelLocationReport';
import { formatFuelDate } from '@/lib/fuel/fuelBuckets';
import { compareValues, nextSortState, type SortState } from '@/lib/listSorting';

const TXN_SELECT =
  'id, invoice_no, invoice_date, merchant_name, city, state, total_amount, '
  + 'fuel_discount_amount, diesel_gallons, reconciliation_ok, '
  + 'fuel_transaction_lines(line_type, amount)';

async function fetchFuelTransactions(): Promise<FuelLocationTransaction[]> {
  const { data, error } = await supabase
    .from('fuel_transactions')
    .select(TXN_SELECT)
    .order('invoice_date', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as FuelLocationTransaction[];
}

const cpg = (n: number | null) => (n === null ? '—' : `$${n.toFixed(3)}`);

/** Cycles a column header and keeps nulls last, via the shared list helpers. */
function SortHead({
  column, label, sort, onSort, className,
}: {
  column: string; label: string; sort: SortState | null;
  onSort: (c: string) => void; className?: string;
}) {
  const active = sort?.column === column;
  const Icon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`font-medium px-3 py-2 ${className ?? 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 ${active ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 shrink-0 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

/**
 * One grouping, sorted over ALL of its rows — there is no pagination here, so
 * a sort can never mean "sorted within the page you can see".
 */
function GroupTable({ groups, showSublabel }: { groups: FuelLocationGroup[]; showSublabel?: boolean }) {
  const [sort, setSort] = useState<SortState | null>(null);
  const onSort = (c: string) => setSort((s) => nextSortState(s, c));
  const rows = useMemo(() => {
    if (!sort) return groups; // page default: gallons descending, as grouped.
    return [...groups].sort((a, b) =>
      compareValues(locationSortValue(a, sort.column), locationSortValue(b, sort.column), sort.direction));
  }, [groups, sort]);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-6">No purchases in this date range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <SortHead column="location" label="Location" sort={sort} onSort={onSort} />
            <SortHead column="purchases" label="Purchases" sort={sort} onSort={onSort} className="text-right" />
            <SortHead column="gallons" label="Gallons" sort={sort} onSort={onSort} className="text-right" />
            <SortHead column="fuelSpend" label="Fuel spend" sort={sort} onSort={onSort} className="text-right" />
            <SortHead column="costPerGallon" label="Avg cost / gal" sort={sort} onSort={onSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={`${g.key}-${g.sublabel ?? ''}`} className="border-t even:bg-muted/20">
              <td className="px-3 py-2">
                <span className="font-medium">{g.key}</span>
                {g.isUnrecognised && (
                  <Badge variant="outline" className="ml-2 text-[10px]">not classified</Badge>
                )}
                {g.isIndependent && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">confirmed independents</Badge>
                )}
                {showSublabel && g.sublabel && (
                  <span className="block text-xs text-muted-foreground">{g.sublabel}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{g.purchases}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.gallons.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(g.fuelSpend)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{cpg(g.costPerGallon)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FuelLocationReportPage() {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['fuel-location-report'],
    queryFn: fetchFuelTransactions,
  });

  const suggested = useMemo(
    () => defaultDateRange(transactions ?? [], new Date().toISOString().slice(0, 10)),
    [transactions],
  );
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const from = range?.from ?? suggested.from;
  const to = range?.to ?? suggested.to;

  const report = useMemo(
    () => buildFuelLocationReport(transactions ?? [], from, to),
    [transactions, from, to],
  );

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Fuel className="h-5 w-5" /> Fuel Cost by Location
          </h1>
          <p className="text-sm text-muted-foreground">
            Fuel purchases only — cash advances, repairs and other card charges are excluded.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <Input
              type="date" value={from} className="h-9"
              onChange={(e) => setRange({ from: e.target.value, to })}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <Input
              type="date" value={to} className="h-9"
              onChange={(e) => setRange({ from, to: e.target.value })}
            />
          </label>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {report.purchases} purchase{report.purchases === 1 ? '' : 's'} · {formatFuelDate(from)} to {formatFuelDate(to)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Gallons</div>
            <div className="text-lg font-semibold tabular-nums">{report.gallons.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Fuel spend</div>
            <div className="text-lg font-semibold tabular-nums">{formatCurrency(report.fuelSpend)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Average cost per gallon</div>
            <div className="text-lg font-semibold tabular-nums">{cpg(report.costPerGallon)}</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="chain">
        <TabsList>
          <TabsTrigger value="chain">By chain</TabsTrigger>
          <TabsTrigger value="state">By state</TabsTrigger>
          <TabsTrigger value="stop">By truck stop</TabsTrigger>
        </TabsList>

        <TabsContent value="chain" className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Chain is <strong className="mx-1">derived</strong> from the merchant name on the
              statement, not supplied by the fuel provider. Pilot, Flying J and PFJ are one
              company and are grouped as {'Pilot Flying J'}.{' '}
              {report.independentChainPurchases} purchase
              {report.independentChainPurchases === 1 ? '' : 's'}{' '}
              {report.independentChainPurchases === 1 ? 'is at a merchant' : 'are at merchants'}{' '}
              <strong className="mx-1">confirmed</strong> to belong to no chain, shown under{' '}
              {INDEPENDENT_CHAIN}. {report.unrecognisedChainPurchases}{' '}
              purchase{report.unrecognisedChainPurchases === 1 ? '' : 's'} could not be classified
              at all and {report.unrecognisedChainPurchases === 1 ? 'is' : 'are'} shown under{' '}
              {UNRECOGNISED_CHAIN}.
            </span>
          </p>
          <Card><CardContent className="p-0"><GroupTable groups={report.byChain} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="state">
          <Card><CardContent className="p-0"><GroupTable groups={report.byState} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="stop">
          <Card>
            <CardContent className="p-0">
              <GroupTable groups={report.byTruckStop} showSublabel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
