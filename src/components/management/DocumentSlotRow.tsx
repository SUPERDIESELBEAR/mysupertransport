import { useRef, useState } from 'react';
import { Eye, Upload, Camera, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { updatePayload } from '@/integrations/supabase/helpers';
import { useAuth } from '@/hooks/useAuth';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { validateFile } from '@/lib/validateFile';
import {
  RETAKE_DOCUMENT_LABELS,
  retakeReasonLabel,
  type RetakeDocumentKey,
  type RetakeRequestEntry,
} from '@/lib/applicationDocumentRetake';

const BUCKET = 'application-documents';

interface Props {
  applicationId: string;
  docKey: RetakeDocumentKey;
  currentPath: string | null;
  signedUrl?: string;
  retake?: RetakeRequestEntry;
  onPreview: () => void;
  onRequestRetake: () => void;
  /** Called with the new storage path after a staff replacement upload. */
  onReplaced: (path: string) => void;
}

export function DocumentSlotRow({
  applicationId, docKey, currentPath, signedUrl, retake, onPreview, onRequestRetake, onReplaced,
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const label = RETAKE_DOCUMENT_LABELS[docKey];
  const outstanding = Boolean(retake) && !currentPath;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const { valid, error } = validateFile(file);
    if (!valid) { toast.error(error!); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `applications/${applicationId}/staff/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await uploadToBucket(BUCKET, path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from('applications')
        .update(updatePayload('applications', { [docKey]: path }))
        .eq('id', applicationId);
      if (updErr) throw updErr;

      let staffName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase
          .from('profiles').select('first_name, last_name').eq('user_id', user.id).maybeSingle();
        staffName = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim() || user.email || null;
      }

      const { error: histErr } = await supabase.from('application_document_history').insert({
        application_id: applicationId,
        document_key: docKey,
        old_path: currentPath,
        new_path: path,
        source: 'staff_replacement',
        note: file.name,
        changed_by: user?.id ?? null,
        changed_by_name: staffName,
      });
      if (histErr) console.warn('[DocumentSlotRow] history insert failed', histErr);

      onReplaced(path);
      toast.success(`${label} replaced.`);
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground flex-1 min-w-[9rem]">{label}</span>

        {currentPath ? (
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg"
          >
            <Eye className="h-3.5 w-3.5" /> View
          </button>
        ) : (
          <span className="text-xs text-muted-foreground px-2">No file</span>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Upload className="h-3 w-3 mr-1.5" />}
          {currentPath ? 'Replace' : 'Upload'}
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={onRequestRetake}
        >
          <Camera className="h-3 w-3 mr-1.5" /> Request retake
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />
      </div>

      {outstanding && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-status-progress/10 border border-status-progress/30 px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-status-progress shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-foreground">
            <span className="font-semibold">Retake requested</span> — {retakeReasonLabel(retake?.reason)}
            {retake?.note ? <> · {retake.note}</> : null}
            {retake?.requested_at && (
              <span className="text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                {new Date(retake.requested_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
                {retake.requested_by_name ? ` · ${retake.requested_by_name}` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {!outstanding && retake && currentPath && (
        <p className="mt-2 text-[11px] text-status-complete font-medium">
          Retake received — new file uploaded.
        </p>
      )}
    </div>
  );
}