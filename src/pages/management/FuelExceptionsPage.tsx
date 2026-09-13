/**
 * FUEL EXCEPTIONS — the screen the owner opens before running settlements.
 *
 * Two sections, because the owner named two exceptions and nothing else:
 * categories that have never appeared on a card before, and fuel that did not
 * resolve to a driver. Everything else on the fuel reporting list is HELD.
 *
 * A QUIET SCREEN MUST EXPLAIN ITSELF. With one import in the system the
 * new-category half has no history to compare against, and an empty list looks
 * exactly like a broken one. So the empty state is a sentence, not a blank —
 * `buildFuelExceptionsReport` decides when it applies and writes it.
 *
 * All arithmetic and every judgement lives in `@/lib/fuel/fuelExceptions`; this
 * file only prints what that returns.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Fuel, Info, Loader2, Sparkles } from 'lucide-react';
import PageHeading from '@/components/shared/PageHeading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildFuelExceptionsReport, fetchFuelExceptionsData } from '@/lib/fuel/fuelExceptions';
import { formatFuelDate } from '@/lib/fuel/fuelBuckets';

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FuelExceptionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['fuel-exceptions'],
    queryFn: async () => buildFuelExceptionsReport(await fetchFuelExceptionsData()),
  });

  return (
    <div className="space-y-6">
      <PageHeading
        title="Fuel Exceptions"
        description="What to glance at before you pay: charges a card has never carried before, and fuel that did not match a driver."
        icon={<Fuel className="h-6 w-6 text-primary" />}
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the imported fuel…
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                New charge for that card
                <Badge variant="secondary">{data.newCategories.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.insufficientHistory ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">{data.historyNote}</AlertDescription>
                </Alert>
              ) : data.newCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing new. Every charge on every card this week is one that card has
                  carried before ({data.cardsWithHistory} card
                  {data.cardsWithHistory === 1 ? '' : 's'} compared against earlier imports
                  {data.cardsOnBaseline > 0
                    ? `, ${data.cardsOnBaseline} still on a first import`
                    : ''}).
                </p>
              ) : (
                <ul className="divide-y">
                  {data.newCategories.map((x) => (
                    <li key={`${x.transactionId}-${x.categoryKey}`} className="py-3 space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-foreground">{x.driver}</span>
                        <span className="font-semibold text-foreground">{money(x.amount)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        First <span className="font-medium text-foreground">{x.categoryLabel}</span>{' '}
                        charge on card {x.cardNo} ({x.bucketLabel}) —{' '}
                        {formatFuelDate(x.invoiceDate)}
                        {x.invoiceNo ? `, invoice ${x.invoiceNo}` : ''}
                        {x.occurrences > 1 ? `, ${x.occurrences} charges this import` : ''}.
                        No earlier import for this card carries it.
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                A first appearance is worth a glance, not a hold. Nothing here changes what a
                driver is paid.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Fuel that did not match a driver
                <Badge variant="secondary">{data.unmatched.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.unmatched.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None. Every imported fuel row resolved to a driver.
                </p>
              ) : (
                <ul className="divide-y">
                  {data.unmatched.map((x) => (
                    <li key={x.transactionId} className="py-3 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{x.message}</span>
                      <span className="font-semibold text-foreground">{money(x.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.rowsWithoutCard > 0 && (
                <p className="text-xs text-muted-foreground">
                  {data.rowsWithoutCard} matched row
                  {data.rowsWithoutCard === 1 ? '' : 's'} carry no card number on the statement, so
                  they cannot be compared against a card's history.
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {data.imports} import{data.imports === 1 ? '' : 's'} read. Cost per gallon, fuel economy,
            fuel as a share of earnings, cash-advance patterns and purchases away from a route are
            deliberately not shown here yet.
          </p>
        </>
      )}
    </div>
  );
}
