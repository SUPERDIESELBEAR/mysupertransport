import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCachedDay } from '@/lib/eld/offline/cache';
import { authorizedUnlockDay } from '@/lib/eld/offline/authorizedUnlock';
import AuthorizedUnlockDialog from './AuthorizedUnlockDialog';

/**
 * Driver-facing notice for a log that is signed and locked on this device but
 * has not reached the office.
 *
 * Never rendered at /roadside. An officer reads the packet as a §395.8 record:
 * a day the driver certified is "Certified" there, with no sync commentary
 * attached to it, per Pass B §4. This component lives only in the day editor
 * and the driver's Logs list, both of which are behind the app shell.
 */
export default function StalledLogBanner({
  operatorId, logDate, compact, showDate, onUnlocked,
}: {
  operatorId: string;
  logDate: string;
  compact?: boolean;
  /** List context: several banners can stack, so each must name its day. */
  showDate?: boolean;
  onUnlocked?: () => void;
}) {
  const [state, setState] = useState<{ stalled: boolean; rejected: boolean; locked: boolean } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const entry = await getCachedDay(logDate);
    setState(entry
      ? {
        stalled: !!entry.sync_stalled,
        rejected: !!entry.sync_rejected,
        locked: !!entry.local_certified_at,
      }
      : null);
  }, [logDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function confirmUnlock(reason: string) {
    setBusy(true);
    try {
      const result = await authorizedUnlockDay({
        operatorId,
        logDate,
        reason,
        deviceInfo: typeof navigator === 'undefined' ? null : navigator.userAgent,
      });
      if (result.ok === true) {
        toast.success('Log reopened', {
          description: 'It is a draft again on this device. The office has been told why.',
        });
      } else if (result.reason === 'server_certified') {
        toast.info('The office already has this log', {
          description: 'It was received after all, so it stays certified. This device is now up to date.',
        });
      } else {
        toast.info('This log is not locked on this device.');
      }
      setDialogOpen(false);
      await refresh();
      onUnlocked?.();
    } catch (err) {
      toast.error('Could not reopen the log', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!state || !state.locked || (!state.stalled && !state.rejected)) return null;

  const dayLabel = new Date(`${logDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const base = state.rejected
    ? 'The office could not accept this log'
    : 'This log has not reached the office yet';
  const headline = showDate ? `${dayLabel} — ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;

  return (
    <div className={`rounded-lg border border-destructive/40 bg-destructive/5 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-destructive">{headline}</p>
          <p className="text-sm text-muted-foreground">
            {state.rejected
              ? 'You signed this log and it is locked on this device, but the office system refused it. It has to be reopened and fixed before it can be sent.'
              : 'You signed this log and it is locked on this device. It keeps failing to send, so the office does not have it yet.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Call the office. They can authorize reopening it so you can correct and re-sign it.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={() => setDialogOpen(true)}
          >
            <Unlock className="mr-2 h-4 w-4" />
            Reopen with office approval
          </Button>
        </div>
      </div>

      <AuthorizedUnlockDialog
        open={dialogOpen}
        logDate={logDate}
        busy={busy}
        onCancel={() => setDialogOpen(false)}
        onConfirm={(reason) => { void confirmUnlock(reason); }}
      />
    </div>
  );
}