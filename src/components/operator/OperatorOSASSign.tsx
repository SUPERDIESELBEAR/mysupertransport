import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, Pen, CheckCircle2, ArrowLeft, HardDrive, Cpu, Camera, Gauge, AlertTriangle,
  RectangleHorizontal, FileText,
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { useSignatureUrl } from '@/hooks/useSignatureUrl';
import AssignmentSheetTerms, { ASSIGNMENT_SHEET_ACK_TEXT } from '@/components/equipment/AssignmentSheetTerms';
import { formatCdl } from '@/lib/cdlFormat';

type DeviceType = 'eld' | 'dash_cam' | 'license_plate' | 'registration' | 'bestpass';

type Sheet = {
  id: string;
  operator_id: string;
  unit_number: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_expiration: string | null;
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
  license_plate: 'License Plate',
  registration: 'Truck Registration',
  bestpass: 'BestPass Transponder',
};

const DEVICE_ICON: Record<DeviceType, React.ReactNode> = {
  eld: <Cpu className="h-4 w-4 text-primary" />,
  dash_cam: <Camera className="h-4 w-4 text-primary" />,
  license_plate: <RectangleHorizontal className="h-4 w-4 text-primary" />,
  registration: <FileText className="h-4 w-4 text-primary" />,
  bestpass: <Gauge className="h-4 w-4 text-primary" />,
};

const SIGNATURE_HEIGHT = 144;
const SIGNATURE_FALLBACK_WIDTH = 280;
const INK_ALPHA_THRESHOLD = 16;
const INK_CHANNEL_THRESHOLD = 245;

type SignatureCanvasSize = {
  cssWidth: number;
  cssHeight: number;
};

function getSignatureCanvasSize(host: HTMLDivElement | null): SignatureCanvasSize {
  const hostWidth = host ? Math.floor(host.getBoundingClientRect().width) : 0;
  const cssWidth = hostWidth > 0 ? hostWidth : SIGNATURE_FALLBACK_WIDTH;
  const cssHeight = SIGNATURE_HEIGHT;

  return { cssWidth, cssHeight };
}

function canvasHasVisibleInk(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !canvas.width || !canvas.height) return false;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    if (
      alpha > INK_ALPHA_THRESHOLD
      && (red < INK_CHANNEL_THRESHOLD || green < INK_CHANNEL_THRESHOLD || blue < INK_CHANNEL_THRESHOLD)
    ) {
      return true;
    }
  }

  return false;
}

