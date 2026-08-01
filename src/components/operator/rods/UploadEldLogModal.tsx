import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { requireCachedCarrier, rodsDayCarrierSnapshot } from '@/lib/eld/carrierIdentity';
import { convertForDisplay, DISPLAY_MIME } from '@/lib/eld/offline/renderability';
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
 *
 * HEIC (Pass B §6): pdf-lib cannot embed HEIC and HEIC is the iPhone camera
 * default, so a photographed ELD screen would break the officer email merge.
 * The device re-encodes to JPEG at upload — on the one device that definitely
 * has the codec — and BOTH files are stored: the original is the record, the
 * JPEG is for display and merging. A file this device cannot decode is stored
 * anyway and flagged; a driver whose phone produced an unconvertible file
 * still needs the log on file.
 */

interface DisplayCopy {
  /** Storage path of the JPEG, or null when there is none. */
  path: string | null;
  /** Conversion was ATTEMPTED and FAILED. A PDF leaves this false with a null path. */
  failed: boolean;
}

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
      const stamp = Date.now();
      const path = `${operatorId}/${logDate}/eld-log-${stamp}.${ext}`;
      const mime = file.type || 'application/pdf';
      // The ORIGINAL goes first and always. It is the record; nothing about the
      // display copy is allowed to cost us the upload.
      const { error: upErr } = await supabase.storage
        .from(RODS_BUCKET)
        .upload(path, file, { upsert: true, contentType: mime });
      if (upErr) throw new Error(upErr.message);

      const display = await uploadDisplayCopy(file, mime, `${operatorId}/${logDate}/eld-log-${stamp}-display.jpg`);

      if (replacing && existing) {
        const { error } = await supabase.rpc('replace_rods_document', {
          _day_id: existing.id,
          _new_path: path,
          _reason: reason.trim(),
          // Idempotency token: a replayed replacement returns the existing
          // replacement instead of filing a second one.
          p_certification_token: crypto.randomUUID(),
          p_display_document_path: display.path,
          p_display_conversion_failed: display.failed,
        });
        if (error) throw new Error(error.message);
        toast.success('Document replaced. The original stays on file.');
      } else {
        // Snapshot from the device cache; blocks when the carrier was never
        // cached rather than filing a record with a guessed identity.
        const carrier = await requireCachedCarrier();
        // Filed through the RPC, never a client insert: it carries the
        // own-operator check, the token idempotency and the non-blank path
        // guard, and it sets status 'certified' + locked so the day occupies
        // the unique slot and no keyed day can be created for the same date.
        // The "On file (ELD log)" wording is display-only — do not "fix" this
        // into status 'on_file'.
        const { error } = await supabase.rpc('create_eld_document_day', {
          p_operator_id: operatorId,
          p_log_date: logDate,
          p_source_document_path: path,
          // Same key set the RPC reads out of the jsonb, and the same snapshot
          // helper every other record-creating path uses.
          p_carrier: rodsDayCarrierSnapshot(carrier),
          p_certification_token: crypto.randomUUID(),
          p_display_document_path: display.path,
          p_display_conversion_failed: display.failed,
        });
        if (error) throw new Error(error.message);
        toast.success('ELD log filed for this day.');
      }
      if (display.failed) {
        toast.warning(
          'The log is on file. This phone produced a format the app cannot display, '
          + 'so it will show as a file rather than an image.',
        );
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