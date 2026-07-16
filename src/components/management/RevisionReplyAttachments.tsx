import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip, Upload, Trash2, FileText, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { uploadToBucket } from '@/lib/uploadWithAuth';

const BUCKET = 'application-revision-replies';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = 'image/*,application/pdf';

interface Attachment {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

interface Props {
  applicationId: string;
  onChanged?: () => void;
}

export function RevisionReplyAttachments({ applicationId, onChanged }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('application_revision_attachments')
      .select('id, file_path, file_name, mime_type, size_bytes, note, uploaded_by_name, uploaded_at')
      .eq('application_id', applicationId)
      .order('uploaded_at', { ascending: false });
    if (error) {
      console.warn(error);
    }
    setRows((data ?? []) as Attachment[]);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > MAX_BYTES) {
      toast.error('File too large (max 10 MB).');
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${applicationId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr, authUid, sessionExpired } = await uploadToBucket(BUCKET, path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (upErr) { console.error('[RevisionReplyAttachments] upload failed', { authUid, sessionExpired, message: upErr.message }); throw upErr; }

      // Resolve uploader display name (best-effort)
      let uploaderName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', user.id)
          .maybeSingle();
        const full = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim();
        uploaderName = full || user.email || null;
      }

      const { error: insErr } = await supabase
        .from('application_revision_attachments')
        .insert({
          application_id: applicationId,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user?.id,
          uploaded_by_name: uploaderName,
        });
      if (insErr) {
        // Best-effort cleanup of the storage object
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        throw insErr;
      }
      toast.success('Attachment uploaded.');
      await load();
      onChanged?.();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (row: Attachment) => {
    if (!confirm(`Delete "${row.file_name}"?`)) return;
    setDeletingId(row.id);
    try {
      await supabase.storage.from(BUCKET).remove([row.file_path]).catch(() => {});
      const { error } = await supabase
        .from('application_revision_attachments')
        .delete()
        .eq('id', row.id);
      if (error) throw error;
      toast.success('Deleted.');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const openPreview = async (row: Attachment) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 60 * 60);
    if (error || !data?.signedUrl) {
      toast.error('Could not open file.');
      return;
    }
    setPreview({ url: data.signedUrl, name: row.file_name });
  };

  return (
    <div className="mt-3 rounded-lg border border-status-progress/30 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Applicant's reply ({rows.length})
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Upload className="h-3 w-3 mr-1.5" />}
          Upload screenshot or file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No attachments yet. Upload a screenshot of the email Kenneth sent (or any file) to keep it with this revision history.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const isImage = (r.mime_type ?? '').startsWith('image/');
            return (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => openPreview(r)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left hover:underline"
                >
                  {isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate font-medium text-foreground">{r.file_name}</span>
                  <span className="text-muted-foreground shrink-0">
                    · {r.uploaded_by_name || 'staff'} · {new Date(r.uploaded_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  disabled={deletingId === r.id}
                  className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                  aria-label="Delete attachment"
                >
                  {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <FilePreviewModal
          url={preview.url}
          name={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}