import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/loadFormat';
import {
  approveAdjustment, attachAdjustmentProof, proofKindFor, rejectAdjustment,
  submitAdjustment, voidAdjustment,
  type AdjustmentAction, type AdjustmentRecord, type ProofKind,
} from '@/lib/accessorialAdjustments';
import ProofPicker from '@/components/accessorials/ProofPicker';

/**
 * Every one of the four writers refuses a blank reason, so there is no
 * reason-free action to offer and this dialog is the only way to reach them.
 */

const COPY: Record<AdjustmentAction, { title: string; verb: string; blurb: string; hint: string }> = {
  submit: {
    title: 'Send for approval',
    verb: 'Send for approval',
    blurb: 'Backup documentation must be attached before this can be sent.',
    hint: 'Who agreed it, and when.',
  },
  approve: {
    title: 'Approve this late accessorial',
    verb: 'Approve',
    blurb: 'Approved money reaches the broker invoice in full and the driver at his policy percentage, in the settlement for the period this is approved in. Nothing reopens a closed period.',
    hint: 'What you checked before approving.',
  },
  reject: {
    title: 'Reject this late accessorial',
    verb: 'Reject',
    blurb: 'Rejecting is final. A corrected one has to be recorded fresh.',
    hint: 'Why it is being rejected. This is what the person who recorded it will read.',
  },
  void: {
    title: 'Void this late accessorial',
    verb: 'Void',
    blurb: 'Voiding is how an approved one is corrected — void it and record a replacement. Settled money cannot be voided.',
    hint: 'Why it is being voided.',
  },
};

export default function AdjustmentActionDialog({
  action, row, open, onOpenChange, onDone,
}: {
  action: AdjustmentAction;
  row: AdjustmentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  /** Attached in this dialog, before the row itself has been re-read. */
  const [attached, setAttached] = useState('');
  useEffect(() => { if (open) { setReason(''); setAttached(''); } }, [open, row?.id, action]);

  const copy = COPY[action];
  const hasProof = !!row?.proof_document_id || !!attached;
  const needsProof = action === 'submit' && !hasProof;

  const run = useMutation({
    mutationFn: async () => {
      if (!row) return;
      if (action === 'submit') return submitAdjustment(row.id, reason);
      if (action === 'approve') return approveAdjustment(row.id, reason);
      if (action === 'reject') return rejectAdjustment(row.id, reason);
      return voidAdjustment(row.id, reason);
    },
    onSuccess: () => {
      toast({ title: `${row?.reference ?? 'Adjustment'} — ${copy.verb.toLowerCase()}d` });
      onDone();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast({
      title: `Could not ${copy.verb.toLowerCase()} it`,
      // The server refusals are written to be read by a person; show them whole.
      description: e instanceof Error ? e.message : 'Unexpected error',
      variant: 'destructive',
    }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="adjustment-action-dialog">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {row ? `${row.reference} · ${formatCurrency(row.amount)}. ` : ''}{copy.blurb}
          </DialogDescription>
        </DialogHeader>

        {action === 'submit' && row ? (
          <ProofPicker
            loadId={row.load_id}
            chargeType={row.charge_type}
            proofKind={(row.proof_kind as ProofKind | null) ?? proofKindFor(row.charge_type)}
            value={attached || row.proof_document_id || ''}
            onChange={async id => {
              try {
                await attachAdjustmentProof(row.id, id);
                setAttached(id);
                qc.invalidateQueries({ queryKey: ['load-adjustments', row.load_id] });
                qc.invalidateQueries({ queryKey: ['adjustment-list'] });
              } catch (e) {
                toast({
                  title: 'Could not attach it',
                  description: e instanceof Error ? e.message : 'Unexpected error',
                  variant: 'destructive',
                });
              }
            }}
          />
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="adjustment-reason">Reason</Label>
          <Textarea
            id="adjustment-reason"
            data-testid="adjustment-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={copy.hint}
          />
          <p className="text-[11px] text-muted-foreground">
            Recorded with your name in the adjustment's history.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="adjustment-action-confirm"
            disabled={run.isPending || !reason.trim() || needsProof}
            variant={action === 'reject' || action === 'void' ? 'destructive' : 'default'}
            onClick={() => run.mutate()}
          >
            {run.isPending ? 'Working…' : copy.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
