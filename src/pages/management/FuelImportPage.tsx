import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronRight, ChevronsUpDown, Copy, FileUp,
  Loader2, Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { fetchProfileNames, formatProfileName } from '@/lib/profileNames';
import { formatCurrency } from '@/lib/loadFormat';
import {
  FuelCsvFormatError, columnDriftNotice, parseMultiserviceCsv, reconciliationWarning,
  unrecognizedColumnsNotice, unrecognizedMoneyNotice,
  type FuelColumnReport, type ParsedFuelFile, type ParsedFuelRow,
} from '@/lib/fuel/multiserviceCsv';
import {
  assignFuelTransactionOperator, commitFuelImport, fetchFuelBatches,
  fetchFuelReviewQueue, fetchLastImportColumns, previewFuelImport,
  type FuelCommitResult, type FuelPreview, type FuelTransactionRecord,
} from '@/lib/fuel/fuelImport';
import {
  FUEL_BUCKET_LABELS, FUEL_DISCREPANCY_LABELS, formatFuelDate,
} from '@/lib/fuel/fuelBuckets';
import {
  buildDisplayRows, filterRows, fuelSortValue,
  type FuelDisplayRow, type FuelTileFilter,
} from '@/lib/fuel/fuelImportView';
import { compareValues, nextSortState, type SortState } from '@/lib/listSorting';



/**
 * MultiService fuel import.
 *
 * NAVIGATION PLACEMENT: Management → Accounting → Fuel Import. Accounting is
 * where the money modules land; this is the first of them.
 *
 * The screen is deliberately two-step. Nothing is written until Commit, and
 * the preview states plainly what will happen — how many rows import, how many
 * are duplicates that will be skipped, how many cannot be matched to a card
 * holder, and how many failed their own arithmetic.
 */

interface OperatorOption { id: string; name: string; unit: string | null }

/**
 * `operators.user_id` points at `auth.users`, not at `public.profiles`, so
 * PostgREST cannot embed the name — the whole request would return nothing.
 * Names come from the second read in src/lib/profileNames.ts.
 */
const OPERATOR_SELECT = 'id, unit_number, user_id';

interface OperatorRow {
  id: string;
  unit_number: string | null;
  user_id: string | null;
}

async function fetchOperatorOptions(): Promise<OperatorOption[]> {
  const { data, error } = await supabase
    .from('operators')
    .select(OPERATOR_SELECT)
    .eq('is_active', true)
    .limit(500)
    .returns<OperatorRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const names = await fetchProfileNames(rows.map((o) => o.user_id));
  return rows
    .map((o) => ({
      id: o.id,
      name: formatProfileName(o.user_id ? names.get(o.user_id) : null, 'Unnamed driver'),
      unit: o.unit_number,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}


function Stat({
  label, value, tone, filter, active, onFilter,
}: {
  label: string;
  value: string | number;
  tone?: 'warn' | 'ok';
  /** Present when this tile represents a subset of the table. */
  filter?: FuelTileFilter;
  active?: boolean;
  onFilter?: (f: FuelTileFilter) => void;
}) {
  const clickable = Boolean(filter && onFilter);
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          'text-lg font-semibold ' +
          (tone === 'warn' ? 'text-destructive' : tone === 'ok' ? 'text-success' : 'text-foreground')
        }
      >
        {value}
      </div>
    </>
  );
  const base = 'rounded-md border px-3 py-2 text-left ' +
    (active ? 'border-gold bg-gold/5 ring-1 ring-gold' : 'border-border bg-card');
  if (!clickable) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      data-testid={`fuel-tile-${filter}`}
      aria-pressed={active}
      onClick={() => onFilter!(filter!)}
      className={`${base} transition-colors hover:border-gold/60`}
    >
      {body}
    </button>
  );
}

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
    <th className={`p-2 font-medium ${className ?? ''}`}>
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

const money = (n: number) => (n ? formatCurrency(n) : '—');

