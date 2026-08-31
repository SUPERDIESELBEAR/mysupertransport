import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/loadFormat';
import {
  FUNDING_SOURCE_LABELS, FUNDING_SOURCE_MEANING, chargeClassification,
  fetchLoadCharges, isMoneyFixed, missingReimbursementFacts, saveReimbursementFacts,
  type LoadChargeRecord, type ReimbursementFacts,
} from '@/lib/loadCharges';
import { fetchEffectivePayPolicy, payClassOf, payTreatment } from '@/lib/payTreatment';
import { CLASSIFICATION_LABELS } from '@/lib/revisedRateCon';
import { fetchLoadDocuments } from '@/lib/loadDocuments';
import ChargeEntryDialog from './ChargeEntryDialog';
import RemoveChargeDialog from './RemoveChargeDialog';

/**
 * Every charge on the load, with what each one does to the driver's pay.
 *
 * The card is self-contained on purpose: it reads its own rows from `loadId`
 * and holds no assumption about what sits above or below it, so moving it under
 * a Financials tab later is a change of placement only.
 */
export default function LoadChargesCard({
  loadId, operatorId, canEdit, loadStatus, onChanged,
}: {
  loadId: string;
  operatorId?: string | null;
  canEdit?: boolean;
  /** Drives the money-fixed refusal; the server refuses regardless. */
  loadStatus?: string | null;
  /** Called after a charge is created, changed or removed so the header total refreshes. */
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState<LoadChargeRecord | null>(null);
  const [removing, setRemoving] = useState<LoadChargeRecord | null>(null);

  const { data: charges, isLoading } = useQuery({
    queryKey: ['load-charges', loadId],
    queryFn: () => fetchLoadCharges(loadId),
  });

  const { data: policy } = useQuery({
    queryKey: ['effective-pay-policy', operatorId ?? null],
    queryFn: () => fetchEffectivePayPolicy(operatorId ?? null),
  });

  const { data: documents } = useQuery({
    queryKey: ['load-documents', loadId],
    queryFn: () => fetchLoadDocuments(loadId),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['load-charges', loadId] });
    onChanged?.();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Charges</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  const rows = charges ?? [];
  const moneyFixed = isMoneyFixed(loadStatus);
  const canEnter = !!canEdit && !moneyFixed;
  const unconfirmed = rows.filter(
    c => payClassOf(chargeClassification(c.charge_type), policy ?? null) === 'reimbursement'
      && missingReimbursementFacts(c).length > 0,
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-[#555555]" />
          Charges
          {rows.length ? (
            <span className="text-xs font-normal text-[#555555]">({rows.length})</span>
          ) : null}
          {unconfirmed ? (
            <Badge variant="outline" className="border-amber-300 bg-[#FFE8E8] text-xs text-[#1A1A1A]">
              {unconfirmed} reimbursement{unconfirmed === 1 ? '' : 's'} unconfirmed
            </Badge>
          ) : null}
          {canEnter ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => { setEditing(null); setEntryOpen(true); }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add charge
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {canEdit && moneyFixed ? (
          <p className="mb-3 rounded-md border border-border bg-[#E8F0FF] p-2 text-xs text-[#1A1A1A]">
            This load's money is fixed. A late accessorial goes through the adjustment path,
            referencing this load, and lands in a later settlement.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-[#555555]">
            No charges are on this load beyond the linehaul and fuel surcharge.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(charge => (
              <ChargeRow
                key={charge.id}
                charge={charge}
                policy={policy ?? null}
                documents={documents ?? []}
                canEdit={!!canEdit}
                canEnter={canEnter}
                onEdit={() => { setEditing(charge); setEntryOpen(true); }}
                onRemove={() => setRemoving(charge)}
                onSaved={refresh}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <ChargeEntryDialog
        loadId={loadId}
        charge={editing}
        policy={policy ?? null}
        documents={documents ?? []}
        open={entryOpen}
        onOpenChange={o => { setEntryOpen(o); if (!o) setEditing(null); }}
        onSaved={refresh}
      />
      <RemoveChargeDialog
        charge={removing}
        open={!!removing}
        onOpenChange={o => { if (!o) setRemoving(null); }}
        onRemoved={refresh}
      />
    </Card>
  );
}


function ChargeRow({
  charge, policy, documents, canEdit, canEnter, onEdit, onRemove, onSaved,
}: {
  charge: LoadChargeRecord;
  policy: Parameters<typeof payTreatment>[1];
  documents: { id: string; document_name: string | null }[];
  canEdit: boolean;
  canEnter: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onSaved: () => void;
}) {
  const klass = chargeClassification(charge.charge_type);
  const treatment = payTreatment(klass, policy);
  const isReimbursement = payClassOf(klass, policy) === 'reimbursement';
  const missing = isReimbursement ? missingReimbursementFacts(charge) : [];

  const [facts, setFacts] = useState<ReimbursementFacts>({
    funding_source: charge.funding_source ?? '',
    actual_cost: charge.actual_cost === null || charge.actual_cost === undefined
      ? '' : String(charge.actual_cost),
    proof_document_id: charge.proof_document_id ?? '',
  });

  // Rows are replaced wholesale when a load is edited; re-sync so the editor
  // never shows a stale confirmation.
  useEffect(() => {
    setFacts({
      funding_source: charge.funding_source ?? '',
      actual_cost: charge.actual_cost === null || charge.actual_cost === undefined
        ? '' : String(charge.actual_cost),
      proof_document_id: charge.proof_document_id ?? '',
    });
  }, [charge.id, charge.funding_source, charge.actual_cost, charge.proof_document_id]);

  const save = useMutation({
    mutationFn: () => saveReimbursementFacts(charge.id, facts),
    onSuccess: () => {
      toast({ title: 'Reimbursement updated' });
      onSaved();
    },
    onError: (e: unknown) => toast({
      title: 'Could not save the reimbursement',
      description: e instanceof Error ? e.message : 'Unexpected error',
      variant: 'destructive',
    }),
  });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1A1A1A]">
            {charge.description || CLASSIFICATION_LABELS[klass]}
          </p>
          <p className="text-xs text-[#555555]">
            {CLASSIFICATION_LABELS[klass]}
            {treatment.label ? ` · ${treatment.label}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#1A1A1A]">
            {formatCurrency(Number(charge.amount ?? 0))}
          </p>
          {canEnter ? (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRemove}>
                Remove
              </Button>
            </>
          ) : null}
        </div>
      </div>


      {isReimbursement ? (
        <div className="mt-2 rounded-md border border-border bg-[#F9F9F9] p-3">
          {missing.length ? (
            <p className="flex items-start gap-2 text-xs text-[#1A1A1A]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>Unconfirmed reimbursement — still missing {missing.join(', ')}.</span>
            </p>
          ) : (
            <p className="text-xs text-[#555555]">
              Reimbursement confirmed at {formatCurrency(Number(charge.actual_cost ?? 0))}.
            </p>
          )}

          {facts.funding_source ? (
            <p className="mt-1 text-xs text-[#555555]">
              {FUNDING_SOURCE_MEANING[facts.funding_source]}
            </p>
          ) : null}

          {canEdit ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Funding source</Label>
                <Select
                  value={facts.funding_source || undefined}
                  onValueChange={v => setFacts(f => ({ ...f, funding_source: v as 'driver' | 'company' }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Not confirmed" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">{FUNDING_SOURCE_LABELS.driver}</SelectItem>
                    <SelectItem value="company">{FUNDING_SOURCE_LABELS.company}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs" htmlFor={`cost-${charge.id}`}>Actual cost</Label>
                <Input
                  id={`cost-${charge.id}`}
                  className="mt-1 h-9"
                  inputMode="decimal"
                  value={facts.actual_cost}
                  onChange={e => setFacts(f => ({ ...f, actual_cost: e.target.value }))}
                  placeholder="What was spent"
                />
              </div>
              <div>
                <Label className="text-xs">Proof document</Label>
                <Select
                  value={facts.proof_document_id || undefined}
                  onValueChange={v => setFacts(f => ({ ...f, proof_document_id: v }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Not attached" /></SelectTrigger>
                  <SelectContent>
                    {documents.length === 0 ? (
                      <SelectItem value="__none" disabled>No documents on this load</SelectItem>
                    ) : documents.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.document_name || 'Document'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save reimbursement'}
                </Button>
                <p className="text-xs text-[#555555]">
                  Receipt or Comchek proof must be uploaded to this load first. Where proof
                  cannot be obtained, file a document exception.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
