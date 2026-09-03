/**
 * DISPATCH COMPANY SETTLEMENT — Management and owner only.
 *
 * MODULE 4 (dispatch), PASS 5. The screen someone opens around the 10th, when
 * they are about to pay the dispatch company and want to know the figure is
 * right. It is not primarily a computation trigger.
 *
 * EVERY FIGURE ON THIS SCREEN IS READ FROM THE STORED ROWS. Nothing is
 * recomputed for display. A screen that recomputes can only ever agree with
 * itself, and the one thing this screen exists to do is show that a stored
 * figure is wrong. The only arithmetic performed is a RE-ADDITION of the
 * stored lines and of the stored per-dispatcher breakdown, both of which are
 * checks on stored rows.
 *
 * Compute, approve, mark paid and void all go through the writers and triggers
 * of Passes 1 and 4. No writer, RPC or migration was added for this screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Wallet } from 'lucide-react';
import {
  defaultDispatchMonth, listDispatchMonths, monthLabel, previewDispatchMonth,
  readStoredDispatchMonth, storeDispatchSettlement,
  type DispatchMonthOption, type StoredDispatchMonth,
} from '@/lib/dispatchSettlementRun';


const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${Number(n).toFixed(2)}%`;

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short',
      }) + ' CT'
    : null;

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-muted text-foreground',
  approved: 'bg-status-progress/15 text-status-progress',
  paid: 'bg-status-complete/15 text-status-complete',
  void: 'bg-destructive/10 text-destructive',
};

const EXCLUSION_LABEL: Record<string, string> = {
  pct_100: 'excluded — pays 100%',
  reimbursement_class: 'excluded — reimbursement',
};

export default function DispatchSettlementPage() {
  const { toast } = useToast();
  const [months, setMonths] = useState<DispatchMonthOption[]>([]);
  const [month, setMonth] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredDispatchMonth | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const loadMonths = useCallback(async (): Promise<DispatchMonthOption[]> => {
    try {
      const list = await listDispatchMonths(supabase);
      setMonths(list);
      return list;
    } catch (e) {
      toast({ title: 'Could not list the months', description: (e as Error).message, variant: 'destructive' });
      return [];
    }
  }, [toast]);

  useEffect(() => {
    void (async () => {
      const list = await loadMonths();
      setMonth(m => m || defaultDispatchMonth(list));
    })();
  }, [loadMonths]);

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      setStored(await readStoredDispatchMonth(supabase, month));
    } catch (e) {
      toast({ title: 'Could not read the month', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => { void load(); }, [load]);


  const s = stored?.settlement ?? null;
  const isPaid = s?.status === 'paid';
  const isVoid = s?.status === 'void';

  const ratesDiffer = useMemo(() => {
    if (!s || !stored?.currentRates) return false;
    return stored.currentRates.dispatch_pct !== s.dispatch_pct
      || stored.currentRates.factoring_pct !== s.factoring_pct;
  }, [s, stored]);

  const compute = useCallback(async () => {
    setBusy('compute');
    try {
      const { result } = await previewDispatchMonth(supabase, month);
      // `replace` only when a non-paid row already exists; the writer refuses a
      // paid one outright and the UI never offers it.
      const mode = stored ? 'replace' : 'refuse';
      const out = await storeDispatchSettlement(supabase, result, mode);
      toast({ title: `Month ${out.outcome === 'refused_existing' ? 'already stored' : 'computed'}` });
      await Promise.all([load(), loadMonths()]);
    } catch (e) {
      toast({ title: 'The month did not compute', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [month, stored, toast, load, loadMonths]);

  const setStatus = useCallback(async (
    patch: Record<string, unknown>, label: string,
  ) => {
    if (!s) return;
    setBusy(label);
    try {
      // The actor is NOT sent from the browser (standing rule: the actor is
      // resolved server-side). Timestamps only.
      const { error } = await supabase.from('dispatch_settlements')
        .update(patch as never).eq('id', s.id);
      if (error) throw error;
      toast({ title: `Settlement ${label}` });
      setVoidOpen(false);
      setVoidReason('');
      await load();
    } catch (e) {
      toast({ title: `Could not mark ${label}`, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [s, toast, load]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Dispatch Company Settlement</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        One vendor, one settlement per calendar month, paid on or around the 10th of the
        following month. Attribution by dispatcher is for visibility only — no amount depends
        on it.
      </p>

      {/* ------------------------------------------------ choose a month */}
      <Card className="p-4 space-y-1">
        <Label htmlFor="dispatch-month">Month</Label>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger id="dispatch-month" className="w-[260px]">
            <SelectValue placeholder="Choose a month" />
          </SelectTrigger>
          <SelectContent>
            {months.map(o => (
              <SelectItem key={o.month} value={o.month}>
                {o.label}
                {o.hasSettlement
                  ? ` — ${(o.status ?? '').toUpperCase()}`
                  : ' — not yet computed'}
              </SelectItem>
            ))}
            {/* The chosen month is always listed, even if nothing matched. */}
            {month && !months.some(o => o.month === month) && (
              <SelectItem value={month}>{monthLabel(month)}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Months with a stored settlement, plus recent months with delivered loads that have
          not been computed. Choosing a month only changes what you are reading.
        </p>
      </Card>

      {/* ----------------------------------- act on the month, separately */}
      {month && (
        <Card className="p-4 space-y-2 border-dashed">
          <h2 className="font-semibold text-sm">Actions for {monthLabel(month)}</h2>
          <p className="text-xs text-muted-foreground">
            These act on {monthLabel(month)} — the month selected above.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {!isPaid && (
              <Button onClick={compute} disabled={!!busy || loading}>
                {busy === 'compute' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {stored ? `Recompute ${monthLabel(month)}` : `Compute ${monthLabel(month)}`}
              </Button>
            )}
            {s && s.status === 'draft' && (
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => setStatus({ status: 'approved', approved_at: new Date().toISOString() }, 'approved')}
              >
                {busy === 'approved' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Approve {monthLabel(month)}
              </Button>
            )}
            {s && s.status === 'approved' && (
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => setStatus({ status: 'paid', paid_at: new Date().toISOString() }, 'paid')}
              >
                {busy === 'paid' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Mark {monthLabel(month)} paid
              </Button>
            )}
            {s && !isPaid && !isVoid && (
              <Button variant="outline" disabled={!!busy} onClick={() => setVoidOpen(true)}>
                Void {monthLabel(month)}
              </Button>
            )}
          </div>
        </Card>
      )}


      {loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!loading && !s && (
        <Card className="p-6 text-sm text-muted-foreground">
          No settlement has been stored for {monthLabel(month)}.
        </Card>
      )}

      {!loading && s && (
        <>
          {/* ---------------------------------------------------- status */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={STATUS_STYLE[s.status]}>{s.status.toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">
                {new Date(`${s.period_month.slice(0, 7)}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="flex justify-between border-b py-1">
                <dt className="text-muted-foreground">Computed</dt>
                <dd>{stamp(s.computed_at) ?? '—'}{s.computed_by_name ? ` · ${s.computed_by_name}` : ''}</dd>
              </div>
              <div className="flex justify-between border-b py-1">
                <dt className="text-muted-foreground">Approved</dt>
                <dd>
                  {stamp(s.approved_at) ?? '—'}
                  {s.approved_by_name ? ` · ${s.approved_by_name}` : (s.approved_at ? ' · actor not recorded (predates actor stamping)' : '')}
                </dd>
              </div>
              <div className="flex justify-between border-b py-1">
                <dt className="text-muted-foreground">Paid</dt>
                <dd>
                  {stamp(s.paid_at) ?? '—'}
                  {s.paid_by_name ? ` · ${s.paid_by_name}` : (s.paid_at ? ' · actor not recorded (predates actor stamping)' : '')}
                </dd>
              </div>
              {isVoid && (
                <div className="flex justify-between border-b py-1">
                  <dt className="text-muted-foreground">Voided</dt>
                  <dd>
                    {s.voided_by_name ?? 'actor not recorded (predates actor stamping)'}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-b py-1">
                <dt className="text-muted-foreground">Last changed</dt>
                <dd>{stamp(s.updated_at) ?? '—'}</dd>
              </div>
            </dl>
            {isVoid && (
              <p className="text-sm text-destructive">
                Voided — {s.void_reason}. The breakdown was erased; the month can be computed fresh.
              </p>
            )}
            {isPaid && (
              <p className="text-xs text-muted-foreground">
                A paid settlement is immutable. It cannot be recomputed, edited or voided.
              </p>
            )}
          </Card>

          {/* --------------------------------------- discrepancy, loudly */}
          {(!stored!.totalsCheck.ok || !stored!.attributionCheck.ok) && (
            <Card className="p-4 border-destructive bg-destructive/5 space-y-1">
              <div className="flex items-center gap-2 text-destructive font-semibold">
                <AlertTriangle className="h-4 w-4" />
                This settlement does not add up. Do not pay it.
              </div>
              {[...stored!.totalsCheck.problems, ...stored!.attributionCheck.problems].map(p => (
                <p key={p} className="text-sm text-destructive">{p}</p>
              ))}
            </Card>
          )}

          {/* --------------------------------------------- the arithmetic */}
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">The arithmetic</h2>
            <p className="text-xs text-muted-foreground">
              The rates below are the rates AS STORED ON THIS SETTLEMENT — what was applied when
              the month was computed, not what is configured today. The two can differ; the
              stored ones are what was paid.
              {ratesDiffer && stored!.currentRates && (
                <span className="text-destructive">
                  {' '}Configured today: dispatch {pct(stored!.currentRates.dispatch_pct)},
                  factoring {pct(stored!.currentRates.factoring_pct)} — these differ from the
                  stored rates and were NOT used.
                </span>
              )}
            </p>
            <dl className="text-sm">
              {[
                ['Eligible base', s.eligible_base, null],
                [`Less factoring at ${pct(s.factoring_pct)}`, -s.factoring_reduction, null],
                ['Reduced base', s.reduced_base, 'sub'],
                [`Dispatch fee at ${pct(s.dispatch_pct)}`, s.dispatch_fee, null],
                ['Less deductions', -s.deductions_amount, null],
                ['Net payable', s.net_amount, 'net'],
              ].map(([label, amount, kind]) => (
                <div
                  key={label as string}
                  className={`flex justify-between py-1 border-b last:border-0 ${
                    kind === 'net' ? 'font-bold text-base pt-2' : kind === 'sub' ? 'font-medium' : ''
                  }`}
                >
                  <dt>{label as string}</dt>
                  <dd className="tabular-nums">{money(amount as number)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* ------------------------------------------ per dispatcher */}
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">By dispatcher — who booked it</h2>
            <p className="text-xs text-muted-foreground">
              Attribution is frozen at the time the month was computed. Visibility only.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-medium">Dispatcher</th>
                  <th className="py-1 font-medium text-right">Loads</th>
                  <th className="py-1 font-medium text-right">Base</th>
                </tr>
              </thead>
              <tbody>
                {stored!.byDispatcher.map(b => (
                  <tr key={b.dispatcherId ?? 'unattributed'} className="border-t">
                    <td className={`py-1 ${b.dispatcherId ? '' : 'italic text-muted-foreground'}`}>{b.name}</td>
                    <td className="py-1 text-right tabular-nums">{b.loads}</td>
                    <td className="py-1 text-right tabular-nums">{money(b.base)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right tabular-nums">
                    {stored!.byDispatcher.reduce((n, b) => n + b.loads, 0)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{money(stored!.byDispatcherTotal)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          {/* ------------------------------------------- contributions */}
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">
              Loads in the base ({stored!.contributions.length})
            </h2>
            <div className="divide-y">
              {stored!.contributions.map(c => {
                const open = !!expanded[c.id];
                const dispatcher = stored!.byDispatcher
                  .find(b => b.dispatcherId === c.dispatcher_id)?.name ?? 'Unattributed';
                return (
                  <div key={c.id} className="py-2">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 text-left"
                      onClick={() => setExpanded(p => ({ ...p, [c.id]: !open }))}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-medium text-sm">{c.load_number}</span>
                      <span className="text-xs text-muted-foreground">{dispatcher}</span>
                      {c.charges_excluded_count > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {c.charges_excluded_count} charge{c.charges_excluded_count > 1 ? 's' : ''} excluded
                        </Badge>
                      )}
                      <span className="ml-auto tabular-nums text-sm">{money(c.base_total)}</span>
                    </button>
                    {open && (
                      <div className="pl-6 pt-2 space-y-1 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Header rate ({c.rate_type}{c.load_type !== 'standard' ? ` · ${c.load_type}` : ''})</span>
                          <span className="tabular-nums">{money(c.header_component)}</span>
                        </div>
                        {c.fsc_component !== 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Fuel surcharge</span>
                            <span className="tabular-nums">{money(c.fsc_component)}</span>
                          </div>
                        )}
                        {c.verdicts.length === 0 && (
                          <p className="text-xs text-muted-foreground">No charges on this load.</p>
                        )}
                        {c.verdicts.map(v => (
                          <div key={v.id} className="flex justify-between gap-3">
                            <span className={v.excluded ? 'text-muted-foreground line-through' : ''}>
                              {v.charge_type}
                            </span>
                            <span className="text-xs text-muted-foreground flex-1">
                              {v.excluded
                                ? `${EXCLUSION_LABEL[v.exclusion_reason ?? ''] ?? v.exclusion_reason}`
                                : 'included'}
                              {v.resolved_pct !== null && ` · ${v.classification} resolved ${v.resolved_pct}%`}
                              {v.pct_column && ` (${v.pct_column})`}
                            </span>
                            <span className={`tabular-nums ${v.excluded ? 'text-muted-foreground line-through' : ''}`}>
                              {money(v.amount)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                          <span>Delivered {c.carrier_delivery_date ?? '—'} (carrier time)</span>
                          <span>
                            charges in {money(c.charges_included_amount)} · out {money(c.charges_excluded_amount)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {stored!.contributions.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No loads contributed to this month.</p>
              )}
            </div>
          </Card>
        </>
      )}

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this settlement</DialogTitle>
            <DialogDescription>
              The stored breakdown is erased and the totals go to zero. The row stays on file
              with the reason, and the month can be computed fresh. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Why is this settlement being voided?"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || !!busy}
              onClick={() => setStatus({ status: 'void', void_reason: voidReason.trim() }, 'void')}
            >
              {busy === 'void' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Void settlement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
