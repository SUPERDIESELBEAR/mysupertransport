import { FileWarning, FileX2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTerminationDate, isVoided, terminationReasonLabel } from '@/lib/leaseTermination';

export interface TerminationSummary {
  effective_date: string | null;
  reason: string | null;
  /** Set when the document was generated in error and withdrawn. */
  voided_at?: string | null;
  void_reason?: string | null;
}

interface Props {
  termination: TerminationSummary | null | undefined;
  className?: string;
  /**
   * By default a voided row renders nothing: it is not a termination, so it
   * must not appear as one on a board or a roster. The places that own the
   * document itself (the operator detail panel, the register) pass
   * `showVoided` so the withdrawal is visible where it belongs.
   */
  showVoided?: boolean;
}

/**
 * A lease_terminations row used to change nothing visible. It now shows on the
 * detail panel, the dispatch board and Driver Status, so a mistake is noticed
 * the same day rather than in an investigation two months later.
 *
 * A VOIDED row never renders as "ICA Terminated" anywhere.
 */
export default function TerminationBadge({ termination, className = '', showVoided = false }: Props) {
  if (!termination) return null;
  const when = formatTerminationDate(termination.effective_date);
  const voided = isVoided(termination);

  if (voided) {
    if (!showVoided) return null;
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-testid="termination-badge-voided"
              className={`inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground line-through decoration-1 ${className}`}
            >
              <FileX2 className="h-3 w-3" />
              Termination Voided{when ? ` (was ${when})` : ''}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span className="text-xs">
              {termination.void_reason || 'This Appendix C was generated in error and withdrawn.'}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

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
