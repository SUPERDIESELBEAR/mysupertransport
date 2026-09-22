import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, Pencil, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { carrierDateOf } from '@/lib/settlementPeriod';
import { companyRateConfirmation } from '@/lib/payRatePresentation';
import { formatLongDay } from '@/lib/settlementMath';
import { companyPolicyHistoryQuery } from '@/lib/payPolicyVersion';

const RATE_FIELDS = [
  ['linehaul_pct', 'Linehaul'], ['fsc_pct', 'Fuel surcharge'], ['detention_pct', 'Detention'],
  ['layover_pct', 'Layover'], ['tonu_pct', 'TONU'], ['stopoff_pct', 'Stop-off'],
  ['lumper_reimbursement_pct', 'Lumper reimbursement'], ['per_ton_pct', 'Per ton'],
  ['loadout_pct', 'Loadout'], ['other_accessorial_pct', 'Other accessorial'],
] as const;
type RateKey = (typeof RATE_FIELDS)[number][0];
type PolicyRow = { id: string; name: string; description: string | null; effective_from: string | null; effective_to: string | null } & Record<RateKey, number | string>;

export default function CompanyPayPolicySettings() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canChange, setCanChange] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [rates, setRates] = useState<Record<RateKey, string>>({} as Record<RateKey, string>);
  const today = carrierDateOf(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const [policyRes, permissionRes] = await Promise.all([
      companyPolicyHistoryQuery<PolicyRow>(supabase),
      supabase.rpc('has_permission', { _action: 'pay_policy.change' } as never),
    ]);
    setLoading(false);
    if (policyRes.error ?? permissionRes.error) {
      const error = policyRes.error ?? permissionRes.error;
      toast({ title: 'Could not load company rate sheets', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
      return;
    }
    setRows((policyRes.data ?? []) as PolicyRow[]);
    setCanChange(permissionRes.data === true);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const current = rows.find(r => !r.effective_to) ?? rows[0] ?? null;
  const openForm = () => {
    if (!canChange || !current) {
      toast({ title: 'Change refused', description: 'Only the owner can open a new company rate sheet.', variant: 'destructive' });
      return;
    }
    setRates(Object.fromEntries(RATE_FIELDS.map(([key]) => [key, String(Number(current[key]))])) as Record<RateKey, string>);
    setEffectiveFrom(today); setOpen(true);
  };
  const changes = useMemo(() => current ? RATE_FIELDS.map(([key, label]) => ({ label, from: Number(current[key]), to: Number(rates[key]) })) : [], [current, rates]);
  const confirmation = companyRateConfirmation(changes, effectiveFrom);
  const formValid = Boolean(current && effectiveFrom >= today && RATE_FIELDS.every(([key]) => rates[key] !== '' && Number(rates[key]) >= 0 && Number(rates[key]) <= 100));

  const save = async () => {
    if (!canChange || !current) {
      toast({ title: 'Change refused', description: 'Only the owner can open a new company rate sheet.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const ratePayload = Object.fromEntries(RATE_FIELDS.map(([key]) => [key, Number(rates[key])]));
    const { error } = await supabase.rpc('open_pay_policy_version', { _effective_from: effectiveFrom, _rates: ratePayload, _name: current.name, _description: current.description } as never);
    setSaving(false);
    if (error) { toast({ title: 'Rate sheet not opened', description: error.message, variant: 'destructive' }); return; }
    setConfirming(false); setOpen(false);
    toast({ title: 'New company rate sheet scheduled', description: confirmation });
    await load();
  };

  return <Card className="p-4 space-y-4" data-testid="company-pay-policy-settings">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-2"><Percent className="mt-0.5 h-4 w-4 text-gold" /><div><h2 className="text-sm font-semibold">Company Pay Rates</h2><p className="text-xs text-muted-foreground">Versioned rates used by driver settlements.</p></div></div>
      {canChange && <Button size="sm" variant="outline" onClick={openForm}><Pencil className="mr-1.5 h-3.5 w-3.5" />Open new version</Button>}
    </div>
    {loading ? <p className="text-sm text-muted-foreground">Loading rate sheets…</p> : !current ? <p className="text-sm text-destructive">No current company rate sheet is available.</p> : <>
      <div className="rounded-md border p-3"><div className="mb-3 flex items-center gap-2"><Badge>Current</Badge><span className="text-xs text-muted-foreground">Started {current.effective_from ? formatLongDay(current.effective_from) : 'before recorded history'}</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{RATE_FIELDS.map(([key, label]) => <div key={key}><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{Number(current[key])}%</p></div>)}</div></div>
      <div><div className="mb-2 flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" /><h3 className="text-xs font-semibold uppercase">Past versions</h3></div>{rows.filter(r => r.id !== current.id).length === 0 ? <p className="text-xs text-muted-foreground">No past versions.</p> : <ul className="divide-y rounded-md border">{rows.filter(r => r.id !== current.id).map(r => <li key={r.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-xs"><span>{r.effective_from ? formatLongDay(r.effective_from) : 'Earlier'} – {r.effective_to ? formatLongDay(r.effective_to) : 'current'}</span><span className="text-muted-foreground">Linehaul {Number(r.linehaul_pct)}% · FSC {Number(r.fsc_pct)}% · Detention {Number(r.detention_pct)}%</span></li>)}</ul>}</div>
    </>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Open a new company rate sheet</DialogTitle><DialogDescription>Every rate carries forward from the current sheet. Change only the fields that should differ.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Effective date</Label><DateInput value={effectiveFrom} onChange={setEffectiveFrom} /><p className="text-xs text-muted-foreground">The date cannot be earlier than today. Earlier work weeks keep their existing sheet.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{RATE_FIELDS.map(([key, label]) => <div key={key} className="grid min-w-0 gap-1"><Label className="text-xs" htmlFor={`policy-${key}`}>{label}</Label><div className="flex items-center gap-2"><Input className="h-9" id={`policy-${key}`} type="number" min="0" max="100" step="0.01" value={rates[key] ?? ''} onChange={e => setRates(v => ({ ...v, [key]: e.target.value }))} /><span className="text-sm text-muted-foreground">%</span></div><p className="text-[11px] text-muted-foreground">Current: {current ? Number(current[key]) : 0}%{Number(rates[key]) === Number(current?.[key]) ? ' · carried forward' : ' · changed'}</p></div>)}</div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!formValid} onClick={() => setConfirming(true)}>Review new version</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={confirming} onOpenChange={setConfirming}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm the new company rate sheet</AlertDialogTitle><AlertDialogDescription>{confirmation}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={e => { e.preventDefault(); void save(); }}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm version</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Card>;
}
