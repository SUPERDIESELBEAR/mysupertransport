import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Arrival / departure entry.
 *
 * The native `datetime-local` popup gives you a Clear and no confirm: you commit
 * by clicking into empty space, which happily commits a half-entered value —
 * a time with the date still `mm/dd/yyyy`. This control replaces it with an
 * explicit Done, and refuses an incomplete value on EVERY commit path, so no
 * path can disagree with another about what half-entered means:
 *
 *   Done        complete -> commit + close; incomplete -> disabled, told why
 *   click-away  complete -> commit + close; incomplete -> DISCARD + close
 *   Escape      always discards, restoring the value the field held on open
 *   Clear       empties the field (the same act as the Clear beside it)
 *
 * Nothing is ever defaulted. An empty date is not today and an empty time is
 * not midnight; both empty is simply "no value", which Done will happily commit.
 *
 * The value in and out is a CARRIER-zone naive string (`YYYY-MM-DDTHH:mm`).
 * This component never touches Date, so it cannot drift to the browser's zone —
 * the conversion stays in isoToNaive / naiveToIso upstream.
 */

export const INCOMPLETE_MESSAGE = 'Enter both a date and a time.';

interface StopTimePickerProps {
  id: string;
  label: string;
  /** Carrier-zone naive value, `YYYY-MM-DDTHH:mm`, or '' for no value. */
  value: string;
  onCommit: (next: string) => void;
}

function split(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

export default function StopTimePicker({ id, label, value, onCommit }: StopTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => split(value).date);
  const [time, setTime] = useState(() => split(value).time);
  const rootRef = useRef<HTMLDivElement>(null);

  const complete = Boolean(date) && Boolean(time);
  const empty = !date && !time;
  const incomplete = !complete && !empty;

  const openPopup = () => {
    const parts = split(value);
    setDate(parts.date);
    setTime(parts.time);
    setOpen(true);
  };

  const commit = () => {
    if (complete) onCommit(`${date}T${time}`);
    else if (empty) onCommit('');
    // incomplete: nothing is recorded.
    setOpen(false);
  };

  const discard = () => {
    const parts = split(value);
    setDate(parts.date);
    setTime(parts.time);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        // Click-away commits, but only a value that Done would also accept.
        commit();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') discard();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  });

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start font-normal"
        aria-label={label}
        aria-expanded={open}
        onClick={() => (open ? commit() : openPopup())}
      >
        {value ? value.replace('T', ' ') : <span className="text-muted-foreground">Not recorded</span>}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${label} entry`}
          className="absolute left-0 z-50 mt-1 w-[16rem] rounded-md border border-border bg-popover p-3 shadow-md"
        >
          <div className="space-y-2">
            <div className="space-y-1">
              <label htmlFor={`${id}-date`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Date
              </label>
              <Input id={`${id}-date`} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-time`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Time
              </label>
              <Input id={`${id}-time`} type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          {incomplete ? (
            <p role="note" className="mt-2 text-xs text-destructive">{INCOMPLETE_MESSAGE}</p>
          ) : null}

          <div className="mt-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Clear ${label.toLowerCase()} in entry`}
              disabled={empty}
              onClick={() => { setDate(''); setTime(''); onCommit(''); setOpen(false); }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label={`Done ${label.toLowerCase()}`}
              disabled={incomplete}
              onClick={commit}
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
