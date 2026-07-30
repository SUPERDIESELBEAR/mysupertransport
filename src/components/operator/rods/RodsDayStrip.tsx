import { AlertTriangle, ChevronRight } from 'lucide-react';
import { formatLogDate, rodsChip, type RodsDay } from '@/lib/eld/rodsTypes';

export default function RodsDayStrip({
  dates,
  byDate,
  onSelect,
  divergedDates,
  onDismissDivergence,
}: {
  dates: string[];
  byDate: Map<string, RodsDay>;
  onSelect: (logDate: string) => void;
  /** Days whose local copy does not match the office copy. */
  divergedDates?: Set<string>;
  onDismissDivergence?: (logDate: string) => void;
}) {
  return (
    <div className="space-y-2">
      {dates.map((d, idx) => {
        const day = byDate.get(d);
        const chip = rodsChip(day);
        const diverged = divergedDates?.has(d) ?? false;
        return (
          <div key={d} className="space-y-1">
          <button
            type="button"
            onClick={() => onSelect(d)}
            className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/40"
          >
            <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: chip.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {idx === 0 ? 'Today' : formatLogDate(d)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {idx === 0 ? formatLogDate(d) : ''}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold" style={{ color: chip.color }}>
              {chip.label}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          {diverged && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  Needs review: this log differs from the office copy
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Your signed copy is still what shows at a roadside inspection. Management has been notified.
                </p>
                {onDismissDivergence && (
                  <button
                    type="button"
                    onClick={() => onDismissDivergence(d)}
                    className="mt-1 text-[11px] font-semibold text-primary underline"
                  >
                    Management contacted me — dismiss
                  </button>
                )}
              </div>
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}