import { useCallback, useEffect, useState } from 'react';
import { History, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import {
  RETAKE_DOCUMENT_SHORT_LABELS,
  retakeReasonLabel,
  type RetakeDocumentKey,
} from '@/lib/applicationDocumentRetake';

const BUCKET = 'application-documents';

interface HistoryRow {
  id: string;
  document_key: string;
  old_path: string | null;
  new_path: string | null;
  source: string;
  reason: string | null;
  note: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  staff_replacement: 'Replaced by staff',
  applicant_retake: 'Re-uploaded by applicant',
  retake_requested: 'Retake requested',
};

export function DocumentHistoryList({ applicationId, refreshKey }: { applicationId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('application_document_history')
      .select('id, document_key, old_path, new_path, source, reason, note, changed_by_name, changed_at')
      .eq('application_id', applicationId)
      .order('changed_at', { ascending: false });
    if (error) console.warn('[DocumentHistoryList]', error);
    setRows((data ?? []) as HistoryRow[]);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const open = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { toast.error('Could not open that file.'); return; }
    setPreview({ url: data.signedUrl, name });
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading history…<Loader2 className="inline h-3 w-3 ml-1 animate-spin" /></p>;
  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5" /> Document history ({rows.length})
      </p>
      <ul className="space-y-1.5">
        {rows.map(r => {
          const short = RETAKE_DOCUMENT_SHORT_LABELS[r.document_key as RetakeDocumentKey] ?? r.document_key;
          return (
            <li key={r.id} className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{short}</span>
              {' · '}{SOURCE_LABELS[r.source] ?? r.source}
              {r.reason ? ` · ${retakeReasonLabel(r.reason)}` : ''}
              {' · '}
              {new Date(r.changed_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
              {r.changed_by_name ? ` · ${r.changed_by_name}` : ''}
              <span className="ml-1 inline-flex gap-2">
                {r.old_path && (
                  <button type="button" onClick={() => open(r.old_path!, `${short} (previous)`)} className="text-gold hover:underline inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" /> previous
                  </button>
                )}
                {r.new_path && (
                  <button type="button" onClick={() => open(r.new_path!, `${short} (new)`)} className="text-gold hover:underline inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" /> new
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {preview && <FilePreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
}