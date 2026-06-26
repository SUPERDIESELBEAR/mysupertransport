import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OnboardingDaysPillProps {
  submittedAt: string | null;
  fullyOnboarded: boolean;
  size?: 'sm' | 'md';
}

/**
 * Staff-only pill that shows how many days a driver has been in onboarding
 * since their application was submitted. Hidden once the driver is fully
 * onboarded or if no submitted_at exists (draft applications).
 *
 * Color thresholds:
 *   1–14 days  → green   (on track)
 *   15–30 days → amber   (watch)
 *   31+ days   → red     (stale, needs follow-up)
 */
export function OnboardingDaysPill({
  submittedAt,
  fullyOnboarded,
  size = 'sm',
}: OnboardingDaysPillProps) {
  if (fullyOnboarded || !submittedAt) return null;

  const submitted = new Date(submittedAt);
  if (Number.isNaN(submitted.getTime())) return null;

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const diffMs = Date.now() - submitted.getTime();
  // Day 1 = submission day, count elapsed full days + 1.
  const day = Math.max(1, Math.floor(diffMs / MS_PER_DAY) + 1);

  let styleVars: { background: string; color: string; borderColor: string };
  if (day <= 14) {
    styleVars = {
      background: 'hsl(var(--status-complete) / 0.12)',
      color: 'hsl(var(--status-complete))',
      borderColor: 'hsl(var(--status-complete) / 0.35)',
    };
  } else if (day <= 30) {
    styleVars = {
      background: 'hsl(var(--warning) / 0.12)',
      color: 'hsl(var(--warning))',
      borderColor: 'hsl(var(--warning) / 0.4)',
    };
  } else {
    styleVars = {
      background: 'hsl(var(--destructive) / 0.12)',
      color: 'hsl(var(--destructive))',
      borderColor: 'hsl(var(--destructive) / 0.4)',
    };
  }

  const sizeClass =
    size === 'md'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-1.5 py-0.5 text-[10px]';

  const submittedLabel = submitted.toLocaleDateString('en-US', {
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
            aria-label={`Day ${day} in onboarding, application submitted ${submittedLabel}`}
          >
            Day {day}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Application submitted {submittedLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default OnboardingDaysPill;