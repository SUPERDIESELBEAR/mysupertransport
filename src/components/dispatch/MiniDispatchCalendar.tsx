import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, EyeOff, CalendarRange } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type DailyStatus = 'dispatched' | 'home' | 'truck_down' | 'not_dispatched';

interface DailyLog {
  id: string;
  log_date: string;
  status: DailyStatus;
  notes: string | null;
}

const STATUS_COLORS: Record<DailyStatus, { dot: string; bg: string; label: string; text: string }> = {
  dispatched:     { dot: 'bg-status-complete', bg: 'bg-status-complete/15', label: 'Dispatched', text: 'text-status-complete' },
  home:           { dot: 'bg-status-progress', bg: 'bg-status-progress/15', label: 'Home', text: 'text-status-progress' },
  truck_down:     { dot: 'bg-destructive',     bg: 'bg-destructive/15',     label: 'Truck Down', text: 'text-destructive' },
  not_dispatched: { dot: 'bg-slate-500',        bg: 'bg-slate-200',         label: 'Not Dispatched', text: 'text-slate-700' },
};

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface Props {
  operatorId: string;
}

export default function MiniDispatchCalendar({ operatorId }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [excluded, setExcluded] = useState<boolean | null>(null);
  // Mark-range popover state
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeStatus, setRangeStatus] = useState<DailyStatus>('dispatched');
  const [rangeOverwrite, setRangeOverwrite] = useState(false);
  const [rangeApplying, setRangeApplying] = useState(false);

  // Check whether this operator is excluded from the Dispatch Hub
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('operators')
        .select('excluded_from_dispatch')
        .eq('id', operatorId)
        .maybeSingle();
      if (!cancelled) {
        setExcluded(((data as any)?.excluded_from_dispatch ?? false) === true);
      }
    })();
    return () => { cancelled = true; };
  }, [operatorId]);

  const fetchLogs = useCallback(async () => {
    const start = `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(month.year, month.month + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const { data } = await supabase
      .from('dispatch_daily_log')
      .select('id, log_date, status, notes')
      .eq('operator_id', operatorId)
      .gte('log_date', start)
      .lte('log_date', end);

    setLogs((data as DailyLog[] | null) ?? []);
  }, [operatorId, month.year, month.month]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const logMap = useMemo(() => {
    const map: Record<string, DailyLog> = {};
    logs.forEach(l => { map[l.log_date] = l; });
    return map;
  }, [logs]);

  const counters = useMemo(() => {
    const c = { dispatched: 0, home: 0, truck_down: 0, not_dispatched: 0 };
    logs.forEach(l => { c[l.status]++; });
    return c;
  }, [logs]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(month.year, month.month, 1);
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const startDow = firstDay.getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [month.year, month.month]);

  const monthLabel = new Date(month.year, month.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const prevMonth = () => setMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 });
  const nextMonth = () => setMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 });

  const setStatus = async (day: number, status: DailyStatus) => {
    const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const todayStr = new Date().toISOString().slice(0, 10);
    setSaving(true);
    const existing = logMap[dateStr];

    let error;
    if (existing) {
      ({ error } = await supabase
        .from('dispatch_daily_log')
        .update({ status, created_by: session?.user?.id ?? null })
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase
        .from('dispatch_daily_log')
        .insert({
          operator_id: operatorId,
          log_date: dateStr,
          status,
          created_by: session?.user?.id ?? null,
        }));
    }

    setSaving(false);
    if (error) {
      toast({ title: 'Error saving status', description: error.message, variant: 'destructive' });
    } else {
      // If editing TODAY, also sync to active_dispatch + history so the live
      // Dispatch Hub tiles reflect the change immediately.
      if (dateStr === todayStr) {
        await syncTodayToLive(status);
      }
      fetchLogs();
    }
  };

  // Clear a logged status for a given day. Deletes the dispatch_daily_log row.
  // If the cleared day is today and the live status differs, also resets
  // active_dispatch back to 'not_dispatched' + appends a history row.
  const clearStatus = async (day: number) => {
    const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = logMap[dateStr];
    if (!existing) return;
    setSaving(true);
    const { error } = await supabase
      .from('dispatch_daily_log')
      .delete()
      .eq('id', existing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error clearing status', description: error.message, variant: 'destructive' });
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dateStr === todayStr) {
      // Reset live tile back to not_dispatched (no-op if already that).
      const { data: current } = await supabase
        .from('active_dispatch')
        .select('id, dispatch_status')
        .eq('operator_id', operatorId)
        .maybeSingle();
      if ((current as any)?.dispatch_status !== 'not_dispatched') {
        const payload = {
          operator_id: operatorId,
          dispatch_status: 'not_dispatched' as DailyStatus,
          updated_by: session?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        };
        if (current) {
          await supabase.from('active_dispatch').update(payload).eq('operator_id', operatorId);
        } else {
          await supabase.from('active_dispatch').insert(payload);
        }
        await supabase.from('dispatch_status_history').insert({
          operator_id: operatorId,
          dispatch_status: 'not_dispatched',
          changed_by: session?.user?.id ?? null,
          status_notes: 'Cleared from calendar today-cell',
        });
      }
    }
    toast({ title: 'Status cleared' });
    fetchLogs();
  };

  // Mirror today's calendar status to active_dispatch (+ history) so the
  // live Dispatch Hub stays in lockstep. No-ops if status is unchanged.
  const syncTodayToLive = useCallback(async (status: DailyStatus) => {
    // Read current live status to avoid spurious history rows / duplicate notifications.
    const { data: current } = await supabase
      .from('active_dispatch')
      .select('id, dispatch_status')
      .eq('operator_id', operatorId)
      .maybeSingle();

    if ((current as any)?.dispatch_status === status) return;

    const payload = {
      operator_id: operatorId,
      dispatch_status: status,
      updated_by: session?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (current) {
      await supabase.from('active_dispatch').update(payload).eq('operator_id', operatorId);
    } else {
      await supabase.from('active_dispatch').insert(payload);
    }

    await supabase.from('dispatch_status_history').insert({
      operator_id: operatorId,
      dispatch_status: status,
      changed_by: session?.user?.id ?? null,
      status_notes: 'Synced from calendar today-cell',
    });
  }, [operatorId, session?.user?.id]);

  // ── Mark range: bulk-set statuses for a date range (per-operator) ────────
  const openRangePopover = () => {
    const firstOfMonth = `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`;
    const todayStr = new Date().toISOString().slice(0, 10);
    setRangeFrom(firstOfMonth);
    setRangeTo(todayStr);
    setRangeStatus('dispatched');
    setRangeOverwrite(false);
    setRangeOpen(true);
  };

  const applyRange = async () => {
    if (!rangeFrom || !rangeTo) return;
    if (rangeFrom > rangeTo) {
      toast({ title: 'Invalid range', description: 'Start date must be on or before end date.', variant: 'destructive' });
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    // Build inclusive list of YYYY-MM-DD strings from rangeFrom to min(rangeTo, today)
    const effectiveEnd = rangeTo > todayStr ? todayStr : rangeTo;
    if (rangeFrom > effectiveEnd) {
      toast({ title: 'Nothing to mark', description: 'The selected range has no past or current dates.', variant: 'destructive' });
      return;
    }
    const dates: string[] = [];
    const cursor = new Date(rangeFrom + 'T00:00:00');
    const endD = new Date(effectiveEnd + 'T00:00:00');
    while (cursor <= endD) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }

    setRangeApplying(true);
    try {
      // Fetch existing entries in range to honor "Overwrite existing" toggle
      const { data: existing } = await supabase
        .from('dispatch_daily_log')
        .select('log_date')
        .eq('operator_id', operatorId)
        .gte('log_date', rangeFrom)
        .lte('log_date', effectiveEnd);

      const existingSet = new Set((existing ?? []).map((r: any) => r.log_date));
      const toWrite = rangeOverwrite ? dates : dates.filter(d => !existingSet.has(d));

      if (toWrite.length === 0) {
        toast({ title: 'No changes', description: 'All days already have entries. Enable "Overwrite existing" to replace.' });
        setRangeApplying(false);
        return;
      }

      const rows = toWrite.map(log_date => ({
        operator_id: operatorId,
        log_date,
        status: rangeStatus,
        created_by: session?.user?.id ?? null,
      }));

      const { error } = await supabase
        .from('dispatch_daily_log')
        .upsert(rows, { onConflict: 'operator_id,log_date' });

      if (error) {
        toast({ title: 'Error applying range', description: error.message, variant: 'destructive' });
        setRangeApplying(false);
        return;
      }

      // If the range covers today AND today was actually written, dual-write to live.
      if (toWrite.includes(todayStr)) {
        await syncTodayToLive(rangeStatus);
      }

      toast({
        title: 'Range marked',
        description: `Marked ${toWrite.length} day${toWrite.length !== 1 ? 's' : ''} as ${STATUS_COLORS[rangeStatus].label}.`,
      });
      setRangeOpen(false);
      fetchLogs();
    } finally {
      setRangeApplying(false);
    }
  };

  const today = new Date();
  const isCurrentMonth = month.year === today.getFullYear() && month.month === today.getMonth();

  if (excluded === true) {
    return (
      <div className="flex items-start gap-2 px-3 py-3 rounded-lg border border-gold/30 bg-gold/5 text-[11px] text-muted-foreground">
        <EyeOff className="h-3.5 w-3.5 text-gold shrink-0 mt-0.5" />
        <p className="leading-snug">
          This driver is <span className="font-semibold text-foreground">excluded from the Dispatch Hub</span>.
          Daily dispatch tracking is disabled. Toggle exclusion off in the Operator panel to resume.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Month nav + Mark range */}
      <div className="flex items-center justify-between gap-1">
        <button onClick={prevMonth} className="p-0.5 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-foreground">{monthLabel}</span>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={openRangePopover}
                title="Mark a date range with the same status"
                className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-gold hover:text-gold-light px-1.5 py-0.5 rounded border border-gold/40 hover:bg-gold/5 transition-colors"
              >
                <CalendarRange className="h-3 w-3" />
                Range
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" side="bottom" align="center" sideOffset={6}>
              <p className="text-[11px] font-semibold text-foreground mb-2">Mark date range</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">From</Label>
                    <input
                      type="date"
                      value={rangeFrom}
                      max={rangeTo || undefined}
                      onChange={e => setRangeFrom(e.target.value)}
                      className="mt-0.5 h-7 w-full rounded border border-input bg-background px-1.5 text-[11px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">To</Label>
                    <input
                      type="date"
                      value={rangeTo}
                      min={rangeFrom || undefined}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => setRangeTo(e.target.value)}
                      className="mt-0.5 h-7 w-full rounded border border-input bg-background px-1.5 text-[11px]"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Status</Label>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {(Object.keys(STATUS_COLORS) as DailyStatus[]).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRangeStatus(s)}
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] font-medium transition-colors text-left ${
                          rangeStatus === s
                            ? STATUS_COLORS[s].bg + ' ' + STATUS_COLORS[s].text
                            : 'hover:bg-muted text-foreground/80'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s].dot} shrink-0`} />
                        {STATUS_COLORS[s].label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <Checkbox
                    checked={rangeOverwrite}
                    onCheckedChange={c => setRangeOverwrite(c === true)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[10px] text-foreground/80">Overwrite existing entries</span>
                </label>
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRangeOpen(false)}
                    disabled={rangeApplying}
                    className="h-7 text-[11px] px-2"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyRange}
                    disabled={rangeApplying || !rangeFrom || !rangeTo}
                    className="h-7 text-[11px] px-2.5 bg-gold text-surface-dark hover:bg-gold-light"
                  >
                    {rangeApplying ? 'Applying…' : 'Apply'}
                  </Button>
                </div>
                <p className="text-[9px] text-muted-foreground leading-snug pt-0.5">
                  Future days are skipped. If the range includes today, the live Dispatch Hub also updates.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <button onClick={nextMonth} className="p-0.5 rounded hover:bg-muted transition-colors">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="h-6" />;
          const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const log = logMap[dateStr];
          const isToday = isCurrentMonth && day === today.getDate();
          const statusCfg = log ? STATUS_COLORS[log.status] : null;

          return (
            <Popover key={day}>
              <PopoverTrigger asChild>
                <button
                  title={
                    isToday
                      ? 'Setting status here also updates the live Dispatch Hub'
                      : undefined
                  }
                  className={`h-6 w-full flex items-center justify-center rounded-sm text-[10px] transition-colors relative ${
                    isToday ? 'font-bold ring-1 ring-gold/60' : ''
                  } ${
                    statusCfg ? statusCfg.bg : 'hover:bg-muted/50'
                  }`}
                >
                  <span className={statusCfg ? statusCfg.text + ' font-semibold' : 'text-foreground/70'}>{day}</span>
                  {statusCfg && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${statusCfg.dot}`} />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1.5" side="top" align="center" sideOffset={4}>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1 px-1">
                  {new Date(month.year, month.month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <div className="flex flex-col gap-0.5">
                  {(Object.keys(STATUS_COLORS) as DailyStatus[]).map(s => (
                    <button
                      key={s}
                      disabled={saving}
                      onClick={() => setStatus(day, s)}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        log?.status === s ? STATUS_COLORS[s].bg + ' ' + STATUS_COLORS[s].text : 'hover:bg-muted text-foreground/80'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s].dot} shrink-0`} />
                      {STATUS_COLORS[s].label}
                    </button>
                  ))}
                </div>
                {log && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => clearStatus(day)}
                      title="Remove this day's status (returns the cell to blank)."
                      className="w-full text-left px-1.5 py-1 rounded text-[11px] font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Clear status
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {/* Counters */}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
        {(Object.keys(STATUS_COLORS) as DailyStatus[]).map(s => (
          <span key={s} className={`flex items-center gap-1 text-[10px] font-medium ${STATUS_COLORS[s].text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[s].dot}`} />
            {counters[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
