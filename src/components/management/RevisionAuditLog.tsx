import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { History, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface AuditRow {
  id: string;
  action: string;
  actor_name: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const REVISION_ACTIONS = [
  'application_revisions_requested',
  'application.revisions_requested',
  'application.revisions_moved_to_pending',
  'revision_request_reverted',
  'application.revisions_reverted',
  'application.correction_request_sent',
  'application.correction_request_cancelled',
  'application.correction_request_approved',
  'application.correction_request_rejected',
  'application.correction_request_expired',
  'application.revision_attachment_uploaded',
  'application.revision_attachment_deleted',
];

const ACTION_LABEL: Record<string, string> = {
  application_revisions_requested: 'Revisions requested from applicant',
  'application.revisions_requested': 'Revisions requested from applicant',
  'application.revisions_moved_to_pending': 'Moved back to pending (staff handling corrections)',
  revision_request_reverted: 'Revision request reverted (sent in error)',
  'application.revisions_reverted': 'Revision request reverted (sent in error)',
  'application.correction_request_sent': 'Correction request sent for e-signature',
  'application.correction_request_cancelled': 'Correction request cancelled',
  'application.correction_request_approved': 'Correction request approved by applicant',
  'application.correction_request_rejected': 'Correction request rejected by applicant',
  'application.correction_request_expired': 'Correction request expired',
  'application.revision_attachment_uploaded': 'Applicant reply attachment uploaded',
  'application.revision_attachment_deleted': 'Applicant reply attachment deleted',
};

function summarize(row: AuditRow): string | null {
  const m = row.metadata ?? {};
  const parts: string[] = [];
  if (typeof m.file_name === 'string') parts.push(m.file_name);
  if (typeof m.reason === 'string' && m.reason.trim()) parts.push(`Reason: ${m.reason}`);
  if (typeof m.rejection_reason === 'string' && m.rejection_reason.trim()) parts.push(`Applicant: ${m.rejection_reason}`);
  if (typeof m.field_count === 'number') parts.push(`${m.field_count} field${m.field_count === 1 ? '' : 's'}`);
  if (typeof m.note === 'string' && m.note.trim()) parts.push(`Note: ${m.note}`);
  return parts.length ? parts.join(' · ') : null;
}

interface Props {
  applicationId: string;
  refreshKey?: number;
}

export function RevisionAuditLog({ applicationId, refreshKey }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, action, actor_name, created_at, metadata')
      .eq('entity_type', 'application')
      .eq('entity_id', applicationId)
      .in('action', REVISION_ACTIONS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setRows((data ?? []) as AuditRow[]);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="mt-3 rounded-lg border border-status-progress/30 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40 rounded-t-lg"
      >
        <span className="flex items-center gap-2">
          <History className="h-3.5 w-3.5" />
          Revision audit log ({rows.length})
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1">
          {loading ? (
            <div className="text-xs text-muted-foreground py-2 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No revision activity yet.</p>
          ) : (
            <ol className="relative border-l border-status-progress/40 ml-1.5 space-y-2.5 pl-3 py-1">
              {rows.map((r) => {
                const label = ACTION_LABEL[r.action] ?? r.action;
                const detail = summarize(r);
                return (
                  <li key={r.id} className="text-xs">
                    <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-status-progress" />
                    <div className="font-medium text-foreground">{label}</div>
                    <div className="text-muted-foreground">
                      {r.actor_name || 'system'} · {new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
                    </div>
                    {detail && (
                      <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{detail}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}