import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Truck, Loader2, AlertTriangle, CheckCircle2, Clock, Archive, Pencil, Settings2 } from 'lucide-react';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';
import { formatDaysHuman } from '@/components/inspection/InspectionBinderTypes';
import QuickTruckEditModal from './QuickTruckEditModal';
import FleetReminderIntervalDialog from './FleetReminderIntervalDialog';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DotFilter = 'all' | 'overdue' | 'due_soon' | 'no_record';
type DotSort = 'unit' | 'due_asc' | 'due_desc';

function daysUntilDue(nextDue: string | null): number | null {
  if (!nextDue) return null;
  return differenceInDays(startOfDay(parseISO(nextDue)), startOfDay(new Date()));
}

interface FleetRow {
  operatorId: string;
  unitNumber: string | null;
  driverName: string;
  ownerName: string;
  truckYear: string | null;
  truckMake: string | null;
  truckVin: string | null;
  truckPlate: string | null;
  truckPlateState: string | null;
  trailerNumber: string | null;
  totalRepairCost: number;
  dotNextDue: string | null;
}

interface FleetRosterProps {
  onSelectOperator: (operatorId: string) => void;
}

function dotStatusBadge(nextDue: string | null) {
  if (!nextDue) return <Badge variant="outline" className="text-[10px]">No Record</Badge>;
  const days = differenceInDays(startOfDay(parseISO(nextDue)), startOfDay(new Date()));
  if (days < 0) return <Badge variant="destructive" className="text-[10px]">Overdue</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">{formatDaysHuman(days)}</Badge>;
  if (days <= 90) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">{formatDaysHuman(days)}</Badge>;
  return <Badge variant="outline" className="text-[10px] text-emerald-700">{formatDaysHuman(days)}</Badge>;
}

