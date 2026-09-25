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
import { ArrowDown, ArrowUp, Eye, ImageUp, Loader2, Trash2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { previewInvoicePdf } from '@/lib/invoicePdf';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPLIES_WHEN, APPLIES_WHEN_LABEL, REQUIREMENT_LABEL, type RequiredChoice } from '@/lib/loadPaperwork';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAILS = 10;

export const DOC_LABELS: Record<string, string> = {
  invoice: 'Invoice', bol: 'BOL', pod: 'POD', rate_confirmation: 'Rate confirmation',
  revised_rate_confirmation: 'Revised rate confirmation', lumper_receipt: 'Lumper receipt',
  scale_ticket: 'Scale ticket', detention_documentation: 'Detention documentation',
};
const docLabel = (t: string) => DOC_LABELS[t] ?? REQUIREMENT_LABEL[t] ?? t.replace(/_/g, ' ');
type ReqRow = {
  id: string; document_type: string; required_before_invoicing: RequiredChoice;
  applies_when: string | null; in_packet: boolean; position: number;
};

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
  id: string; company_id: string; remit_to_name: string | null; remit_to_address_1: string | null;
  remit_to_address_2: string | null; remit_to_city: string | null; remit_to_state: string | null;
  remit_to_zip: string | null; remit_to_phone: string | null; remit_to_email: string | null;
  payment_terms_days: number; logo_storage_path: string | null; accent_color: string; footer_note: string | null;
  show_po_number: boolean; show_mc_usdot: boolean; show_order_date: boolean; show_pickup_date: boolean;
};
type Factor = {
  id: string; name: string; is_default: boolean; send_to_emails: string[]; cc_emails: string[];
  fee_pct: number; packet_style: 'combined' | 'separate';
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
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [either, setEither] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, f, r, e] = await Promise.all([
      supabase.from('billing_settings').select('*').maybeSingle(),
      supabase.from('factoring_companies').select('*').order('is_default', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('document_requirements').select('id, document_type, required_before_invoicing, applies_when, in_packet, position').order('position'),
      supabase.from('document_requirement_settings').select('bol_or_pod_either').maybeSingle(),
    ]);
    setReqs((r.data ?? []) as ReqRow[]);
    setEither(e.data?.bol_or_pod_either ?? true);
    setSettings(s.data ? {
      accent_color: '#C9A84C', footer_note: null, logo_storage_path: null,
      show_po_number: true, show_mc_usdot: true, show_order_date: true, show_pickup_date: true,
      ...(s.data as Settings),
    } : null);
    setFactor(f.data ? {
      ...(f.data as Factor), fee_pct: Number((f.data as Factor).fee_pct),
    } : null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const move = (i: number, d: -1 | 1) => {
    const o = [...reqs];
    [o[i], o[i + d]] = [o[i + d], o[i]];
    setReqs(o.map((row, k) => ({ ...row, position: k + 1 })));
  };
  const setReq = (i: number, patch: Partial<ReqRow>) => setReqs(reqs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

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
        payment_terms_days: Number(sRest.payment_terms_days), logo_storage_path: sRest.logo_storage_path,
        accent_color: sRest.accent_color, footer_note: sRest.footer_note, show_po_number: sRest.show_po_number,
        show_mc_usdot: sRest.show_mc_usdot, show_order_date: sRest.show_order_date, show_pickup_date: sRest.show_pickup_date,
      }).eq('id', sid);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('factoring_companies').update({
        name: factor.name, send_to_emails: factor.send_to_emails, cc_emails: factor.cc_emails,
        fee_pct: factor.fee_pct, packet_style: factor.packet_style,
      }).eq('id', factor.id);
      if (r2.error) throw r2.error;
      for (const row of reqs) {
        const r3 = await supabase.from('document_requirements').update({
          required_before_invoicing: row.required_before_invoicing, in_packet: row.in_packet, position: row.position,
        }).eq('id', row.id);
        if (r3.error) throw r3.error;
      }
      const r4 = await supabase.from('document_requirement_settings').update({ bol_or_pod_either: either }).eq('company_id', settings.company_id);
      if (r4.error) throw r4.error;
      toast({ title: 'Billing settings saved' });
      await load();
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const uploadLogo = async (file: File) => {
    if (!settings || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 1024 * 1024) {
      toast({ title: 'Logo not accepted', description: 'Choose a PNG or JPG up to 1 MB.', variant: 'destructive' }); return;
    }
    setLogoBusy(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${settings.company_id}/logo.${ext}`;
      if (settings.logo_storage_path && settings.logo_storage_path !== path) await supabase.storage.from('carrier-branding').remove([settings.logo_storage_path]);
      const { error } = await supabase.storage.from('carrier-branding').upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      setSettings({ ...settings, logo_storage_path: path });
      toast({ title: 'Logo uploaded', description: 'Save billing settings to use it on invoices.' });
    } catch (e) { toast({ title: 'Logo not uploaded', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
    finally { setLogoBusy(false); }
  };

  const removeLogo = async () => {
    if (!settings?.logo_storage_path) return;
    setLogoBusy(true);
    const { error } = await supabase.storage.from('carrier-branding').remove([settings.logo_storage_path]);
    if (error) toast({ title: 'Logo not removed', description: error.message, variant: 'destructive' });
    else setSettings({ ...settings, logo_storage_path: null });
    setLogoBusy(false);
  };

  const preview = async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.from('invoices').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('There is no invoice to preview yet.');
      await previewInvoicePdf(data.id);
    } catch (e) { toast({ title: 'Preview not opened', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
    finally { setPreviewing(false); }
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
        <h2 className="font-semibold">Invoice appearance</h2>
        <div className="flex flex-wrap items-center gap-3">
          {editable && <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <ImageUp className="h-4 w-4" /> {settings.logo_storage_path ? 'Replace logo' : 'Upload logo'}
            <input className="hidden" type="file" accept="image/png,image/jpeg" disabled={logoBusy}
              onChange={e => { const f=e.target.files?.[0]; e.target.value=''; if(f) void uploadLogo(f); }} />
          </Label>}
          {settings.logo_storage_path && editable && <Button type="button" variant="outline" size="sm" onClick={removeLogo} disabled={logoBusy}><Trash2 className="h-4 w-4 mr-2" />Remove logo</Button>}
          <span className="text-sm text-muted-foreground">{settings.logo_storage_path ? 'Logo ready' : 'Carrier name will be shown'}</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1"><Label htmlFor="accent">Accent color</Label><Input id="accent" type="color" className="h-10 w-20" disabled={!editable} value={settings.accent_color} onChange={e=>setSettings({...settings,accent_color:e.target.value})}/></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="footer">Footer note</Label><Input id="footer" maxLength={240} disabled={!editable} value={settings.footer_note ?? ''} onChange={e=>setSettings({...settings,footer_note:e.target.value})}/><p className="text-xs text-muted-foreground text-right">{(settings.footer_note ?? '').length}/240</p></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {([['show_po_number','PO number'],['show_mc_usdot','MC / USDOT'],['show_order_date','Order date'],['show_pickup_date','Pickup date']] as const).map(([key,label])=><div key={key} className="flex items-center justify-between rounded border px-3 py-2"><Label htmlFor={key}>{label}</Label><Switch id={key} disabled={!editable} checked={settings[key]} onCheckedChange={v=>setSettings({...settings,[key]:v})}/></div>)}
        </div>
        <Button type="button" variant="outline" onClick={preview} disabled={previewing}><Eye className="h-4 w-4 mr-2" />{previewing ? 'Opening…' : 'Preview invoice'}</Button>
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
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Required documents and packet</h2>
          <p className="text-sm text-muted-foreground mt-1">What must be on file before a load can be invoiced, what goes in the packet, and in which order. Drivers' paperwork reminders follow the same list.</p>
        </div>
        <div className="flex items-center justify-between rounded border px-3 py-2">
          <Label htmlFor="either">BOL or POD — either one is enough</Label>
          <Switch id="either" disabled={!editable} checked={either} onCheckedChange={setEither} />
        </div>
        <ol className="space-y-1">
          {reqs.map((r, i) => {
            const cond = APPLIES_WHEN[r.document_type];
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded border px-3 py-2 text-sm">
                <span className="flex-1 min-w-[10rem]">{i + 1}. {docLabel(r.document_type)}</span>
                {r.document_type !== 'invoice' && (
                  <Select disabled={!editable} value={r.required_before_invoicing}
                    onValueChange={v => setReq(i, { required_before_invoicing: v as RequiredChoice })}>
                    <SelectTrigger className="h-8 w-48" aria-label={`Required before invoicing: ${docLabel(r.document_type)}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Required: Always</SelectItem>
                      {cond && <SelectItem value="when_applies">Required: {APPLIES_WHEN_LABEL[cond]}</SelectItem>}
                      <SelectItem value="no">Required: No</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <span className="flex items-center gap-2">
                  <Switch aria-label={`In the packet: ${docLabel(r.document_type)}`} disabled={!editable || r.document_type === 'invoice'}
                    checked={r.in_packet} onCheckedChange={v => setReq(i, { in_packet: v })} />
                  <span className="text-muted-foreground">In packet</span>
                </span>
                {editable && (
                  <span className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${docLabel(r.document_type)} up`}
                      disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${docLabel(r.document_type)} down`}
                      disabled={i === reqs.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {editable && (
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save billing settings
        </Button>
      )}
    </div>
  );
}
