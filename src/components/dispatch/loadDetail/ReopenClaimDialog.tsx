import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { manageClaimFlag, type LoadClaim } from '@/lib/loadDetail';

export default function ReopenClaimDialog({
  claim, open, onOpenChange, onSaved,
}: {
  claim: LoadClaim;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => manageClaimFlag({ action: 'reopen', claimId: claim.id, reason }),
    onSuccess: async () => {
      await onSaved();
      toast({ title: 'Claim reopened' });
      onOpenChange(false);
    },
    onError: (err) => {
      logDbError('manageClaimFlag:reopen', err, { claimId: claim.id });
      toast({
        title: 'Could not reopen the claim',
        description: getDbErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reopen Claim</DialogTitle>
          <DialogDescription>
            Reopening clears the existing resolution and returns this claim to the active list.
          </DialogDescription>
        </DialogHeader>

        {claim.flag_level === 'hold' ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            This claim is a hold. Reopening it will block this load from settlement again.
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="reopen-reason">Reason <span className="text-destructive">*</span></Label>
          <Textarea
            id="reopen-reason" rows={3} value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why this claim is being reopened"
          />
          <p className="text-xs text-muted-foreground">
            This reason is appended to the claim notes and recorded in the claim history.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !reason.trim()}
          >
            {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reopening…</> : 'Reopen Claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
