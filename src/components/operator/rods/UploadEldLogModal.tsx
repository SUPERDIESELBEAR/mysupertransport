import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { CARRIER_LEGAL_NAME, CARRIER_MC, CARRIER_USDOT } from '@/lib/eld/constants';
import { RODS_BUCKET, formatLogDate, type RodsDay } from '@/lib/eld/rodsTypes';

/**
 * Uploaded ELD logs are a distinct record type (record_source = 'eld_document').
 * No signature, no 1440-minute check, no generated PDF — the uploaded file at
 * source_document_path IS the record, and the driver already certified it on
 * their own device.
 *
 * Two modes:
 *   - new upload for a date with no record
 *   - "Replace document", which goes through the atomic replace_rods_document
 *     RPC (the partial unique index rejects any intermediate state, so this can
 *     never be two client calls) and requires a written reason.
 */
export default function UploadEldLogModal({
  open, onOpenChange, operatorId, logDate, existing, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operatorId: string;
  logDate: string;
  /** When present the upload replaces this row instead of creating a new one. */
  existing?: RodsDay | null;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const replacing = !!existing;

  async function submit() {
    if (!file) { toast.error('Choose the ELD log file first.'); return; }
    if (replacing && reason.trim().length < 5) {
      toast.error('A written reason is required to replace a document on file.');
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const path = `${operatorId}/${logDate}/eld-log-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(RODS_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
      if (upErr) throw new Error(upErr.message);

      if (replacing && existing) {
        const { error } = await supabase.rpc('replace_rods_document', {
          _day_id: existing.id,
          _new_path: path,
          _reason: reason.trim(),
        });
        if (error) throw new Error(error.message);
        toast.success('Document replaced. The original stays on file.');
      } else {
        // status 'certified' + locked so the day occupies the unique slot and no
        // keyed day can be created for the same date. The "On file (ELD log)"
        // wording is display-only — do not "fix" this into status 'on_file'.
        const { error } = await supabase.from('rods_days').insert({
          operator_id: operatorId,
          log_date: logDate,
          record_source: 'eld_document',
          status: 'certified',
          locked: true,
          is_reconstructed: false, // retrieved, not reconstructed
          source_document_path: path,
          carrier_name: CARRIER_LEGAL_NAME,
          carrier_usdot: CARRIER_USDOT,
          carrier_mc: CARRIER_MC,
          certified_at: new Date().toISOString(),
        } as never);
        if (error) throw new Error(error.message);
        toast.success('ELD log filed for this day.');
      }
      setFile(null);
      setReason('');
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {replacing ? 'Replace document' : 'Upload ELD log'} — {formatLogDate(logDate)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {replacing
              ? 'The document currently on file is kept permanently. This adds the corrected file and records the replacement.'
              : 'If your ELD still produced a log for this day, upload it instead of keying the day in by hand.'}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="mr-2 h-4 w-4" /> {file ? file.name : 'Choose file'}
          </Button>

          {replacing && (
            <div className="space-y-1">
              <Label className="text-xs">Why is this being replaced?</Label>
              <Textarea
                className="text-base"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Wrong day uploaded, unreadable scan, etc."
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1" onClick={submit} disabled={busy || !file}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : replacing ? 'Replace' : 'File this log'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}