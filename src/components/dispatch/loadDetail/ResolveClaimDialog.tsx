import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { manageClaimFlag, type LoadClaim } from '@/lib/loadDetail';
import {
  AMOUNT_REQUIRED, CLAIM_TYPE_LABELS, RESOLUTION_OUTCOMES, type ResolutionOutcome,
} from './claimConstants';

export default function ResolveClaimDialog({
  claim, open, onOpenChange, onSaved,
}: {
  claim: LoadClaim;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const [outcome, setOutcome] = useState<ResolutionOutcome>('denied');
  const [notes, setNotes] = useState('');
  const [actual, setActual] = useState(
    claim.actual_claim_amount !== null && claim.actual_claim_amount !== undefined
      ? String(claim.actual_claim_amount) : '',
  );

  const needsAmount = AMOUNT_REQUIRED.includes(outcome);

  const mutation = useMutation({
    mutationFn: () => manageClaimFlag({
      action: 'resolve',
      claimId: claim.id,
      resolution: outcome,
      resolutionNotes: notes,
      actualAmount: needsAmount ? Number(actual) : null,
    }),
    onSuccess: async () => {
      await onSaved();
      toast({ title: 'Claim resolved' });
      onOpenChange(false);
    },
    onError: (err) => {
      logDbError('manageClaimFlag:resolve', err, { claimId: claim.id, outcome });
      toast({
        title: 'Could not resolve the claim',
        description: getDbErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const amountInvalid = needsAmount && (!actual.trim() || !Number.isFinite(Number(actual)));
  const disabled = mutation.isPending || !notes.trim() || amountInvalid;

  return (
    <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Claim</DialogTitle>
          <DialogDescription>
            {CLAIM_TYPE_LABELS[claim.claim_type]}
            {claim.flag_level === 'hold' ? ' — resolving releases the settlement hold.' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={outcome} onValueChange={v => setOutcome(v as ResolutionOutcome)} className="space-y-2">
            {RESOLUTION_OUTCOMES.map(o => (
              <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                <RadioGroupItem value={o.value} id={`resolution-${o.value}`} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.help}</span>
                </span>
              </label>
            ))}
          </RadioGroup>

          {needsAmount ? (
            <div className="space-y-1.5">
              <Label htmlFor="claim-actual">Actual claim amount <span className="text-destructive">*</span></Label>
              <Input
                id="claim-actual" inputMode="decimal" value={actual}
                onChange={e => setActual(e.target.value)}
                placeholder="0.00"
              />
              {actual.trim() && !Number.isFinite(Number(actual)) ? (
                <p className="text-xs text-destructive">Enter a valid dollar amount.</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="claim-resolution-notes">Resolution notes <span className="text-destructive">*</span></Label>
            <Textarea
              id="claim-resolution-notes" rows={3} value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="How the claim was settled"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={disabled}>
            {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Resolution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
