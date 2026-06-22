import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, CalendarClock, FileUp, BellRing, ShieldCheck, History, AlertOctagon,
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

/**
 * Unified compliance audit timeline.
 * - Per-cert mode (#16): pass `inspectionDocId` to filter to one document.
 * - Per-driver mode (#17): pass `operatorId` to see every cert event for one driver.
 */

interface BaseProps {
  open: boolean;
  onClose: () => void;
  /** Title heading — e.g. "Jane Doe — CDL history" or "Jane Doe — Compliance timeline" */
  title: string;
}

interface PerCertProps extends BaseProps {
  mode: 'cert';
  inspectionDocId: string;
  /** Operator UUID — needed to pull cert_reminders for the matching doc_type */
  operatorId?: string | null;
  /** "CDL" | "Medical Cert" | "Insurance" | ... — used to filter cert_reminders */
  docTypeForReminders?: string | null;
}

interface PerDriverProps extends BaseProps {
  mode: 'driver';
  operatorId: string;
  /** Driver auth user_id — used to scope inspection_documents */
  driverUserId: string | null;
}

export type ComplianceHistoryModalProps = PerCertProps | PerDriverProps;

interface TimelineEntry {
  id: string;
  at: string; // ISO
  kind: 'expiry' | 'upload' | 'reminder' | 'renewed';
  actor: string;
  title: string;
  detail?: string;
}

const KIND_META: Record<TimelineEntry['kind'], { Icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  expiry:   { Icon: CalendarClock, cls: 'bg-gold/15 text-gold',                   label: 'Expiry updated' },
  upload:   { Icon: FileUp,        cls: 'bg-sky-100 text-sky-700',                label: 'File uploaded' },
  reminder: { Icon: BellRing,      cls: 'bg-amber-100 text-amber-700',            label: 'Reminder sent' },
  renewed:  { Icon: ShieldCheck,   cls: 'bg-status-complete/15 text-status-complete', label: 'Cert renewed' },
};

