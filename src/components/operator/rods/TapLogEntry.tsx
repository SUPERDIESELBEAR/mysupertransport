import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatClock, MINUTES_PER_DAY, STATUS_SHORT } from '@/lib/eld/rodsGridGeometry';
import {
  boundaryBounds, deleteChange, editChange, minuteOfDay, moveBoundary, segmentAt, tapStatus,
  type DutyStatus,
} from '@/lib/eld/tapLog';
import type { DraftSegment } from '@/hooks/useRodsDay';
import LocationPicker, { formatTown, townKey, type TownOption } from './LocationPicker';

const STATUS_ORDER: DutyStatus[] = [1, 2, 3, 4];
const STATUS_TITLE: Record<DutyStatus, string> = {
  1: '1  OFF DUTY',
  2: '2  SLEEPER BERTH',
  3: '3  DRIVING',
  4: '4  ON DUTY (NOT DRIVING)',
};

function toTimeInput(minute: number) {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minute));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fromTimeInput(value: string, fallback: number) {
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return Math.max(0, Math.min(MINUTES_PER_DAY - 1, h * 60 + m));
}

function elapsedLabel(fromMinute: number, nowMinute: number) {
  const mins = Math.max(0, nowMinute - fromMinute);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

type Draft =
  | { mode: 'tap'; status: DutyStatus; minute: number; city: string; state: string; remarks: string }
  | { mode: 'edit'; localId: string; status: DutyStatus | null; minute: number; city: string; state: string; remarks: string };

/**
 * The driver's only repeated screen.
 *
 * Four buttons in the federal order. A tap stamps the change at now and asks
 * for nothing but the town — a status runs until the next tap, so there is no
 * end time to key and no way to leave a hole. The list below is the day; a row
 * opens the same sheet for correcting the time, the status or the town.
 */
export default function TapLogEntry({
  segments,
  onChange,
  disabled,
  recentTowns,
  isToday,
}: {
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  disabled?: boolean;
  recentTowns?: TownOption[];
  /** Only today's log stamps "now"; an older day asks for the time. */
  isToday?: boolean;
}) {
  const [nowMinute, setNowMinute] = useState(() => minuteOfDay(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowMinute(minuteOfDay(new Date())), 30_000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(
    () => [...segments].sort((a, b) => a.start_minute - b.start_minute),
    [segments],
  );
  const current = isToday ? segmentAt(sorted, nowMinute) : sorted[sorted.length - 1] ?? null;

  const todayTowns = useMemo(() => {
    const seen = new Set<string>();
    const out: TownOption[] = [];
    for (const s of [...sorted].reverse()) {
      const t = { city: s.city, state: s.state };
      if (!t.city.trim() || seen.has(townKey(t))) continue;
      seen.add(townKey(t));
      out.push(t);
    }
    return out;
  }, [sorted]);

  const lastTown = todayTowns[0] ?? recentTowns?.[0] ?? { city: '', state: '' };

  function openTap(status: DutyStatus) {
    if (disabled) return;
    setDraft({
      mode: 'tap',
      status,
      minute: isToday ? nowMinute : (sorted[sorted.length - 1]?.start_minute ?? 0),
      city: lastTown.city,
      state: lastTown.state,
      remarks: '',
    });
  }

  function openEdit(s: DraftSegment) {
    if (disabled) return;
    setDraft({
      mode: 'edit',
      localId: s.localId,
      status: s.duty_status,
      minute: s.start_minute,
      city: s.city,
      state: s.state,
      remarks: s.remarks,
    });
  }

  function saveDraft() {
    if (!draft) return;
    if (draft.mode === 'tap') {
      onChange(tapStatus(sorted, draft.minute, draft.status, {
        city: draft.city, state: draft.state, remarks: draft.remarks,
      }));
    } else {
      let next = editChange(sorted, draft.localId, {
        duty_status: draft.status,
        city: draft.city.trim(),
        state: draft.state.trim().toUpperCase(),
        remarks: draft.remarks.trim(),
      });
      next = moveBoundary(next, draft.localId, draft.minute);
      onChange(next);
    }
    setDraft(null);
  }

  function removeEntry() {
    if (!draft || draft.mode !== 'edit') return;
    onChange(deleteChange(sorted, draft.localId));
    setDraft(null);
  }

  const bounds = draft?.mode === 'edit' ? boundaryBounds(sorted, draft.localId) : null;
  const firstOfDay = draft?.mode === 'edit' && bounds === null;
  const saveDisabled = !draft
    || (draft.mode === 'edit' && draft.status === null)
    || !draft.city.trim()
    || draft.state.trim().length !== 2;

  return (
    <div className="space-y-4">
      {/* Status pad */}
      <div className="grid grid-cols-2 gap-2">
        {STATUS_ORDER.map((s) => {
          const active = current?.duty_status === s;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => openTap(s)}
              className={`min-h-[86px] rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                active
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card hover:border-primary/40'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              <div className={`text-sm font-bold leading-tight ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                {STATUS_TITLE[s]}
              </div>
              {active && current && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  {isToday
                    ? `${elapsedLabel(current.start_minute, nowMinute)} since ${formatClock(current.start_minute)}`
                    : `since ${formatClock(current.start_minute)}`}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!disabled && (
        <p className="text-center text-[11px] text-muted-foreground">
          Tap a status when it changes. It runs until your next tap, so there is nothing to close out.
        </p>
      )}

      {/* The day's changes */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No changes recorded yet today. Tap the status you are in now.
          </p>
        ) : (
          sorted.map((s) => (
            <button
              key={s.localId}
              type="button"
              disabled={disabled}
              onClick={() => openEdit(s)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left"
            >
              <span className="font-mono text-sm font-bold text-foreground">{formatClock(s.start_minute)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {s.duty_status ? STATUS_SHORT[s.duty_status - 1] : 'No status'}
                {s.city ? ` · ${formatTown({ city: s.city, state: s.state })}` : ''}
                {s.remarks ? ` · ${s.remarks}` : ''}
              </span>
              {!disabled && <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))
        )}
      </div>

      {!disabled && sorted.length > 0 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setDraft({
            mode: 'tap',
            status: 4,
            minute: isToday ? nowMinute : (sorted[sorted.length - 1]?.start_minute ?? 0),
            city: lastTown.city,
            state: lastTown.state,
            remarks: '',
          })}
        >
          <Plus className="mr-2 h-4 w-4" /> Add a change I missed
        </Button>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.mode === 'tap' ? 'Change of duty status' : 'Correct this change'}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Duty status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDraft({ ...draft, status: s })}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        draft.status === s
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {STATUS_TITLE[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Input
                  type="time"
                  className="text-base"
                  disabled={firstOfDay}
                  value={toTimeInput(draft.minute)}
                  onChange={(e) => setDraft({ ...draft, minute: fromTimeInput(e.target.value, draft.minute) })}
                />
                {firstOfDay ? (
                  <p className="text-[10px] text-muted-foreground">
                    This is the status you started the day in, so it begins at midnight.
                  </p>
                ) : bounds ? (
                  <p className="text-[10px] text-muted-foreground">
                    Anywhere between {formatClock(bounds.min)} and {formatClock(bounds.max)}.
                  </p>
                ) : null}
              </div>

              <LocationPicker
                city={draft.city}
                state={draft.state}
                today={todayTowns}
                recent={recentTowns}
                onChange={(t) => setDraft({ ...draft, city: t.city, state: t.state })}
              />

              <div className="space-y-1">
                <Label className="text-xs">Remarks (optional)</Label>
                <Input
                  className="text-base" value={draft.remarks}
                  placeholder="Fuel stop, pre-trip"
                  onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.mode === 'edit' ? (
              <Button variant="ghost" className="text-destructive" onClick={removeEntry}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={saveDraft} disabled={saveDisabled}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
