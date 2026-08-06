import { CheckCircle2, FlaskConical } from 'lucide-react';

interface HiringWindowDatesProps {
  approvedAt: string | null;
  peResultsDate: string | null;
}

function fmt(value: string | null): string {
  if (!value) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * At-a-glance ribbon chips: application approval date and the date the
 * pre-employment drug test results were received (start of the FMCSA window).
 */
export function HiringWindowDates({ approvedAt, peResultsDate }: HiringWindowDatesProps) {
  return (
    <>
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none border shrink-0 w-fit bg-muted/40 text-muted-foreground border-border"
        title="Application approved"
      >
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        Approved {fmt(approvedAt)}
      </span>
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none border shrink-0 w-fit bg-muted/40 text-muted-foreground border-border"
        title="Pre-employment drug test results received"
      >
        <FlaskConical className="h-2.5 w-2.5 shrink-0" />
        PE Results {fmt(peResultsDate)}
      </span>
    </>
  );
}

export default HiringWindowDates;