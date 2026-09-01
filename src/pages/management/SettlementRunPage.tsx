/**
 * SETTLEMENT RUN — Management and owner only.
 *
 * A run is a deliberate act. It PREVIEWS first: who is included, what each one
 * nets, what status each carries, and every withheld load with its reason. Only
 * then does the person running it approve, and only then is anything written.
 * A run that writes first and shows afterwards is the wrong order for money.
 *
 * Nothing here recomputes a STORED settlement. The engine runs on gathered rows
 * to produce the preview; once stored, that settlement is read, never re-derived.
 */
import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Play, ShieldAlert, Wallet } from 'lucide-react';
import {
  previewSettlementRun, storeSettlementRun,
  type PreviewRow, type RunPreview, type StoreResultRow,
} from '@/lib/settlementRun';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/settlementConfig';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SettlementRunPage() {
  const { toast } = useToast();
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [storing, setStoring] = useState(false);
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [acceptReplace, setAcceptReplace] = useState(false);
  const [results, setResults] = useState<StoreResultRow[] | null>(null);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setResults(null);
    try {
      const p = await previewSettlementRun(supabase, anchor);
      setPreview(p);
      setSelected(Object.fromEntries(p.rows.map(r => [r.operatorId, true])));
      setAcceptReplace(false);
    } catch (e) {
      toast({ title: 'Could not build the preview', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [anchor, toast]);

  const chosen: PreviewRow[] = useMemo(
    () => (preview?.rows ?? []).filter(r => selected[r.operatorId]),
    [preview, selected],
  );
  const conflicts = chosen.filter(r => r.existing);
  const paidConflicts = conflicts.filter(r => r.existing?.status === 'paid');

  const store = useCallback(async () => {
    if (!preview) return;
    setStoring(true);
    try {
      const mode = conflicts.length > 0 && acceptReplace ? 'replace' : 'refuse';
      const { results: rs } = await storeSettlementRun(supabase, preview, chosen, mode);
      setResults(rs);
      toast({ title: 'Settlement run stored', description: `${rs.filter(r => r.outcome !== 'refused_existing').length} settlement(s) written.` });
      await runPreview();
    } catch (e) {
      toast({ title: 'The run did not write', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setStoring(false);
    }
  }, [preview, chosen, conflicts.length, acceptReplace, toast, runPreview]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Settlement Run</h1>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="anchor">Any date inside the work week</Label>
            <Input id="anchor" type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className="w-48" />
          </div>
          <Button onClick={runPreview} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Preview run
          </Button>
        </div>
        {preview && (
          <p className="text-sm text-muted-foreground">
            Work week {preview.period.periodStart} → {preview.period.periodEnd}. Payday {preview.period.payday}.
          </p>
        )}
      </Card>

      {preview && preview.rows.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">No driver has unsettled work in this period.</Card>
      )}

      {preview && preview.rows.length > 0 && (
        <Card className="p-4 space-y-4">
          <h2 className="font-semibold">What will be written</h2>
          <div className="space-y-3">
            {preview.rows.map(row => (
              <div key={row.operatorId} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={Boolean(selected[row.operatorId])}
                    onCheckedChange={v => setSelected(s => ({ ...s, [row.operatorId]: v === true }))}
                    aria-label={`Include ${row.operatorName}`}
                  />
                  <span className="font-medium">{row.operatorName}</span>
                  <Badge variant="outline">{SETTLEMENT_STATUS_LABELS[row.computed.status]}</Badge>
                  <span className="ml-auto text-lg font-semibold">{money(row.computed.netAmount)}</span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Gross {money(row.computed.grossAmount)} · deductions {money(row.computed.deductionsAmount)} ·{' '}
                  {row.computed.lines.length} line item(s) · in: {row.reasons.join('; ')}
                </p>

                {row.computed.holdReason && (
                  <p className="text-xs">{row.computed.holdReason}</p>
                )}

                {row.computed.lines.length > 0 && (
                  <ul className="text-xs space-y-0.5">
                    {row.computed.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{l.description}</span>
                        <span>{money(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {row.computed.withheldLoads.map(w => (
                  <p key={w.loadId} className="text-xs">
                    <span className="font-medium">Withheld — {w.loadNumber}:</span> {w.reasons.map(r => r.message).join(' ')}
                  </p>
                ))}
                {row.computed.pendingScaleTicketLoads.map(w => (
                  <p key={`s-${w.loadId}`} className="text-xs">
                    <span className="font-medium">{w.loadNumber}:</span> {w.reason}
                  </p>
                ))}

                {row.existing && (
                  <p className="text-xs flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    A settlement already exists for this week — {SETTLEMENT_STATUS_LABELS[row.existing.status as never] ?? row.existing.status}
                    , net {money(row.existing.net_amount)}.
                    {row.existing.status === 'paid'
                      ? ' It is PAID and cannot be replaced; a correction belongs on a later settlement.'
                      : ' It will be refused unless you accept a recomputation below.'}
                  </p>
                )}
              </div>
            ))}
          </div>

          {conflicts.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={acceptReplace} onCheckedChange={v => setAcceptReplace(v === true)} />
              <span>
                Replace the {conflicts.length} existing settlement(s) for this week with this recomputation. The previous
                net and status are written to the activity log.
                {paidConflicts.length > 0 && ' A PAID settlement is still refused.'}
              </span>
            </label>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={store} disabled={storing || chosen.length === 0}>
              {storing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Approve and store {chosen.length} settlement(s)
            </Button>
            <span className="text-sm text-muted-foreground">
              Total net {money(chosen.reduce((t, r) => t + r.computed.netAmount, 0))}
            </span>
          </div>
        </Card>
      )}

      {results && (
        <Card className="p-4 space-y-1">
          <h2 className="font-semibold">Stored</h2>
          {results.map(r => (
            <p key={r.operator_id} className="text-sm">
              {r.outcome === 'refused_existing'
                ? `Refused — a settlement already exists (net ${money(Number(r.existing_net ?? 0))}, ${r.existing_status}).`
                : `${r.outcome === 'replaced' ? 'Replaced' : 'Created'} — net ${money(Number(r.net ?? 0))}, ${r.status}.`}
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}
