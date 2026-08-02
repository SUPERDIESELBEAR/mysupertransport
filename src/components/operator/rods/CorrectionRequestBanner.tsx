import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquareWarning, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getCachedDay } from '@/lib/eld/offline/cache';
import {
  declineCorrectionRequest, fetchOpenCorrectionRequest, type CorrectionRequest,
} from '@/lib/eld/correctionRequests';

/**
 * The driver's side of a correction request.
 *
 * Whether the driver can actually amend depends on this device's cache, which
 * the office cannot see — so the office is always allowed to raise, and the
 * "you can't act on this yet" explanation lives here, next to the state that
 * knows. Declining stays available in every case, so a request can never sit
 * open because the phone is stuck.
 */
export default function CorrectionRequestBanner({
  operatorId, logDate, onAmend, onChanged, canAmend = true,
}: {
  operatorId: string;
  logDate: string;
  /** Runs the same amendment flow as the generic "Amend this log" button. */
  onAmend: () => void;
  onChanged: () => void;
  /** False when the log itself is not in an amendable state (e.g. still a draft). */
  canAmend?: boolean;
}) {
  const [request, setRequest] = useState<CorrectionRequest | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [req, cached] = await Promise.all([
      fetchOpenCorrectionRequest(operatorId, logDate),
      getCachedDay(logDate),
    ]);
    setRequest(req);
    setBlocked(!!cached && !!cached.local_certified_at && (!!cached.sync_stalled || !!cached.sync_rejected));
  }, [operatorId, logDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function decline() {
    if (!request) return;
    if (!response.trim()) { toast.error('Write a short reason so the office knows why.'); return; }
    setBusy(true);
    const result = await declineCorrectionRequest(request.id, response);
    setBusy(false);
    if (!result.ok) { toast.error(result.message ?? 'Could not send your response.'); return; }
    toast.success('Sent. The office can see your response.');
    setDeclineOpen(false);
    setResponse('');
    await refresh();
    onChanged();
  }

  if (!request) return null;

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">The office asked you to look at this log</p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.issue}</p>
          <p className="text-xs text-muted-foreground">
            Raised by {request.requested_by_name || 'the office'} on{' '}
            {new Date(request.requested_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
          </p>

          {blocked && (
            <p className="text-xs font-semibold text-destructive">
              Resolve this log&apos;s sync problem first — then you can amend it.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={onAmend} disabled={blocked || !canAmend || busy}>
              <PencilLine className="mr-2 h-4 w-4" /> Amend this log
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeclineOpen(true)} disabled={busy}>
              Decline with a response
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Amending closes this request on its own once you certify the corrected log.
          </p>
        </div>
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Decline this correction request</DialogTitle>
            <DialogDescription>
              Tell the office why the log is right as it stands. Your response is kept with the request.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={5}
            placeholder="Why the log does not need changing…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => { void decline(); }} disabled={busy || !response.trim()}>
              Send response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
