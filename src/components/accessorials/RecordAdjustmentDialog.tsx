import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  createAdjustment, proofKindFor, PROOF_KIND_LABELS, type AdjustmentDraftInput,
} from '@/lib/accessorialAdjustments';
import { CLASSIFICATION_LABELS, CLASSIFICATION_OPTIONS } from '@/lib/revisedRateCon';

/**
 * Recording a late accessorial, from the load whose money is already fixed.
 *
 * The reference is NOT shown, offered or reserved here — it is allocated inside
 * the create function and only exists once the row does.
 */
export default function RecordAdjustmentDialog({
  loadId, documents, open, onOpenChange, onSaved,
}: {
  loadId: string;
  documents: { id: string; document_name: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AdjustmentDraftInput>({
    chargeType: 'detention', amount: '', description: '', reason: '',
    funding_source: '', actual_cost: '', proof_document_id: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      chargeType: 'detention', amount: '', description: '', reason: '',
      funding_source: '', actual_cost: '', proof_document_id: '',
    });
  }, [open]);

  const proofKind = proofKindFor(form.chargeType);

  const save = useMutation({
    mutationFn: () => createAdjustment(loadId, form),
    onSuccess: () => {
      toast({
        title: 'Late accessorial recorded',
        description: 'It is a draft until it is sent for approval.',
      });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast({
      title: 'Could not record it',
      description: e instanceof Error ? e.message : 'Unexpected error',
      variant: 'destructive',
    }),
  });

  const amountInvalid = !form.amount.trim() || !Number.isFinite(Number(form.amount))
    || Number(form.amount) <= 0;
  const disabled = save.isPending || amountInvalid || !form.reason.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="record-adjustment-dialog">
        <DialogHeader>
          <DialogTitle>Record a late accessorial</DialogTitle>
          <DialogDescription>
            For money agreed after this load's money was fixed. It lands in a later
            settlement and never reopens a closed one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Charge type</Label>
            <Select
              value={form.chargeType}
              onValueChange={v => setForm(f => ({ ...f, chargeType: v }))}
            >
              <SelectTrigger data-testid="adjustment-charge-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_OPTIONS.map(k => (
                  <SelectItem key={k} value={k}>{CLASSIFICATION_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjustment-amount">Amount</Label>
            <Input
              id="adjustment-amount"
              data-testid="adjustment-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="What the broker agreed to pay"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjustment-description">Description</Label>
            <Input
              id="adjustment-description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detention at the receiver, agreed by the broker on the 8th"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Backup documentation</Label>
            <Select
              value={form.proof_document_id || undefined}
              onValueChange={v => setForm(f => ({ ...f, proof_document_id: v }))}
            >
              <SelectTrigger data-testid="adjustment-proof">
                <SelectValue placeholder="Not attached yet" />
              </SelectTrigger>
              <SelectContent>
                {documents.length === 0 ? (
                  <SelectItem value="__none" disabled>No documents on this load yet</SelectItem>
                ) : documents.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.document_name || 'Document'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground" data-testid="adjustment-proof-hint">
              A {CLASSIFICATION_LABELS[form.chargeType as keyof typeof CLASSIFICATION_LABELS]
                 ?? form.chargeType} charge needs {PROOF_KIND_LABELS[proofKind]}. It can be
              attached later, but nothing can be sent for approval without it — upload it to
              the load first.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjustment-reason-new">Reason</Label>
            <Textarea
              id="adjustment-reason-new"
              data-testid="adjustment-new-reason"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Who agreed it, and when."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="adjustment-save" disabled={disabled} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Record it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
