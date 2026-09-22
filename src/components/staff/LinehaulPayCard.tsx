import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, DollarSign, History, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { carrierDateOf } from '@/lib/settlementPeriod';
import { agreementMismatch, driverRateConfirmation, rateSourceLabel, type RateSource } from '@/lib/payRatePresentation';
import { formatLongDay } from '@/lib/settlementMath';

interface VersionRow { id: string; pct: number | string; effective_from: string; effective_to: string | null; reason: string; actor: string | null; source: string; }
interface PolicyRow { id: string; linehaul_pct: number | string; effective_from: string | null; effective_to: string | null; }
interface AgreementRow { linehaul_split_pct: number | null; status: string | null; }

export default function LinehaulPayCard({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [agreement, setAgreement] = useState<AgreementRow | null>(null);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [canChange, setCanChange] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pct, setPct] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [reason, setReason] = useState('');

  const today = carrierDateOf(new Date());
  const load = useCallback(async () => {
    setLoading(true);
    const [versionsRes, policyRes, agreementRes, permissionRes] = await Promise.all([
      supabase.from('operator_linehaul_pct_versions').select('id, pct, effective_from, effective_to, reason, actor, source').eq('operator_id', operatorId).order('effective_from', { ascending: false }),
      supabase.from('pay_policies').select('id, linehaul_pct, effective_from, effective_to').eq('is_company_default', true).eq('is_active', true).or(`effective_from.is.null,effective_from.lte.${today}`).or(`effective_to.is.null,effective_to.gte.${today}`).order('effective_from', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      supabase.from('ica_contracts').select('linehaul_split_pct, status').eq('operator_id', operatorId).in('status', ['fully_executed', 'complete', 'completed', 'signed']).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc('has_permission', { _action: 'driver_pay.change' } as never),
    ]);
    setLoading(false);
    const failure = versionsRes.error ?? policyRes.error ?? agreementRes.error ?? permissionRes.error;
    if (failure) {
      toast({ title: 'Could not load linehaul pay', description: failure.message, variant: 'destructive' });
      return;
    }
    const rows = (versionsRes.data ?? []) as VersionRow[];
    setVersions(rows);
    setPolicy(policyRes.data as PolicyRow | null);
    setAgreement(agreementRes.data as AgreementRow | null);
    setCanChange(permissionRes.data === true);
    const ids = [...new Set(rows.map(r => r.actor).filter(Boolean) as string[])];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
      setActors(Object.fromEntries((data ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown'])));
    } else setActors({});
  }, [operatorId, today, toast]);

  useEffect(() => { void load(); }, [load]);

  const driverVersion = versions.find(v => v.effective_from <= today && (!v.effective_to || v.effective_to >= today));
  const currentPct = Number(driverVersion?.pct ?? policy?.linehaul_pct ?? 0);
  const currentSource: RateSource = driverVersion ? 'driver_version' : 'company_policy';
  const currentStart = driverVersion?.effective_from ?? policy?.effective_from ?? null;
  const mismatch = agreementMismatch(agreement?.linehaul_split_pct, currentPct);
  const confirmation = useMemo(() => driverRateConfirmation(operatorName, currentPct, Number(pct), effectiveFrom), [operatorName, currentPct, pct, effectiveFrom]);
  const formValid = Number.isInteger(Number(pct)) && Number(pct) >= 0 && Number(pct) <= 100 && effectiveFrom >= today && reason.trim().length > 0;

  const beginChange = () => {
    if (!canChange) {
      toast({ title: 'Change refused', description: "Only the owner can change a driver's linehaul percentage.", variant: 'destructive' });
      return;
    }
    setPct(String(currentPct)); setEffectiveFrom(today); setReason(''); setOpen(true);
  };

  const save = async () => {
    if (!canChange) {
      toast({ title: 'Change refused', description: "Only the owner can change a driver's linehaul percentage.", variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('set_operator_linehaul_pct', {
      _operator_id: operatorId, _pct: Number(pct), _effective_from: effectiveFrom, _reason: reason.trim(), _source: 'driver_page',
    } as never);
    setSaving(false);
    if (error) {
      toast({ title: 'Percentage not changed', description: error.message, variant: 'destructive' });
      return;
    }
    setConfirming(false); setOpen(false);
    toast({ title: 'Linehaul percentage scheduled', description: confirmation });
    await load();
  };

  if (loading) return <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Loading linehaul pay…</div>;

  return (
    <section className="rounded-lg border bg-card shadow-sm" data-testid="linehaul-pay-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex gap-2">
          <DollarSign className="mt-0.5 h-4 w-4 text-gold" />
          <div><h3 className="text-sm font-semibold">Linehaul Pay</h3><p className="text-xs text-muted-foreground">Staff only</p></div>
        </div>
        {canChange && <Button size="sm" variant="outline" onClick={beginChange}><Pencil className="mr-1.5 h-3.5 w-3.5" />Change</Button>}
      </div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-3xl font-bold">{currentPct}%</span>
          <Badge variant="outline">{rateSourceLabel(currentSource)}</Badge>
          <span className="text-xs text-muted-foreground">Effective {currentStart ? formatLongDay(currentStart) : 'date unavailable'}</span>
        </div>
        {mismatch && (
          <div className="flex gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-sm" data-testid="linehaul-agreement-mismatch">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
            <p><strong>Agreement mismatch.</strong> The signed agreement says {agreement?.linehaul_split_pct}%; the effective pay rate is {currentPct}%. Settlements pay {currentPct}% from the {rateSourceLabel(currentSource)}.</p>
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" /><h4 className="text-xs font-semibold uppercase">Dated history</h4></div>
          {versions.length === 0 ? <p className="text-xs text-muted-foreground">No driver-specific changes. This driver follows the company rate sheet.</p> : (
            <ul className="divide-y rounded-md border">
              {versions.map(v => <li key={v.id} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[70px_170px_1fr]">
                <strong>{Number(v.pct)}%</strong>
                <span>{formatLongDay(v.effective_from)} – {v.effective_to ? formatLongDay(v.effective_to) : 'current'}</span>
                <span className="text-muted-foreground">{v.reason} · {v.actor ? actors[v.actor] ?? 'Unknown' : v.source === 'backfill' ? 'Initial record' : 'Unknown'}</span>
              </li>)}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change {operatorName}'s linehaul percentage</DialogTitle><DialogDescription>A new dated record will be created. Earlier work weeks never change.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5"><Label htmlFor="driver-linehaul-pct">Percentage</Label><Input id="driver-linehaul-pct" type="number" min="0" max="100" step="1" value={pct} onChange={e => setPct(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Effective date</Label><DateInput value={effectiveFrom} onChange={setEffectiveFrom} min={today} /><p className="text-xs text-muted-foreground">The date cannot be earlier than today. Past and settled weeks keep the rate already in force.</p></div>
            <div className="grid gap-1.5"><Label htmlFor="driver-linehaul-reason">Reason</Label><Textarea id="driver-linehaul-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this percentage changing?" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!formValid} onClick={() => setConfirming(true)}>Review change</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm the dated pay change</AlertDialogTitle><AlertDialogDescription>{confirmation}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={e => { e.preventDefault(); void save(); }}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm change</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
