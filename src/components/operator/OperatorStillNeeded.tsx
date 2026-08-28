import { ArrowRight, CircleDashed } from 'lucide-react';
import { stillNeededItems, isEldInstallOutstanding } from '@/lib/operatorHome';

/**
 * What onboarding still owes, shown ALONGSIDE the load card.
 *
 * Go-live is triggered by insurance, so a driver hauls for roughly a week
 * while plates, decals, ELD and dash cam are still pending. Hiding this once he
 * is live would leave real obligations invisible. Absent only when nothing is
 * outstanding.
 */
export default function OperatorStillNeeded({
  status, paySetup, onOpenProgress,
}: {
  status: Record<string, unknown> | null | undefined;
  paySetup?: unknown;
  onOpenProgress: () => void;
}) {
  const items = stillNeededItems(status, paySetup);
  if (items.length === 0) return null;
  const eldPending = isEldInstallOutstanding(status);
  const shown = items.slice(0, 4);

  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Still needed</p>
        <span className="text-[11px] text-muted-foreground">{items.length} open</span>
      </div>

      {eldPending && (
        <p className="text-xs text-muted-foreground leading-snug">
          You are running paper logs until your ELD is installed at the terminal.
        </p>
      )}

      <ul className="space-y-1.5">
        {shown.map((item, i) => (
          <li key={`${item.stage}-${item.label}-${i}`} className="flex items-start gap-2">
            <CircleDashed className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-xs text-foreground leading-snug">
              {item.label}
              <span className="text-muted-foreground"> · {item.stage}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onOpenProgress}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        {items.length > shown.length ? `View all ${items.length} items` : 'View onboarding status'}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>
  );
}
