import { ChevronRight } from 'lucide-react';
import { formatLogDate, rodsChip, type RodsDay } from '@/lib/eld/rodsTypes';

export default function RodsDayStrip({
  dates,
  byDate,
  onSelect,
}: {
  dates: string[];
  byDate: Map<string, RodsDay>;
  onSelect: (logDate: string) => void;
}) {
  return (
    <div className="space-y-2">
      {dates.map((d, idx) => {
        const day = byDate.get(d);
        const chip = rodsChip(day);
        return (
          <button
            key={d}
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
        );
      })}
    </div>
  );
}