function getSignatureDataUrl(sig: SignatureCanvas): string | null {
  const canvas = sig.getCanvas();
  if (!canvasHasVisibleInk(canvas)) return null;
  const trimmedCanvas = sig.getTrimmedCanvas();
  return canvasHasVisibleInk(trimmedCanvas) ? trimmedCanvas.toDataURL('image/png') : canvas.toDataURL('image/png');
}

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
  const [localSignedDataUrl, setLocalSignedDataUrl] = useState<string | null>(null);
  const [signatureCanvasSize, setSignatureCanvasSize] = useState<SignatureCanvasSize>(() => getSignatureCanvasSize(null));
  const signatureBoxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
        setLocalSignedDataUrl(null);

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
  const allConfirmed = alreadySigned || (items.length > 0 && items.every(i => confirmedIds.has(i.id)));
  const signature = useSignatureUrl(localSignedDataUrl ?? sheet?.driver_signature_data_url ?? null);
  const signatureNeedsReplacement = alreadySigned && (!!signature.blank || (!!sheet?.signed_at && !sheet?.driver_signature_data_url));
  const showSigningForm = !alreadySigned || signatureNeedsReplacement;
  const receiptMode = alreadySigned && !signatureNeedsReplacement;
  const termsAccepted = alreadySigned || termsAck;

  const measureSignatureCanvas = useCallback(() => {
    if (sigRef.current && !sigRef.current.isEmpty()) return;
    const host = signatureBoxRef.current;
    const next = getSignatureCanvasSize(host);
    setSignatureCanvasSize(prev => {
      if (prev.cssWidth === next.cssWidth && prev.cssHeight === next.cssHeight) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!showSigningForm) return;
    measureSignatureCanvas();
    const host = signatureBoxRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureSignatureCanvas());
    observer.observe(host);
    return () => observer.disconnect();
  }, [measureSignatureCanvas, showSigningForm]);

  useEffect(() => {
    if (!showSigningForm) return;
    const signaturePad = sigRef.current;
    if (!signaturePad) return;
    signaturePad.clear();
    setHasDrawn(false);
  }, [showSigningForm, signatureCanvasSize]);

  useEffect(() => {
    if (!receiptMode) return;
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [receiptMode]);

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
    if (!termsAccepted) { toast.error('You must acknowledge the terms'); return; }
    if (!typedName.trim()) { toast.error('Type your full legal name'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('Draw your signature'); return; }

    const dataUrl = getSignatureDataUrl(sigRef.current);
    if (!dataUrl) {
      toast.error('Signature was not captured. Please clear and sign again.');
      sigRef.current.clear();
      setHasDrawn(false);
      return;
    }

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
      // refresh local state
      setLocalSignedDataUrl(dataUrl);
      setSheet({ ...sheet, status: 'signed', signed_at: nowIso, driver_signature_data_url: path, driver_signature_name: typedName.trim() });
      onComplete?.();
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
    <div ref={rootRef} className="max-w-2xl mx-auto p-4 space-y-4 animate-fade-in">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 h-8">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
      )}

      {receiptMode ? (
        <>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Assignment Sheet Signed</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Unit {sheet.unit_number ?? '—'} · Assignment date{' '}
                  {new Date(sheet.assignment_date + 'T12:00:00').toLocaleDateString('en-US')}
                </p>
                {formatCdl(sheet.cdl_number, sheet.cdl_state, sheet.cdl_expiration) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    CDL {formatCdl(sheet.cdl_number, sheet.cdl_state, sheet.cdl_expiration)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Signed{sheet.driver_signature_name ? ` by ${sheet.driver_signature_name}` : ''} on{' '}
                  {sheet.signed_at ? new Date(sheet.signed_at).toLocaleString('en-US') : 'file'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">Devices issued to you</h3>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No devices listed on this sheet.</p>
            ) : (
              <div className="space-y-2">
                {items.map(it => (
                  <div
                    key={it.id}
                    className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {DEVICE_ICON[it.device_type]}
                        {DEVICE_LABEL[it.device_type]}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Serial <span className="font-mono text-foreground">{it.serial_snapshot}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <AssignmentSheetTerms
              bestpassIncluded={sheet.bestpass_included}
              acknowledgedBy={sheet.driver_signature_name}
              acknowledgedAt={sheet.signed_at ? new Date(sheet.signed_at).toLocaleString('en-US') : null}
            />

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Your signature
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
          </div>

          <Button
            onClick={() => (onBack ? onBack() : onComplete?.())}
            className="w-full gap-1.5 bg-primary text-primary-foreground"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </Button>
        </>
      ) : (
      <>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Onboard Systems Assignment Sheet</h2>
            <p className="text-xs text-muted-foreground">
              Unit {sheet.unit_number ?? '—'} · Assignment date{' '}
              {new Date(sheet.assignment_date + 'T12:00:00').toLocaleDateString('en-US')}
            </p>
            {formatCdl(sheet.cdl_number, sheet.cdl_state, sheet.cdl_expiration) && (
              <p className="text-xs text-muted-foreground">
                CDL {formatCdl(sheet.cdl_number, sheet.cdl_state, sheet.cdl_expiration)}
              </p>
            )}
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
            const confirmed = alreadySigned || confirmedIds.has(it.id);
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

        <div className="space-y-1.5">
          <AssignmentSheetTerms bestpassIncluded={sheet.bestpass_included} hideAcknowledgement />
          <label className={`flex items-start gap-2 pt-1 ${alreadySigned ? 'pointer-events-none opacity-90' : 'cursor-pointer'}`}>
            <Checkbox
              checked={alreadySigned ? true : termsAck}
              disabled={alreadySigned}
              onCheckedChange={c => setTermsAck(c === true)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground">
              {ASSIGNMENT_SHEET_ACK_TEXT}
            </span>
          </label>
        </div>
      </div>

      {alreadySigned && !signatureNeedsReplacement ? (
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
          ) : signature.blank ? (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Signature needs to be re-signed.
            </div>
          ) : sheet.driver_signature_data_url ? (
            <div className="flex h-24 w-40 items-center justify-center rounded border border-dashed border-border bg-muted/20 px-3 text-center text-xs text-muted-foreground">
              Signature image unavailable
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Pen className="h-3.5 w-3.5 text-primary" /> {signatureNeedsReplacement ? 'Re-sign Assignment Sheet' : 'Your Signature'}
          </h3>
          {signatureNeedsReplacement && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The previous signature image was blank or unavailable. Please sign again to replace it.
            </div>
          )}
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
            <div
              ref={signatureBoxRef}
              className="h-36 w-full min-w-0 rounded-md border border-dashed border-border bg-white mt-1 overflow-hidden touch-none overscroll-contain"
            >
              <SignatureCanvas
                ref={sigRef}
                penColor="#000"
                clearOnResize={false}
                canvasProps={{
                  width: signatureCanvasSize.cssWidth,
                  height: signatureCanvasSize.cssHeight,
                  className: 'block h-36 w-full rounded-md touch-none select-none',
                  style: {
                    width: `${signatureCanvasSize.cssWidth}px`,
                    height: `${signatureCanvasSize.cssHeight}px`,
                    maxWidth: '100%',
                  },
                }}
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
            disabled={saving || !allConfirmed || !termsAccepted || !hasDrawn || !typedName.trim()}
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
      </>
      )}
    </div>
  );
}