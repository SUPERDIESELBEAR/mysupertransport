import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Archive, CheckCircle2, ExternalLink, FileWarning, Inbox as InboxIcon,
  Loader2, MailQuestion, RefreshCw, Sparkles, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { logDbError } from '@/lib/dbError';
import { stashIngestParse } from '@/lib/ingestHandoff';
import {
  OPEN_STATUSES as INBOX_OPEN_STATUSES,
  isAutoCollapsedDuplicate,
  isDefaultVisible,
  isOpenStatus,
} from '@/lib/rateConInbox';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';
import type { VerbatimCheck } from '@/lib/verbatimCheck';
import type { Database } from '@/integrations/supabase/types';

type QueueRow = Database['public']['Tables']['rate_con_ingest_queue']['Row'];
type QueueStatus = QueueRow['status'];

const OPEN_STATUSES: QueueStatus[] = [...INBOX_OPEN_STATUSES];
/** Items a dispatcher still has to act on — parsed or needs_manual. */
const ACTIONABLE_STATUSES: QueueStatus[] = ['parsed', 'needs_manual'];


const STATUS_LABEL: Record<QueueStatus, string> = {
  received: 'Received',
  pending_parse: 'Parsing…',
  parsed: 'Parsed',
  needs_manual: 'Needs manual',
  auto_handled: 'Auto-handled',
  converted: 'Converted',
  dismissed: 'Dismissed',
};

function canRetry(row: QueueRow): boolean {
  return row.status === 'needs_manual' && row.parse_status === 'failed' && !!row.attachment_storage_path;
}

/**
 * "No attachment" used to cover two different situations: an email that never
 * carried a PDF (a portal-link tender a dispatcher handles by hand) and a
 * retrieval failure on our side (a bug). Those get different words.
 */
export function attachmentLabel(row: Pick<QueueRow, 'attachment_filename' | 'attachment_storage_path' | 'parse_error'>): string {
  if (row.attachment_filename && row.attachment_storage_path) return row.attachment_filename;
  if (row.attachment_filename) return `${row.attachment_filename} — retrieval failed`;
  const err = row.parse_error ?? '';
  if (/no attachment/i.test(err)) return 'no attachment on the email';
  if (/retriev|download|unusable|url/i.test(err)) return 'attachment retrieval failed';
  return 'no attachment on the email';
}


export function formatIngestWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
  });
}

/** One-line summary of the server-side verbatim judgment for an inbox row. */
export function verbatimSummary(checks: VerbatimCheck[] | null): string | null {
  if (!checks || checks.length === 0) return null;
  const adopted = checks.filter(c => c.valueOrigin === 'text_layer').length;
  const failed = checks.filter(c => c.regionFailure).length;
  const noLayer = checks.filter(c => c.verdict === 'no_layer').length;
  const parts: string[] = [];
  if (adopted > 0) parts.push(`${adopted} adopted from page text`);
  if (failed > 0) parts.push(`${failed} unresolved region${failed === 1 ? '' : 's'}`);
  if (noLayer === checks.length) parts.push('no text layer');
  return parts.length > 0 ? parts.join(' · ') : `${checks.length} verbatim checks clean`;
}

async function downloadAttachment(row: QueueRow): Promise<File> {
  if (!row.attachment_storage_path) throw new Error('No stored attachment on this item.');
  const { data, error } = await supabase.storage
    .from('rate-con-ingest')
    .createSignedUrl(row.attachment_storage_path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not sign the attachment URL.');
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`Attachment download failed (HTTP ${res.status}).`);
  const blob = await res.blob();
  return new File(
    [blob],
    row.attachment_filename ?? 'rate-con.pdf',
    { type: row.attachment_mime_type ?? 'application/pdf' },
  );
}

