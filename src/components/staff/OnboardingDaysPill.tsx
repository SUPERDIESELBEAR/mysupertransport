import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OnboardingDaysPillProps {
  /** Date the pre-employment drug test results were received (YYYY-MM-DD or ISO). */
  peResultsDate: string | null;
  fullyOnboarded: boolean;
  size?: 'sm' | 'md';
}

/**
 * Staff-only pill tracking the FMCSA 30-day hiring window, counted from the
 * date the pre-employment drug test results were received (day 0).
 * Hidden once the driver is fully onboarded or if no results date exists.
 *
 * Color thresholds:
 *   0–10 days  → green
 *   11–20 days → yellow
 *   21–30 days → red
 *   31+ days   → window expired (destructive, explicit label)
 */
export function OnboardingDaysPill({
  peResultsDate,
  fullyOnboarded,
  size = 'sm',
}: OnboardingDaysPillProps) {
  if (fullyOnboarded || !peResultsDate) return null;

  // Anchor date-only values at local noon so timezone never shifts the day count.
  const submitted = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(peResultsDate) ? `${peResultsDate}T12:00:00` : peResultsDate
  );
  if (Number.isNaN(submitted.getTime())) return null;

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const diffMs = Date.now() - submitted.getTime();
  // Day 0 = the day results were received.
  const day = Math.max(0, Math.floor(diffMs / MS_PER_DAY));
  const expired = day > 30;

  let styleVars: { background: string; color: string; borderColor: string };
  if (day <= 10) {
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

  const resultsLabel = submitted.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded-full font-semibold leading-none border shrink-0 tabular-nums cursor-default ${sizeClass}`}
            style={styleVars}
            aria-label={
              expired
                ? `FMCSA hiring window expired, day ${day} since PE drug test results received ${resultsLabel}`
                : `Day ${day} of the FMCSA 30-day hiring window, PE drug test results received ${resultsLabel}`
            }
          >
            {expired ? `Window Expired · Day ${day}` : `Day ${day}`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {expired
            ? `FMCSA 30-day hiring window expired — PE drug test results received ${resultsLabel}`
            : `Day ${day} of the FMCSA 30-day hiring window — PE drug test results received ${resultsLabel}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default OnboardingDaysPill;