import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RotateCcw, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RevertedBannerProps {
  applicationId: string;
  firstName: string | null;
  /** Bumps when parent wants the banner to refetch (e.g. after a successful revert). */
  refreshKey?: number;
}

interface RevertAuditRow {
  id: string;
  created_at: string;
  actor_name: string | null;
  metadata: {
    restored_status?: string;
    courtesy_email_sent?: boolean;
    courtesy_email_error?: string | null;
    courtesy_email_requested?: boolean;
  } | null;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function RevertedBanner({ applicationId, firstName, refreshKey = 0 }: RevertedBannerProps) {
  const [row, setRow] = useState<RevertAuditRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchRow = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_log')
      .select('id, created_at, actor_name, metadata')
      .eq('entity_type', 'application')
      .eq('entity_id', applicationId)
      .eq('action', 'revision_request_reverted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRow((data as RevertAuditRow | null) ?? null);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    setDismissed(false);
    fetchRow();
  }, [fetchRow, refreshKey]);

  if (loading || !row || dismissed) return null;

  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > TWENTY_FOUR_HOURS_MS) return null;

  const meta = row.metadata ?? {};
  const restored = (meta.restored_status || 'approved').replace(/_/g, ' ');
  const courtesyRequested =
    meta.courtesy_email_requested ?? (meta.courtesy_email_sent === true || !!meta.courtesy_email_error);
  const sent = meta.courtesy_email_sent === true;
  const failed = courtesyRequested && !sent;

  const dateLabel = new Date(row.created_at).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' CT';
  const actor = row.actor_name || 'Staff';

  // Variant styling
  let containerClass = '';
  let iconClass = '';
  let Icon = CheckCircle2;
  let headline = '';

  if (sent) {
    containerClass = 'bg-status-success/10 border-status-success/40';
    iconClass = 'text-status-success';
    Icon = CheckCircle2;
    headline = `Reverted to ${restored} · Courtesy email sent to applicant`;
  } else if (failed) {
    containerClass = 'bg-amber-50 border-amber-300';
    iconClass = 'text-amber-700';
    Icon = AlertTriangle;
    headline = `Reverted to ${restored} · Courtesy email failed to send — message ${firstName || 'the applicant'} manually`;
  } else {
    containerClass = 'bg-muted border-border';
    iconClass = 'text-muted-foreground';
    Icon = RotateCcw;
    headline = `Reverted to ${restored} · No courtesy email sent`;
  }

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('revert-application-revisions', {
        body: { applicationId, sendCourtesyEmail: true, retryEmailOnly: true },
      });
      if (error || (data as any)?.error) {
        const code = (data as any)?.error || error?.message || 'unknown';
        throw new Error(typeof code === 'string' ? code : 'Failed to retry');
      }
      const result = data as { courtesyEmailSent?: boolean };
      if (result?.courtesyEmailSent) {
        toast.success('Courtesy email sent.');
      } else {
        toast.error('Email retry failed. Please message the applicant manually.');
      }
      await fetchRow();
    } catch (err: any) {
      toast.error(err?.message ?? 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`border-t border-b p-4 shrink-0 ${containerClass}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-foreground first-letter:uppercase">{headline}</p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dateLabel} by {actor}
            {failed && meta.courtesy_email_error ? ` · ${meta.courtesy_email_error}` : ''}
          </p>
          {failed && (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 disabled:opacity-50"
              >
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Retry email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}