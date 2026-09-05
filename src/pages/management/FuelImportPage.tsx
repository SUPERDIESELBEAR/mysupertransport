import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, FileUp, Loader2, Upload } from 'lucide-react';
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
  unrecognizedColumnsNotice,
  type FuelColumnReport, type ParsedFuelFile, type ParsedFuelRow,
} from '@/lib/fuel/multiserviceCsv';
import {
  assignFuelTransactionOperator, commitFuelImport, fetchFuelBatches,
  fetchFuelReviewQueue, fetchLastImportColumns, previewFuelImport,
  type FuelCommitResult, type FuelPreview, type FuelTransactionRecord,
} from '@/lib/fuel/fuelImport';

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


function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' | 'ok' }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          'text-lg font-semibold ' +
          (tone === 'warn' ? 'text-destructive' : tone === 'ok' ? 'text-success' : 'text-foreground')
        }
      >
        {value}
      </div>
    </div>
  );
}

export default function FuelImportPage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedFuelRow[] | null>(null);
  const [columns, setColumns] = useState<FuelColumnReport | null>(null);
  const [notices, setNotices] = useState<{ reconciliation: string | null; unrecognized: string | null; drift: string | null }>(
    { reconciliation: null, unrecognized: null, drift: null },
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<FuelPreview | null>(null);
  const [result, setResult] = useState<FuelCommitResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setNotices({ reconciliation: null, unrecognized: null, drift: null });
    try {
      const parsed: ParsedFuelFile = parseMultiserviceCsv(await file.text());
      const previousColumns = await fetchLastImportColumns().catch(() => null);
      setFileName(file.name);
      setRows(parsed.rows);
      setColumns(parsed.columns);
      setNotices({
        reconciliation: reconciliationWarning(parsed),
        unrecognized: unrecognizedColumnsNotice(parsed.columns),
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
      setNotices({ reconciliation: null, unrecognized: null, drift: null });
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
                  <Stat label="Will import" value={preview.importable_count} tone="ok" />
                  <Stat
                    label="Duplicates skipped"
                    value={preview.duplicate_count}
                    tone={preview.duplicate_count > 0 ? 'warn' : undefined}
                  />
                  <Stat label="Total" value={formatCurrency(preview.total_amount)} />
                  <Stat label="Matched" value={preview.matched_count} />
                  <Stat
                    label="Unmatched"
                    value={preview.unmatched_count}
                    tone={preview.unmatched_count > 0 ? 'warn' : undefined}
                  />
                  <Stat
                    label="Disagreements"
                    value={preview.disagreement_count}
                    tone={preview.disagreement_count > 0 ? 'warn' : undefined}
                  />
                  <Stat
                    label="Failed reconciliation"
                    value={preview.flagged_count}
                    tone={preview.flagged_count > 0 ? 'warn' : undefined}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Dates covered: {preview.date_range_start ?? '—'} to {preview.date_range_end ?? '—'}
                </div>

                <div className="max-h-80 overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#F9F9F9] text-left">
                      <tr>
                        <th className="p-2 font-medium">Invoice</th>
                        <th className="p-2 font-medium">Date</th>
                        <th className="p-2 font-medium">Card</th>
                        <th className="p-2 font-medium">Unit / name as printed</th>
                        <th className="p-2 font-medium">Amount</th>
                        <th className="p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={`${r.invoice_no}-${r.invoice_date}-${r.card_no}-${i}`} className="border-t border-border">
                          <td className="p-2">{r.invoice_no}</td>
                          <td className="p-2">{r.invoice_date}</td>
                          <td className="p-2 font-mono text-xs">{r.card_no}</td>
                          <td className="p-2">{[r.unit_no, r.driver_name].filter(Boolean).join(' · ')}</td>
                          <td className="p-2">{formatCurrency(r.total_amount)}</td>
                          <td className="p-2">
                            {r.duplicate ? (
                              <Badge variant="outline" className="gap-1">
                                <Copy className="h-3 w-3" /> Duplicate — skipped
                              </Badge>
                            ) : r.match_status === 'unmatched' ? (
                              <Badge variant="destructive">Unmatched</Badge>
                            ) : r.match_status === 'matched_with_disagreement' ? (
                              <Badge variant="secondary">Matched, disagreement</Badge>
                            ) : (
                              <Badge variant="outline">Matched</Badge>
                            )}
                            {!r.reconciliation_ok && (
                              <Badge variant="destructive" className="ml-1">
                                Does not add up ({formatCurrency(r.reconciliation_delta)})
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
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
