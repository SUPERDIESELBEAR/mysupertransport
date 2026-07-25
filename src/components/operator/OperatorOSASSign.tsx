import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, Pen, CheckCircle2, ArrowLeft, HardDrive, Cpu, Camera, Gauge, AlertTriangle,
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { useSignatureUrl } from '@/hooks/useSignatureUrl';

type DeviceType = 'eld' | 'dash_cam' | 'bestpass';

type Sheet = {
  id: string;
  operator_id: string;
  unit_number: string | null;
  assignment_date: string;
  status: 'draft' | 'sent' | 'signed' | 'void';
  bestpass_included: boolean;
  bestpass_fee_cents: number | null;
  terms_version: string;
  driver_signature_data_url: string | null;
  driver_signature_name: string | null;
  signed_at: string | null;
  sent_at: string | null;
  access_token: string | null;
};

type Item = {
  id: string;
  sheet_id: string;
  device_type: DeviceType;
  serial_snapshot: string;
  driver_confirmed_at: string | null;
};

const DEVICE_LABEL: Record<DeviceType, string> = {
  eld: 'ELD Unit',
  dash_cam: 'Dash Camera',
  bestpass: 'BestPass Transponder',
};

const DEVICE_ICON: Record<DeviceType, React.ReactNode> = {
  eld: <Cpu className="h-4 w-4 text-primary" />,
  dash_cam: <Camera className="h-4 w-4 text-primary" />,
  bestpass: <Gauge className="h-4 w-4 text-primary" />,
};

interface Props {
  onBack?: () => void;
  onComplete?: () => void;
}

