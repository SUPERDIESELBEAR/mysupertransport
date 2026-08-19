import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Ban, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { updateLoadStatus } from '@/lib/loadDetail';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { formatEnumLabel, LOAD_STATUSES, type LoadStatus } from '@/lib/loadFormat';
import { getNextStatuses, isBillingStatus, isTerminalStatus } from '@/lib/loadStatusFlow';
import StatusChangeDialog from './StatusChangeDialog';

const BILLING_HELP = 'Billing status changes require management access.';

interface Props {
  loadId: string;
  currentStatus: LoadStatus;
  /** Dispatcher, management or owner. Other roles render nothing. */
  canChangeStatus: boolean;
  /** Management or owner — required for invoiced/factored/paid/settled. */
  canChangeBilling: boolean;
}

export default function LoadStatusControls({
  loadId, currentStatus, canChangeStatus, canChangeBilling,
}: Props) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<LoadStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!canChangeStatus) return null;

  const blocked = (status: LoadStatus) => isBillingStatus(status) && !canChangeBilling;

  const request = (status: LoadStatus) => {
    setTarget(status);
    setOpen(true);
  };

  const confirm = async (note: string | null) => {
    if (!target) return;
    setSubmitting(true);
    try {
      await updateLoadStatus(loadId, target, note);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['load-detail', loadId] }),
        queryClient.invalidateQueries({ queryKey: ['load-status-history', loadId] }),
        queryClient.invalidateQueries({ queryKey: ['loads'] }),
      ]);
      toast({ title: `Status changed to ${formatEnumLabel(target)}` });
      setOpen(false);
      setTarget(null);
    } catch (e) {
      logDbError('update_load_status', e, { loadId, target, hasNote: !!note });
      toast({
        title: 'Status not changed',
        description: getDbErrorMessage(e, 'Could not change the load status.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const nextSteps = getNextStatuses(currentStatus);

  const primaryButton = (status: LoadStatus) => {
    const isBlocked = blocked(status);
    const btn = (
      <Button
        key={status}
        size="sm"
        className="gap-1.5"
        disabled={isBlocked}
        onClick={() => request(status)}
      >
        Mark {formatEnumLabel(status)}
      </Button>
    );
    if (!isBlocked) return btn;
    return (
      <Tooltip key={status}>
        <TooltipTrigger asChild><span tabIndex={0}>{btn}</span></TooltipTrigger>
        <TooltipContent>{BILLING_HELP}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-2">
        {nextSteps.map(primaryButton)}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              Change Status
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel>Set status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LOAD_STATUSES.filter(s => !isTerminalStatus(s)).map(status => (
              <DropdownMenuItem
                key={status}
                disabled={status === currentStatus || blocked(status)}
                onSelect={() => request(status)}
              >
                {formatEnumLabel(status)}
                {blocked(status) ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">Mgmt</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={currentStatus === 'tonu'}
          onClick={() => request('tonu')}
        >
          <Ban className="h-4 w-4" />
          Mark TONU
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={currentStatus === 'cancelled'}
          onClick={() => request('cancelled')}
        >
          <XCircle className="h-4 w-4" />
          Mark Cancelled
        </Button>

        {!canChangeBilling ? (
          <p className="w-full text-xs text-muted-foreground sm:w-auto">{BILLING_HELP}</p>
        ) : null}

        <StatusChangeDialog
          open={open}
          onOpenChange={(v) => { if (!v) setTarget(null); setOpen(v); }}
          currentStatus={currentStatus}
          targetStatus={target}
          submitting={submitting}
          onConfirm={confirm}
        />
      </div>
    </TooltipProvider>
  );
}
