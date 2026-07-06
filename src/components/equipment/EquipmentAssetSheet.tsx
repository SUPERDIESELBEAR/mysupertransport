import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ClipboardList, Cpu, Camera, Gauge, CreditCard, FileText, Loader2, Lock, Package, Pen, Upload, X, ExternalLink, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { validateFile } from '@/lib/validateFile';
import { format, parseISO } from 'date-fns';

type AssignmentState = 'prior' | 'during' | 'not_assigned';
type EquipmentLine = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card' | 'decal';

interface LineConfig {
  key: EquipmentLine;
  label: string;
  icon: React.ReactNode;
  serialColumn: string | null; // null = no serial field (decal)
}

const LINES: LineConfig[] = [
  { key: 'eld',       label: 'ELD Unit',    icon: <Cpu className="h-4 w-4" />,        serialColumn: 'eld_serial_number' },
  { key: 'dash_cam',  label: 'Dash Cam',    icon: <Camera className="h-4 w-4" />,     serialColumn: 'dash_cam_number' },
  { key: 'bestpass',  label: 'BestPass',    icon: <Gauge className="h-4 w-4" />,      serialColumn: 'bestpass_number' },
  { key: 'fuel_card', label: 'Fuel Card',   icon: <CreditCard className="h-4 w-4" />, serialColumn: 'fuel_card_number' },
  { key: 'decal',     label: 'Decal',       icon: <Truck className="h-4 w-4" />,      serialColumn: null },
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

interface Receipt {
  id: string;
  equipment_line: EquipmentLine;
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
  /** Full onboarding_status record — pass through what you have loaded. */
  status: Record<string, any> | null;
  /** Called after a status field is saved so the parent can refresh. */
  onStatusRefresh?: () => void;
  /** Optional visible-only override (e.g. driver hub renders read-only). */
  readOnly?: boolean;
}

/**
 * Shared Equipment Asset Sheet.
 *
 * - Driver mode: shows all equipment lines (read-only serials & status),
 *   signature block for the ELD acknowledgment, and shipping-receipt upload
 *   ONLY for lines management flagged as shipped/awaiting return.
 * - Management mode: adds the three-way assignment status selector, editable
 *   serial inputs (locked once the driver signs), shipped/awaiting toggles,
 *   the return-date block, and unrestricted receipt uploads.
 */
export default function EquipmentAssetSheet({
  mode,
  operatorId,
  status,
  onStatusRefresh,
  readOnly,
}: EquipmentAssetSheetProps) {
  const { session, user } = useAuth();
  const { guardDemo } = useDemoMode();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('Shipping Receipt');
  const [savingField, setSavingField] = useState<string | null>(null);

  const signed = !!status?.eld_signature_signed_at;
  const canManage = mode === 'management' && !readOnly;

  // Local edit buffer for management mode (so typing feels snappy; save on blur)
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
        .update(patch)
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

  // ── Signature refs ──
  const sigRef = useRef<SignatureCanvas>(null);
  const [typedName, setTypedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signing, setSigning] = useState(false);

  const handleExecute = async () => {
    if (guardDemo()) return;
    if (!typedName.trim()) { toast.error('Please type your full name.'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('Please draw your signature.'); return; }
    setSigning(true);
    try {
      const dataUrl = sigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `equipment-asset-sheet/${operatorId}/signature-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from('operator-documents')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const imageUrl = signed?.signedUrl ?? null;
      if (!imageUrl) throw new Error('signed url failed');

      const { error } = await supabase
        .from('onboarding_status')
        .update({
          eld_signature_typed_name: typedName.trim(),
          eld_signature_image_url: imageUrl,
        })
        .eq('operator_id', operatorId);
      if (error) throw error;

      toast.success('Signature recorded.');
      onStatusRefresh?.();
    } catch (err: any) {
      console.error('[EquipmentAssetSheet] signature save failed', err);
      toast.error("Something went wrong while saving your signature. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  // ── Receipt upload ──
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const uploadReceipt = async (line: EquipmentLine, direction: 'inbound' | 'return', file: File, carrier: string | null, tracking: string | null) => {
    if (guardDemo()) return;
    if (!user?.id) { toast.error('You must be signed in.'); return; }
    const check = validateFile(file, true);
    if (!check.valid) { toast.error(check.error ?? 'Invalid file'); return; }
    setUploadingFor(`${line}-${direction}`);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `equipment-receipts/${operatorId}/${line}/${direction}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('operator-documents')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signed?.signedUrl;
      if (!url) throw new Error('signed url failed');

      const { error } = await supabase.from('equipment_receipts').insert({
        operator_id: operatorId,
        equipment_line: line,
        direction,
        carrier: carrier || null,
        tracking_number: tracking || null,
        file_url: url,
        file_name: file.name,
        uploaded_by: user.id,
        uploader_role: mode === 'management' ? 'management' : 'driver',
      });
      if (error) throw error;
      toast.success('Receipt uploaded.');
      fetchReceipts();
    } catch (err: any) {
      console.error('[EquipmentAssetSheet] receipt upload failed', err);
      toast.error("We couldn't upload that receipt. Please try again.");
    } finally {
      setUploadingFor(null);
    }
  };

  // Grouped receipts by line
  const receiptsByLine = useMemo(() => {
    const map: Record<string, Receipt[]> = {};
    for (const r of receipts) {
      (map[r.equipment_line] ??= []).push(r);
    }
    return map;
  }, [receipts]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Equipment Asset Sheet</h3>
            <p className="text-xs text-muted-foreground truncate">
              {signed
                ? `Signed ${format(parseISO(status!.eld_signature_signed_at), 'MMM d, yyyy')}`
                : mode === 'driver'
                  ? 'Review your equipment, then sign below.'
                  : 'Set assignment status and log return details.'}
            </p>
          </div>
        </div>
        {signed && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-status-complete/10 text-status-complete border-status-complete/30">
            <Lock className="h-3 w-3" /> Locked
          </Badge>
        )}
      </div>

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
            shippedToDriver={!!status?.[`${cfg.key}_shipped_to_driver`]}
            awaitingReturn={!!status?.[`${cfg.key}_awaiting_return_shipment`]}
            onStateChange={s => patchStatus({ [`${cfg.key}_assignment_state`]: s, ...(s === 'not_assigned' && cfg.serialColumn ? { [cfg.serialColumn]: null } : {}) })}
            onSerialChange={v => setBuffer(b => ({ ...b, [cfg.serialColumn!]: v }))}
            onSerialCommit={() => cfg.serialColumn && buffer[cfg.serialColumn] !== undefined && patchStatus({ [cfg.serialColumn]: buffer[cfg.serialColumn] || null })}
            onToggleShipped={v => patchStatus({ [`${cfg.key}_shipped_to_driver`]: v })}
            onToggleAwaiting={v => patchStatus({ [`${cfg.key}_awaiting_return_shipment`]: v })}
            receipts={receiptsByLine[cfg.key] ?? []}
            onPreview={(url, name) => { setPreviewUrl(url); setPreviewName(name); }}
            onUploadReceipt={(dir, file, carrier, tracking) => uploadReceipt(cfg.key, dir, file, carrier, tracking)}
            uploadingKey={uploadingFor}
            saving={savingField}
          />
        ))}
      </div>

      {/* Signature block */}
      <div className="rounded-lg border border-border bg-surface/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Pen className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Driver Acknowledgment</h4>
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
            <p className="text-xs text-muted-foreground">
              I acknowledge receipt of the equipment listed above. The signed date will be applied automatically.
            </p>
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
              disabled={signing || !typedName.trim() || !hasDrawn}
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

      {/* Management-only: Equipment return date */}
      {mode === 'management' && !readOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-700" />
            <h4 className="text-sm font-semibold text-amber-900">Equipment Return (Management)</h4>
          </div>
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
  shippedToDriver: boolean;
  awaitingReturn: boolean;
  onStateChange: (s: AssignmentState) => void;
  onSerialChange: (v: string) => void;
  onSerialCommit: () => void;
  onToggleShipped: (v: boolean) => void;
  onToggleAwaiting: (v: boolean) => void;
  receipts: Receipt[];
  onPreview: (url: string, name: string) => void;
  onUploadReceipt: (dir: 'inbound' | 'return', file: File, carrier: string | null, tracking: string | null) => void;
  uploadingKey: string | null;
  saving: string | null;
}

