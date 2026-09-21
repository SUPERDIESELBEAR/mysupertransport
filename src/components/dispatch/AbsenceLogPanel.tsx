import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDispatchDayLogs } from '@/lib/dispatchDayLogs';
import { CalendarDays, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  absenceReasonLabel,
  formatReasonBreakdown,
  formatStretchDates,
  groupAbsenceStretches,
  maxPlannedDate,
  resolveRange,
  summarizeAbsence,
  todayIso,
  type AbsenceDay,
  type AbsenceDayStatus,
  type AbsenceRangePreset,
} from '@/lib/absenceLog';

const STATUS_STYLE: Record<AbsenceDayStatus, { dot: string; text: string; label: string }> = {
  dispatched:     { dot: 'bg-status-complete', text: 'text-status-complete', label: 'Dispatched' },
  home:           { dot: 'bg-status-progress', text: 'text-status-progress', label: 'Home' },
  truck_down:     { dot: 'bg-destructive',     text: 'text-destructive',     label: 'Truck Down' },
  not_dispatched: { dot: 'bg-slate-500',       text: 'text-slate-700',       label: 'Not Dispatched' },
};

interface Props {
  operatorId: string;
  /** Resolves an auth user id to a display name (dispatcher/staff maps the page already holds). */
  resolveName?: (userId: string | null | undefined) => string | null;
  /** Bump to force a refetch after the calendar writes a day. */
  refreshKey?: number;
}

/**
 * THE ABSENCE LOG.
 *
 * The permanent, dated answer to "why was this driver off the road?". It reads
 * `dispatch_daily_log` — the same rows the mini calendar writes — and collapses
 * consecutive days sharing a reason into one stretch, so three weeks of truck
 * down reads as one line rather than twenty-one.
 *
 * It replaces the old single Notes field, which was overwritten on every edit
 * and therefore kept no history at all.
 */
export default function AbsenceLogPanel({ operatorId, resolveName, refreshKey = 0 }: Props) {
  const [preset, setPreset] = useState<AbsenceRangePreset>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [days, setDays] = useState<AbsenceDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDispatched, setShowDispatched] = useState(false);

  const today = useMemo(() => todayIso(), []);

  // The chosen period (always ending at/before today) plus a lookahead so
  // PLANNED days — booked ahead of the fact — always show, whichever period
  // is selected. A custom To beyond today is honoured as-is.
  const range = useMemo(() => {
    const resolved = preset === 'custom'
      ? (() => {
          const fallback = resolveRange('this_year');
          return { from: customFrom || fallback.from, to: customTo || fallback.to };
        })()
      : resolveRange(preset);
    const lookahead = maxPlannedDate();
    return { from: resolved.from, to: resolved.to > lookahead ? resolved.to : lookahead };
  }, [preset, customFrom, customTo]);

  const fetchDays = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Column-tolerant read: until the staged reason columns land, the log still
    // lists every off-road stretch, just without a reason label.
    const { logs, error: err } = await fetchDispatchDayLogs(operatorId, range.from, range.to, { order: 'desc' });

    if (err) {
      setError(err);
      setDays([]);
    } else {
      setDays(logs.map(r => ({
        log_date: r.log_date,
        status: r.status as AbsenceDayStatus,
        absence_reason: r.absence_reason ?? null,
        notes: r.notes ?? null,
        notes_at: r.notes_at ?? null,
        notes_by_name: resolveName?.(r.notes_by) ?? null,
      })));
    }
    setLoading(false);
  }, [operatorId, range.from, range.to, resolveName]);

  useEffect(() => { void fetchDays(); }, [fetchDays, refreshKey]);

  const visible = useMemo(
    () => showDispatched ? days : days.filter(d => d.status !== 'dispatched'),
    [days, showDispatched],
  );
  const stretches = useMemo(() => groupAbsenceStretches(visible, today), [visible, today]);
  // Planned stretches sit above the history — the question "when is he next
  // away?" is answered before "why was he away?".
  const plannedStretches = useMemo(() => stretches.filter(s => s.planned), [stretches]);
  const pastStretches = useMemo(() => stretches.filter(s => !s.planned), [stretches]);
  // Totals count what has happened; summarizeAbsence splits the planned days.
  const totals = useMemo(() => summarizeAbsence(days, today), [days, today]);
  const breakdown = formatReasonBreakdown(totals);

  return (
    <div className="border-t border-border pt-2 mt-1 space-y-2" data-testid="absence-log-panel">
      {/* Range controls */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Period</Label>
          <Select value={preset} onValueChange={v => setPreset(v as AbsenceRangePreset)}>
            <SelectTrigger className="h-7 mt-0.5 w-[136px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="this_quarter">This quarter</SelectItem>
              <SelectItem value="this_year">This year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === 'custom' && (
          <>
            <div>
              <Label className="text-[10px] text-muted-foreground">From</Label>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={e => setCustomFrom(e.target.value)}
                className="mt-0.5 h-7 rounded border border-input bg-background px-1.5 text-[11px]"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">To</Label>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={e => setCustomTo(e.target.value)}
                className="mt-0.5 h-7 rounded border border-input bg-background px-1.5 text-[11px]"
              />
            </div>
          </>
        )}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer pb-1 ml-auto">
          <input
            type="checkbox"
            checked={showDispatched}
            onChange={e => setShowDispatched(e.target.checked)}
            className="h-3 w-3 accent-current"
          />
          Include dispatched days
        </label>
      </div>

      {/* Totals */}
      <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
        <p className="text-xs font-semibold text-foreground">
          {totals.offRoadDays} day{totals.offRoadDays !== 1 ? 's' : ''} off the road
          {totals.plannedDays > 0 && (
            <span className="ml-2 text-[10px] font-semibold text-gold">
              + {totals.plannedDays} planned
            </span>
          )}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {breakdown || 'Nothing recorded in this period.'}
        </p>
      </div>

      {/* The log */}
      {loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : error ? (
        <p className="text-[11px] text-destructive pl-1">Could not load the absence log: {error}</p>
      ) : stretches.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-1">
          <CalendarDays className="h-3 w-3" />
          No days recorded in this period.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          {[...plannedStretches, ...pastStretches].map(s => {
            const style = STATUS_STYLE[s.status] ?? STATUS_STYLE.not_dispatched;
            return (
              <li key={`${s.start}-${s.end}-${s.reason ?? 'none'}`} className="flex items-start gap-2.5">
                <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${style.dot} ring-2 ring-background`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {formatStretchDates(s.start, s.end)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.days} day{s.days !== 1 ? 's' : ''}
                    </span>
                    {s.planned && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gold px-1.5 py-px rounded-full border border-gold/40 bg-gold/10">
                        Planned
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold ml-auto ${style.text}`}>
                      {s.reason ? absenceReasonLabel(s.reason) : style.label}
                    </span>
                  </div>
                  {s.note && (
                    <p className="text-[11px] text-muted-foreground italic mt-0.5 break-words">{s.note}</p>
                  )}
                  {(s.enteredByName || s.enteredAt) && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Entered by {s.enteredByName ?? 'staff'}
                      {s.enteredAt ? ` · ${new Date(s.enteredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
