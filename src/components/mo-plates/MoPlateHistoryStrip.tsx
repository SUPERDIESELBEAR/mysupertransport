import { useState } from 'react';
import { format } from 'date-fns';
import { Truck, AlertTriangle, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlateEventType = 'assignment' | 'lost_stolen' | 'replacement_received';

export type PlateAssignmentEvent = {
  id: string;
  plate_id?: string;
  driver_name: string;
  unit_number: string | null;
  event_type: PlateEventType;
  assigned_at: string;
  returned_at: string | null;
  notes: string | null;
  operator_id?: string | null;
};

export const PLATE_EVENT_CONFIG: Record<PlateEventType, {
  icon: JSX.Element;
  dot: string;
  label: string;
  labelClass: string;
}> = {
  assignment: {
    icon: <Truck className="h-3.5 w-3.5" />,
    dot: 'bg-primary',
    label: 'ASSIGNED',
    labelClass: 'text-primary',
  },
  lost_stolen: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    dot: 'bg-destructive',
    label: 'LOST / STOLEN',
    labelClass: 'text-destructive',
  },
  replacement_received: {
    icon: <RefreshCcw className="h-3.5 w-3.5" />,
    dot: 'bg-status-complete',
    label: "REPLACEMENT REC'D",
    labelClass: 'text-status-complete',
  },
};

/** One rendered timeline line — an event may produce an "assigned" and a "returned" line. */
type Line = {
  key: string;
  dot: string;
  labelClass: string;
  label: string;
  who: string | null;
  unit: string | null;
  at: string;
};

function buildLines(events: PlateAssignmentEvent[]): Line[] {
  const lines: Line[] = [];
  for (const e of events) {
    const cfg = PLATE_EVENT_CONFIG[e.event_type] ?? PLATE_EVENT_CONFIG.assignment;
    lines.push({
      key: `${e.id}-start`,
      dot: cfg.dot,
      labelClass: cfg.labelClass,
      label:
        e.event_type === 'assignment' ? 'Assigned'
        : e.event_type === 'lost_stolen' ? 'Lost / Stolen'
        : "Replacement rec'd",
      who: e.event_type === 'assignment' ? e.driver_name : null,
      unit: e.unit_number,
      at: e.assigned_at,
    });
    if (e.event_type === 'assignment' && e.returned_at) {
      lines.push({
        key: `${e.id}-return`,
        dot: 'bg-muted-foreground/50',
        labelClass: 'text-muted-foreground',
        label: 'Returned',
        who: e.driver_name,
        unit: e.unit_number,
        at: e.returned_at,
      });
    }
  }
  return lines.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

interface Props {
  events: PlateAssignmentEvent[];
  /** How many lines to show before expanding. Defaults to 2. */
  previewCount?: number;
  className?: string;
}

export default function MoPlateHistoryStrip({ events, previewCount = 2, className }: Props) {
  const [expanded, setExpanded] = useState(false);
  const lines = buildLines(events ?? []);
  const shown = expanded ? lines : lines.slice(0, previewCount);
  const hiddenCount = lines.length - previewCount;

  return (
    <div className={cn('pt-2 border-t border-border/60', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        Recent activity
      </p>

      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 italic">No activity yet.</p>
      ) : (
        <>
          <ul className={cn('space-y-1', expanded && lines.length > 6 && 'max-h-52 overflow-y-auto pr-1')}>
            {shown.map(l => (
              <li key={l.key} className="flex items-start gap-1.5 text-xs leading-snug">
                <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0', l.dot)} />
                <span className="min-w-0">
                  <span className={cn('font-semibold', l.labelClass)}>{l.label}</span>
                  {l.who && <span className="text-foreground"> — {l.who}</span>}
                  {l.unit && <span className="text-muted-foreground"> (Unit {l.unit})</span>}
                  <span className="text-muted-foreground"> · {format(new Date(l.at), 'MMM d, yyyy')}</span>
                </span>
              </li>
            ))}
          </ul>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              {expanded ? (<><ChevronUp className="h-3 w-3" /> Show less</>)
                        : (<><ChevronDown className="h-3 w-3" /> Show all ({lines.length})</>)}
            </button>
          )}
        </>
      )}
    </div>
  );
}