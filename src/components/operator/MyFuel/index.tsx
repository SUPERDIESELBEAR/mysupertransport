/**
 * MY FUEL — the driver's own fuel-card purchases.
 *
 * SAME NUMBERS AS THE OFFICE SCREEN, BY CONSTRUCTION. Every figure on this
 * screen is produced by `buildDriverRows`/`summarizeDriverRows` in
 * `src/lib/fuel/fuelDriverDetail.ts` — the same functions
 * `src/pages/management/FuelDriverDetailPage.tsx` calls, off the same
 * `fuelBucketLines` assembler. If the owner and the driver ever saw different
 * money for the same week, that would be a defect, so there is deliberately no
 * second arithmetic here to drift.
 *
 * WHAT IS NOT HERE, AND WHY:
 *   - No other driver. Nothing on this screen is computed from anyone else's
 *     data: no averages, no comparisons, no rankings. Those need other
 *     drivers' rows and are a decision the owner has not made.
 *   - No match status, unmatched reason, disagreement or reconciliation note.
 *     Those describe the quality of OUR records, not his purchases, and they
 *     move no figure.
 *
 * The read is `fetchMyFuel`, which calls a no-argument function scoped at the
 * database to the signed-in driver. This component never names an operator id.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Fuel } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/loadFormat';
import { fetchMyFuel } from '@/lib/fuel/myFuel';
import { downloadFuelPdf } from '@/lib/fuel/fuelDriverPdf';
import {
  NOT_YET_DEDUCTED_LABEL, buildDriverRows, summarizeDriverRows,
  type FuelDriverRow, type FuelDriverTotals,
} from '@/lib/fuel/fuelDriverDetail';

const money = (n: number) => (n ? formatCurrency(n) : '—');

function Totals({ title, note, tone, totals }: {
  title: string; note: string; tone: 'settled' | 'pending'; totals: FuelDriverTotals;
}) {
  return (
    <Card className={tone === 'pending' ? 'border-amber-400 bg-amber-50/60' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {totals.count} purchase{totals.count === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold">{formatCurrency(totals.total)}</div>
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

/** One purchase. Mobile reads it as a card; the desktop table shares the data. */
function PurchaseCard({ row }: { row: FuelDriverRow }) {
  return (
    <Card
      data-testid="my-fuel-row"
      data-deducted={row.deducted ? 'yes' : 'no'}
      className={row.deducted ? undefined : 'border-amber-400 bg-amber-50/40'}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{row.merchantName ?? 'Fuel purchase'}</div>
            <div className="text-xs text-muted-foreground">
              {row.dateLabel}{row.location ? ` · ${row.location}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold">{formatCurrency(row.total)}</div>
            {row.costPerGallon && (
              <div className="text-xs text-muted-foreground">${row.costPerGallon.toFixed(3)}/gal</div>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {row.fuel !== 0 && <div className="flex justify-between"><dt>Fuel</dt><dd>{money(row.fuel)}</dd></div>}
          {row.cashAdvance !== 0 && <div className="flex justify-between"><dt>Cash advance</dt><dd>{money(row.cashAdvance)}</dd></div>}
          {row.repair !== 0 && <div className="flex justify-between"><dt>Repairs</dt><dd>{money(row.repair)}</dd></div>}
          {row.other !== 0 && <div className="flex justify-between"><dt>Other</dt><dd>{money(row.other)}</dd></div>}
          {row.discount !== 0 && <div className="flex justify-between"><dt>Discount</dt><dd>{money(row.discount)}</dd></div>}
          {row.gallons !== 0 && <div className="flex justify-between"><dt>Gallons</dt><dd>{row.gallons}</dd></div>}
        </dl>

        {row.deducted ? (
          <div className="text-xs text-muted-foreground">Deducted on {row.periodLabel}</div>
        ) : (
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            {NOT_YET_DEDUCTED_LABEL}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyFuel({ onReady }: { onReady?: () => void }) {
  const q = useQuery({ queryKey: ['my-fuel'], queryFn: fetchMyFuel });

  const rows = useMemo(
    () => buildDriverRows(q.data?.transactions ?? [], q.data?.settled ?? {}, q.data?.workWeekStartDow ?? 3),
    [q.data],
  );
  const summary = useMemo(() => summarizeDriverRows(rows), [rows]);

  if (q.isSuccess && onReady) onReady();

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;

  if (q.isError) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        Your fuel purchases could not be loaded. Please try again.
      </CardContent></Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent
        data-testid="my-fuel-empty"
        className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground"
      >
        <Fuel className="h-6 w-6" />
        No fuel purchases on your card yet.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My Fuel</h1>
        <p className="text-sm text-muted-foreground">
          Everything bought on your fuel card, newest first.
        </p>
      </div>

      {/* Two totals, never one. Money already taken out of a check and money
          not taken yet are different facts and are never added together. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Totals
          title="Taken out of your settlements"
          note="Already deducted from a check."
          tone="settled"
          totals={summary.settled}
        />
        <Totals
          title="Not yet deducted"
          note="Bought, but not taken out of any check yet."
          tone="pending"
          totals={summary.pending}
        />
      </div>

      <div className="space-y-3">
        {rows.map((r) => <PurchaseCard key={r.id} row={r} />)}
      </div>
    </div>
  );
}