export default function OperatorOSASSign({ onBack, onComplete }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [termsAck, setTermsAck] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);

  const tokenFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('osas_token');
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('onboard_assignment_sheets')
          .select('*')
          .in('status', ['sent', 'signed'])
          .order('sent_at', { ascending: false, nullsFirst: false })
          .limit(1);
        if (tokenFromUrl) {
          q = supabase
            .from('onboard_assignment_sheets')
            .select('*')
            .eq('access_token', tokenFromUrl)
            .limit(1);
        }
        const { data: sheets, error: sErr } = await q;
        if (sErr) throw sErr;
        const s = (sheets ?? [])[0] as Sheet | undefined;
        if (!s) {
          setSheet(null);
          return;
        }
        setSheet(s);
        setTypedName(s.driver_signature_name ?? '');

        const { data: rows, error: iErr } = await supabase
          .from('onboard_assignment_sheet_items')
          .select('*')
          .eq('sheet_id', s.id)
          .order('device_type');
        if (iErr) throw iErr;
        const parsed = (rows ?? []) as Item[];
        setItems(parsed);
        setConfirmedIds(new Set(parsed.filter(i => !!i.driver_confirmed_at).map(i => i.id)));
      } catch (e: any) {
        console.error('[OperatorOSASSign] load failed', e);
        toast.error(e?.message ?? 'Could not load assignment sheet');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tokenFromUrl]);

  const alreadySigned = sheet?.status === 'signed' && !!sheet?.signed_at;
  const allConfirmed = items.length > 0 && items.every(i => confirmedIds.has(i.id));
  const signature = useSignatureUrl(sheet?.driver_signature_data_url ?? null);

  const toggleConfirm = (itemId: string, checked: boolean) => {
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const handleSign = async () => {
    if (!sheet || !user) return;
    if (!allConfirmed) { toast.error('Confirm each device before signing'); return; }
    if (!termsAck) { toast.error('You must acknowledge the terms'); return; }
    if (!typedName.trim()) { toast.error('Type your full legal name'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('Draw your signature'); return; }

    setSaving(true);
    try {
      // 1. persist per-item confirmations that aren't already saved
      const nowIso = new Date().toISOString();
      const toStamp = items.filter(i => !i.driver_confirmed_at && confirmedIds.has(i.id));
      for (const it of toStamp) {
        const { error } = await supabase
          .from('onboard_assignment_sheet_items')
          .update({ driver_confirmed_at: nowIso })
          .eq('id', it.id);
        if (error) throw error;
      }

      // 2. upload signature image
      const dataUrl = sigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `osas/${sheet.operator_id}/${sheet.id}-${Date.now()}.png`;
      const { error: upErr } = await uploadToBucket('signatures', path, blob, {
        contentType: 'image/png',
        upsert: true,
      });
      if (upErr) throw upErr;

      // 3. finalize sheet
      const { error: uErr } = await supabase
        .from('onboard_assignment_sheets')
        .update({
          driver_signature_data_url: path,
          driver_signature_name: typedName.trim(),
          signed_at: nowIso,
          status: 'signed',
        })
        .eq('id', sheet.id);
      if (uErr) throw uErr;
      // Audit entry is written by the `trg_audit_osas_signed` trigger on
      // `onboard_assignment_sheets` (SECURITY DEFINER) — drivers can't insert
       // into `audit_log` directly under RLS.

      toast.success('Signed — thanks! Your onboard systems assignment is complete.');
      onComplete?.();
      // refresh local state
      setSheet({ ...sheet, status: 'signed', signed_at: nowIso, driver_signature_data_url: path, driver_signature_name: typedName.trim() });
    } catch (e: any) {
      console.error('[OperatorOSASSign] sign failed', e);
      toast.error(e?.message ?? 'Sign failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          No pending onboard systems assignment sheet was found for your account.
        </p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 animate-fade-in">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 h-8">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Onboard Systems Assignment Sheet</h2>
            <p className="text-xs text-muted-foreground">
              Unit {sheet.unit_number ?? '—'} · Assignment date{' '}
              {new Date(sheet.assignment_date + 'T12:00:00').toLocaleDateString('en-US')}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Devices issued to you
          </div>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No devices listed on this sheet.</p>
          )}
          {items.map(it => {
            const confirmed = confirmedIds.has(it.id);
            return (
              <label
                key={it.id}
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  confirmed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-muted/20'
                } ${alreadySigned ? 'pointer-events-none opacity-90' : ''}`}
              >
                <Checkbox
                  checked={confirmed}
                  disabled={alreadySigned}
                  onCheckedChange={c => toggleConfirm(it.id, c === true)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {DEVICE_ICON[it.device_type]}
                    {DEVICE_LABEL[it.device_type]}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Serial <span className="font-mono text-foreground">{it.serial_snapshot}</span>
                  </div>
                </div>
                {confirmed && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
              </label>
            );
          })}
        </div>

        <div className="rounded-md border border-gold/30 bg-gold/5 p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-gold font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Terms you are acknowledging
          </div>
          <ul className="list-disc pl-4 text-muted-foreground space-y-1">
            <li>Unreturned ELD equipment will be assessed a <strong className="text-foreground">$1,000.00</strong> replacement charge.</li>
            <li>Additional charges may be incurred for unreturned license plates or other issued equipment.</li>
            {sheet.bestpass_included && (
              <li>A BestPass transponder fee of <strong className="text-foreground">$60.00</strong> is acknowledged on this sheet.</li>
            )}
          </ul>
          <label className={`flex items-start gap-2 pt-1 ${alreadySigned ? 'pointer-events-none opacity-90' : 'cursor-pointer'}`}>
            <Checkbox
              checked={alreadySigned ? true : termsAck}
              disabled={alreadySigned}
              onCheckedChange={c => setTermsAck(c === true)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground">
              I have received the devices listed above and agree to these terms.
            </span>
          </label>
        </div>
      </div>

      {alreadySigned ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Signed on {sheet.signed_at ? new Date(sheet.signed_at).toLocaleString('en-US') : 'file'}
              {sheet.driver_signature_name ? ` by ${sheet.driver_signature_name}` : ''}.
            </span>
          </div>
          {signature.loading ? (
            <div className="flex h-24 w-40 items-center justify-center rounded border border-border bg-muted/30 text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Loading signature…
            </div>
          ) : signature.url ? (
            <img
              src={signature.url}
              alt="Your signature"
              className="max-h-24 bg-white border border-border rounded"
            />
          ) : sheet.driver_signature_data_url ? (
            <div className="flex h-24 w-40 items-center justify-center rounded border border-dashed border-border bg-muted/20 px-3 text-center text-xs text-muted-foreground">
              Signature image unavailable
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Pen className="h-3.5 w-3.5 text-primary" /> Your Signature
          </h3>
          <div>
            <Label className="text-xs">Full legal name</Label>
            <Input
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              className="h-9 text-sm"
              placeholder="e.g. John A. Smith"
            />
          </div>
          <div>
            <Label className="text-xs">Sign below</Label>
            <div className="border border-dashed border-border rounded-md bg-white mt-1">
              <SignatureCanvas
                ref={sigRef}
                penColor="#000"
                canvasProps={{ className: 'w-full h-32 rounded-md' }}
                onEnd={() => setHasDrawn(true)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] h-6 mt-1"
              onClick={() => { sigRef.current?.clear(); setHasDrawn(false); }}
            >
              Clear
            </Button>
          </div>
          <Button
            onClick={handleSign}
            disabled={saving || !allConfirmed || !termsAck || !hasDrawn || !typedName.trim()}
            className="w-full gap-1.5 bg-primary text-primary-foreground"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Sign Assignment Sheet
          </Button>
          {!allConfirmed && (
            <p className="text-[11px] text-muted-foreground text-center">
              Confirm each device above to enable signing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}