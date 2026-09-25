/**
 * BILLING SETTINGS — where invoices go (P69) and what the remit-to block says.
 * Management and owner edit; dispatchers read. The database validates every
 * address, refuses duplicates and caps each list at 10 — this screen checks
 * the same rules first so the message is immediate.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Loader2, X } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAILS = 10;

export const DOC_LABELS: Record<string, string> = {
  invoice: 'Invoice', bol: 'BOL', pod: 'POD', rate_confirmation: 'Rate confirmation',
  revised_rate_confirmation: 'Revised rate confirmation', lumper_receipt: 'Lumper receipt',
  scale_ticket: 'Scale ticket', detention_documentation: 'Detention documentation',
};
const docLabel = (t: string) => DOC_LABELS[t] ?? t.replace(/_/g, ' ');

/** Returns an error message, or null when the address may be added. */
export function emailProblem(raw: string, list: string[], other: string[]): string | null {
  const e = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return `"${raw.trim()}" is not a valid email address.`;
  if (list.includes(e)) return `${e} is already listed.`;
  if (other.includes(e)) return 'An address cannot be both a send-to and a CC address.';
  if (list.length >= MAX_EMAILS) return `A list can hold at most ${MAX_EMAILS} addresses.`;
  return null;
}

type Settings = {
  id: string; remit_to_name: string | null; remit_to_address_1: string | null;
  remit_to_address_2: string | null; remit_to_city: string | null; remit_to_state: string | null;
  remit_to_zip: string | null; remit_to_phone: string | null; remit_to_email: string | null;
  payment_terms_days: number;
};
type Factor = {
  id: string; name: string; is_default: boolean; send_to_emails: string[]; cc_emails: string[];
  fee_pct: number; packet_style: 'combined' | 'separate'; packet_order: string[];
};

const REMIT_FIELDS: Array<[keyof Settings, string]> = [
  ['remit_to_name', 'Remit-to name'], ['remit_to_address_1', 'Address line 1'],
  ['remit_to_address_2', 'Address line 2'], ['remit_to_city', 'City'], ['remit_to_state', 'State'],
  ['remit_to_zip', 'ZIP'], ['remit_to_phone', 'Phone'], ['remit_to_email', 'Email'],
];

function EmailChips({ label, list, other, editable, onChange }: {
  label: string; list: string[]; other: string[]; editable: boolean; onChange: (l: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const p = emailProblem(draft, list, other);
    setProblem(p);
    if (!p) { onChange([...list, draft.trim().toLowerCase()]); setDraft(''); }
  };
  return (
    <div className="space-y-2">
      <Label>{label} <span className="text-muted-foreground font-normal">({list.length}/{MAX_EMAILS})</span></Label>
      <div className="flex flex-wrap gap-2">
        {list.length === 0 && <span className="text-sm text-muted-foreground">No addresses yet.</span>}
        {list.map((e) => (
          <Badge key={e} variant="secondary" className="gap-1">
            {e}
            {editable && (
              <button type="button" aria-label={`Remove ${e}`} onClick={() => onChange(list.filter((x) => x !== e))}>
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {editable && (
        <div className="flex gap-2">
          <Input value={draft} placeholder="name@example.com" aria-label={`${label} address`}
            onChange={(e) => { setDraft(e.target.value); setProblem(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button type="button" variant="outline" onClick={add}>Add</Button>
        </div>
      )}
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </div>
  );
}

export default function BillingSettingsPage() {
  const { isManagement, isOwner } = useAuth();
  const editable = !!(isManagement || isOwner);
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, f] = await Promise.all([
      supabase.from('billing_settings').select('*').maybeSingle(),
      supabase.from('factoring_companies').select('*').order('is_default', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setSettings((s.data as Settings) ?? null);
    setFactor(f.data ? { ...(f.data as Factor), fee_pct: Number((f.data as Factor).fee_pct) } : null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const move = (i: number, d: -1 | 1) => {
    if (!factor) return;
    const o = [...factor.packet_order];
    [o[i], o[i + d]] = [o[i + d], o[i]];
    setFactor({ ...factor, packet_order: o });
  };

  const save = async () => {
    if (!settings || !factor) return;
    setSaving(true);
    try {
      const { id: sid, ...sRest } = settings;
      const r1 = await supabase.from('billing_settings').update({
        remit_to_name: sRest.remit_to_name, remit_to_address_1: sRest.remit_to_address_1,
        remit_to_address_2: sRest.remit_to_address_2, remit_to_city: sRest.remit_to_city,
        remit_to_state: sRest.remit_to_state, remit_to_zip: sRest.remit_to_zip,
        remit_to_phone: sRest.remit_to_phone, remit_to_email: sRest.remit_to_email,
        payment_terms_days: Number(sRest.payment_terms_days),
      }).eq('id', sid);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('factoring_companies').update({
        name: factor.name, send_to_emails: factor.send_to_emails, cc_emails: factor.cc_emails,
        fee_pct: factor.fee_pct, packet_style: factor.packet_style, packet_order: factor.packet_order,
      }).eq('id', factor.id);
      if (r2.error) throw r2.error;
      toast({ title: 'Billing settings saved' });
      await load();
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (!settings || !factor) return <Card className="p-6 text-muted-foreground">Billing settings have not been set up for this company.</Card>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Billing Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where invoices are sent, and what the remit-to block on every invoice says.
          {!editable && ' You can view these settings; management edits them.'}
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Remit to</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {REMIT_FIELDS.map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} disabled={!editable} value={(settings[k] as string | null) ?? ''}
                onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="terms">Payment terms (days)</Label>
            <Input id="terms" type="number" min={0} disabled={!editable} value={settings.payment_terms_days}
              onChange={(e) => setSettings({ ...settings, payment_terms_days: Number(e.target.value) })} />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Factoring company</h2>
          {factor.is_default && <Badge variant="outline">Default</Badge>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="fname">Name</Label>
            <Input id="fname" disabled={!editable} value={factor.name} onChange={(e) => setFactor({ ...factor, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fee">Fee % (used only to flag payouts that do not add up)</Label>
            <Input id="fee" type="number" step="0.01" disabled={!editable} value={factor.fee_pct}
              onChange={(e) => setFactor({ ...factor, fee_pct: Number(e.target.value) })} />
          </div>
        </div>
        <EmailChips label="Send invoices to" list={factor.send_to_emails} other={factor.cc_emails} editable={editable}
          onChange={(l) => setFactor({ ...factor, send_to_emails: l })} />
        <EmailChips label="CC" list={factor.cc_emails} other={factor.send_to_emails} editable={editable}
          onChange={(l) => setFactor({ ...factor, cc_emails: l })} />
        <div className="space-y-2">
          <Label>Packet</Label>
          <div className="flex gap-2">
            {(['combined', 'separate'] as const).map((s) => (
              <Button key={s} type="button" size="sm" disabled={!editable}
                variant={factor.packet_style === s ? 'default' : 'outline'}
                onClick={() => setFactor({ ...factor, packet_style: s })}>
                {s === 'combined' ? 'One combined PDF' : 'Separate PDFs'}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Document order</Label>
          <ol className="space-y-1">
            {factor.packet_order.map((t, i) => (
              <li key={t} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                <span>{i + 1}. {docLabel(t)}</span>
                {editable && (
                  <span className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${docLabel(t)} up`}
                      disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${docLabel(t)} down`}
                      disabled={i === factor.packet_order.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      {editable && (
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save billing settings
        </Button>
      )}
    </div>
  );
}