export default function FleetRoster({ onSelectOperator }: FleetRosterProps) {
  const [activeRows, setActiveRows] = useState<FleetRow[]>([]);
  const [deactivatedRows, setDeactivatedRows] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [editTarget, setEditTarget] = useState<FleetRow | null>(null);
  const [intervalDialogOpen, setIntervalDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode('vehicle_hub_view', 'mode', 'cards');
  const [dotFilter, setDotFilter] = useState<DotFilter>(() => {
    return (localStorage.getItem('vehicle_hub_dot_filter') as DotFilter) || 'all';
  });
  const [dotSort, setDotSort] = useState<DotSort>(() => {
    return (localStorage.getItem('vehicle_hub_dot_sort') as DotSort) || 'unit';
  });

  useEffect(() => { localStorage.setItem('vehicle_hub_dot_filter', dotFilter); }, [dotFilter]);
  useEffect(() => { localStorage.setItem('vehicle_hub_dot_sort', dotSort); }, [dotSort]);

  const buildRows = useCallback(async (isActive: boolean) => {
    const { data: operators } = await supabase
      .from('operators')
      .select(`
        id,
        unit_number,
        applications(first_name, last_name),
        onboarding_status(unit_number, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number, insurance_added_date),
        ica_contracts(owner_name, owner_business_name, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number)
      `)
      .eq('is_active', isActive);

    if (!operators) return [];

    // For active operators, only include those with an insurance_added_date set (Stage 6 complete).
    // Deactivated operators show regardless to preserve historical visibility.
    const filteredOperators = isActive
      ? (operators as any[]).filter(op => {
          const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
          return !!os?.insurance_added_date;
        })
      : (operators as any[]);

    const opIds = filteredOperators.map(o => o.id);

    const [{ data: maintenance }, { data: dotInspections }] = await Promise.all([
      supabase.from('truck_maintenance_records').select('operator_id, amount').in('operator_id', opIds),
      supabase.from('truck_dot_inspections').select('operator_id, next_due_date').order('inspection_date', { ascending: false }).in('operator_id', opIds),
    ]);

    const costMap = new Map<string, number>();
    (maintenance ?? []).forEach((r: any) => {
      costMap.set(r.operator_id, (costMap.get(r.operator_id) ?? 0) + Number(r.amount ?? 0));
    });

    const dotMap = new Map<string, string>();
    (dotInspections ?? []).forEach((r: any) => {
      if (!dotMap.has(r.operator_id)) dotMap.set(r.operator_id, r.next_due_date);
    });

    const fleet: FleetRow[] = filteredOperators.map(op => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const ica = Array.isArray(op.ica_contracts) ? op.ica_contracts[0] : op.ica_contracts;

      const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown';
      const ownerName = ica?.owner_name || ica?.owner_business_name || driverName;

      return {
        operatorId: op.id,
        unitNumber: os?.unit_number || op.unit_number || null,
        driverName,
        ownerName,
        truckYear: os?.truck_year || ica?.truck_year || null,
        truckMake: os?.truck_make || ica?.truck_make || null,
        truckVin: os?.truck_vin || ica?.truck_vin || null,
        truckPlate: os?.truck_plate || ica?.truck_plate || null,
        truckPlateState: os?.truck_plate_state || ica?.truck_plate_state || null,
        trailerNumber: os?.trailer_number || ica?.trailer_number || null,
        totalRepairCost: costMap.get(op.id) ?? 0,
        dotNextDue: dotMap.get(op.id) ?? null,
      };
    });

    fleet.sort((a, b) => {
      const aNum = parseInt(a.unitNumber ?? '99999');
      const bNum = parseInt(b.unitNumber ?? '99999');
      return aNum - bNum;
    });

    return fleet;
  }, []);

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    const [active, deactivated] = await Promise.all([
      buildRows(true),
      buildRows(false),
    ]);
    setActiveRows(active);
    setDeactivatedRows(deactivated);
    setLoading(false);
  }, [buildRows]);

  useEffect(() => { fetchFleet(); }, [fetchFleet]);

  const rows = showDeactivated ? deactivatedRows : activeRows;

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.driverName.toLowerCase().includes(q) ||
      r.ownerName.toLowerCase().includes(q) ||
      (r.unitNumber ?? '').toLowerCase().includes(q) ||
      (r.truckVin ?? '').toLowerCase().includes(q) ||
      (r.truckMake ?? '').toLowerCase().includes(q) ||
      (r.truckPlate ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    const c = { all: filtered.length, overdue: 0, due_soon: 0, no_record: 0 };
    filtered.forEach(r => {
      const d = daysUntilDue(r.dotNextDue);
      if (d === null) c.no_record++;
      else if (d < 0) c.overdue++;
      else if (d <= 30) c.due_soon++;
    });
    return c;
  }, [filtered]);

  const filteredAndSorted = useMemo(() => {
    const list = filtered.filter(r => {
      if (dotFilter === 'all') return true;
      const d = daysUntilDue(r.dotNextDue);
      if (dotFilter === 'no_record') return d === null;
      if (dotFilter === 'overdue') return d !== null && d < 0;
      if (dotFilter === 'due_soon') return d !== null && d >= 0 && d <= 30;
      return true;
    });
    const sorted = [...list];
    if (dotSort === 'unit') {
      sorted.sort((a, b) => parseInt(a.unitNumber ?? '99999') - parseInt(b.unitNumber ?? '99999'));
    } else {
      const dir = dotSort === 'due_asc' ? 1 : -1;
      sorted.sort((a, b) => {
        const da = daysUntilDue(a.dotNextDue);
        const db = daysUntilDue(b.dotNextDue);
        // No record always at top
        if (da === null && db === null) return 0;
        if (da === null) return -1;
        if (db === null) return 1;
        return (da - db) * dir;
      });
    }
    return sorted;
  }, [filtered, dotFilter, dotSort]);

  const handleFilterChange = (next: DotFilter) => {
    setDotFilter(next);
    if ((next === 'overdue' || next === 'due_soon') && dotSort === 'unit') {
      setDotSort('due_asc');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Vehicle Hub</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {activeRows.length} active vehicle{activeRows.length !== 1 ? 's' : ''}
              {deactivatedRows.length > 0 && ` · ${deactivatedRows.length} deactivated`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vehicles…"
              className="pl-9 text-sm h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Active / Deactivated toggle + Fleet settings */}
      <div className="flex flex-wrap gap-1.5 items-center justify-between">
        <div className="flex gap-1.5">
        <button
          onClick={() => setShowDeactivated(false)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
            !showDeactivated
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
          }`}
        >
          Active
          <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full ${!showDeactivated ? 'bg-white/20' : 'bg-muted'}`}>
            {activeRows.length}
          </span>
        </button>
        <button
          onClick={() => setShowDeactivated(true)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors flex items-center gap-1 ${
            showDeactivated
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
          }`}
        >
          <Archive className="h-3 w-3" />
          Deactivated
          <span className={`ml-1 text-[10px] px-1 py-0.5 rounded-full ${showDeactivated ? 'bg-white/20' : 'bg-muted'}`}>
            {deactivatedRows.length}
          </span>
        </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5 h-8"
          onClick={() => setIntervalDialogOpen(true)}
          title="Set the fleet-wide default DOT reminder interval"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Fleet Reminder Interval
        </Button>
      </div>

      {/* DOT status filter chips + sort */}
      <div className="flex flex-wrap gap-1.5 items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: 'all' as const, label: 'All', count: counts.all, activeClass: 'bg-primary text-primary-foreground border-primary' },
            { key: 'overdue' as const, label: 'Overdue', count: counts.overdue, activeClass: 'bg-destructive text-destructive-foreground border-destructive' },
            { key: 'due_soon' as const, label: 'Due Soon', count: counts.due_soon, activeClass: 'bg-amber-500 text-white border-amber-500' },
            { key: 'no_record' as const, label: 'No Record', count: counts.no_record, activeClass: 'bg-muted-foreground text-background border-muted-foreground' },
          ]).map(chip => {
            const active = dotFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => handleFilterChange(chip.key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  active ? chip.activeClass : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {chip.label}
                <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-muted'}`}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        <Select value={dotSort} onValueChange={(v) => setDotSort(v as DotSort)}>
          <SelectTrigger className="h-8 text-xs w-[200px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unit" className="text-xs">Unit # (default)</SelectItem>
            <SelectItem value="due_asc" className="text-xs">DOT Due — Soonest first</SelectItem>
            <SelectItem value="due_desc" className="text-xs">DOT Due — Furthest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
          <p className="text-sm">Loading fleet…</p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? 'No vehicles match your search.' : showDeactivated ? 'No deactivated vehicles.' : 'No active vehicles found.'}</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${showDeactivated ? 'opacity-75' : ''}`}>
          {filteredAndSorted.map(row => (
            <div
              key={row.operatorId}
              onClick={() => onSelectOperator(row.operatorId)}
              className="group bg-white border border-border rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer p-4 flex flex-col gap-3"
            >
              {/* Header: Unit # + DOT status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Unit</div>
                    <div className="text-lg font-mono font-bold text-primary leading-tight truncate">
                      {row.unitNumber || '—'}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">{dotStatusBadge(row.dotNextDue)}</div>
              </div>

              {/* Driver + Owner */}
              <div className="space-y-0.5 text-sm">
                <div className="font-medium text-foreground truncate">{row.driverName}</div>
                {row.ownerName && row.ownerName !== row.driverName && (
                  <div className="text-xs text-muted-foreground truncate">Owner: {row.ownerName}</div>
                )}
              </div>

              {/* Specs */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs border-t border-border pt-2.5">
                <div>
                  <div className="text-muted-foreground">Vehicle</div>
                  <div className="font-medium text-foreground truncate">
                    {[row.truckYear, row.truckMake].filter(Boolean).join(' ') || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Plate</div>
                  <div className="font-mono text-foreground truncate">
                    {row.truckPlate
                      ? `${row.truckPlate}${row.truckPlateState ? ` (${row.truckPlateState})` : ''}`
                      : '—'}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">VIN</div>
                  <div className="font-mono text-foreground truncate">{row.truckVin || '—'}</div>
                </div>
              </div>

              {/* Footer: Repair cost + Edit */}
              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Repair Cost</div>
                  <div className="text-sm font-mono font-semibold">
                    {row.totalRepairCost > 0
                      ? `$${row.totalRepairCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={e => { e.stopPropagation(); setEditTarget(row); }}
                  title="Quick edit truck specs"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`bg-white border border-border rounded-xl overflow-hidden shadow-sm ${showDeactivated ? 'opacity-75' : ''}`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-sm font-semibold w-20">Unit #</TableHead>
                  <TableHead className="text-sm font-semibold">Driver</TableHead>
                  <TableHead className="text-sm font-semibold hidden lg:table-cell">Owner</TableHead>
                  <TableHead className="text-sm font-semibold hidden md:table-cell">Vehicle</TableHead>
                  <TableHead className="text-sm font-semibold hidden md:table-cell">Plate #</TableHead>
                  <TableHead className="text-sm font-semibold hidden lg:table-cell">VIN</TableHead>
                  <TableHead className="text-sm font-semibold text-right">Repair Cost</TableHead>
                  <TableHead className="text-sm font-semibold text-center">DOT Status</TableHead>
                  <TableHead className="text-sm font-semibold w-12 text-center">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSorted.map(row => (
                  <TableRow
                    key={row.operatorId}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => onSelectOperator(row.operatorId)}
                  >
                    <TableCell className="text-sm font-mono font-semibold text-primary">
                      {row.unitNumber || '—'}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{row.driverName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{row.ownerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                      {[row.truckYear, row.truckMake].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                      {row.truckPlate
                        ? <span className="font-mono">{row.truckPlate}{row.truckPlateState ? ` (${row.truckPlateState})` : ''}</span>
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell font-mono">
                      {row.truckVin || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {row.totalRepairCost > 0 ? `$${row.totalRepairCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {dotStatusBadge(row.dotNextDue)}
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditTarget(row)}
                        title="Quick edit truck specs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {editTarget && (
        <QuickTruckEditModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchFleet}
          operatorId={editTarget.operatorId}
          driverName={editTarget.driverName}
          initialValues={{
            truck_year: editTarget.truckYear,
            truck_make: editTarget.truckMake,
            truck_vin: editTarget.truckVin,
            truck_plate: editTarget.truckPlate,
            truck_plate_state: editTarget.truckPlateState,
            unit_number: editTarget.unitNumber,
            trailer_number: editTarget.trailerNumber,
          }}
        />
      )}
      <FleetReminderIntervalDialog
        open={intervalDialogOpen}
        onClose={() => setIntervalDialogOpen(false)}
        onSaved={fetchFleet}
      />
    </div>
  );
}