function EquipmentLineRow(props: RowProps) {
  const {
    cfg, mode, canManage, signedLock, state, serialColumn, serialValue,
    shippedToDriver, awaitingReturn,
    onStateChange, onSerialChange, onSerialCommit, onToggleShipped, onToggleAwaiting,
    receipts, onPreview, onUploadReceipt, uploadingKey,
  } = props;

  // Driver sees the upload only when management flagged this line as shipped or awaiting return.
  const showDriverUpload = mode === 'driver' && (shippedToDriver || awaitingReturn);
  const showManagementUpload = mode === 'management';
  const uploadDirection: 'inbound' | 'return' = awaitingReturn ? 'return' : 'inbound';

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-primary/8 text-primary shrink-0">
            {cfg.icon}
          </span>
          <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] ${STATE_BADGE[state]}`}>
          {STATE_LABELS[state]}
        </Badge>
      </div>

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
          <div className="sm:col-span-2 flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={shippedToDriver}
                onChange={e => onToggleShipped(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Shipped to driver
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={awaitingReturn}
                onChange={e => onToggleAwaiting(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Awaiting return shipment
            </label>
          </div>
        </div>
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

      {/* Shipping receipts */}
      {(showDriverUpload || showManagementUpload || receipts.length > 0) && (
        <div className="pt-2 border-t border-border/60 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Package className="h-3 w-3" /> Shipping Receipt
          </div>
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
                  {' · '}{r.direction === 'inbound' ? 'To driver' : 'Return'}
                </div>
              </div>
              <a
                href={r.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-primary hover:text-primary/80"
                title="Open"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
          {(showDriverUpload || showManagementUpload) && (
            <ReceiptUploader
              direction={uploadDirection}
              uploading={uploadingKey === `${cfg.key}-${uploadDirection}`}
              allowMeta={mode === 'management'}
              onUpload={(file, carrier, tracking) => onUploadReceipt(uploadDirection, file, carrier, tracking)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Receipt uploader
// ─────────────────────────────────────────────────────────────
function ReceiptUploader({
  direction, uploading, allowMeta, onUpload,
}: {
  direction: 'inbound' | 'return';
  uploading: boolean;
  allowMeta: boolean;
  onUpload: (file: File, carrier: string | null, tracking: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');

  const submit = () => {
    if (!file) return;
    onUpload(file, carrier || null, tracking || null);
    setFile(null); setCarrier(''); setTracking('');
  };

  return (
    <div className="space-y-1.5">
      {allowMeta && (
        <div className="grid grid-cols-2 gap-1.5">
          <Input
            value={carrier}
            onChange={e => setCarrier(e.target.value)}
            placeholder="Carrier (optional)"
            className="h-7 text-xs"
          />
          <Input
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            placeholder="Tracking # (optional)"
            className="h-7 text-xs font-mono"
          />
        </div>
      )}
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1 text-xs">
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
        <label className="flex items-center justify-center gap-2 rounded border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40 cursor-pointer transition-colors">
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