import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Cpu, Camera, Gauge, CreditCard, FileText, Loader2, Lock, Mail, Package, Pen, Upload, X, ExternalLink, Truck, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { updatePayload } from '@/integrations/supabase/helpers';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useScrollIntoViewOnOpen } from '@/hooks/useScrollIntoViewOnOpen';
import { toast } from 'sonner';
import { withTimeout } from '@/lib/withTimeout';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { PreviewLink } from '@/components/documents/PreviewLink';
import { validateFile } from '@/lib/validateFile';
import { format, parseISO } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type AssignmentState = 'prior' | 'during' | 'not_assigned';
type DeliveryMethod = 'shipped' | 'orientation' | 'on_site' | 'awaiting_return' | 'not_assigned';
type EquipmentLine = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card' | 'decal';

interface LineConfig {
  key: EquipmentLine;
  label: string;
  icon: React.ReactNode;
  serialColumn: string | null;
  verifiedAtColumn: string | null;
  verifiedByColumn: string | null;
}

const LINES: LineConfig[] = [
  { key: 'eld',       label: 'ELD Unit',    icon: <Cpu className="h-4 w-4" />,        serialColumn: 'eld_serial_number',  verifiedAtColumn: 'eld_verified_at',       verifiedByColumn: 'eld_verified_by' },
  { key: 'dash_cam',  label: 'Dash Cam',    icon: <Camera className="h-4 w-4" />,     serialColumn: 'dash_cam_number',    verifiedAtColumn: 'dash_cam_verified_at',  verifiedByColumn: 'dash_cam_verified_by' },
  { key: 'bestpass',  label: 'BestPass',    icon: <Gauge className="h-4 w-4" />,      serialColumn: 'bestpass_number',    verifiedAtColumn: 'bestpass_verified_at',  verifiedByColumn: 'bestpass_verified_by' },
  { key: 'fuel_card', label: 'Fuel Card',   icon: <CreditCard className="h-4 w-4" />, serialColumn: 'fuel_card_number',   verifiedAtColumn: 'fuel_card_verified_at', verifiedByColumn: 'fuel_card_verified_by' },
  { key: 'decal',     label: 'Decal',       icon: <Truck className="h-4 w-4" />,      serialColumn: null,                 verifiedAtColumn: null,                    verifiedByColumn: null },
];

const STATE_LABELS: Record<AssignmentState, string> = {
  prior: 'Assigned Prior to Onboarding',
  during: 'Assigned During Onboarding',
  not_assigned: 'Not Assigned',
};

const STATE_BADGE: Record<AssignmentState, string> = {
  prior: 'bg-primary/10 text-primary border-primary/30',
  during: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  not_assigned: 'bg-muted text-muted-foreground border-border',
};

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: 'shipped',     label: 'Shipped to Driver' },
  { value: 'orientation', label: 'Installed at Orientation' },
];

const DELIVERY_LABEL: Record<DeliveryMethod, string> = DELIVERY_OPTIONS.reduce(
  (acc, o) => { acc[o.value] = o.label; return acc; },
  {} as Record<DeliveryMethod, string>,
);

const CARRIER_OPTIONS = ['UPS', 'USPS', 'FedEx', 'Other'] as const;

interface Receipt {
  id: string;
  equipment_line: EquipmentLine | null;
  direction: 'inbound' | 'return';
  carrier: string | null;
  tracking_number: string | null;
  file_url: string;
  file_name: string | null;
  uploaded_by: string | null;
  uploader_role: 'management' | 'driver';
  uploaded_at: string;
  uploader_display?: string | null;
}

export interface EquipmentAssetSheetProps {
  mode: 'driver' | 'management';
  operatorId: string;
  status: Record<string, any> | null;
  onStatusRefresh?: () => void;
  readOnly?: boolean;
}

