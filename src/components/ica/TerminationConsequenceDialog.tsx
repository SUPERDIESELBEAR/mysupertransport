import { useEffect, useState } from 'react';
import { AlertTriangle, PauseCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { looksActivelyWorking, nameMatches, type ActiveDriverSignals } from '@/lib/leaseTermination';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operatorName: string;
  signals: ActiveDriverSignals;
  /** Opens the parked control instead. */
  onParkInstead: () => void;
  onConfirm: () => void;
}

/**
 * Friction proportional to permanence. A single OK click is what failed here,
 * so this states the consequence in plain language and requires the driver's
 * full name to be typed.
 */
export default function TerminationConsequenceDialog({
  open, onOpenChange, operatorName, signals, onParkInstead, onConfirm,
}: Props) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);

  const working = looksActivelyWorking(signals);
  const matched = nameMatches(typed, operatorName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            End {operatorName}'s Independent Contractor Agreement?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-foreground">
              <p>
                This <strong>ends the operator's Independent Contractor Agreement</strong> and generates a
                signed Appendix C — a legal document, sent to the insurance company.
              </p>
              <p className="text-muted-foreground">
                It is not a status note and it is not reversible from this screen.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {working && (
          <div
            data-testid="active-driver-warning"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2"
          >
            <p className="text-sm font-semibold text-destructive">
              This driver appears to be actively working.
            </p>
            <p className="text-xs text-foreground">
              {operatorName} is active, not excluded from dispatch, and has recent dispatch activity.
              If this driver is temporarily unavailable — truck down, vacation, time off — park them instead.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              data-testid="park-instead"
              onClick={() => { onOpenChange(false); onParkInstead(); }}
            >
              <PauseCircle className="h-3.5 w-3.5" />
              Park {operatorName} instead
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="termination-typed-name" className="text-xs uppercase tracking-wide text-muted-foreground">
            Type <span className="font-semibold text-foreground normal-case">{operatorName}</span> to confirm
          </Label>
          <Input
            id="termination-typed-name"
            data-testid="termination-typed-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={operatorName}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            data-testid="termination-continue"
            disabled={!matched}
            onClick={onConfirm}
          >
            I understand — end the ICA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
