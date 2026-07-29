import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { MINUTES_PER_DAY, STATUS_SHORT, formatClock } from '@/lib/eld/rodsGridGeometry';
import { SHORT_PERIOD_MINUTES } from '@/lib/eld/rodsValidation';
import { newLocalId, type DraftSegment } from '@/hooks/useRodsDay';

const SNAP = 15;

function snap(minutes: number) {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes / SNAP) * SNAP));
}

function toTimeInput(minute: number) {
  const m = Math.min(minute, MINUTES_PER_DAY - 1);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fromTimeInput(value: string) {
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return snap(h * 60 + m);
}

/**
 * Chronological segment list. Each segment starts where the previous ended, so
 * the driver never has to reason about gaps — they add the next change of duty
 * status and the timeline extends to midnight.
 */
export default function DutyStatusTimeline({
  segments,
  onChange,
  disabled,
  activeLocalId,
  onFocusSegment,
}: {
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  disabled?: boolean;
  activeLocalId?: string | null;
  onFocusSegment?: (localId: string | null) => void;
}) {
  const sorted = [...segments].sort((a, b) => a.start_minute - b.start_minute);

  function normalize(list: DraftSegment[]): DraftSegment[] {
    const next = [...list].sort((a, b) => a.start_minute - b.start_minute);
    for (let i = 0; i < next.length; i += 1) {
      const end = i === next.length - 1 ? MINUTES_PER_DAY : next[i + 1].start_minute;
      next[i] = { ...next[i], end_minute: Math.max(next[i].start_minute, end) };
    }
    return next;
  }

  function addSegment() {
    const last = sorted[sorted.length - 1];
    const start = last ? snap(Math.min(last.start_minute + 60, MINUTES_PER_DAY - SNAP)) : 0;
    onChange(normalize([
      ...sorted,
      {
        localId: newLocalId(),
        start_minute: last ? start : 0,
        end_minute: MINUTES_PER_DAY,
        duty_status: last ? ((last.duty_status === 1 ? 4 : 1) as 1 | 4) : 1,
        city: '', state: '', remarks: '',
      },
    ]));
  }

  function patch(localId: string, p: Partial<DraftSegment>) {
    onChange(normalize(sorted.map((s) => (s.localId === localId ? { ...s, ...p } : s))));
  }

  function remove(localId: string) {
    onChange(normalize(sorted.filter((s) => s.localId !== localId)));
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Start at midnight and add each change of duty status through the day.
        </p>
      )}

      {sorted.map((s, idx) => {
        const duration = s.end_minute - s.start_minute;
        const short = duration > 0 && duration < SHORT_PERIOD_MINUTES;
        return (
          <div
            key={s.localId}
            className={`rounded-lg border p-3 space-y-3 ${activeLocalId === s.localId ? 'border-primary' : 'border-border'}`}
            onFocus={() => onFocusSegment?.(s.localId)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">
                {formatClock(s.start_minute)} — {formatClock(s.end_minute)}
                <span className="ml-2 font-normal text-muted-foreground">
                  {Math.floor(duration / 60)}h {duration % 60}m
                </span>
              </div>
              {!disabled && (
                <Button variant="ghost" size="sm" onClick={() => remove(s.localId)} aria-label="Remove entry">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Starts at</Label>
                <Input
                  type="time" step={900} disabled={disabled || idx === 0}
                  className="text-base"
                  value={toTimeInput(s.start_minute)}
                  onChange={(e) => patch(s.localId, { start_minute: fromTimeInput(e.target.value) })}
                />
                {idx === 0 && <p className="text-[10px] text-muted-foreground">The day always starts at midnight.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duty status</Label>
                <div className="grid grid-cols-2 gap-1">
                  {STATUS_SHORT.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      disabled={disabled}
                      onClick={() => patch(s.localId, { duty_status: (i + 1) as 1 | 2 | 3 | 4 })}
                      className={`rounded-md border px-2 py-1.5 text-[11px] ${
                        s.duty_status === i + 1
                          ? 'border-primary bg-primary/10 font-semibold text-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input
                  className="text-base" disabled={disabled} value={s.city}
                  onChange={(e) => patch(s.localId, { city: e.target.value })}
                  placeholder="Springfield"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input
                  className="text-base uppercase" maxLength={2} disabled={disabled} value={s.state}
                  onChange={(e) => patch(s.localId, { state: e.target.value.toUpperCase() })}
                  placeholder="MO"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Remarks</Label>
              <Input
                className="text-base" disabled={disabled} value={s.remarks}
                onChange={(e) => patch(s.localId, { remarks: e.target.value })}
                placeholder="Fuel stop, pre-trip, shipping doc no."
              />
              {short && (
                <p className="text-[10px] text-muted-foreground">
                  Under {SHORT_PERIOD_MINUTES} minutes — this will be listed separately in REMARKS on the printed log.
                </p>
              )}
            </div>
          </div>
        );
      })}

      {!disabled && (
        <Button variant="outline" className="w-full" onClick={addSegment}>
          <Plus className="mr-2 h-4 w-4" /> Add change of duty status
        </Button>
      )}
    </div>
  );
}