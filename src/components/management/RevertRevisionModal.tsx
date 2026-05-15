import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RevertRevisionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    revision_requested_at?: string | null;
    revision_request_message?: string | null;
    revision_count?: number | null;
    pre_revision_status?: string | null;
  };
  onSuccess: () => void;
}

export function RevertRevisionModal({ open, onOpenChange, application, onSuccess }: RevertRevisionModalProps) {
  const [unusedTokens, setUnusedTokens] = useState<number | null>(null);
  const [sendCourtesyEmail, setSendCourtesyEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSendCourtesyEmail(false);
    setUnusedTokens(null);
    (async () => {
      const { count } = await supabase
        .from('application_resume_tokens')
        .select('token', { count: 'exact', head: true })
        .eq('application_id', application.id)
        .is('used_at', null);
      setUnusedTokens(count ?? 0);
    })();
  }, [open, application.id]);

  const fullName = [application.first_name, application.last_name].filter(Boolean).join(' ') || application.email;
  const restoredStatus = application.pre_revision_status || 'approved';
  const sentAtLabel = application.revision_requested_at
    ? new Date(application.revision_requested_at).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }) + ' CT'
    : 'Unknown';

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('revert-application-revisions', {
        body: { applicationId: application.id, sendCourtesyEmail },
      });
      if (error || (data as any)?.error) {
        const code = (data as any)?.error || error?.message || 'unknown';
        throw new Error(typeof code === 'string' ? code : 'Failed to revert');
      }
      const result = data as { courtesyEmailSent?: boolean; courtesyEmailError?: string | null };
      if (sendCourtesyEmail && !result?.courtesyEmailSent) {
        toast.success(`Reverted to ${restoredStatus}. Couldn't send courtesy email — message ${fullName} manually.`);
      } else if (sendCourtesyEmail) {
        toast.success(`Reverted to ${restoredStatus} and emailed ${application.email}.`);
      } else {
        toast.success(`Reverted to ${restoredStatus}. The applicant's link is now invalid.`);
      }
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to revert');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-status-progress" />
            Undo revision request
          </DialogTitle>
          <DialogDescription>
            Use this if the request for revisions was sent in error and the applicant doesn't actually need to make changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-[110px_1fr] gap-y-2 gap-x-3">
            <div className="text-muted-foreground">Applicant</div>
            <div>
              <div className="font-medium text-foreground">{fullName}</div>
              <div className="text-xs text-muted-foreground">{application.email}</div>
            </div>

            <div className="text-muted-foreground">Sent</div>
            <div className="text-foreground">{sentAtLabel}</div>

            {application.revision_request_message && (
              <>
                <div className="text-muted-foreground">Message</div>
                <div className="p-2.5 bg-muted/40 border border-border rounded text-xs whitespace-pre-wrap text-foreground">
                  {application.revision_request_message}
                </div>
              </>
            )}
          </div>

          <div className="border border-border rounded-lg p-3 bg-secondary/30 space-y-1.5">
            <p className="text-xs font-semibold text-foreground mb-1">This will:</p>
            <p className="text-xs text-foreground">✓ Restore status to <span className="font-semibold capitalize">{restoredStatus}</span></p>
            <p className="text-xs text-foreground">
              ✓ Invalidate {unusedTokens === null ? '…' : unusedTokens} unused resume link{unusedTokens === 1 ? '' : 's'} in their inbox
            </p>
            <p className="text-xs text-foreground">
              ✓ Reset revision count from {application.revision_count ?? 0} → {Math.max(0, (application.revision_count ?? 1) - 1)}
            </p>
            <p className="text-xs text-foreground">✓ Write an audit log entry</p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox
              checked={sendCourtesyEmail}
              onCheckedChange={(v) => setSendCourtesyEmail(v === true)}
              disabled={submitting}
              className="mt-0.5"
            />
            <div className="text-xs">
              <div className="font-medium text-foreground">Also email the applicant a "please disregard" note</div>
              <div className="text-muted-foreground">Off by default — most teams prefer to text or call instead.</div>
            </div>
          </label>

          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>The link in their inbox stops working immediately. If you skip the courtesy email, tell them to disregard the original message.</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || unusedTokens === null}
            className="bg-status-progress hover:bg-status-progress/90 text-white"
          >
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reverting…</> : 'Confirm undo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}