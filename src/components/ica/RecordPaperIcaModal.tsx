import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, FileText, AlertTriangle } from 'lucide-react';

/**
 * RECORD AN AGREEMENT SIGNED BEFORE SUPERDRIVE.
 *
 * Some drivers signed a real ICA on paper before the app existed. Without a
 * row in ica_contracts, offboarding steps 4 (Lease Termination) and 8 (ICA
 * Void) have nothing to act on and skip themselves. This records the existing
 * agreement so those steps run exactly as they do for everyone else.
 *
 * Nothing is invented: truck and owner details are pre-filled from what
 * SUPERDRIVE already holds and shown for confirmation. The scan is encouraged
 * but optional — with no copy on file the record says so plainly.
 */

const SCAN_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const SCAN_MAX_BYTES = 10 * 1024 * 1024;

export interface RecordPaperIcaModalProps {
  open: boolean;
  onClose: () => void;
  operatorId: string;
  operatorName: string;
  onRecorded?: () => void;
}

interface FormState {
  truck_year: string;
  truck_make: string;
  truck_model: string;
  truck_vin: string;
  truck_plate: string;
  truck_plate_state: string;
  trailer_number: string;
  owner_name: string;
  owner_business_name: string;
  owner_email: string;
  owner_phone: string;
  lease_effective_date: string;
}

const EMPTY: FormState = {
  truck_year: '',
  truck_make: '',
  truck_model: '',
  truck_vin: '',
  truck_plate: '',
  truck_plate_state: '',
  trailer_number: '',
  owner_name: '',
  owner_business_name: '',
  owner_email: '',
  owner_phone: '',
  lease_effective_date: '',
};

export default function RecordPaperIcaModal({
  open,
  onClose,
  operatorId,
  operatorName,
  onRecorded,
}: RecordPaperIcaModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const prefill = useCallback(async () => {
    setLoading(true);
    try {
      const [snapRes, ownerRes] = await Promise.all([
        supabase
          .from('onboarding_status')
          .select('truck_year, truck_make, truck_model, truck_vin, truck_plate, truck_plate_state, trailer_number')
          .eq('operator_id', operatorId)
          .maybeSingle(),
        supabase
          .from('truck_owners')
          .select('legal_first_name, legal_last_name, business_name, email, phone')
          .eq('operator_id', operatorId)
          .maybeSingle(),
      ]);
      const s = (snapRes.data ?? {}) as Record<string, string | null>;
      const o = (ownerRes.data ?? {}) as Record<string, string | null>;
      setForm({
        ...EMPTY,
        truck_year: s.truck_year ?? '',
        truck_make: s.truck_make ?? '',
        truck_model: s.truck_model ?? '',
        truck_vin: s.truck_vin ?? '',
        truck_plate: s.truck_plate ?? '',
        truck_plate_state: s.truck_plate_state ?? '',
        trailer_number: s.trailer_number ?? '',
        owner_name: [o.legal_first_name, o.legal_last_name].filter(Boolean).join(' ').trim(),
        owner_business_name: o.business_name ?? '',
        owner_email: o.email ?? '',
        owner_phone: o.phone ?? '',
      });
    } finally {
      setLoading(false);
    }
  }, [operatorId]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    void prefill();
  }, [open, prefill]);

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!SCAN_TYPES.includes(f.type)) {
      toast({ title: 'Unsupported file', description: 'Upload a PDF, JPG, or PNG.', variant: 'destructive' });
      return;
    }
    if (f.size > SCAN_MAX_BYTES) {
      toast({ title: 'File too large', description: 'Maximum size is 10MB.', variant: 'destructive' });
      return;
    }
    setFile(f);
  };

  const handleSave = async () => {
    if (!form.lease_effective_date) {
      toast({ title: 'Enter the date the original lease started', variant: 'destructive' });
      return;
    }
    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const path = `ica-paper/${operatorId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('operator-documents')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        uploadedPath = path;
      }

      const signedAt = new Date(`${form.lease_effective_date}T12:00:00`).toISOString();
      const { error } = await supabase.from('ica_contracts').insert({
        operator_id: operatorId,
        status: 'complete',
        truck_year: form.truck_year || null,
        truck_make: form.truck_make || null,
        truck_model: form.truck_model || null,
        truck_vin: form.truck_vin || null,
        truck_plate: form.truck_plate || null,
        truck_plate_state: form.truck_plate_state || null,
        trailer_number: form.trailer_number || null,
        owner_name: form.owner_name || null,
        owner_business_name: form.owner_business_name || null,
        owner_email: form.owner_email || null,
        owner_phone: form.owner_phone || null,
        lease_effective_date: form.lease_effective_date,
        contractor_typed_name: form.owner_name || operatorName,
        contractor_signed_at: signedAt,
        is_paper_original: true,
        paper_scan_path: uploadedPath,
        paper_scan_name: file?.name ?? null,
        paper_recorded_by: user?.id ?? null,
        paper_recorded_at: new Date().toISOString(),
      } as never);
      if (error) throw new Error(error.message);

      await supabase.from('audit_log').insert({
        action: 'ica_paper_recorded',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        actor_id: user?.id ?? null,
        metadata: {
          lease_effective_date: form.lease_effective_date,
          scan_on_file: Boolean(uploadedPath),
        },
      } as never);

      toast({
        title: '✅ Existing agreement recorded',
        description: uploadedPath
          ? 'The signed original is on file. Lease termination and void are now available.'
          : 'Recorded with no signed copy on file. Lease termination and void are now available.',
      });
      onRecorded?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not record the agreement';
      if (uploadedPath) await supabase.storage.from('operator-documents').remove([uploadedPath]);
      console.error('[RecordPaperIcaModal] save failed', err);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof FormState, placeholder?: string) => (
    <div>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} className="mt-1.5" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Existing Agreement</DialogTitle>
          <DialogDescription>
            Log an ICA that {operatorName} signed before SUPERDRIVE. Details are pulled from existing records —
            confirm or correct them. Nothing is emailed to the driver.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {field('Year', 'truck_year')}
              {field('Make', 'truck_make')}
              {field('Model', 'truck_model')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {field('VIN', 'truck_vin')}
              {field('Plate', 'truck_plate')}
              {field('Plate State', 'truck_plate_state')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field('Trailer Number', 'trailer_number')}
              {field('Owner Name', 'owner_name')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {field('Business Name', 'owner_business_name')}
              {field('Owner Email', 'owner_email')}
              {field('Owner Phone', 'owner_phone')}
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Original Lease Start Date
              </Label>
              <Input
                type="date"
                value={form.lease_effective_date}
                onChange={e => set('lease_effective_date', e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div className="border border-dashed border-border rounded-lg p-3 bg-muted/20 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Signed Copy (optional)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => pickFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                {file && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1 shrink-0">
                    <FileText className="h-3.5 w-3.5" /> {file.name}
                  </span>
                )}
              </div>
              {!file && (
                <Alert className="border-warning/30 bg-warning/5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-xs">
                    With no upload, the agreement is recorded and marked “no signed copy on file.”
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-1.5 bg-gold hover:bg-gold/90 text-black">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Record Agreement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
