import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchPEIStatusMismatches, type PEIStatusMismatch } from '@/lib/pei/api';

interface Props {
  onOpenApplication?: (applicationId: string) => void;
}

/**
 * Flags applications whose previous-employer status claims progress while no
 * live request stands behind it. This is the state a deleted request used to
 * leave silently: the applicant reads "in progress" for weeks with nothing
 * actually out to any employer.
 */
export function PEIStatusMismatchAlert({ onOpenApplication }: Props) {
  const [rows, setRows] = useState<PEIStatusMismatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await fetchPEIStatusMismatches();
        if (!cancelled) setRows(found);
      } catch {
        // A read failure must not take the queue screen down.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card
      className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900"
      data-testid="pei-status-mismatch"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {rows.length} applicant{rows.length === 1 ? '' : 's'} marked as having
            previous-employer checks, with no request behind them
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
            Nothing is out to any employer for these applicants. Open each one and build or send
            the requests.
          </p>
          <ul className="mt-2 space-y-1">
            {rows.map((r) => (
              <li key={r.application_id} className="text-xs flex items-center gap-2 flex-wrap">
                <span className="font-medium">{r.applicant_name}</span>
                <span className="text-muted-foreground">
                  status: {r.pei_status === 'complete' ? 'complete' : 'in progress'}
                  {r.pei_deadline ? ` · deadline ${r.pei_deadline}` : ''}
                </span>
                {onOpenApplication && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => onOpenApplication(r.application_id)}
                  >
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
