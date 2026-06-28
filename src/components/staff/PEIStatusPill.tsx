import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface PEICounts {
  total: number;
  pending: number;       // status='pending'
  awaiting: number;      // sent / follow_up_sent / final_notice_sent
  completed: number;     // completed / gfe_documented
  perEmployer: { name: string; status: string }[];
}

interface Props {
  counts: PEICounts | undefined;
  onClick?: () => void;
}

/**
 * Compact PEI status pill rendered on each Applicant Pipeline card.
 * Hidden when there are no PEI requests for the applicant yet.
 */
export function PEIStatusPill({ counts, onClick }: Props) {
  if (!counts || counts.total === 0) return null;
  const allDone = counts.completed === counts.total;
  const tone = allDone
    ? 'bg-status-complete/10 text-status-complete border-status-complete/30'
    : 'bg-warning/10 text-warning border-warning/30';

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none border shrink-0 tabular-nums transition-colors hover:brightness-110 ${tone}`}
            aria-label={`PEI ${counts.completed} of ${counts.total} complete`}
          >
            <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
            PEI {counts.completed}/{counts.total}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-left max-w-[260px] p-2 space-y-1">
          <p className="text-[11px] font-semibold">Previous Employment Investigations</p>
          <ul className="space-y-0.5">
            {counts.perEmployer.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-foreground">{e.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                  {e.status.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground italic pt-0.5">Click to open PEI panel</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function summarizePEIRows(
  rows: { application_id: string; status: string; employer_name: string }[]
): Record<string, PEICounts> {
  const map: Record<string, PEICounts> = {};
  for (const r of rows) {
    const c = (map[r.application_id] ??= {
      total: 0, pending: 0, awaiting: 0, completed: 0, perEmployer: [],
    });
    c.total += 1;
    c.perEmployer.push({ name: r.employer_name, status: r.status });
    if (r.status === 'pending') c.pending += 1;
    else if (r.status === 'completed' || r.status === 'gfe_documented') c.completed += 1;
    else c.awaiting += 1;
  }
  return map;
}