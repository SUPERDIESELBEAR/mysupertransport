import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type ScreeningStatusValue = 'not_started' | 'requested' | 'received';

export interface ScreeningCheck {
  /** Short label shown inside the chip, e.g. MVR */
  key: 'MVR' | 'PSP' | 'CH';
  /** Full name used in the tooltip */
  name: string;
  status: ScreeningStatusValue;
  requestedDate?: string | null;
  receivedDate?: string | null;
}

/** No marks in any state — uniform-width chips stay on one row.
    State reads from color, and the tooltip carries the full wording. */

const WORDS: Record<ScreeningStatusValue, string> = {
  received: 'Received',
  requested: 'Requested',
  not_started: 'Not started',
};

const CHIP: Record<ScreeningStatusValue, string> = {
  received: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  requested: 'bg-status-progress/10 text-status-progress border-status-progress/30',
  not_started: 'bg-transparent text-muted-foreground border-border',
};

function fmt(date?: string | null) {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function tooltipText(check: ScreeningCheck) {
  const base = `${check.name} — ${WORDS[check.status]}`;
  if (check.status === 'received') {
    const on = fmt(check.receivedDate);
    return on ? `${base} ${on}` : base;
  }
  if (check.status === 'requested') {
    const on = fmt(check.requestedDate);
    return on ? `${base} ${on}, awaiting results` : `${base}, awaiting results`;
  }
  return base;
}

function Chip({ label, status, title }: { label: string; status: ScreeningStatusValue; title: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${CHIP[status]}`}
          aria-label={title}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{title}</TooltipContent>
    </Tooltip>
  );
}

/**
 * MVR / PSP / CH state in one compact group. Collapses to a single "Verified"
 * chip when all three are received, so a clean applicant reads as one mark.
 */
export function ScreeningChips({ checks }: { checks: ScreeningCheck[] }) {
  const allReceived = checks.length > 0 && checks.every(c => c.status === 'received');
  const summary = checks
    .map(c => tooltipText(c))
    .join(' · ');

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-center gap-1">
        {allReceived ? (
          <Chip label="Verified" status="received" title={summary} />
        ) : (
          checks.map(c => <Chip key={c.key} label={c.key} status={c.status} title={tooltipText(c)} />)
        )}
      </div>
    </TooltipProvider>
  );
}

/** Build the three checks from an application row. */
export function screeningChecksFromApp(app: {
  mvr_status?: string | null;
  psp_status?: string | null;
  ch_status?: string | null;
  mvr_requested_date?: string | null;
  mvr_received_date?: string | null;
  psp_requested_date?: string | null;
  psp_received_date?: string | null;
  ch_requested_date?: string | null;
  ch_received_date?: string | null;
}): ScreeningCheck[] {
  const val = (v?: string | null): ScreeningStatusValue =>
    v === 'received' || v === 'requested' ? v : 'not_started';
  return [
    { key: 'MVR', name: 'MVR', status: val(app.mvr_status), requestedDate: app.mvr_requested_date, receivedDate: app.mvr_received_date },
    { key: 'PSP', name: 'PSP', status: val(app.psp_status), requestedDate: app.psp_requested_date, receivedDate: app.psp_received_date },
    { key: 'CH', name: 'Clearinghouse', status: val(app.ch_status), requestedDate: app.ch_requested_date, receivedDate: app.ch_received_date },
  ];
}

export default ScreeningChips;
