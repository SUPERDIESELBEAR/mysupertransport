import { LogOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { departingSummary, type DepartingState } from '@/lib/departing';

interface Props {
  operator: DepartingState | null | undefined;
  className?: string;
}

/**
 * Departing is shown ALONGSIDE everything else. The driver is still active,
 * still dispatchable, still settling — this is a heads-up for staff only and
 * is never rendered anywhere the driver can see.
 *
 * Visually distinct on purpose: parked is amber, a termination is red/muted,
 * this is slate/blue.
 */
export default function DepartingBadge({ operator, className = '' }: Props) {
  const summary = departingSummary(operator);
  if (!summary) return null;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="departing-badge"
            className={`inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400 ${className}`}
          >
            <LogOut className="h-3 w-3" />
            Departing
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">
            May be leaving — {summary}. Still active and dispatchable; affects settlement only. Staff view only.
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
