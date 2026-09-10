import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileWarning } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  ADJUSTMENT_STATUS_LABELS, fetchAdjustments, fetchDispatcherApprovalLimit, isOverdue,
  type AdjustmentAction, type AdjustmentRecord, type AdjustmentStatus,
} from '@/lib/accessorialAdjustments';
import AdjustmentActionDialog from '@/components/accessorials/AdjustmentActionDialog';
import { AdjustmentRow } from '@/components/dispatch/loadDetail/LateAccessorialsCard';

/**
 * THE LATE ACCESSORIAL QUEUE.
 *
 * Recording happens on the load; this screen is for working through what has
 * been recorded. Dispatchers see the whole queue — they record and they approve
 * under the limit — and the limit itself is enforced by the database, so a
 * button shown in error produces a refusal rather than an approval.
 */

const FILTERS: { key: AdjustmentStatus | 'all'; label: string }[] = [
  { key: 'pending_approval', label: 'Awaiting approval' },
  { key: 'draft', label: 'Drafts' },
  { key: 'approved', label: 'Approved' },
  { key: 'settled', label: 'Settled' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'void', label: 'Void' },
  { key: 'all', label: 'Everything' },
];

export default function LateAccessorialsPage() {
  const qc = useQueryClient();
  const { isDispatcher, isManagement } = useAuth();
  const [filter, setFilter] = useState<AdjustmentStatus | 'all'>('pending_approval');
  const [acting, setActing] = useState<{ row: AdjustmentRecord; action: AdjustmentAction } | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['adjustment-list', filter],
    queryFn: () => fetchAdjustments(filter === 'all' ? undefined : filter),
  });

  const { data: limit } = useQuery({
    queryKey: ['dispatcher-accessorial-limit'],
    queryFn: fetchDispatcherApprovalLimit,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['adjustment-list'] });
    qc.invalidateQueries({ queryKey: ['pending-adjustment-count'] });
    qc.invalidateQueries({ queryKey: ['load-adjustments'] });
  };

  const list = rows ?? [];
  const overdue = useMemo(() => list.filter(r => isOverdue(r)), [list]);

  return (
    <div className="space-y-5 animate-fade-in" data-testid="late-accessorials-page">
      <div className="flex items-center gap-3">
        <FileWarning className="h-6 w-6 text-gold" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Late Accessorials</h1>
          <p className="text-sm text-muted-foreground">
            Money agreed after a load's money was fixed. An approved one lands in the
            settlement for the period it is approved in, and reaches the broker invoice
            in full.
          </p>
        </div>
      </div>

      {overdue.length ? (
        <div
          className="flex items-start gap-2 rounded-md border border-red-300 bg-[#FFE8E8] p-3 text-sm text-[#1A1A1A]"
          data-testid="late-accessorials-overdue-banner"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {overdue.length === 1
              ? 'One late accessorial has been waiting more than a day for approval.'
              : `${overdue.length} late accessorials have been waiting more than a day for approval.`}
            {' '}Every day one sits is a day the driver is not paid for it.
          </span>
        </div>
      ) : null}

      {limit === null ? (
        <p className="rounded-md border border-border bg-[#E8F0FF] p-2 text-xs text-[#1A1A1A]">
          No dispatcher approval limit is set, so only management or the owner can approve.
          The limit lives in Settlement Settings.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            data-testid={`adjustment-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card className="p-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing {filter === 'all' ? 'recorded yet' : `is ${ADJUSTMENT_STATUS_LABELS[filter as AdjustmentStatus].toLowerCase()}`}.
            Late accessorials are recorded from the load they belong to.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map(row => (
              <AdjustmentRow
                key={row.id}
                row={row}
                loadLabel={row.load_number}
                limit={limit ?? null}
                isDispatcher={!!isDispatcher}
                isManagement={!!isManagement}
                onAct={action => setActing({ row, action })}
              />
            ))}
          </ul>
        )}
      </Card>

      <AdjustmentActionDialog
        action={acting?.action ?? 'approve'}
        row={acting?.row ?? null}
        open={!!acting}
        onOpenChange={o => { if (!o) setActing(null); }}
        onDone={refresh}
      />
    </div>
  );
}
