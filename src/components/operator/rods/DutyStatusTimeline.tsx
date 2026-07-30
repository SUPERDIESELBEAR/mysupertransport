import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { MINUTES_PER_DAY, STATUS_SHORT, formatClock } from '@/lib/eld/rodsGridGeometry';
import { SHORT_PERIOD_MINUTES } from '@/lib/eld/rodsValidation';
import { newLocalId, type DraftSegment } from '@/hooks/useRodsDay';

const SNAP = 15;

function snap(minutes: number) {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes / SNAP) * SNAP));
}

function toTimeInput(minute: number | null) {
  if (minute === null) return '';
  const m = Math.min(minute, MINUTES_PER_DAY - 1);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fromTimeInput(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return snap(h * 60 + m);
}

/**
 * Chronological segment list.
 *
 * A new segment's start is chained to the previous segment's end — that is data
 * entry, and the driver sees and can change it. Nothing else is inferred: an
 * end time the driver has not entered stays empty, and a gap left behind by an
 * edit is reported as a validation failure rather than quietly closed. Filling
 * a gap would put a duty status and a location on a federal record that the
 * driver never stated.
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
  const last = sorted[sorted.length - 1];
  // The next entry starts where the last one ended, so we need that end first.
  const canAdd = !last || last.end_minute !== null;
  const dayFinished = !!last && last.end_minute === MINUTES_PER_DAY;

  function sortOnly(list: DraftSegment[]): DraftSegment[] {
    return [...list].sort((a, b) => a.start_minute - b.start_minute);
  }

  function addSegment() {
    if (!canAdd || dayFinished) return;
    onChange(sortOnly([
      ...sorted,
      {
        localId: newLocalId(),
        start_minute: last ? (last.end_minute as number) : 0,
        // Nothing is guessed: the driver states the end time and the status.
        end_minute: null,
        duty_status: null,
        city: '', state: '', remarks: '',
      },
    ]));
  }

  function patch(localId: string, p: Partial<DraftSegment>) {
    // Only the edited segment changes. Neighbours are never shifted to absorb
    // a gap the edit opened — the gap is shown and the driver resolves it.
    onChange(sortOnly(sorted.map((s) => (s.localId === localId ? { ...s, ...p } : s))));
  }

  function remove(localId: string) {
    onChange(sortOnly(sorted.filter((s) => s.localId !== localId)));
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Start at midnight and add each change of duty status through the day.
        </p>
      )}

      {sorted.map((s, idx) => {
        const duration = s.end_minute === null ? null : s.end_minute - s.start_minute;
        const short = duration !== null && duration > 0 && duration < SHORT_PERIOD_MINUTES;
        const backwards = duration !== null && duration <= 0;
        const prev = sorted[idx - 1];
        const gapBefore = prev?.end_minute != null && prev.end_minute < s.start_minute;
        return (
          <div
            key={s.localId}
            className={`rounded-lg border p-3 space-y-3 ${activeLocalId === s.localId ? 'border-primary' : 'border-border'}`}
            onFocus={() => onFocusSegment?.(s.localId)}
          >
            {gapBefore && (
              <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Nothing recorded between {formatClock(prev.end_minute as number)} and {formatClock(s.start_minute)}.
                Add an entry for that time — it will not be filled in for you.
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">
                {formatClock(s.start_minute)} — {s.end_minute === null ? '—' : formatClock(s.end_minute)}
                {duration !== null && duration > 0 && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {Math.floor(duration / 60)}h {duration % 60}m
                  </span>
                )}
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
                  onChange={(e) => patch(s.localId, { start_minute: fromTimeInput(e.target.value) ?? 0 })}
                />
                {idx === 0 && <p className="text-[10px] text-muted-foreground">The day always starts at midnight.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ends at</Label>
                <Input
                  type="time" step={900} disabled={disabled || s.end_minute === MINUTES_PER_DAY}
                  className="text-base"
                  value={s.end_minute === MINUTES_PER_DAY ? '' : toTimeInput(s.end_minute)}
                  placeholder={s.end_minute === MINUTES_PER_DAY ? 'Midnight' : undefined}
                  onChange={(e) => patch(s.localId, { end_minute: fromTimeInput(e.target.value) })}
                />
                {!disabled && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground underline"
                    onClick={() => patch(s.localId, {
                      end_minute: s.end_minute === MINUTES_PER_DAY ? null : MINUTES_PER_DAY,
                    })}
                  >
                    {s.end_minute === MINUTES_PER_DAY ? 'Ends at midnight — change' : 'Runs to midnight'}
                  </button>
                )}
                {backwards && (
                  <p className="text-[10px] text-destructive">The end time must be after the start time.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Duty status</Label>
                <div className="grid grid-cols-4 gap-1">
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
                {s.duty_status === null && (
                  <p className="text-[10px] text-muted-foreground">Choose the duty status for this period.</p>
                )}
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
        <div className="space-y-1">
          <Button variant="outline" className="w-full" onClick={addSegment} disabled={!canAdd || dayFinished}>
            <Plus className="mr-2 h-4 w-4" /> Add change of duty status
          </Button>
          {!canAdd && (
            <p className="text-center text-[10px] text-muted-foreground">
              Enter the end time of the last entry first — the next one starts there.
            </p>
          )}
          {dayFinished && (
            <p className="text-center text-[10px] text-muted-foreground">
              The last entry runs to midnight, so the day is closed out.
            </p>
          )}
        </div>
      )}
    </div>
  );
}