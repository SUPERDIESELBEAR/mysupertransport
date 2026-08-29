import { PauseCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parkedSummary, type ParkedState } from '@/lib/parking';

interface Props {
  operator: ParkedState | null | undefined;
  className?: string;
}

/**
 * Parked is shown ALONGSIDE the day status, never instead of it. A parked
 * driver is still active and still counted — just counted as parked.
 */
export default function ParkedBadge({ operator, className = '' }: Props) {
  const summary = parkedSummary(operator);
  if (!summary) return null;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="parked-badge"
            className={`inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ${className}`}
          >
            <PauseCircle className="h-3 w-3" />
            Parked
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">{summary} — still active, equipment stays assigned</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
