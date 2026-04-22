import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, EyeOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
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
  not_dispatched: { dot: 'bg-muted-foreground', bg: 'bg-muted/40',          label: 'Not Dispatched', text: 'text-muted-foreground' },
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
    setSaving(true);
    const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
      fetchLogs();
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
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-0.5 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="text-[11px] font-semibold text-foreground">{monthLabel}</span>
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
                  className={`h-6 w-full flex items-center justify-center rounded-sm text-[10px] transition-colors relative ${
                    isToday ? 'font-bold ring-1 ring-primary/40' : ''
                  } ${statusCfg ? statusCfg.bg : 'hover:bg-muted/50'}`}
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
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        log?.status === s ? STATUS_COLORS[s].bg + ' ' + STATUS_COLORS[s].text : 'hover:bg-muted text-foreground/80'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s].dot} shrink-0`} />
                      {STATUS_COLORS[s].label}
                    </button>
                  ))}
                </div>
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
