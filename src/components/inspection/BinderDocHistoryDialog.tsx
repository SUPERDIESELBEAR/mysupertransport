import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Eye } from 'lucide-react';
import { FilePreviewModal, bucketForBinderDoc } from './DocRow';
import { parseLocalDate } from './InspectionBinderTypes';

export interface BinderDocVersion {
  id: string;
  document_id: string;
  version: number;
  file_path: string | null;
  file_url: string | null;
  expires_at: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  source: string | null;
}

/** Sign (or reuse) a view URL for a binder file pair. */
export async function signBinderFileUrl(file: { file_url: string | null; file_path: string | null }): Promise<string | null> {
  if (file.file_url) return file.file_url;
  if (!file.file_path) return null;
  let path = file.file_path;
  let bucket: string;
  if (path.startsWith('fleet-documents/')) {
    bucket = 'fleet-documents';
    path = path.slice('fleet-documents/'.length);
  } else {
    bucket = bucketForBinderDoc(path);
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Fetch prior versions for a binder document. */
export async function fetchBinderDocVersions(documentId: string): Promise<BinderDocVersion[]> {
  const { data, error } = await (supabase as any)
    .from('inspection_document_versions')
    .select('id, document_id, version, file_path, file_url, expires_at, uploaded_by, uploaded_at, source')
    .eq('document_id', documentId)
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BinderDocVersion[];
}

const SOURCE_LABELS: Record<string, string> = {
  replaced: 'Replaced',
  staff_replace: 'Staff replace',
  driver_upload: 'Driver upload',
  vehicle_hub_sync: 'Vehicle Hub',
  onboarding_sync: 'Onboarding',
};

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: string;
  docName: string;
  /** Current (newest) file, listed at the top of the history */
  current: { file_path: string | null; file_url: string | null; expires_at: string | null; uploaded_at: string | null };
}

export function BinderDocHistoryDialog({ open, onClose, documentId, docName, current }: Props) {
  const [versions, setVersions] = useState<BinderDocVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setError(null);
    fetchBinderDocVersions(documentId).then(setVersions).catch(e => setError(e.message));
  }, [open, documentId]);

  const openPreview = async (file: { file_url: string | null; file_path: string | null }, label: string) => {
    const url = await signBinderFileUrl(file);
    if (url) setPreview({ url, label });
  };

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDate = (d: string) =>
    parseLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{docName} — version history</DialogTitle>
            <DialogDescription>Newest first. Older versions are kept for your records.</DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!versions && !error && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {versions && (
            <div className="space-y-2">
              {/* Current version */}
              <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/5 px-3 py-2.5">
                <FileText className="h-4 w-4 text-gold-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Current version</p>
                  <p className="text-xs text-muted-foreground">
                    {current.uploaded_at ? fmtDateTime(current.uploaded_at) : 'On file'}
                    {current.expires_at ? ` · expiry ${fmtDate(current.expires_at)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="View current version"
                  onClick={() => openPreview(current, `${docName} (current)`)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </div>

              {versions.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No previous versions on file.</p>
              )}

              {versions.map(v => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Version {v.version}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(v.uploaded_at)}
                      {v.source ? ` · ${SOURCE_LABELS[v.source] ?? v.source}` : ''}
                      {v.expires_at ? ` · expiry ${fmtDate(v.expires_at)}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={`View version ${v.version}`}
                    onClick={() => openPreview(v, `${docName} (version ${v.version})`)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {preview && (
        <FilePreviewModal url={preview.url} name={preview.label} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
