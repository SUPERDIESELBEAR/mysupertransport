import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { validateFile } from '@/lib/validateFile';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, Package, Upload } from 'lucide-react';
import { FilePreviewModal } from '@/components/inspection/DocRow';

interface Props {
  operatorId: string;
  /** Render without the outer card + header (used inside a My Documents folder). */
  embedded?: boolean;
  onSummary?: (s: { count: number; actionNeeded: boolean }) => void;
}

type Sheet = {
  id: string;
  unit_number: string | null;
  return_requested_at: string | null;
  return_completed_at: string | null;
};

type Receipt = {
  id: string;
  sheet_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
};

const CARRIERS = ['UPS', 'USPS', 'FedEx', 'Other'];

export default function EquipmentReturnCard({ operatorId, embedded = false, onSummary }: Props) {
  const { user } = useAuth();
  const { guardDemo } = useDemoMode();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState<string>('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!operatorId) return;
    const [{ data: sheetRows }, { data: receiptRows }] = await Promise.all([
      supabase
        .from('onboard_assignment_sheets')
        .select('id, unit_number, return_requested_at, return_completed_at')
        .eq('operator_id', operatorId)
        .not('return_requested_at', 'is', null)
        .order('return_requested_at', { ascending: false }),
      supabase
        .from('equipment_receipts')
        .select('id, sheet_id, carrier, tracking_number, file_url, file_name, uploaded_at')
        .eq('operator_id', operatorId)
        .eq('direction', 'return')
        .order('uploaded_at', { ascending: false }),
    ]);
    setSheets((sheetRows ?? []) as Sheet[]);
    setReceipts((receiptRows ?? []) as Receipt[]);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { load(); }, [load]);

  // Deep link: ?sheet=<id>&return=1 scrolls this block into view.
  useEffect(() => {
    if (loading || sheets.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('return') === '1') {
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [loading, sheets.length]);

  const receiptsFor = (sheetId: string) => receipts.filter(r => r.sheet_id === sheetId || r.sheet_id === null);

  const handleUpload = async (sheet: Sheet) => {
    if (guardDemo()) return;
    if (!user?.id) { toast.error('You must be signed in.'); return; }
    if (!file) { toast.error('Please attach a photo or PDF of your shipping receipt.'); return; }
    if (!tracking.trim()) { toast.error('Tracking number is required.'); return; }
    const check = validateFile(file, true);
    if (!check.valid) { toast.error(check.error ?? 'Invalid file'); return; }

    setUploadingId(sheet.id);
    try {
      const rawExt = file.name.split('.').pop()?.toLowerCase() ?? '';
      const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'bin';
      // Must live under the operator's own folder — storage rules key off folder[1].
      const path = `${operatorId}/equipment-receipts/return-${Date.now()}.${ext}`;
      const { error: upErr } = await uploadToBucket('operator-documents', path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signed?.signedUrl;
      if (!url) throw new Error('Could not create a link for the uploaded file.');

      const { error } = await supabase.from('equipment_receipts').insert({
        operator_id: operatorId,
        sheet_id: sheet.id,
        equipment_line: null,
        direction: 'return',
        carrier: carrier || null,
        tracking_number: tracking.trim(),
        file_url: url,
        file_name: file.name,
        uploaded_by: user.id,
        uploader_role: 'driver',
      });
      if (error) {
        await supabase.storage.from('operator-documents').remove([path]).catch(() => {});
        throw error;
      }
      toast.success('Receipt received — staff have been notified', {
        description: `Tracking ${tracking.trim()}${carrier ? ` • ${carrier}` : ''} was saved to your assignment sheet. No further action is needed from you.`,
        duration: 8000,
      });
      setFile(null);
      setTracking('');
      setCarrier('');
      load();
    } catch (err: any) {
      console.error('[EquipmentReturnCard] upload failed', err);
      const msg: string = err?.message ?? '';
      const permissionish = /row-level security|unauthorized|jwt|permission/i.test(msg);
      toast.error("We couldn't upload that receipt", {
        description: permissionish
          ? 'Your session may have expired. Please sign out, sign back in, and try again.'
          : msg || 'Please try again.',
      });
    } finally {
      setUploadingId(null);
    }
  };

  if (loading || sheets.length === 0) return null;

  return (
    <div id="equipment-return" ref={rootRef} className="rounded-2xl border border-primary/30 bg-card p-4 space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Return Your Equipment</h3>
          <p className="text-xs text-muted-foreground">Mail your equipment back, then upload the shipping receipt below.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <AddressCard
          title="Option 1 — The UPS Store #4564"
          lines={['608 W. Parkway Dr.', 'Russellville, AR 72801']}
          note={'P: (479) 498-2041'}
        />
        <AddressCard
          title="Option 2 — USPS (P.O. Box)"
          lines={['SuperTransport', 'c/o Craig Pate', 'P.O. Box 718', 'Dover, AR 72837']}
        />
      </div>

      {sheets.map(sheet => {
        const existing = receiptsFor(sheet.id);
        const busy = uploadingId === sheet.id;
        return (
          <div key={sheet.id} className="rounded-xl border border-border bg-background/50 p-3 space-y-3">
            <div className="text-sm font-medium text-foreground">
              Assignment Sheet{sheet.unit_number ? ` — Unit ${sheet.unit_number}` : ''}
            </div>

            {existing.length > 0 ? (
              <div className="space-y-2">
                {existing.map(r => (
                  <div key={r.id} className="flex items-start gap-2 rounded-lg border border-status-complete/40 bg-status-complete/10 p-3">
                    <CheckCircle2 className="h-4 w-4 text-status-complete mt-0.5 shrink-0" />
                    <div className="min-w-0 text-xs">
                      <div className="text-sm font-medium text-foreground">Receipt received — staff notified</div>
                      <div className="text-muted-foreground">
                        Tracking <span className="font-mono">{r.tracking_number ?? '—'}</span>
                        {r.carrier ? ` • ${r.carrier}` : ''} • {format(new Date(r.uploaded_at), 'MM/dd/yyyy')}
                      </div>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        <li>• Your receipt was attached to this assignment sheet and the SUPERTRANSPORT team was notified automatically.</li>
                        <li>• Staff will confirm the shipment when your equipment arrives and close out the return.</li>
                        <li>• Your driver login stays active — nothing else is needed from you unless staff reach out.</li>
                      </ul>
                      <button
                        type="button"
                        className="mt-2 text-primary underline underline-offset-2"
                        onClick={() => setPreview({ url: r.file_url, name: r.file_name ?? 'Shipping receipt' })}
                      >
                        View receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Shipping receipt photo or PDF <span className="text-destructive">*</span></Label>
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                    disabled={busy}
                    className="text-xs"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tracking number <span className="text-destructive">*</span></Label>
                    <Input
                      value={tracking}
                      onChange={e => setTracking(e.target.value)}
                      placeholder="1Z999AA10123456784"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Carrier <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Select value={carrier} onValueChange={setCarrier} disabled={busy}>
                      <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                      <SelectContent>
                        {CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => handleUpload(sheet)} disabled={busy} className="w-full sm:w-auto">
                  {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                  Upload Return Receipt
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {preview && (
        <FilePreviewModal
          url={preview.url}
          name={preview.name}
          onClose={() => setPreview(null)}
          bucketName="operator-documents"
        />
      )}
    </div>
  );
}

function AddressCard({ title, lines, note }: { title: string; lines: string[]; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">{title}</div>
      <div className="mt-1 text-sm text-foreground leading-snug">
        {lines.map(l => <div key={l}>{l}</div>)}
      </div>
      {note && <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}