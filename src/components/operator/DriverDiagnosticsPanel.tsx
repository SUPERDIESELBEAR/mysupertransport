import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/pwa';
import {
  collectServiceWorkerInfo,
  formatDiagnosticsForCopy,
  getDiagnosticsHeader,
  readNavTrace,
  resetDriverAppState,
} from '@/lib/navTrace';

interface DriverDiagnosticsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Hidden diagnostics panel opened by 5-tapping the version footer in
 * `BuildInfo`. Lets a driver copy their nav trace + environment info to
 * support, or hard-reset client state when the app feels stuck.
 */
export default function DriverDiagnosticsPanel({ open, onOpenChange }: DriverDiagnosticsPanelProps) {
  const [payload, setPayload] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const header = getDiagnosticsHeader();
      const sws = await collectServiceWorkerInfo();
      const trace = readNavTrace();
      if (cancelled) return;
      setPayload(formatDiagnosticsForCopy(header, sws, trace));
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(payload);
    if (ok) {
      toast.success('Diagnostics copied — paste to support.');
    } else {
      toast.error('Copy failed. Select the text and copy manually.');
    }
  };

  const handleReset = async () => {
    setBusy(true);
    toast('Resetting app… you will be signed out and reloaded.');
    await resetDriverAppState();
    // resetDriverAppState triggers a hard navigation; nothing else to do.
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Support Diagnostics</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground text-xs">
            If the app feels stuck, tap <strong>Reset app state</strong> first. If the problem
            comes back, open this panel again and tap <strong>Copy diagnostics</strong>, then
            paste the text to support.
          </p>
          <textarea
            readOnly
            value={payload}
            className="w-full h-64 rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={handleReset}
            disabled={busy}
          >
            Reset app state
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" onClick={handleCopy}>
              Copy diagnostics
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}