import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronLeft, ChevronRight, Search, X, AlertTriangle } from 'lucide-react';
import { getDbErrorMessage } from '@/lib/dbError';
import { operatorDisplayName } from '@/lib/profileNames';
import {
  inspectionGroup, nextCycleOnOrAfter, cycleStatus, cycleLabel,
  CYCLE_STATUS_LABELS, MONTH_NAMES, GROUP_MONTHS, MAKEUP_MONTHS, type CycleStatus,
} from '@/lib/inspectionProgram';

const db = supabase as any;

interface CalendarUnit {
  operatorId: string;
  name: string;
  unit: string | null;
  group: 'A' | 'B' | null;
  month: number;
  status: CycleStatus | null;
  cycleLabel: string;
}

interface Props {
  year: number;
  onSelectOperator?: (operatorId: string) => void;
}

export default function InspectionCalendar({ year, onSelectOperator }: Props) {
  const [units, setUnits] = useState<CalendarUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<'all' | 'A' | 'B'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CycleStatus>('all');
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // NAMES LIVE ON `applications`, NOT ON `operators`. Selecting them off
    // `operators` makes PostgREST reject the whole read, which rendered here as
    // an empty calendar with no error at all.
    const [opsRes, cyclesRes] = await Promise.all([
      supabase.from('operators')
        .select('id, unit_number, is_active, is_demo, demo_label, applications(first_name, last_name)')
        .eq('is_active', true),
      db.from('inspection_cycles').select('*').gte('cycle_year', year).lte('cycle_year', year),
    ]);

    if (opsRes.error || cyclesRes.error) {
      setLoadError(getDbErrorMessage(opsRes.error ?? cyclesRes.error));
      setUnits([]);
      setLoading(false);
      return;
    }
    setLoadError(null);

    const cycles = (cyclesRes.data as any[]) ?? [];
    const rows: CalendarUnit[] = [];

    for (const op of (opsRes.data as any[]) ?? []) {
      const group = inspectionGroup(op.unit_number);
      if (!group) continue;

      // For each assigned month in the year, figure the cycle status.
      for (const month of GROUP_MONTHS[group]) {
        const row = cycles.find(
          (c: any) => c.operator_id === op.id && c.cycle_year === year && c.cycle_month === month,
        );
        rows.push({
          operatorId: op.id,
          name: operatorDisplayName(
            { application: op.applications, is_demo: op.is_demo, demo_label: op.demo_label },
            'Unknown driver',
          ),
          unit: op.unit_number,
          group,
          month,
          status: cycleStatus({
            cycle: { year, month },
            submittedAt: row?.submitted_at,
            closedAt: row?.closed_at,
            defectsIdentified: row?.defects_identified,
            defectsRepaired: row?.defects_repaired,
            graceUntil: row?.grace_until,
          }),
          cycleLabel: cycleLabel({ year, month }),
        });
      }
    }

    setUnits(rows);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return units.filter(u => {
      if (groupFilter !== 'all' && u.group !== groupFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!term) return true;
      return u.name.toLowerCase().includes(term) || (u.unit ?? '').toLowerCase().includes(term);
    });
  }, [units, groupFilter, statusFilter, search]);

  const monthSummary = useCallback((month: number) => {
    const inMonth = filtered.filter(u => u.month === month);
    const closed = inMonth.filter(u => u.status === 'closed').length;
    const submitted = inMonth.filter(u => u.status === 'submitted').length;
    const outstanding = inMonth.filter(u => u.status && u.status !== 'closed' && u.status !== 'submitted' && u.status !== 'upcoming').length;
    return { total: inMonth.length, closed, submitted, outstanding };
  }, [filtered]);

  const statusBadgeClass = (status: CycleStatus | null) => {
    if (!status) return '';
    if (status === 'overdue') return 'bg-destructive/10 text-destructive border-destructive/40';
    if (status === 'closed') return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    if (status === 'grace') return 'bg-orange-50 text-orange-800 border-orange-300';
    if (status === 'submitted') return 'bg-blue-50 text-blue-800 border-blue-300';
    return 'bg-amber-50 text-amber-800 border-amber-300';
  };

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2 py-6">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading calendar…
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm" variant={groupFilter === 'all' ? 'default' : 'outline'}
            className="text-xs h-7"
            onClick={() => setGroupFilter('all')}
          >
            All groups
          </Button>
          <Button
            size="sm" variant={groupFilter === 'A' ? 'default' : 'outline'}
            className="text-xs h-7"
            onClick={() => setGroupFilter('A')}
          >
            Group A
          </Button>
          <Button
            size="sm" variant={groupFilter === 'B' ? 'default' : 'outline'}
            className="text-xs h-7"
            onClick={() => setGroupFilter('B')}
          >
            Group B
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'upcoming', 'due', 'submitted', 'grace', 'overdue', 'closed'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              className="text-xs h-7 capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Any status' : CYCLE_STATUS_LABELS[s as CycleStatus]}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Driver or unit"
            className="pl-7 h-7 text-xs w-full sm:w-44"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {MONTH_NAMES.map((name, idx) => {
          const month = idx + 1;
          const inMonth = filtered.filter(u => u.month === month);
          const summary = monthSummary(month);
          const isMakeup = MAKEUP_MONTHS.includes(month);

          return (
            <div key={month} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{name}</p>
                {isMakeup && (
                  <Badge variant="outline" className="text-[10px]">makeup</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {summary.total
                  ? `${summary.closed} complete · ${summary.submitted} in review · ${summary.outstanding} outstanding`
                  : 'No units scheduled'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inMonth.length === 0 && !isMakeup && (
                  <span className="text-[11px] text-muted-foreground italic">No matching units</span>
                )}
                {inMonth.map(u => (
                  <button
                    key={`${u.operatorId}-${month}`}
                    onClick={() => onSelectOperator?.(u.operatorId)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{u.unit ?? '—'}</span>
                    <span className="text-muted-foreground truncate max-w-[80px]">{u.name}</span>
                    {u.status && (
                      <span className={`ml-0.5 inline-block h-1.5 w-1.5 rounded-full ${
                        u.status === 'closed' ? 'bg-emerald-500'
                          : u.status === 'overdue' ? 'bg-destructive'
                          : u.status === 'grace' ? 'bg-orange-500'
                          : u.status === 'submitted' ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Closed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Awaiting repair docs</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Due / upcoming</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Grace</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Overdue</span>
      </div>
    </div>
  );
}
