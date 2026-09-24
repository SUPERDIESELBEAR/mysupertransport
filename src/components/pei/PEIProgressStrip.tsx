import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchPEIRequestsByApplication } from '@/lib/pei/api';
import { STATUS_LABEL, type PEIRequestStatus } from '@/lib/pei/types';

export interface PEIProgress {
  total: number;
  pending: number;
  awaiting: number;
  completed: number;
  employers: { name: string; status: PEIRequestStatus }[];
}

/**
 * One shared read of an application's live (non-withdrawn) previous-employer
 * requests, used by both the progress strip and the PEI tab badge.
 */
export function usePEIProgress(applicationId: string | null | undefined) {
  const [progress, setProgress] = useState<PEIProgress | null>(null);

  useEffect(() => {
    if (!applicationId) { setProgress(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchPEIRequestsByApplication(applicationId);
        if (cancelled) return;
        const p: PEIProgress = { total: 0, pending: 0, awaiting: 0, completed: 0, employers: [] };
        // Oldest first so the strip reads in the order the checks were built.
        for (const r of [...rows].reverse()) {
          p.total += 1;
          p.employers.push({ name: r.employer_name, status: r.status });
          if (r.status === 'pending') p.pending += 1;
          else if (r.status === 'completed' || r.status === 'gfe_documented') p.completed += 1;
          else p.awaiting += 1;
        }
        setProgress(p);
      } catch {
        // A read failure must not take the application screen down.
        if (!cancelled) setProgress(null);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  return progress;
}

function segmentClass(status: PEIRequestStatus) {
  if (status === 'completed' || status === 'gfe_documented') return 'bg-status-complete';
  if (status === 'pending') return 'bg-muted-foreground/30';
  return 'bg-warning';
}

interface Props {
  applicationId: string;
  progress?: PEIProgress | null;
  onOpenPEI?: () => void;
}

export function PEIProgressStrip({ applicationId, progress: external, onOpenPEI }: Props) {
  const own = usePEIProgress(external === undefined ? applicationId : null);
  const progress = external === undefined ? own : external;

  if (!progress) return null;

  if (progress.total === 0) {
    return (
      <div
        className="px-5 py-2 text-xs text-muted-foreground border-b border-border bg-muted/20"
        data-testid="pei-progress-strip-empty"
      >
        No previous-employer checks built yet
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenPEI}
      disabled={!onOpenPEI}
      className="w-full text-left px-5 py-2 border-b border-border bg-muted/20 hover:bg-muted/40 transition-colors disabled:hover:bg-muted/20"
      data-testid="pei-progress-strip"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <TooltipProvider delayDuration={150}>
          <div className="flex items-center gap-1 shrink-0">
            {progress.employers.map((e, i) => (
              <Tooltip key={`${e.name}-${i}`}>
                <TooltipTrigger asChild>
                  <span
                    className={`h-2.5 w-14 rounded-full ${segmentClass(e.status)}`}
                    aria-label={`${e.name}: ${STATUS_LABEL[e.status]}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[11px]">
                  <span className="font-medium">{e.name}</span> — {STATUS_LABEL[e.status]}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
        <span className="text-xs font-medium tabular-nums">
          Previous-employer checks {progress.completed}/{progress.total} complete
        </span>
        {progress.pending > 0 && (
          <span className="text-xs text-muted-foreground">
            {progress.pending} not sent yet
          </span>
        )}
      </div>
    </button>
  );
}
