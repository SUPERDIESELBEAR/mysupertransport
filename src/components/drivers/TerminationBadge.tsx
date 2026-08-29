import { FileWarning } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTerminationDate, terminationReasonLabel } from '@/lib/leaseTermination';

export interface TerminationSummary {
  effective_date: string | null;
  reason: string | null;
}

interface Props {
  termination: TerminationSummary | null | undefined;
  className?: string;
}

/**
 * A lease_terminations row used to change nothing visible. It now shows on the
 * detail panel, the dispatch board and Driver Status, so a mistake is noticed
 * the same day rather than in an investigation two months later.
 */
export default function TerminationBadge({ termination, className = '' }: Props) {
  if (!termination) return null;
  const when = formatTerminationDate(termination.effective_date);
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="termination-badge"
            className={`inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive ${className}`}
          >
            <FileWarning className="h-3 w-3" />
            ICA Terminated{when ? ` ${when}` : ''}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">
            Appendix C on file{when ? ` — effective ${when}` : ''} · {terminationReasonLabel(termination.reason)}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