export default function EquipmentAssetSheet({
  mode,
  operatorId,
  status,
  onStatusRefresh,
  readOnly,
}: EquipmentAssetSheetProps) {
  const { user } = useAuth();
  const { guardDemo } = useDemoMode();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('Shipping Receipt');
  const [, setSavingField] = useState<string | null>(null);

  const signed = !!status?.eld_signature_signed_at;
  // Collapsed by default; auto-expand once the sheet has been signed so the
  // completed record is immediately visible on load.
  const [expanded, setExpanded] = useState<boolean>(signed);
  const containerRef = useScrollIntoViewOnOpen<HTMLDivElement>(expanded);
  // If the signed flag flips (e.g. driver signs while the card is open), keep
  // the card open so the confirmation is visible without an extra tap.
  useEffect(() => { if (signed) setExpanded(true); }, [signed]);
  const canManage = mode === 'management' && !readOnly;

  const [buffer, setBuffer] = useState<Record<string, any>>({});
  useEffect(() => { setBuffer({}); }, [operatorId]);

  const value = useCallback((col: string) => {
    if (col in buffer) return buffer[col];
    return status?.[col] ?? '';
  }, [buffer, status]);

  const patchStatus = useCallback(async (patch: Record<string, any>) => {
    if (guardDemo()) return;
    if (!operatorId) return;
    setSavingField(Object.keys(patch)[0] ?? null);
    try {
      const { error } = await supabase
        .from('onboarding_status')
        .update(updatePayload('onboarding_status', patch))
        .eq('operator_id', operatorId);
      if (error) throw error;
      onStatusRefresh?.();
    } catch (err: any) {
      console.error('[EquipmentAssetSheet] patch failed', err);
      toast.error("Couldn't save that change. Please try again.");
    } finally {
      setSavingField(null);
    }
  }, [guardDemo, operatorId, onStatusRefresh]);

  // ── Receipts ──
  const fetchReceipts = useCallback(async () => {
    if (!operatorId) return;
    const { data, error } = await supabase
      .from('equipment_receipts')
      .select('id, equipment_line, direction, carrier, tracking_number, file_url, file_name, uploaded_by, uploader_role, uploaded_at')
      .eq('operator_id', operatorId)
      .order('uploaded_at', { ascending: false });
    if (error) { console.warn('[EquipmentAssetSheet] receipts fetch failed', error); return; }
    const rows = (data ?? []) as Receipt[];
    const uploaderIds = Array.from(new Set(rows.map(r => r.uploaded_by).filter(Boolean))) as string[];
    const nameMap: Record<string, string> = {};
    if (uploaderIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', uploaderIds);
      for (const p of profs ?? []) {
        nameMap[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ');
      }
    }
    setReceipts(rows.map(r => ({
      ...r,
      uploader_display: r.uploader_role === 'driver'
        ? 'Driver'
        : `Management${r.uploaded_by && nameMap[r.uploaded_by] ? ` — ${nameMap[r.uploaded_by]}` : ''}`,
    })));
  }, [operatorId]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  // ── Signature ──
  const sigRef = useRef<SignatureCanvas>(null);
  const [typedName, setTypedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signing, setSigning] = useState(false);

  const handleExecute = async () => {
    if (guardDemo()) return;
    if (!typedName.trim()) { toast.error('Please type your full name.'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('Please draw your signature.'); return; }
    setSigning(true);
    let step: 'upload' | 'signed_url' | 'execute' = 'upload';
    try {
      const dataUrl = sigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${operatorId}/equipment-asset-sheet/signature-${Date.now()}.png`;
      step = 'upload';
      const { error: upErr, authUid, sessionExpired } = await uploadToBucket(
        'operator-documents',
        path,
        blob,
        { contentType: 'image/png', upsert: true },
      );
      if (upErr) { console.error('[EquipmentAssetSheet/signature] upload failed', { authUid, sessionExpired, message: upErr.message }); throw upErr; }
      step = 'signed_url';
      const { data: signedUrl } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const imageUrl = signedUrl?.signedUrl ?? null;
      if (!imageUrl) throw new Error('signed url failed');

      step = 'execute';
      const { error } = await (supabase as any).rpc('execute_equipment_asset_signature', {
        p_operator_id: operatorId,
        p_typed_name: typedName.trim(),
        p_signature_image_url: imageUrl,
      });
      if (error) throw error;

      toast.success('Signature recorded.');
      onStatusRefresh?.();
    } catch (err: any) {
      console.error(`[EquipmentAssetSheet] signature save failed at step=${step}`, err);
      const msg = err?.message || err?.error_description || err?.error || null;
      toast.error(msg ? `Couldn't save signature (${step}): ${msg}` : 'Something went wrong while saving your signature. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  // ── Receipt upload ──
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  // ── Send Return Instructions (management) ──
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendingInstructions, setSendingInstructions] = useState(false);
  const assignedForReturn = useMemo(
    () => LINES.filter(l => {
      const state = status?.[`${l.key}_assignment_state`] as AssignmentState | undefined;
      return state && state !== 'not_assigned';
    }),
    [status],
  );
  const sendReturnInstructions = async () => {
    if (guardDemo()) return;
    if (!operatorId) return;
    setSendingInstructions(true);
    try {
      // 1. Flip assigned lines to awaiting_return so the driver sees the uploader.
      const patch: Record<string, any> = {
        return_instructions_sent_at: new Date().toISOString(),
        return_instructions_sent_by: user?.id ?? null,
      };
      for (const l of assignedForReturn) {
        const dm = status?.[`${l.key}_delivery_method`] as DeliveryMethod | undefined;
        if (dm !== 'awaiting_return') {
          patch[`${l.key}_delivery_method`] = 'awaiting_return';
          patch[`${l.key}_awaiting_return_shipment`] = true;
          patch[`${l.key}_shipped_to_driver`] = false;
        }
      }
      const { error: patchErr } = await supabase
        .from('onboarding_status')
        .update(updatePayload('onboarding_status', patch))
        .eq('operator_id', operatorId);
      if (patchErr) throw patchErr;

      // 2. Look up driver email + name.
      const { data: op } = await supabase
        .from('operators')
        .select('applications(first_name, last_name, email)')
        .eq('id', operatorId)
        .maybeSingle();
      const app = (op as any)?.applications;
      const email = app?.email as string | undefined;
      const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Driver';
      if (!email) {
        toast.error("We saved the return flags but couldn't find the driver's email on file.");
        return;
      }

      // 3. Fire email via transactional-email function.
      const items = assignedForReturn.map(l => ({
        label: l.label,
        serial: l.serialColumn ? ((status?.[l.serialColumn] as string | null) ?? null) : null,
      }));
      const portalUrl = `${window.location.origin}/status`;
      const { error: fnErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'equipment-return-instructions',
          recipientEmail: email,
          templateData: { driverName, items, portalUrl },
        },
      });
      if (fnErr) throw fnErr;

      toast.success(`Return instructions emailed to ${email}.`);
      onStatusRefresh?.();
      setSendDialogOpen(false);
    } catch (err: any) {
      console.error('[EquipmentAssetSheet] send return instructions failed', err);
      toast.error(err?.message || "Couldn't send return instructions. Please try again.");
    } finally {
      setSendingInstructions(false);
    }
  };

  const uploadShipmentReceipt = async (
    direction: 'inbound' | 'return',
    formId: string,
    file: File,
    carrier: string | null,
    tracking: string | null,
  ) => {
    if (guardDemo()) return;
    if (!user?.id) { toast.error('You must be signed in.'); return; }
    const check = validateFile(file, true);
    if (!check.valid) { toast.error(check.error ?? 'Invalid file'); return; }
    setUploadingKey(`${direction}-${formId}`);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `equipment-receipts/${operatorId}/${direction}-${Date.now()}.${ext}`;
      const { error: upErr, authUid, sessionExpired } = await uploadToBucket(
        'operator-documents',
        path,
        file,
        { upsert: true },
      );
      if (upErr) { console.error('[EquipmentAssetSheet/receipt] upload failed', { authUid, sessionExpired, message: upErr.message }); throw upErr; }
      const { data: signedUrl } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedUrl?.signedUrl;
      if (!url) throw new Error('signed url failed');

      const { error } = await supabase.from('equipment_receipts').insert({
        operator_id: operatorId,
        equipment_line: null,
        direction,
        carrier: carrier || null,
        tracking_number: tracking || null,
        file_url: url,
        file_name: file.name,
        uploaded_by: user.id,
        uploader_role: mode === 'management' ? 'management' : 'driver',
      });
      if (error) {
        await supabase.storage.from('operator-documents').remove([path]).catch(() => {});
        throw error;
      }
      toast.success('Receipt uploaded.');
      fetchReceipts();
    } catch (err: any) {
      console.error('[EquipmentAssetSheet] receipt upload failed', err);
      toast.error("We couldn't upload that receipt. Please try again.");
    } finally {
      setUploadingKey(null);
    }
  };

  const inboundReceipts = useMemo(() => receipts.filter(r => r.direction === 'inbound'), [receipts]);
  const returnReceipts  = useMemo(() => receipts.filter(r => r.direction === 'return'),  [receipts]);

  const anyAwaitingReturn = useMemo(
    () => LINES.some(l => (status?.[`${l.key}_delivery_method`] as DeliveryMethod | undefined) === 'awaiting_return'),
    [status],
  );

  const showInboundBlock = mode === 'management' || inboundReceipts.length > 0;
  // Driver may upload return receipts when at least one line is awaiting return.
  const driverMayUploadReturn = mode === 'driver' && !readOnly && anyAwaitingReturn;
  const showReturnBlock = mode === 'management' || driverMayUploadReturn || returnReceipts.length > 0;

  const openPreview = (url: string, name: string) => { setPreviewUrl(url); setPreviewName(name); };

  // Verification helpers ─────────────────────────────────────
  const isLineAssigned = (cfg: LineConfig) => {
    const state = (status?.[`${cfg.key}_assignment_state`] as AssignmentState | undefined) ?? 'not_assigned';
    return state !== 'not_assigned';
  };
  const isLineVerified = (cfg: LineConfig) => {
    if (!cfg.verifiedAtColumn) return true; // Decal has no verification
    return !!status?.[cfg.verifiedAtColumn];
  };
  const requiresVerification = (cfg: LineConfig) => cfg.verifiedAtColumn && isLineAssigned(cfg);
  const unverifiedLines = LINES.filter(cfg => requiresVerification(cfg) && !isLineVerified(cfg));
  const allAssignedVerified = unverifiedLines.length === 0;

  const setVerified = (cfg: LineConfig, verified: boolean) => {
    if (!cfg.verifiedAtColumn || !cfg.verifiedByColumn) return;
    patchStatus({
      [cfg.verifiedAtColumn]: verified ? new Date().toISOString() : null,
      [cfg.verifiedByColumn]: verified ? (user?.id ?? null) : null,
    });
  };

  // When a serial changes, clear its verified stamp so staff must re-verify.
  const commitSerial = (cfg: LineConfig) => {
    if (!cfg.serialColumn) return;
    if (buffer[cfg.serialColumn] === undefined) return;
    const newSerial = buffer[cfg.serialColumn] || null;
    const prevSerial = (status?.[cfg.serialColumn] as string | null) ?? null;
    const patch: Record<string, any> = { [cfg.serialColumn]: newSerial };
    if (newSerial !== prevSerial && cfg.verifiedAtColumn && cfg.verifiedByColumn) {
      patch[cfg.verifiedAtColumn] = null;
      patch[cfg.verifiedByColumn] = null;
    }
    patchStatus(patch);
  };

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-5 scroll-mt-20">
      {/* Header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="equipment-asset-sheet-body"
        className="w-full flex items-start justify-between gap-3 text-left -m-1 p-1 rounded-lg hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Equipment Asset Sheet</h3>
            <p className="text-xs text-muted-foreground truncate">
              {signed
                ? `Signed ${format(parseISO(status!.eld_signature_signed_at), 'MMM d, yyyy')}`
                : expanded
                  ? mode === 'driver'
                    ? 'Review your equipment, then sign below.'
                    : 'Set assignment status and log return details.'
                  : 'Tap to open'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {signed && (
            <Badge variant="outline" className="text-[10px] gap-1 bg-status-complete/10 text-status-complete border-status-complete/30">
              <Lock className="h-3 w-3" /> Locked
            </Badge>
          )}
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
      <div id="equipment-asset-sheet-body" className="space-y-5">
      {/* Outbound Shipment Receipts */}
      {showInboundBlock && (
        <ShipmentReceiptsBlock
          direction="inbound"
          title="Outbound Shipment Receipts"
          subtitle="One or more receipts covering equipment shipped to the driver."
          canUpload={mode === 'management' && !readOnly}
          uploadingKey={uploadingKey}
          receipts={inboundReceipts}
          onUpload={(formId, file, carrier, tracking) => uploadShipmentReceipt('inbound', formId, file, carrier, tracking)}
          onPreview={openPreview}
        />
      )}

      {/* Equipment lines */}
      <div className="space-y-3">
        {LINES.map(cfg => (
          <EquipmentLineRow
            key={cfg.key}
            cfg={cfg}
            mode={mode}
            canManage={canManage && !signed}
            signedLock={signed}
            state={(status?.[`${cfg.key}_assignment_state`] as AssignmentState | undefined) ?? 'not_assigned'}
            serialColumn={cfg.serialColumn}
            serialValue={cfg.serialColumn ? (value(cfg.serialColumn) as string ?? '') : ''}
            deliveryMethod={(status?.[`${cfg.key}_delivery_method`] as DeliveryMethod | undefined) ?? null}
            verifiedAt={cfg.verifiedAtColumn ? (status?.[cfg.verifiedAtColumn] as string | null) ?? null : null}
            onToggleVerified={(v) => setVerified(cfg, v)}
            onStateChange={s => patchStatus({
              [`${cfg.key}_assignment_state`]: s,
              ...(s === 'not_assigned' && cfg.serialColumn ? { [cfg.serialColumn]: null } : {}),
              // Clearing to "not_assigned" also clears the verified stamp for this line.
              ...(s === 'not_assigned' && cfg.verifiedAtColumn && cfg.verifiedByColumn
                ? { [cfg.verifiedAtColumn]: null, [cfg.verifiedByColumn]: null }
                : {}),
            })}
            onSerialChange={v => setBuffer(b => ({ ...b, [cfg.serialColumn!]: v }))}
            onSerialCommit={() => commitSerial(cfg)}
            onDeliveryChange={m => {
              const patch: Record<string, any> = { [`${cfg.key}_delivery_method`]: m };
              // Keep the legacy boolean flags in sync so any older readers still work.
              patch[`${cfg.key}_shipped_to_driver`] = m === 'shipped';
              patch[`${cfg.key}_awaiting_return_shipment`] = m === 'awaiting_return';
              // Selecting "Not Assigned" here also flips the assignment status.
              if (m === 'not_assigned') {
                patch[`${cfg.key}_assignment_state`] = 'not_assigned';
                if (cfg.serialColumn) patch[cfg.serialColumn] = null;
                if (cfg.verifiedAtColumn && cfg.verifiedByColumn) {
                  patch[cfg.verifiedAtColumn] = null;
                  patch[cfg.verifiedByColumn] = null;
                }
              }
              patchStatus(patch);
            }}
          />
        ))}
      </div>

      {/* Driver Acknowledgment signature block */}
      <div className="rounded-lg border border-border bg-surface/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Pen className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Owner Operator Equipment Receipt Acknowledgment</h4>
        </div>
        {signed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-status-complete font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Signed by {status?.eld_signature_typed_name} on{' '}
              {format(parseISO(status!.eld_signature_signed_at), 'MMMM d, yyyy · h:mm a')}
            </div>
            {status?.eld_signature_image_url && (
              <div className="border border-border rounded bg-white p-2 inline-block">
                <img src={status.eld_signature_image_url} alt="Driver signature" className="h-16 object-contain" />
              </div>
            )}
          </div>
        ) : mode === 'driver' && !readOnly ? (
          <div className="space-y-3">
            {!allAssignedVerified ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Staff is still verifying your equipment ({unverifiedLines.map(l => l.label).join(', ')}). You'll be able to sign once verification is complete.
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                I acknowledge receipt of the equipment listed above. The signed date will be applied automatically.
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="eld-typed-name" className="text-xs">Type your full name</Label>
              <Input
                id="eld-typed-name"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="First Last"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sign with your finger</Label>
              <div className="rounded border border-border bg-white touch-none">
                <SignatureCanvas
                  ref={sigRef}
                  canvasProps={{ className: 'w-full h-32' }}
                  onEnd={() => setHasDrawn(true)}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { sigRef.current?.clear(); setHasDrawn(false); }}
                >
                  Clear
                </Button>
              </div>
            </div>
            <Button
              onClick={handleExecute}
              disabled={signing || !typedName.trim() || !hasDrawn || !allAssignedVerified}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold gap-2"
            >
              {signing ? <><Loader2 className="h-4 w-4 animate-spin" /> Executing…</> : <><CheckCircle2 className="h-4 w-4" /> Execute</>}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Waiting on the driver to sign.
          </p>
        )}
      </div>

      {/* Management: Equipment return date */}
      {mode === 'management' && !readOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-700" />
            <h4 className="text-sm font-semibold text-amber-900">Equipment Return (Management)</h4>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setSendDialogOpen(true)}
              disabled={assignedForReturn.length === 0}
              className="h-8 gap-2 bg-amber-600 text-white hover:bg-amber-700"
            >
              <Mail className="h-3.5 w-3.5" />
              {status?.return_instructions_sent_at ? 'Resend Return Instructions' : 'Send Return Instructions'}
            </Button>
            {status?.return_instructions_sent_at && (
              <span className="text-[11px] text-amber-900/80">
                Emailed {format(parseISO(status.return_instructions_sent_at as string), 'MMM d, yyyy · h:mm a')}
              </span>
            )}
            {status?.equipment_return_completed_at && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-status-complete/10 text-status-complete border-status-complete/30">
                <CheckCircle2 className="h-3 w-3" />
                Return receipt received {format(parseISO(status.equipment_return_completed_at as string), 'MMM d')}
              </Badge>
            )}
          </div>
          {assignedForReturn.length === 0 && (
            <p className="text-[11px] text-amber-900/70">
              No equipment is currently marked as assigned to this driver — nothing to send return instructions for.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Return Date</Label>
              <DateInput
                value={(status?.equipment_return_date as string | null) ?? ''}
                onChange={v => patchStatus({ equipment_return_date: v || null })}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                defaultValue={(status?.equipment_return_notes as string | null) ?? ''}
                onBlur={e => {
                  const v = e.currentTarget.value;
                  if ((status?.equipment_return_notes ?? '') !== v) {
                    patchStatus({ equipment_return_notes: v || null });
                  }
                }}
                placeholder="Return condition, missing items, etc."
                className="text-sm min-h-[60px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Return Shipment Receipts */}
      {showReturnBlock && (
        <div className="space-y-2">
          {status?.return_instructions_sent_at && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
              <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>
                {mode === 'driver'
                  ? `We emailed you the mailing instructions on ${format(parseISO(status.return_instructions_sent_at as string), 'MMM d, yyyy')}. Ship your equipment to the UPS Store or the P.O. Box listed in that email, then upload your shipping receipt below.`
                  : `Return instructions emailed to the driver on ${format(parseISO(status.return_instructions_sent_at as string), 'MMM d, yyyy · h:mm a')}.`}
              </span>
            </div>
          )}
          <ShipmentReceiptsBlock
            direction="return"
            title="Return Shipment Receipts"
            subtitle={
              mode === 'driver'
                ? 'Upload a receipt for equipment you shipped back.'
                : 'One or more receipts covering equipment returned by the driver.'
            }
            canUpload={(mode === 'management' && !readOnly) || driverMayUploadReturn}
            uploadingKey={uploadingKey}
            receipts={returnReceipts}
            onUpload={(formId, file, carrier, tracking) => uploadShipmentReceipt('return', formId, file, carrier, tracking)}
            onPreview={openPreview}
          />
        </div>
      )}

      {/* Read-only return summary for driver hub */}
      {mode === 'driver' && readOnly && status?.equipment_return_date && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <span className="font-semibold">Equipment Returned:</span>{' '}
          {format(parseISO(status.equipment_return_date + 'T12:00:00'), 'MMM d, yyyy')}
          {status.equipment_return_notes && (
            <p className="text-muted-foreground mt-1">{status.equipment_return_notes}</p>
          )}
        </div>
      )}

      {previewUrl && (
        <FilePreviewModal
          url={previewUrl}
          name={previewName}
          onClose={() => setPreviewUrl(null)}
          bucketName="operator-documents"
        />
      )}
      </div>
      )}

      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send return instructions to driver?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email the driver the Equipment Asset Sheet and both mailing
              addresses (UPS Store #4564 in Russellville and the Dover P.O. Box), and
              flip the items below to "Awaiting Return" so the driver can upload a
              shipping receipt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
            {assignedForReturn.length === 0 ? (
              <span className="text-muted-foreground">No assigned equipment on file.</span>
            ) : (
              assignedForReturn.map(l => {
                const serial = l.serialColumn ? (status?.[l.serialColumn] as string | null) : null;
                return (
                  <div key={l.key} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{l.label}</span>
                    <span className="text-muted-foreground">{serial ? `Serial ${serial}` : '—'}</span>
                  </div>
                );
              })
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingInstructions}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); sendReturnInstructions(); }}
              disabled={sendingInstructions || assignedForReturn.length === 0}
              className="gap-2"
            >
              {sendingInstructions ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Mail className="h-4 w-4" /> Send Email</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Per-equipment line row
// ─────────────────────────────────────────────────────────────

interface RowProps {
  cfg: LineConfig;
  mode: 'driver' | 'management';
  canManage: boolean;
  signedLock: boolean;
  state: AssignmentState;
  serialColumn: string | null;
  serialValue: string;
  deliveryMethod: DeliveryMethod | null;
  verifiedAt: string | null;
  onToggleVerified: (verified: boolean) => void;
  onStateChange: (s: AssignmentState) => void;
  onSerialChange: (v: string) => void;
  onSerialCommit: () => void;
  onDeliveryChange: (m: DeliveryMethod) => void;
}

function EquipmentLineRow(props: RowProps) {
  const {
    cfg, mode, canManage, signedLock, state, serialColumn, serialValue,
    deliveryMethod, verifiedAt, onToggleVerified,
    onStateChange, onSerialChange, onSerialCommit, onDeliveryChange,
  } = props;

  const supportsVerification = !!cfg.verifiedAtColumn;
  const isAssigned = state !== 'not_assigned';
  const isVerified = !!verifiedAt;
  const showVerificationUI = supportsVerification && isAssigned;

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-primary/8 text-primary shrink-0">
            {cfg.icon}
          </span>
          <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
          {showVerificationUI && (
            isVerified ? (
              <Badge variant="outline" className="text-[10px] gap-1 bg-status-complete/10 text-status-complete border-status-complete/30">
                <ShieldCheck className="h-3 w-3" />
                Verified {format(parseISO(verifiedAt!), 'MMM d')}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-700 border-amber-500/30">
                <ShieldAlert className="h-3 w-3" />
                Unverified
              </Badge>
            )
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mode === 'driver' ? (
            deliveryMethod && deliveryMethod !== 'not_assigned' ? (
              <Badge variant="outline" className="text-[10px] bg-muted/60 border-border">
                {DELIVERY_LABEL[deliveryMethod]}
              </Badge>
            ) : (
              <Badge variant="outline" className={`text-[10px] ${STATE_BADGE[state]}`}>
                {STATE_LABELS[state]}
              </Badge>
            )
          ) : (
            <>
              <Badge variant="outline" className={`text-[10px] ${STATE_BADGE[state]}`}>
                {STATE_LABELS[state]}
              </Badge>
              {deliveryMethod && deliveryMethod !== 'not_assigned' && (
                <Badge variant="outline" className="text-[10px] bg-muted/60 border-border">
                  {DELIVERY_LABEL[deliveryMethod]}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Auto-filled hint (management, before verification) */}
      {mode === 'management' && showVerificationUI && !isVerified && serialValue && (
        <p className="text-[11px] text-muted-foreground italic">
          Auto-filled from Inventory — review the serial and mark Verified to confirm.
        </p>
      )}

      {/* Management controls */}
      {canManage && (
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
            <Select value={state} onValueChange={v => onStateChange(v as AssignmentState)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prior">Assigned Prior to Onboarding</SelectItem>
                <SelectItem value="during">Assigned During Onboarding</SelectItem>
                <SelectItem value="not_assigned">Not Assigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {serialColumn && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Serial / Number</Label>
              <Input
                value={serialValue}
                onChange={e => onSerialChange(e.target.value)}
                onBlur={onSerialCommit}
                disabled={state === 'not_assigned'}
                placeholder={state === 'not_assigned' ? '—' : 'Enter number'}
                className="h-8 text-sm font-mono"
              />
            </div>
          )}
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery Method</Label>
            <div className="flex flex-wrap gap-1.5">
              {DELIVERY_OPTIONS.map(opt => {
                const active = deliveryMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onDeliveryChange(opt.value)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-border hover:bg-muted/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Staff verified checkbox */}
      {canManage && showVerificationUI && (
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isVerified}
            onChange={e => onToggleVerified(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span>
            Verified — I confirm this {cfg.label.toLowerCase()} serial matches the device in the driver's possession.
          </span>
        </label>
      )}

      {/* Driver read-only summary */}
      {mode === 'driver' && serialColumn && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Number:</span>{' '}
          <span className="font-mono">{serialValue || '—'}</span>
        </p>
      )}

      {/* Locked read-only in management once signed */}
      {mode === 'management' && signedLock && serialColumn && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Number:</span>{' '}
          <span className="font-mono">{serialValue || '—'}</span>
          <span className="ml-2 text-[10px] text-muted-foreground/70">(locked after signature)</span>
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shipment receipts block (outbound or return)
// ─────────────────────────────────────────────────────────────

interface ShipmentBlockProps {
  direction: 'inbound' | 'return';
  title: string;
  subtitle: string;
  canUpload: boolean;
  uploadingKey: string | null;
  receipts: Receipt[];
  onUpload: (formId: string, file: File, carrier: string | null, tracking: string | null) => void;
  onPreview: (url: string, name: string) => void;
}

function ShipmentReceiptsBlock({
  direction, title, subtitle, canUpload, uploadingKey, receipts, onUpload, onPreview,
}: ShipmentBlockProps) {
  const [formIds, setFormIds] = useState<string[]>(() => canUpload ? ['0'] : []);

  useEffect(() => {
    if (canUpload && formIds.length === 0) setFormIds(['0']);
  }, [canUpload, formIds.length]);

  const removeForm = (id: string) => {
    setFormIds(ids => ids.length > 1 ? ids.filter(x => x !== id) : ids);
  };
  const addForm = () => setFormIds(ids => [...ids, String(Date.now())]);
  const resetForm = (id: string) => {
    // Replace the id so the form re-mounts with fresh state
    setFormIds(ids => ids.map(x => x === id ? String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6) : x));
  };

  return (
    <div className="rounded-lg border border-border bg-surface/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
      </div>

      {/* Existing receipts */}
      {receipts.length > 0 && (
        <div className="space-y-1.5">
          {receipts.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                  <button
                    type="button"
                    className="truncate font-medium text-foreground hover:underline text-left"
                    onClick={() => onPreview(r.file_url, r.file_name ?? 'Shipping Receipt')}
                  >
                    {r.file_name ?? 'Receipt'}
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {r.uploader_display} · {format(parseISO(r.uploaded_at), 'MMM d, yyyy')}
                  {r.carrier && ` · ${r.carrier}`}
                  {r.tracking_number && ` · ${r.tracking_number}`}
                </div>
              </div>
              <PreviewLink
                url={r.file_url}
                name={`Receipt — ${r.uploader_display}`}
                className="shrink-0 text-primary hover:text-primary/80"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </PreviewLink>
            </div>
          ))}
        </div>
      )}

      {/* Upload forms */}
      {canUpload && (
        <div className="space-y-2">
          {formIds.map((id, i) => (
            <ReceiptForm
              key={id}
              formId={id}
              direction={direction}
              uploading={uploadingKey === `${direction}-${id}`}
              onUpload={(file, carrier, tracking) => {
                onUpload(id, file, carrier, tracking);
                resetForm(id);
              }}
              onRemove={formIds.length > 1 ? () => removeForm(id) : undefined}
              isFirst={i === 0}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addForm}
            className="h-8 text-xs gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add Another Receipt
          </Button>
        </div>
      )}

      {!canUpload && receipts.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No receipts uploaded yet.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// One receipt upload form (carrier + tracking + file)
// ─────────────────────────────────────────────────────────────
function ReceiptForm({
  formId, direction, uploading, onUpload, onRemove, isFirst,
}: {
  formId: string;
  direction: 'inbound' | 'return';
  uploading: boolean;
  onUpload: (file: File, carrier: string | null, tracking: string | null) => void;
  onRemove?: () => void;
  isFirst: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [carrierChoice, setCarrierChoice] = useState<string>('');
  const [carrierOther, setCarrierOther] = useState('');
  const [tracking, setTracking] = useState('');

  const submit = () => {
    if (!file) return;
    const carrier = carrierChoice === 'Other' ? (carrierOther.trim() || null) : (carrierChoice || null);
    onUpload(file, carrier, tracking.trim() || null);
    setFile(null); setCarrierChoice(''); setCarrierOther(''); setTracking('');
  };

  return (
    <div className="rounded border border-border bg-card p-2.5 space-y-2">
      {!isFirst && (
        <div className="flex justify-end -mb-1">
          {onRemove && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={onRemove}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Carrier</Label>
          <Select value={carrierChoice} onValueChange={setCarrierChoice}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select carrier" />
            </SelectTrigger>
            <SelectContent>
              {CARRIER_OPTIONS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {carrierChoice === 'Other' && (
            <Input
              value={carrierOther}
              onChange={e => setCarrierOther(e.target.value)}
              placeholder="Enter carrier name"
              className="h-8 text-xs"
            />
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tracking #</Label>
          <Input
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            placeholder="Tracking number"
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{file.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={submit}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Upload'}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFile(null)} disabled={uploading}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 rounded border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40 cursor-pointer transition-colors">
          <Upload className="h-3.5 w-3.5" />
          {direction === 'inbound' ? 'Upload Shipping Receipt' : 'Upload Return Shipping Receipt'}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}
