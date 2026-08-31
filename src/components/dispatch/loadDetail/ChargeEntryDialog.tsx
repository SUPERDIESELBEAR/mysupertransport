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
  FUNDING_SOURCE_LABELS, FUNDING_SOURCE_MEANING, addLoadCharge, chargeClassification,
  updateLoadCharge, type ChargeEntryInput, type FundingSource, type LoadChargeRecord,
} from '@/lib/loadCharges';
import { payClassOf, type PayPolicyRates } from '@/lib/payTreatment';
import { CLASSIFICATION_LABELS, CLASSIFICATION_OPTIONS } from '@/lib/revisedRateCon';

/**
 * Entering money that was agreed during the load.
 *
 * Detention, lumper and layover arise mid-load and are negotiated on the phone.
 * Where a revised rate confirmation follows, that path stays the source and
 * writes the charge itself; this dialog exists for the agreements no revised
 * con ever documents.
 *
 * The three reimbursement facts are the SAME fields the card already edits —
 * they are offered here so a reimbursement can be entered complete, not so a
 * second confirmation flow exists.
 */
export default function ChargeEntryDialog({
  loadId, charge, policy, documents, open, onOpenChange, onSaved,
}: {
  loadId: string;
  /** Null for a new charge; the row being changed otherwise. */
  charge: LoadChargeRecord | null;
  policy: PayPolicyRates | null;
  documents: { id: string; document_name: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ChargeEntryInput>({
    chargeType: 'detention', amount: '', description: '', reason: '',
    funding_source: '', actual_cost: '', proof_document_id: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      chargeType: charge ? chargeClassification(charge.charge_type) : 'detention',
      amount: charge?.amount === null || charge?.amount === undefined ? '' : String(charge.amount),
      description: charge?.description ?? '',
      reason: '',
      funding_source: charge?.funding_source ?? '',
      actual_cost: charge?.actual_cost === null || charge?.actual_cost === undefined
        ? '' : String(charge.actual_cost),
      proof_document_id: charge?.proof_document_id ?? '',
    });
  }, [open, charge]);

  const isReimbursement =
    payClassOf(chargeClassification(form.chargeType), policy) === 'reimbursement';

  const save = useMutation({
    mutationFn: () => (charge
      ? updateLoadCharge(charge.id, form)
      : addLoadCharge(loadId, form).then(() => undefined)),
    onSuccess: () => {
      toast({ title: charge ? 'Charge updated' : 'Charge added' });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast({
      title: charge ? 'Could not update the charge' : 'Could not add the charge',
      description: e instanceof Error ? e.message : 'Unexpected error',
      variant: 'destructive',
    }),
  });

  const amountInvalid = !form.amount.trim() || !Number.isFinite(Number(form.amount))
    || Number(form.amount) < 0;
  const disabled = save.isPending || amountInvalid || !form.reason.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{charge ? 'Edit charge' : 'Add a charge'}</DialogTitle>
          <DialogDescription>
            For money agreed during the load with no revised rate confirmation to follow.
            Where a revised con is coming, apply it instead — that path is the source.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Charge type</Label>
            <Select
              value={form.chargeType}
              onValueChange={v => setForm(f => ({ ...f, chargeType: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_OPTIONS.map(k => (
                  <SelectItem key={k} value={k}>{CLASSIFICATION_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="charge-amount">Amount</Label>
            <Input
              id="charge-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="What the broker agreed to pay"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="charge-description">Description</Label>
            <Input
              id="charge-description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detention at the receiver, 3 hours"
            />
          </div>

          {isReimbursement ? (
            <div className="space-y-3 rounded-md border border-border bg-[#F9F9F9] p-3">
              <div className="space-y-1.5">
                <Label>Funding source</Label>
                <Select
                  value={form.funding_source || undefined}
                  onValueChange={v => setForm(f => ({ ...f, funding_source: v as FundingSource }))}
                >
                  <SelectTrigger><SelectValue placeholder="Not confirmed" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">{FUNDING_SOURCE_LABELS.driver}</SelectItem>
                    <SelectItem value="company">{FUNDING_SOURCE_LABELS.company}</SelectItem>
                  </SelectContent>
                </Select>
                {form.funding_source ? (
                  <p className="text-[11px] text-[#555555]">
                    {FUNDING_SOURCE_MEANING[form.funding_source]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="charge-actual-cost">Actual cost</Label>
                <Input
                  id="charge-actual-cost"
                  inputMode="decimal"
                  value={form.actual_cost}
                  onChange={e => setForm(f => ({ ...f, actual_cost: e.target.value }))}
                  placeholder="What was spent"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Proof document</Label>
                <Select
                  value={form.proof_document_id || undefined}
                  onValueChange={v => setForm(f => ({ ...f, proof_document_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Not attached" /></SelectTrigger>
                  <SelectContent>
                    {documents.length === 0 ? (
                      <SelectItem value="__none" disabled>No documents on this load</SelectItem>
                    ) : documents.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.document_name || 'Document'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="charge-reason">Reason</Label>
            <Textarea
              id="charge-reason"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Who agreed it, and when. This is recorded in the load's change history."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={disabled} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : charge ? 'Save charge' : 'Add charge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