export default function ComplianceHistoryModal(props: ComplianceHistoryModalProps) {
  const { open, onClose, title } = props;
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const collected: TimelineEntry[] = [];

        // Resolve the list of inspection_doc_ids in scope ----------------------
        let docIds: string[] = [];
        let docMeta: Record<string, { name: string; uploaded_at: string | null }> = {};

        if (props.mode === 'cert') {
          docIds = [props.inspectionDocId];
          const { data: d } = await supabase
            .from('inspection_documents')
            .select('id, name, uploaded_at')
            .eq('id', props.inspectionDocId)
            .maybeSingle();
          if (d) docMeta[d.id] = { name: d.name, uploaded_at: d.uploaded_at };
        } else {
          // Per-driver — pull every per_driver doc for this driver
          if (props.driverUserId) {
            const { data: docs } = await supabase
              .from('inspection_documents')
              .select('id, name, uploaded_at')
              .eq('scope', 'per_driver')
              .eq('driver_id', props.driverUserId);
            (docs ?? []).forEach((d: any) => {
              docIds.push(d.id);
              docMeta[d.id] = { name: d.name, uploaded_at: d.uploaded_at };
            });
          }
        }

        // 1. Expiry-change audit entries (entity_type='compliance') ------------
        if (docIds.length > 0) {
          const { data: expiryLogs } = await supabase
            .from('audit_log')
            .select('id, action, actor_name, created_at, metadata, entity_id')
            .eq('entity_type', 'compliance')
            .in('entity_id', docIds)
            .order('created_at', { ascending: false })
            .limit(200);
          (expiryLogs ?? []).forEach((l: any) => {
            const docType = l.metadata?.document_type ?? docMeta[l.entity_id]?.name ?? 'Document';
            const oldExp = l.metadata?.old_expiry as string | null;
            const newExp = l.metadata?.new_expiry as string | null;
            const fmt = (v: string | null) =>
              v ? format(parseISO(v + 'T12:00:00'), 'MMM d, yyyy') : '—';
            collected.push({
              id: `expiry-${l.id}`,
              at: l.created_at,
              kind: 'expiry',
              actor: l.actor_name ?? 'A staff member',
              title: `${docType} expiry changed`,
              detail: `${fmt(oldExp)} → ${fmt(newExp)}`,
            });
          });
        }

        // 2. File uploads — synthesize from inspection_documents.uploaded_at ---
        Object.entries(docMeta).forEach(([, m]) => {
          if (m.uploaded_at) {
            collected.push({
              id: `upload-${m.uploaded_at}-${m.name}`,
              at: m.uploaded_at,
              kind: 'upload',
              actor: 'Staff',
              title: `${m.name} file uploaded`,
            });
          }
        });

        // 3. Reminder sends + renewals (entity_type='operator') ---------------
        const operatorId =
          props.mode === 'driver' ? props.operatorId : props.operatorId ?? null;
        const docTypeFilter =
          props.mode === 'cert' ? props.docTypeForReminders ?? null : null;

        if (operatorId) {
          const { data: reminders } = await supabase
            .from('cert_reminders')
            .select('id, doc_type, sent_at, sent_by_name, email_sent, email_error, source, threshold')
            .eq('operator_id', operatorId)
            .order('sent_at', { ascending: false })
            .limit(200);
          (reminders ?? [])
            .filter((r: any) => !docTypeFilter || r.doc_type === docTypeFilter)
            .forEach((r: any) => {
              const status = r.email_sent
                ? 'delivered'
                : r.email_error
                ? `failed: ${r.email_error}`
                : 'queued';
              const src = r.source === 'cron' ? `automated · ${r.threshold ?? ''}` : 'manual';
              collected.push({
                id: `rem-${r.id}`,
                at: r.sent_at,
                kind: 'reminder',
                actor: r.sent_by_name ?? 'System',
                title: `${r.doc_type} reminder (${src.trim()})`,
                detail: status,
              });
            });

          const { data: renewals } = await supabase
            .from('audit_log')
            .select('id, action, actor_name, created_at, metadata, entity_id')
            .eq('action', 'cert_renewed')
            .eq('entity_id', operatorId)
            .order('created_at', { ascending: false })
            .limit(200);
          (renewals ?? [])
            .filter((l: any) => !docTypeFilter || l.metadata?.document_type === docTypeFilter)
            .forEach((l: any) => {
              collected.push({
                id: `ren-${l.id}`,
                at: l.created_at,
                kind: 'renewed',
                actor: l.actor_name ?? 'Staff',
                title: `${l.metadata?.document_type ?? 'Cert'} renewed`,
              });
            });
        }

        collected.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        if (!cancelled) setEntries(collected);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, props]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[85dvh] flex flex-col">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10">
              <History className="h-4 w-4 text-gold" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold truncate">{title}</DialogTitle>
              <p className="text-[11px] text-muted-foreground">
                Expiry edits, file uploads, reminders, renewals — newest first.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertOctagon className="h-6 w-6 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <History className="h-6 w-6 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">No history yet for this view.</p>
              <p className="text-[11px] text-muted-foreground/70">Activity will appear here once dates change, files upload, or reminders go out.</p>
            </div>
          ) : (
            <ol className="relative border-l border-border/60 ml-3 space-y-4">
              {entries.map(e => {
                const meta = KIND_META[e.kind];
                const Icon = meta.Icon;
                return (
                  <li key={e.id} className="pl-6 relative">
                    <span className={cn(
                      'absolute -left-3 top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background',
                      meta.cls,
                    )}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                      {meta.label}
                    </div>
                    <p className="text-sm font-medium text-foreground">{e.title}</p>
                    {e.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">{e.detail}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {format(parseISO(e.at), 'MMM d, yyyy · h:mm a')} · {formatDistanceToNow(parseISO(e.at), { addSuffix: true })} · by {e.actor}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}