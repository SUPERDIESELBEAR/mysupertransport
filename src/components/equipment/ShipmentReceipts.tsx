import { useEffect, useState } from 'react';
import { Package, FileText, ExternalLink, Upload, X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PreviewLink } from '@/components/documents/PreviewLink';
import { format, parseISO } from 'date-fns';

export type EquipmentLine = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card' | 'decal';

export interface Receipt {
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

export const CARRIER_OPTIONS = ['UPS', 'USPS', 'FedEx', 'Other'] as const;

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

export function ShipmentReceiptsBlock({
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

interface ReceiptFormProps {
  formId: string;
  direction: 'inbound' | 'return';
  uploading: boolean;
  onUpload: (file: File, carrier: string | null, tracking: string | null) => void;
  onRemove?: () => void;
  isFirst: boolean;
}

function ReceiptForm({
  formId, direction, uploading, onUpload, onRemove, isFirst,
}: ReceiptFormProps) {
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