/** One preview row plus its expandable detail. */
function PreviewRow({ row }: { row: FuelDisplayRow }) {
  const [open, setOpen] = useState(false);
  const s = row.split;
  return (
    <>
      <tr className="border-t border-border">
        <td className="p-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? 'Hide detail' : 'Show detail'}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        </td>
        <td className="p-2 whitespace-nowrap">{formatFuelDate(row.invoice_date)}</td>
        <td className="p-2">{[row.unit_no, row.driver_name].filter(Boolean).join(' · ') || '—'}</td>
        <td className="p-2 text-right">{money(s.fuel)}</td>
        <td className="p-2 text-right">{money(s.cash_advance)}</td>
        <td className="p-2 text-right">{money(s.repair)}</td>
        <td className="p-2 text-right">{money(s.other)}</td>
        <td className="p-2 text-right">{money(s.discount)}</td>
        <td className={`p-2 text-right ${s.discrepancy ? 'text-destructive' : ''}`}>
          {money(s.discrepancy)}
        </td>
        <td className="p-2 text-right font-medium">{formatCurrency(row.total_amount)}</td>

        <td className="p-2 text-right">{row.diesel_gallons ? row.diesel_gallons.toFixed(2) : '—'}</td>
        <td className="p-2 text-right">
          {row.cost_per_gallon !== null ? `$${row.cost_per_gallon.toFixed(3)}` : '—'}
        </td>
        <td className="p-2">
          {row.duplicate ? (
            <Badge variant="outline" className="gap-1">
              <Copy className="h-3 w-3" /> Duplicate — skipped
            </Badge>
          ) : row.match_status === 'unmatched' ? (
            <Badge variant="destructive">Unmatched</Badge>
          ) : row.match_status === 'matched_with_disagreement' ? (
            <Badge variant="secondary">Matched, disagreement</Badge>
          ) : (
            <Badge variant="outline">Matched</Badge>
          )}
          {!row.reconciliation_ok && (
            <Badge variant="destructive" className="ml-1">
              Does not add up ({formatCurrency(row.reconciliation_delta)})
            </Badge>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-[#F9F9F9]">
          <td />
          <td colSpan={12} className="p-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Invoice</dt><dd className="font-mono">{row.invoice_no}</dd></div>
              <div><dt className="text-muted-foreground">Card</dt><dd className="font-mono">{row.card_no}</dd></div>
              <div><dt className="text-muted-foreground">Date</dt><dd>{formatFuelDate(row.invoice_date)}</dd></div>
              <div>
                <dt className="text-muted-foreground">Reconciliation</dt>
                <dd className={row.reconciliation_ok ? '' : 'text-destructive'}>
                  {row.reconciliation_ok
                    ? 'Categories add up to the total'
                    : `Off by ${formatCurrency(row.reconciliation_delta)} at import`}
                </dd>
              </div>
              <div><dt className="text-muted-foreground">{FUEL_BUCKET_LABELS.fuel}</dt><dd>{formatCurrency(s.fuel)}</dd></div>
              <div><dt className="text-muted-foreground">{FUEL_BUCKET_LABELS.cash_advance}</dt><dd>{formatCurrency(s.cash_advance)}</dd></div>
              <div><dt className="text-muted-foreground">{FUEL_BUCKET_LABELS.repair}</dt><dd>{formatCurrency(s.repair)}</dd></div>
              <div><dt className="text-muted-foreground">{FUEL_BUCKET_LABELS.other}</dt><dd>{formatCurrency(s.other)}</dd></div>
              {s.discrepancy !== 0 && (
                <div className="col-span-2 sm:col-span-4 text-destructive">
                  <dt className="text-muted-foreground">Unexplained balance</dt>
                  <dd>
                    {formatCurrency(s.discrepancy)} —{' '}
                    {s.discrepancy > 0 ? FUEL_DISCREPANCY_LABELS.short : FUEL_DISCREPANCY_LABELS.over}
                  </dd>
                </div>
              )}
              <div><dt className="text-muted-foreground">Diesel gallons</dt><dd>{row.diesel_gallons ? row.diesel_gallons.toFixed(2) : '—'}</dd></div>
              <div><dt className="text-muted-foreground">DEF quantity</dt><dd>{row.def_quantity ? row.def_quantity.toFixed(2) : '—'}</dd></div>
              <div>
                <dt className="text-muted-foreground">Cost per gallon</dt>
                <dd>{row.cost_per_gallon !== null ? `$${row.cost_per_gallon.toFixed(3)}` : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fuel discount</dt>
                <dd>{row.fuel_discount_amount ? formatCurrency(row.fuel_discount_amount) : '—'}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}


export default function FuelImportPage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedFuelRow[] | null>(null);
  const [columns, setColumns] = useState<FuelColumnReport | null>(null);
  const [notices, setNotices] = useState<{ reconciliation: string | null; unrecognized: string | null; unrecognizedMoney: string | null; drift: string | null }>(
    { reconciliation: null, unrecognized: null, unrecognizedMoney: null, drift: null },
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<FuelPreview | null>(null);
  const [result, setResult] = useState<FuelCommitResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Tile filter and column sort — view state only, nothing is persisted. */
  const [tile, setTile] = useState<FuelTileFilter | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);

  const toggleTile = (f: FuelTileFilter) => setTile((cur) => (cur === f ? null : f));
  const onSort = (c: string) => setSort((cur) => nextSortState(cur, c));

  const displayRows = useMemo(
    () => (preview ? buildDisplayRows(preview.rows, rows ?? []) : []),
    [preview, rows],
  );
  const visibleRows = useMemo(() => {
    const filtered = filterRows(displayRows, tile);
    if (!sort) return filtered;
    return [...filtered].sort((a, b) =>
      compareValues(fuelSortValue(a, sort.column), fuelSortValue(b, sort.column), sort.direction));
  }, [displayRows, tile, sort]);



  const queue = useQuery({ queryKey: ['fuel-review-queue'], queryFn: fetchFuelReviewQueue });
  const batches = useQuery({ queryKey: ['fuel-batches'], queryFn: fetchFuelBatches });
  const operators = useQuery({ queryKey: ['fuel-operator-options'], queryFn: fetchOperatorOptions });

  const assign = useMutation({
    mutationFn: (v: { id: string; operatorId: string }) =>
      assignFuelTransactionOperator(v.id, v.operatorId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fuel-review-queue'] });
      toast({ description: 'Assigned.' });
    },
    onError: (e) => {
      logDbError('assign fuel transaction', e, {});
      toast({ variant: 'destructive', description: getDbErrorMessage(e, 'Could not assign that row.') });
    },
  });

  async function onFile(file: File) {
    setBusy(true);
    setParseError(null);
    setResult(null);
    setPreview(null);
    setRows(null);
    setColumns(null);
    setNotices({ reconciliation: null, unrecognized: null, unrecognizedMoney: null, drift: null });
    setTile(null);
    setSort(null);
    try {
      const parsed: ParsedFuelFile = parseMultiserviceCsv(await file.text());
      const previousColumns = await fetchLastImportColumns().catch(() => null);
      setFileName(file.name);
      setRows(parsed.rows);
      setColumns(parsed.columns);
      setNotices({
        reconciliation: reconciliationWarning(parsed),
        unrecognized: unrecognizedColumnsNotice(parsed.columns),
        unrecognizedMoney: unrecognizedMoneyNotice(parsed.columns),
        drift: columnDriftNotice(parsed.columns, previousColumns),
      });
      setAcknowledged(false);
      setPreview(await previewFuelImport(parsed.rows));
    } catch (e) {
      if (e instanceof FuelCsvFormatError) {
        setParseError(e.message);
      } else {
        logDbError('preview fuel import', e, {});
        setParseError(getDbErrorMessage(e, 'Could not read that file.'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!rows || !fileName || !columns) return;
    setBusy(true);
    try {
      const res = await commitFuelImport(fileName, rows, columns);
      setResult(res);
      setPreview(null);
      setRows(null);
      setColumns(null);
      setNotices({ reconciliation: null, unrecognized: null, unrecognizedMoney: null, drift: null });
      void qc.invalidateQueries({ queryKey: ['fuel-review-queue'] });
      void qc.invalidateQueries({ queryKey: ['fuel-batches'] });
      toast({ description: `Imported ${res.imported_count} rows.` });
    } catch (e) {
      logDbError('commit fuel import', e, {});
      toast({ variant: 'destructive', description: getDbErrorMessage(e, 'Could not import that file.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-[#2C2C2C]">Fuel import</h1>
        <p className="text-sm text-muted-foreground">
          MultiService customized detail export. Nothing is written until you commit.
        </p>
      </div>

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="review">
            Review queue
            {queue.data && queue.data.length > 0 && (
              <Badge variant="secondary" className="ml-2">{queue.data.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ import ----- */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Upload a file</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = '';
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => fileInput.current?.click()} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                  Choose CSV
                </Button>
                {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
              </div>
              {parseError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-[#FFE8E8] p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <div className="font-medium">This file was not imported.</div>
                    <div className="text-muted-foreground">{parseError}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader><CardTitle className="text-base">Preview — nothing has been saved yet</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Rows in file" value={preview.row_count} />
                  <Stat
                    label="Will import" value={preview.importable_count} tone="ok"
                    filter="importable" active={tile === 'importable'} onFilter={toggleTile}
                  />
                  <Stat
                    label="Duplicates skipped"
                    value={preview.duplicate_count}
                    tone={preview.duplicate_count > 0 ? 'warn' : undefined}
                    filter="duplicate" active={tile === 'duplicate'} onFilter={toggleTile}
                  />
                  <Stat label="Total" value={formatCurrency(preview.total_amount)} />
                  <Stat
                    label="Matched" value={preview.matched_count}
                    filter="matched" active={tile === 'matched'} onFilter={toggleTile}
                  />
                  <Stat
                    label="Unmatched"
                    value={preview.unmatched_count}
                    tone={preview.unmatched_count > 0 ? 'warn' : undefined}
                    filter="unmatched" active={tile === 'unmatched'} onFilter={toggleTile}
                  />
                  <Stat
                    label="Disagreements"
                    value={preview.disagreement_count}
                    tone={preview.disagreement_count > 0 ? 'warn' : undefined}
                    filter="disagreement" active={tile === 'disagreement'} onFilter={toggleTile}
                  />
                  <Stat
                    label="Failed reconciliation"
                    value={preview.flagged_count}
                    tone={preview.flagged_count > 0 ? 'warn' : undefined}
                    filter="flagged" active={tile === 'flagged'} onFilter={toggleTile}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    Dates covered: {formatFuelDate(preview.date_range_start) || '—'} to{' '}
                    {formatFuelDate(preview.date_range_end) || '—'}
                  </span>
                  {tile && (
                    <button
                      type="button"
                      onClick={() => setTile(null)}
                      className="text-gold underline underline-offset-2"
                    >
                      Showing {visibleRows.length} of {displayRows.length} rows — clear filter
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#F9F9F9] text-left">
                      <tr>
                        <th className="p-2 w-8" />
                        <SortHead column="date" label="Date" sort={sort} onSort={onSort} />
                        <SortHead column="driver" label="Unit / name as printed" sort={sort} onSort={onSort} />
                        <SortHead column="fuel" label="Fuel" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead column="advances" label="Advances" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead column="repairs" label="Repairs" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead column="other" label="Other" sort={sort} onSort={onSort} className="text-right" />
                        <th className="p-2 font-medium text-right">Unexplained</th>
                        <SortHead column="total" label="Total" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead column="gallons" label="Gallons" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead column="cpg" label="$/gal" sort={sort} onSort={onSort} className="text-right" />
                        <th className="p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => <PreviewRow key={r.key} row={r} />)}
                      {visibleRows.length === 0 && (
                        <tr><td colSpan={13} className="p-3 text-muted-foreground">No rows match that tile.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>


                {notices.reconciliation && (
                  <div
                    data-testid="fuel-reconciliation-warning"
                    className="space-y-2 rounded-md border border-destructive/40 bg-[#FFE8E8] p-3 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div>
                        <div className="font-medium">Check the export before committing</div>
                        <div className="text-muted-foreground">{notices.reconciliation}</div>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      I have read this and want to import anyway.
                    </label>
                  </div>
                )}

                {notices.unrecognizedMoney && (
                  <div
                    data-testid="fuel-unrecognized-money-warning"
                    className="flex items-start gap-2 rounded-md border border-destructive/40 bg-[#FFE8E8] p-3 text-sm"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <div className="font-medium">A column with money in it was not recognised</div>
                      <div className="text-muted-foreground">{notices.unrecognizedMoney}</div>
                    </div>
                  </div>
                )}

                {notices.drift && (
                  <div className="rounded-md border border-border bg-[#E8F0FF] p-3 text-sm">
                    {notices.drift}
                  </div>
                )}

                {notices.unrecognized && (
                  <div className="rounded-md border border-border bg-[#F9F9F9] p-3 text-sm text-muted-foreground">
                    {notices.unrecognized} They are ignored; nothing from them is imported.
                  </div>
                )}

                <Button
                  onClick={() => void onCommit()}
                  disabled={
                    busy || preview.importable_count === 0
                    || (notices.reconciliation !== null && !acknowledged)
                  }
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Commit {preview.importable_count} rows
                </Button>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Import complete
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Imported" value={result.imported_count} tone="ok" />
                <Stat
                  label="Duplicates skipped"
                  value={result.duplicate_count}
                  tone={result.duplicate_count > 0 ? 'warn' : undefined}
                />
                <Stat label="Unmatched" value={result.unmatched_count} />
                <Stat label="Flagged" value={result.flagged_count} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ------------------------------------------------- review ----- */}
        <TabsContent value="review" className="space-y-3">
          {queue.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (queue.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing waiting for review.</p>
          ) : (
            (queue.data ?? []).map((t) => (
              <ReviewRow
                key={t.id}
                tx={t}
                operators={operators.data ?? []}
                onAssign={(operatorId) => assign.mutate({ id: t.id, operatorId })}
                busy={assign.isPending}
              />
            ))
          )}
        </TabsContent>

        {/* ------------------------------------------------ history ----- */}
        <TabsContent value="history" className="space-y-2">
          {(batches.data ?? []).map((b) => (
            <Card key={b.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <div className="font-medium">{b.file_name}</div>
                  <div className="text-muted-foreground">
                    {new Date(b.imported_at).toLocaleString()} · {b.date_range_start ?? '—'} to {b.date_range_end ?? '—'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{b.imported_count} imported</Badge>
                  {b.duplicate_count > 0 && <Badge variant="secondary">{b.duplicate_count} duplicates skipped</Badge>}
                  {b.unmatched_count > 0 && <Badge variant="destructive">{b.unmatched_count} unmatched</Badge>}
                  {b.flagged_count > 0 && <Badge variant="destructive">{b.flagged_count} flagged</Badge>}
                  <Badge variant="outline">{formatCurrency(b.total_amount)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {(batches.data ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No imports yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReviewRow({
  tx, operators, onAssign, busy,
}: {
  tx: FuelTransactionRecord;
  operators: OperatorOption[];
  onAssign: (operatorId: string) => void;
  busy: boolean;
}) {
  const [choice, setChoice] = useState<string>('');
  const disagreements = Array.isArray(tx.disagreement_fields) ? tx.disagreement_fields : [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">
              Invoice {tx.invoice_no} · {tx.invoice_date} · {formatCurrency(tx.total_amount)}
            </div>
            <div className="text-muted-foreground">
              Card <span className="font-mono">{tx.card_no}</span>
              {tx.city ? ` · ${tx.city}, ${tx.state ?? ''}` : ''}
            </div>
          </div>
          {tx.match_status === 'unmatched'
            ? <Badge variant="destructive">Unmatched card</Badge>
            : <Badge variant="secondary">Matched, disagreement</Badge>}
        </div>

        <div className="rounded-md bg-[#F9F9F9] p-2">
          <div className="text-xs text-muted-foreground">As printed on the file</div>
          <div>{[tx.unit_no, tx.driver_name].filter(Boolean).join(' · ') || '—'}</div>
        </div>

        {disagreements.length > 0 && (
          <div className="space-y-1 rounded-md border border-border bg-[#E8F0FF] p-2">
            {disagreements.map((d) => (
              <div key={d.field} className="flex flex-wrap gap-x-4">
                <span className="text-xs uppercase text-muted-foreground">
                  {d.field === 'unit_no' ? 'Unit number' : 'Driver name'}
                </span>
                <span>File: <strong>{d.csv_value || '—'}</strong></span>
                <span>On record: <strong>{d.system_value || '—'}</strong></span>
              </div>
            ))}
            <div className="text-xs text-muted-foreground">
              Imported against the card. The card is the account the money moved on.
            </div>
          </div>
        )}

        {tx.match_status === 'unmatched' && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Assign to a driver" /></SelectTrigger>
              <SelectContent>
                {operators.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}{o.unit ? ` · Unit ${o.unit}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!choice || busy} onClick={() => onAssign(choice)}>Assign</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
