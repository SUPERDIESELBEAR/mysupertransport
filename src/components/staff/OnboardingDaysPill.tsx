import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type DayPillMode = 'pe_results' | 'application_submitted' | 'application_approved';

interface OnboardingDaysPillProps {
  /** Date to count days from (YYYY-MM-DD or ISO). */
  date: string | null;
  /** Which day counter this pill represents. */
  mode: DayPillMode;
  /** Hide when the driver is fully onboarded. */
  fullyOnboarded: boolean;
  size?: 'sm' | 'md';
}

/**
 * Staff-only day counter pill.
 *
 * Modes:
 *   - pe_results: tracks the FMCSA 30-day hiring window from the date the
 *     pre-employment drug test results were received (day 0). Uses dynamic
 *     color thresholds and shows "Window Expired" after 30 days.
 *   - application_submitted: tracks days since the application was submitted.
 *     Static gray styling; never shows "Window Expired".
 *
 * The pill is hidden once the driver is fully onboarded or if no source date
 * exists.
 */
export function OnboardingDaysPill({
  date,
  mode,
  fullyOnboarded,
  size = 'sm',
}: OnboardingDaysPillProps) {
  if (fullyOnboarded || !date) return null;

  // Anchor date-only values at local noon so timezone never shifts the day count.
  const anchor = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date
  );
  if (Number.isNaN(anchor.getTime())) return null;

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const diffMs = Date.now() - anchor.getTime();
  // Day 0 = the day the source date occurred.
  const day = Math.max(0, Math.floor(diffMs / MS_PER_DAY));

  const isPeResults = mode === 'pe_results';
  const expired = isPeResults && day > 30;

  let styleVars: { background: string; color: string; borderColor: string };
  if (!isPeResults) {
    styleVars = {
      background: 'hsl(var(--muted) / 0.4)',
      color: 'hsl(var(--muted-foreground))',
      borderColor: 'hsl(var(--border))',
    };
  } else if (day <= 10) {
    styleVars = {
      background: 'hsl(var(--status-complete) / 0.12)',
      color: 'hsl(var(--status-complete))',
      borderColor: 'hsl(var(--status-complete) / 0.35)',
    };
  } else if (day <= 20) {
    styleVars = {
      background: 'hsl(var(--warning) / 0.12)',
      color: 'hsl(var(--warning))',
      borderColor: 'hsl(var(--warning) / 0.4)',
    };
  } else if (day <= 30) {
    styleVars = {
      background: 'hsl(var(--destructive) / 0.12)',
      color: 'hsl(var(--destructive))',
      borderColor: 'hsl(var(--destructive) / 0.4)',
    };
  } else {
    styleVars = {
      background: 'hsl(var(--destructive))',
      color: 'hsl(var(--destructive-foreground))',
      borderColor: 'hsl(var(--destructive))',
    };
  }

  const sizeClass =
    size === 'md'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-1.5 py-0.5 text-[10px]';

  const dateLabel = anchor.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const staticSourceLabel =
    mode === 'application_approved' ? 'application was approved' : 'application was submitted';

  const labelText = isPeResults
    ? expired
      ? `Window Expired · Day ${day}`
      : `Day ${day}`
    : `Day ${day}`;

  const ariaLabel = isPeResults
    ? expired
      ? `FMCSA hiring window expired, day ${day} since PE drug test results received ${dateLabel}`
      : `Day ${day} of the FMCSA 30-day hiring window, PE drug test results received ${dateLabel}`
    : `Day ${day} since ${staticSourceLabel} ${dateLabel}`;

  const tooltipText = isPeResults
    ? expired
      ? `FMCSA 30-day hiring window expired — PE drug test results received ${dateLabel}`
      : `Day ${day} of the FMCSA 30-day hiring window — PE drug test results received ${dateLabel}`
    : `Day ${day} since ${staticSourceLabel} — ${dateLabel}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded font-semibold leading-none border shrink-0 tabular-nums cursor-default ${sizeClass}`}
            style={styleVars}
            aria-label={ariaLabel}
          >
            {labelText}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default OnboardingDaysPill;
