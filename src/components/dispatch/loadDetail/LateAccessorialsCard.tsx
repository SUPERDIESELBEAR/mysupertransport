import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileWarning, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/loadFormat';
import { formatDateMDY } from '@/lib/dateDisplay';
import { fetchLoadDocuments } from '@/lib/loadDocuments';
import { CLASSIFICATION_LABELS } from '@/lib/revisedRateCon';
import {
  ADJUSTMENT_STATUS_LABELS, BILLING_STATE_LABELS, availableActions,
  fetchDispatcherApprovalLimit, fetchLoadAdjustments, isOverdue, PROOF_KIND_LABELS,
  proofKindFor, type AdjustmentAction, type AdjustmentRecord, type AdjustmentStatus,
} from '@/lib/accessorialAdjustments';
import AdjustmentActionDialog from '@/components/accessorials/AdjustmentActionDialog';
import RecordAdjustmentDialog from '@/components/accessorials/RecordAdjustmentDialog';

/**
 * LATE ACCESSORIALS ON A LOAD.
 *
 * This is the entry point: the money on this load is fixed, the charge card
 * refuses, and this is where the adjustment is recorded instead. The card shows
 * regardless of load status so an existing adjustment never disappears from
 * view; recording is offered only once the money is actually fixed, because
 * anything earlier belongs on the charge card.
 */
export default function LateAccessorialsCard({
  loadId, moneyFixed, isDispatcher, isManagement,
}: {
  loadId: string;
  moneyFixed: boolean;
  isDispatcher: boolean;
  isManagement: boolean;
}) {
  const qc = useQueryClient();
  const [recordOpen, setRecordOpen] = useState(false);
  const [acting, setActing] = useState<{ row: AdjustmentRecord; action: AdjustmentAction } | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['load-adjustments', loadId],
    queryFn: () => fetchLoadAdjustments(loadId),
  });

  const { data: documents } = useQuery({
    queryKey: ['load-documents', loadId],
    queryFn: () => fetchLoadDocuments(loadId),
  });

  const { data: limit } = useQuery({
    queryKey: ['dispatcher-accessorial-limit'],
    queryFn: fetchDispatcherApprovalLimit,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['load-adjustments', loadId] });
    qc.invalidateQueries({ queryKey: ['pending-adjustment-count'] });
    qc.invalidateQueries({ queryKey: ['adjustment-list'] });
  };

  const canRecord = (isDispatcher || isManagement) && moneyFixed;
  const list = rows ?? [];

  if (!isDispatcher && !isManagement) return null;
  if (!canRecord && list.length === 0) return null;

  return (
    <Card data-testid="late-accessorials-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileWarning className="h-4 w-4 text-[#555555]" />
          Late accessorials
          {list.length ? (
            <span className="text-xs font-normal text-[#555555]">({list.length})</span>
          ) : null}
          {canRecord ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              data-testid="record-late-accessorial"
              onClick={() => setRecordOpen(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Record one
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : list.length === 0 ? (
          <p className="text-sm text-[#555555]">
            Nothing recorded against this load after its money was fixed.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map(row => (
              <AdjustmentRow
                key={row.id}
                row={row}
                limit={limit ?? null}
                isDispatcher={isDispatcher}
                isManagement={isManagement}
                onAct={action => setActing({ row, action })}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <RecordAdjustmentDialog
        loadId={loadId}
        documents={(documents ?? []).map(d => ({ id: d.id, document_name: d.document_name }))}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onSaved={refresh}
      />
      <AdjustmentActionDialog
        action={acting?.action ?? 'submit'}
        row={acting?.row ?? null}
        open={!!acting}
        onOpenChange={o => { if (!o) setActing(null); }}
        onDone={refresh}
      />
    </Card>
  );
}

const STATUS_TONE: Record<AdjustmentStatus, string> = {
  draft: 'border-border bg-[#F9F9F9] text-[#1A1A1A]',
  pending_approval: 'border-amber-300 bg-[#FFF6E5] text-[#1A1A1A]',
  approved: 'border-emerald-300 bg-[#E9F7EF] text-[#1A1A1A]',
  settled: 'border-border bg-[#E8F0FF] text-[#1A1A1A]',
  rejected: 'border-red-300 bg-[#FFE8E8] text-[#1A1A1A]',
  void: 'border-border bg-[#F9F9F9] text-[#555555]',
};

export function AdjustmentRow({
  row, limit, isDispatcher, isManagement, onAct, loadLabel,
}: {
  row: AdjustmentRecord;
  limit: number | null;
  isDispatcher: boolean;
  isManagement: boolean;
  onAct: (action: AdjustmentAction) => void;
  loadLabel?: string | null;
}) {
  const actions = availableActions(row, { isDispatcher, isManagement }, limit);
  const overdue = isOverdue(row);
  const proofKind = (row.proof_kind as keyof typeof PROOF_KIND_LABELS | null)
    ?? proofKindFor(row.charge_type);

  return (
    <li className="py-3" data-testid={`adjustment-${row.reference}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[#1A1A1A]">{row.reference}</span>
        {loadLabel ? <span className="text-xs text-[#555555]">Load {loadLabel}</span> : null}
        <span className="text-sm text-[#1A1A1A]">
          {CLASSIFICATION_LABELS[row.charge_type as keyof typeof CLASSIFICATION_LABELS]
            ?? row.charge_type}
        </span>
        <span className="font-medium text-[#1A1A1A]">{formatCurrency(row.amount)}</span>
        <Badge variant="outline" className={`text-xs ${STATUS_TONE[row.status]}`}>
          {ADJUSTMENT_STATUS_LABELS[row.status]}
        </Badge>
        {overdue ? (
          <Badge variant="outline" className="border-red-300 bg-[#FFE8E8] text-xs text-[#1A1A1A]">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Waiting over a day
          </Badge>
        ) : null}
        <div className="ml-auto flex gap-1.5">
          {actions.map(a => (
            <Button
              key={a}
              size="sm"
              variant={a === 'reject' || a === 'void' ? 'outline' : 'default'}
              data-testid={`adjustment-action-${a}`}
              onClick={() => onAct(a)}
            >
              {a === 'submit' ? 'Send for approval'
                : a === 'approve' ? 'Approve'
                : a === 'reject' ? 'Reject' : 'Void'}
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-xs text-[#555555]">
        Recorded {formatDateMDY(row.created_at)}
        {row.description ? ` · ${row.description}` : ''}
        {' · '}{BILLING_STATE_LABELS[row.billing_state] ?? row.billing_state}
      </p>
      <p className="text-xs text-[#555555]">
        {row.proof_document_id
          ? `Backed by ${PROOF_KIND_LABELS[proofKind]}, attached to the load.`
          : `No backup documentation yet — ${PROOF_KIND_LABELS[proofKind]} is needed before this can be sent for approval.`}
      </p>
      {row.status === 'approved' ? (
        <p className="text-xs text-[#555555]">
          Approved money is frozen. A correction means voiding this and recording a replacement.
        </p>
      ) : null}
    </li>
  );
}
