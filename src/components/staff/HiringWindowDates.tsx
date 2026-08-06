import { CheckCircle2, FlaskConical, Send } from 'lucide-react';
import { OnboardingDaysPill } from './OnboardingDaysPill';

interface HiringWindowDatesProps {
  applicationSubmittedAt: string | null;
  approvedAt: string | null;
  peResultsDate: string | null;
  fullyOnboarded: boolean;
}

function fmt(value: string | null): string {
  if (!value) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const chipBase =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none border shrink-0 w-fit';

/**
 * At-a-glance ribbon chips for the onboarding pipeline:
 *   - Application submitted date + static gray day pill
 *   - Application approved date
 *   - Pre-employment drug test results date + dynamic FMCSA day pill
 */
export function HiringWindowDates({
  applicationSubmittedAt,
  approvedAt,
  peResultsDate,
  fullyOnboarded,
}: HiringWindowDatesProps) {
  return (
    <>
      <span
        className={`${chipBase} bg-muted/40 text-muted-foreground border-border`}
        title="Application submitted"
      >
        <Send className="h-2.5 w-2.5 shrink-0" />
        Submitted {fmt(applicationSubmittedAt)}
        <OnboardingDaysPill
          date={applicationSubmittedAt}
          mode="application_submitted"
          fullyOnboarded={fullyOnboarded}
        />
      </span>
      <span
        className={`${chipBase} bg-muted/40 text-muted-foreground border-border`}
        title="Application approved"
      >
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        Approved {fmt(approvedAt)}
        <OnboardingDaysPill
          date={approvedAt}
          mode="application_approved"
          fullyOnboarded={fullyOnboarded}
        />
      </span>
      <span
        className={`${chipBase} bg-muted/40 text-muted-foreground border-border`}
        title="Pre-employment drug test results received"
      >
        <FlaskConical className="h-2.5 w-2.5 shrink-0" />
        PE Results {fmt(peResultsDate)}
        <OnboardingDaysPill
          date={peResultsDate}
          mode="pe_results"
          fullyOnboarded={fullyOnboarded}
        />
      </span>
    </>
  );
}

export default HiringWindowDates;
