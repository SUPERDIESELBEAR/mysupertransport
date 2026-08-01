import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

/**
 * The reason field is not paperwork. Management cannot write to a driver's
 * device, so the authorization for reopening a signed log exists only as what
 * the driver types here — it is the whole audit record of who allowed it.
 */
export default function AuthorizedUnlockDialog({
  open, logDate, busy, onCancel, onConfirm,
}: {
  open: boolean;
  logDate: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= 10;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !busy) { setReason(''); onCancel(); } }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Reopen the log for {logDate}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>
                Call the office first. Someone there has to authorize reopening a log
                you already signed.
              </p>
              <p>
                Your signature and the signed copy are kept. The log goes back to a draft
                on this device so you can correct it and sign it again.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="unlock-reason">Who authorized this, and why</Label>
          <Textarea
            id="unlock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="text-base"
            placeholder="Example: Dana in the office approved reopening 3/14 by phone — the drive line ends an hour early."
          />
          <p className="text-xs text-muted-foreground">
            Required. This is sent to the office exactly as written.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep it locked</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready || busy}
            onClick={(e) => { e.preventDefault(); onConfirm(reason.trim()); }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reopen log
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}