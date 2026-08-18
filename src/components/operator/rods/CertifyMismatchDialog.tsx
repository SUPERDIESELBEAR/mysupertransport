import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import type { AmendmentChange } from '@/lib/eld/amendmentDiff';

/**
 * Shown when the certify preflight finds the saved log and the screen disagree.
 *
 * Nothing is certified from here and neither button picks a winner silently:
 * the driver saves again, or knowingly takes the office copy and loses the
 * listed edits. Certifying past a mismatch would sign a record the driver
 * never saw.
 */
export default function CertifyMismatchDialog({
  open,
  onOpenChange,
  differences,
  busy,
  onRetry,
  onUseSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  differences: AmendmentChange[];
  busy?: boolean;
  onRetry: () => void | Promise<void>;
  onUseSaved: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>This log was not saved the way it looks</AlertDialogTitle>
          <AlertDialogDescription>
            What is saved does not match what is on your screen, so nothing has been signed. Save again, or load the
            saved version and lose the changes listed below.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-2 rounded-lg border border-border p-3 text-xs">
          {differences.map((d, i) => (
            <li key={`${d.field_path}-${i}`} className="space-y-0.5">
              <div className="font-semibold text-foreground">{d.field_path}</div>
              <div className="text-muted-foreground">
                Saved: {d.old_value ?? '—'} · On screen: {d.new_value ?? '—'}
              </div>
            </li>
          ))}
        </ul>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy} onClick={() => { void onUseSaved(); }}>
            Use the saved version
          </AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void onRetry(); }}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save again
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
