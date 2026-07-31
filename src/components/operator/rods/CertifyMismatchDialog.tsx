/**
 * Shown when the preflight guard finds the saved copy of a log does not match
 * what is on screen.
 *
 * Nothing is resolved automatically. Reloading the saved copy would throw away
 * work the driver can see; pushing the screen over the saved copy without
 * saying so would hide a write that failed. The driver decides, and the two
 * versions are named field by field so the choice is informed.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { AmendmentChange } from '@/lib/eld/amendmentDiff';

export default function CertifyMismatchDialog({
  open, onOpenChange, differences, onRetry, onUseSaved, busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  differences: AmendmentChange[];
  onRetry: () => void | Promise<void>;
  onUseSaved: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>This log was changed somewhere else</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Certifying locks the log permanently, so SUPERDRIVE checked the copy saved on this phone first. That copy
            was changed — the change has already reached this phone, but the screen still shows the older version.
            Nothing has been certified and nothing has been changed.
          </p>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="text-xs font-semibold text-foreground">What differs</div>
            <ul className="space-y-2">
              {differences.map((d, i) => (
                <li key={`${d.field_path}-${i}`} className="text-xs">
                  <div className="font-semibold text-foreground">{d.field_path}</div>
                  <div className="text-muted-foreground">
                    Saved: <span className="text-foreground">{d.old_value ?? '—'}</span>
                  </div>
                  <div className="text-muted-foreground">
                    On screen: <span className="text-foreground">{d.new_value ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-2">
            <Button disabled={busy} onClick={() => void onRetry()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Try saving again'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void onUseSaved()}>
              Use the saved version
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            &ldquo;Use the saved version&rdquo; loads the version stored on this phone and discards what is on screen.
            Neither option certifies anything — you sign again once the two agree.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}