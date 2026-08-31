import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { deleteLoadCharge, type LoadChargeRecord } from '@/lib/loadCharges';
import { formatCurrency } from '@/lib/loadFormat';

/** Removing a charge is a money change, so it carries a written reason too. */
export default function RemoveChargeDialog({
  charge, open, onOpenChange, onRemoved,
}: {
  charge: LoadChargeRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);

  const remove = useMutation({
    mutationFn: () => deleteLoadCharge(charge!.id, reason),
    onSuccess: () => {
      toast({ title: 'Charge removed' });
      onRemoved();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast({
      title: 'Could not remove the charge',
      description: e instanceof Error ? e.message : 'Unexpected error',
      variant: 'destructive',
    }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove charge</DialogTitle>
          <DialogDescription>
            {charge
              ? `${charge.description || charge.charge_type} · ${formatCurrency(Number(charge.amount ?? 0))}`
              : ''}
            {' '}will come off the load and out of its total value.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="remove-charge-reason">Reason</Label>
          <Textarea
            id="remove-charge-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why this charge should not be on the load."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || !reason.trim()}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? 'Removing…' : 'Remove charge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