export default function RateConInboxPage({ onOpenCreateLoad }: { onOpenCreateLoad?: () => void } = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHandled, setShowHandled] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('rate_con_ingest_queue')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(200);
    if (error) {
      logDbError('rate con inbox fetch', error);
      toast({ variant: 'destructive', description: 'Could not load the rate con inbox.' });
      return;
    }
    // A duplicate the system collapsed on its own stays visible in the default
    // view: a silent collapse is indistinguishable from mail never arriving.
    const visible = (data ?? []).filter(row => showHandled || isDefaultVisible(row));

    setRows(visible);
    setLoading(false);
  }, [showHandled, toast]);


  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // The ingest function lands rows asynchronously — the badge and the list
  // follow inserts and status changes without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('rate-con-inbox')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rate_con_ingest_queue',
      }, () => { void fetchRows(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRows]);

  const openAttachment = async (row: QueueRow) => {
    setBusyId(row.id);
    try {
      if (!row.attachment_storage_path) throw new Error('No stored attachment.');
      const { data, error } = await supabase.storage
        .from('rate-con-ingest')
        .createSignedUrl(row.attachment_storage_path, 3600);
      if (error || !data?.signedUrl) throw error ?? new Error('Could not sign the attachment URL.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      logDbError('rate con attachment open', e, { queueId: row.id });
      toast({ variant: 'destructive', description: 'Could not open the attachment.' });
    } finally {
      setBusyId(null);
    }
  };

  // One click, by design: junk and portal-link emails must cost a dispatcher
  // nothing. Dismissed items remain visible under "Show handled".
  const dismiss = async (row: QueueRow) => {
    setBusyId(row.id);
    try {
      const { error } = await supabase
        .from('rate_con_ingest_queue')
        .update({
          status: 'dismissed',
          dismissed_by: session?.user?.id ?? null,
          dismissed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
      toast({ description: 'Inbox item dismissed.' });
      await fetchRows();
    } catch (e) {
      logDbError('rate con inbox dismiss', e, { queueId: row.id });
      toast({ variant: 'destructive', description: 'Could not dismiss that item.' });
    } finally {
      setBusyId(null);
    }
  };

  const retryParse = async (row: QueueRow) => {
    setBusyId(row.id);
    try {
      const { error } = await supabase.functions.invoke('receive-rate-con-email', {
        body: { action: 'retry', queue_id: row.id },
      });
      if (error) throw error;
      toast({ description: 'Retry started.' });
      await fetchRows();
    } catch (e) {
      logDbError('rate con inbox retry', e, { queueId: row.id });
      toast({ variant: 'destructive', description: 'Could not retry parsing that item.' });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Conversion: the stored attachment and the SERVER-verified parse travel to
   * Create Load as a one-shot handoff. The form runs only its application
   * half — the document is never parsed or verified a second time.
   */
  const createLoad = async (row: QueueRow) => {
    setOpeningId(row.id);
    try {
      if (!row.parsed) throw new Error('This item has no parsed result to apply.');
      const file = await downloadAttachment(row);
      stashIngestParse({
        queueId: row.id,
        file,
        parsed: row.parsed as unknown as ParsedRateConfirmation,
        checks: (row.verbatim_checks ?? []) as unknown as VerbatimCheck[],
        layerText: row.text_layer ?? '',
        layerAvailable: !!row.text_layer_available,
        pageCount: row.attachment_page_count ?? 0,
      });
      if (onOpenCreateLoad) onOpenCreateLoad();
      else navigate('/dispatch/loads/new');
    } catch (e) {
      logDbError('rate con inbox create load', e, { queueId: row.id });
      toast({
        variant: 'destructive',
        title: 'Could not open this rate con',
        description: e instanceof Error ? e.message : 'Try downloading the attachment and uploading it manually.',
      });
    } finally {
      setOpeningId(null);
    }
  };

  const open = rows.filter(r => OPEN_STATUSES.includes(r.status));
  const handled = showHandled ? rows.filter(r => !OPEN_STATUSES.includes(r.status)) : [];

  const renderRow = (row: QueueRow) => {
    const busy = busyId === row.id || openingId === row.id;
    const isOpen = OPEN_STATUSES.includes(row.status);
    const checks = (row.verbatim_checks ?? null) as unknown as VerbatimCheck[] | null;
    const summary = verbatimSummary(checks);
    return (
      <div
        key={row.id}
        className="rounded-lg border border-border bg-card p-3 sm:p-4 flex flex-col gap-2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">
                {row.subject || '(no subject)'}
              </span>
              <Badge
                variant="outline"
                className={
                  row.status === 'parsed'
                    ? 'border-status-complete/40 text-status-complete'
                    : row.status === 'needs_manual'
                    ? 'border-gold/50 text-gold'
                    : row.status === 'pending_parse'
                    ? 'border-status-progress/40 text-status-progress'
                    : 'border-border text-muted-foreground'
                }
              >
                {row.status === 'dismissed' && !row.dismissed_by && /^duplicate/i.test(row.dismiss_reason ?? '')
                  ? 'Duplicate — collapsed'
                  : STATUS_LABEL[row.status]}
              </Badge>
              {!row.sender_allowed && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  Wrong address
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {row.from_address ?? 'Unknown sender'} · {formatIngestWhen(row.received_at)}
              {' · '}{attachmentLabel(row)}
            </p>
            {row.broker_load_number && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Broker ref: <span className="font-medium text-foreground">{row.broker_load_number}</span>
              </p>
            )}
            {row.status === 'parsed' && summary && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-gold shrink-0" />
                {summary}
              </p>
            )}
            {row.parse_error && (
              <p className="text-xs text-destructive mt-0.5 flex items-start gap-1.5">
                {row.parse_status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />}
                <span>{row.parse_error}</span>
              </p>
            )}
            {row.status === 'auto_handled' && row.matched_load_id && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-status-complete shrink-0" />
                Already entered as a load — nothing to do.
              </p>
            )}
            {row.dismiss_reason && (
              <p className="text-xs text-muted-foreground mt-0.5">{row.dismiss_reason}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {row.attachment_storage_path && (
              <Button
                size="sm" variant="ghost"
                disabled={busy}
                onClick={() => void openAttachment(row)}
                title="Open the original attachment"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {row.status === 'parsed' && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void createLoad(row)}
                className="bg-gold text-[#0D0D0D] hover:bg-gold/90"
              >
                {openingId === row.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : 'Create load'}
              </Button>
            )}
            {canRetry(row) && (
              <Button
                size="sm" variant="outline"
                disabled={busy}
                onClick={() => void retryParse(row)}
                title="Retry parsing this stored attachment"
              >
                {busyId === row.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><RefreshCw className="h-4 w-4 mr-1" />Retry</>}
              </Button>
            )}
            {isOpen && row.status !== 'pending_parse' && (
              <Button
                size="sm" variant="outline"
                disabled={busy}
                onClick={() => void dismiss(row)}
                title="Dismiss — junk or already handled"
              >
                {busyId === row.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><X className="h-4 w-4 mr-1" />Dismiss</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <InboxIcon className="h-5 w-5 text-gold" />
            Rate Con Inbox
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rate confirmations emailed to the ingest address land here, already parsed and
            verbatim-checked. Shared queue — anyone in dispatch works any item.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="show-handled"
              checked={showHandled}
              onCheckedChange={setShowHandled}
            />
            <Label htmlFor="show-handled" className="text-xs text-muted-foreground">
              Show handled
            </Label>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => { setLoading(true); void fetchRows(); }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : open.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <MailQuestion className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Inbox zero</p>
          <p className="text-xs text-muted-foreground mt-1">
            No emailed rate confirmations are waiting. Manual upload on the Create Load
            page is unchanged and always available.
          </p>
        </div>
      ) : (
        <div className="space-y-2">{open.map(renderRow)}</div>
      )}

      {showHandled && handled.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 pt-2">
            <Archive className="h-4 w-4" />
            Handled
          </h2>
          {handled.map(renderRow)}
        </div>
      )}

      {showHandled && !loading && handled.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
          <FileWarning className="h-3.5 w-3.5" />
          No handled items yet.
        </p>
      )}
    </div>
  );
}
