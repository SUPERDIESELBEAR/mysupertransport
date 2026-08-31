import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useViewPreferences } from '@/hooks/useViewPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ColumnVisibilityMenu from '@/components/shared/ColumnVisibilityMenu';
import SortableTableHead from '@/components/shared/SortableTableHead';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import LoadClaimIndicator from '@/components/dispatch/LoadClaimIndicator';
import { compareValues, nextSortState } from '@/lib/listSorting';
import {
  EQUIPMENT_TYPES, LOAD_STATUSES, formatEnumLabel,
  type EquipmentType, type LoadStatus,
} from '@/lib/loadFormat';
import {
  summarizeActiveClaims,
  matchesClaimFilter,
  normalizeClaimFilter,
  type ActiveClaimSummary,
  type ClaimFilterValue,
} from '@/lib/loadClaims';
import {
  type ClaimLevel,
  type ClaimType,
} from '@/components/dispatch/loadDetail/claimConstants';
import {
  DEFAULT_LOAD_COLUMNS, LOAD_COLUMNS, LOAD_COLUMN_TOGGLES, rateOf, type LoadRow,
} from './loadsColumns';

const VIEW_KEY = 'loads_list';

const STAT_GROUPS: { label: string; statuses: LoadStatus[] }[] = [
  { label: 'Available',         statuses: ['available'] },
  { label: 'Covered / Dispatched', statuses: ['covered', 'dispatched'] },
  { label: 'In Transit',        statuses: ['in_transit', 'at_delivery'] },
  { label: 'Delivered',         statuses: ['delivered', 'pod_received', 'accessorials_approved'] },
  { label: 'Ready to Invoice',  statuses: ['ready_to_invoice'] },
];

interface StopRow {
  stop_sequence: number | null;
  city: string | null;
  state: string | null;
  appointment_start: string | null;
}

async function fetchLoads(orderField: string, ascending: boolean): Promise<LoadRow[]> {
  const { data, error } = await supabase
    .from('loads')
    .select(
      'id, load_number, status, equipment_type, load_type, linehaul_rate, total_load_value, ' +
      'loaded_miles, commodity, weight_lbs, created_at, delivered_at, operator_id, dispatcher_id, ' +
      'brokers:broker_id(company_name), dispatcher:dispatcher_id(first_name, last_name), ' +
      'load_stops(stop_sequence, city, state, appointment_start)',
    )
    .order(orderField, { ascending });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const operatorIds = Array.from(
    new Set(rows.map(r => r.operator_id as string | null).filter(Boolean)),
  ) as string[];

  const driverNames: Record<string, string> = {};
  if (operatorIds.length > 0) {
    const { data: operators, error: opErr } = await supabase
      .from('operators')
      .select('id, user_id')
      .in('id', operatorIds);
    if (opErr) throw opErr;

    const userIds = (operators ?? []).map(o => o.user_id).filter(Boolean);
    const nameByUser: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', userIds);
      if (profErr) throw profErr;
      (profiles ?? []).forEach(p => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
        if (p.user_id && name) nameByUser[p.user_id] = name;
      });
    }
    (operators ?? []).forEach(o => {
      const name = o.user_id ? nameByUser[o.user_id] : undefined;
      if (name) driverNames[o.id] = name;
    });
  }

  const loadIds = rows.map(r => r.id as string);
  const activeClaimsByLoad: Record<string, ActiveClaimSummary> = {};
  if (loadIds.length > 0) {
    const { data: claimRows, error: claimErr } = await supabase
      .from('claim_flags')
      .select('load_id, flag_level, claim_type')
      .in('load_id', loadIds)
      .eq('is_active', true);
    if (claimErr) throw claimErr;
    const grouped = new Map<string, { flag_level: ClaimLevel; claim_type: ClaimType }[]>();
    (claimRows ?? []).forEach(c => {
      const list = grouped.get(c.load_id) ?? [];
      list.push({ flag_level: c.flag_level, claim_type: c.claim_type });
      grouped.set(c.load_id, list);
    });
    grouped.forEach((claims, loadId) => {
      const summary = summarizeActiveClaims(claims);
      if (summary) activeClaimsByLoad[loadId] = summary;
    });
  }

  return rows.map(r => {
    const stops = ((r.load_stops as StopRow[] | null) ?? [])
      .slice()
      .sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
    const first = stops[0];
    const last = stops.length > 1 ? stops[stops.length - 1] : undefined;
    const dispatcher = r.dispatcher as { first_name: string | null; last_name: string | null } | null;
    const dispatcherName = dispatcher
      ? [dispatcher.first_name, dispatcher.last_name].filter(Boolean).join(' ').trim() || null
      : null;
    const operatorId = r.operator_id as string | null;
    const loadId = r.id as string;

    return {
      id: loadId,
      load_number: r.load_number as string,
      status: r.status as LoadRow['status'],
      equipment_type: r.equipment_type as LoadRow['equipment_type'],
      load_type: r.load_type as LoadRow['load_type'],
      linehaul_rate: r.linehaul_rate as number | null,
      total_load_value: r.total_load_value as number | null,
      loaded_miles: r.loaded_miles as number | null,
      commodity: r.commodity as string | null,
      weight_lbs: r.weight_lbs as number | null,
      created_at: r.created_at as string,
      delivered_at: (r.delivered_at as string | null) ?? null,
      operator_id: operatorId,
      dispatcher_id: r.dispatcher_id as string | null,
      brokerName: (r.brokers as { company_name: string } | null)?.company_name ?? null,
      driverName: operatorId ? driverNames[operatorId] ?? null : null,
      dispatcherName,
      originCity: first?.city ?? null,
      originState: first?.state ?? null,
      destinationCity: last?.city ?? null,
      destinationState: last?.state ?? null,
      pickupDate: first?.appointment_start ?? null,
      deliveryDate: last?.appointment_start ?? null,
      activeClaim: activeClaimsByLoad[loadId] ?? null,
    } satisfies LoadRow;
  });
}

interface DispatcherOption { id: string; name: string }

async function fetchDispatchers(): Promise<DispatcherOption[]> {
  const { data: roleRows, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'dispatcher');
  if (error) throw error;
  const userIds = Array.from(new Set((roleRows ?? []).map(r => r.user_id).filter(Boolean))) as string[];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('user_id', userIds);
  if (profErr) throw profErr;

  return (profiles ?? [])
    .map(p => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() }))
    .filter(p => p.id && p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface LoadsListPageProps {
  /**
   * Host-supplied row navigation. The Management Portal drives its sections
   * with internal state, so it passes this instead of relying on the
   * dispatch-only `/dispatch/loads/:id` path.
   */
  onSelectLoad?: (id: string) => void;
  /** Host-supplied "Create Load" navigation; defaults to the dispatch route. */
  onCreateLoad?: () => void;
}

export default function LoadsListPage({ onSelectLoad, onCreateLoad }: LoadsListPageProps = {}) {
  const navigate = useNavigate();
  const openLoad = (id: string) => {
    if (onSelectLoad) onSelectLoad(id);
    else navigate(`/dispatch/loads/${id}`);
  };
  const createLoad = () => {
    if (onCreateLoad) onCreateLoad();
    else navigate('/dispatch/loads/new');
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LoadStatus>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<'all' | EquipmentType>('all');
  const [dispatcherFilter, setDispatcherFilter] = useState<string>('all');
  const debouncedSearch = useDebouncedValue(search, 200);

  const { visibleColumns, sort, filters, setVisibleColumns, setSort, setFilters, reset } = useViewPreferences({
    viewKey: VIEW_KEY,
    defaultVisibleColumns: DEFAULT_LOAD_COLUMNS,
  });

  // A settlement-blocking state is worth remembering: the claim filter persists
  // per user through the same view-preferences record as columns and sort.
  const claimFilter = normalizeClaimFilter((filters as Record<string, unknown> | null)?.claim);
  const setClaimFilter = (next: ClaimFilterValue) =>
    setFilters({ ...(filters as Record<string, unknown> | null ?? {}), claim: next });

  const columns = useMemo(
    () => LOAD_COLUMNS.filter(c => c.locked || visibleColumns.includes(c.key)),
    [visibleColumns],
  );

  const activeColumn = sort ? LOAD_COLUMNS.find(c => c.key === sort.column) ?? null : null;
  const serverField = activeColumn?.serverField ?? null;
  const orderField = serverField ?? 'created_at';
  const ascending = serverField ? sort?.direction === 'asc' : false;

  const { data: loads, isLoading, error, refetch } = useQuery({
    queryKey: ['dispatch-loads', orderField, ascending],
    queryFn: () => fetchLoads(orderField, ascending),
  });

  const { data: dispatchers } = useQuery({
    queryKey: ['dispatch-loads-dispatchers'],
    queryFn: fetchDispatchers,
  });

  const clearFilters = () => {
    setSearch(''); setStatusFilter('all'); setEquipmentFilter('all'); setDispatcherFilter('all'); setClaimFilter('all');
  };

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = (loads ?? []).filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (equipmentFilter !== 'all' && l.equipment_type !== equipmentFilter) return false;
      if (dispatcherFilter === 'unassigned' && l.dispatcher_id) return false;
      if (dispatcherFilter !== 'all' && dispatcherFilter !== 'unassigned' && l.dispatcher_id !== dispatcherFilter) return false;
      if (!matchesClaimFilter(l.activeClaim, claimFilter)) return false;
      if (!q) return true;
      return [l.load_number, l.brokerName, l.driverName, l.dispatcherName]
        .filter(Boolean)
        .some(v => (v as string).toLowerCase().includes(q));
    });

    // Derived columns (and status workflow order) sort client-side; direct
    // `loads` columns already came back ordered from the database.
    if (sort && activeColumn && !activeColumn.serverField) {
      return rows.slice().sort((a, b) =>
        compareValues(activeColumn.sortValue(a), activeColumn.sortValue(b), sort.direction));
    }
    return rows;
  }, [loads, debouncedSearch, statusFilter, equipmentFilter, dispatcherFilter, claimFilter, sort, activeColumn]);

  const counts = useMemo(() => STAT_GROUPS.map(g => ({
    label: g.label,
    count: (loads ?? []).filter(l => g.statuses.includes(l.status)).length,
  })), [loads]);

  const handleSort = (columnKey: string) => setSort(nextSortState(sort, columnKey));

  const createButton = (
    <Button onClick={createLoad} className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light">
      <Plus className="h-4 w-4" />
      Create Load
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-foreground">Loads</h1>
        {createButton}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {counts.map(c => (
          <div key={c.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{c.label}</p>
            {isLoading
              ? <Skeleton className="h-6 w-10 mt-1" />
              : <p className="text-xl font-semibold text-foreground leading-tight">{c.count}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search load #, broker, or driver…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'all' | LoadStatus)}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {LOAD_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{formatEnumLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={equipmentFilter} onValueChange={v => setEquipmentFilter(v as 'all' | EquipmentType)}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="All Equipment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Equipment</SelectItem>
            {EQUIPMENT_TYPES.map(t => (
              <SelectItem key={t} value={t}>{formatEnumLabel(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dispatcherFilter} onValueChange={setDispatcherFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="All Dispatchers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dispatchers</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(dispatchers ?? []).map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={claimFilter} onValueChange={v => setClaimFilter(v as ClaimFilterValue)}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="All Claims" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Claims</SelectItem>
            <SelectItem value="active">Has active claim</SelectItem>
            <SelectItem value="watch">Watch</SelectItem>
            <SelectItem value="hold">Hold</SelectItem>
          </SelectContent>
        </Select>
        <ColumnVisibilityMenu
          columns={LOAD_COLUMN_TOGGLES}
          visible={visibleColumns}
          onChange={setVisibleColumns}
          onReset={reset}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive flex items-center justify-between gap-3">
          <span>Could not load the load list.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && !error && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {/* Empty — nothing at all */}
      {!isLoading && !error && (loads ?? []).length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold text-foreground">No loads yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Loads you create will show up here with their status, broker, driver, and rate.
          </p>
          <div className="mt-4 flex justify-center">{createButton}</div>
        </div>
      )}

      {/* Empty — filters */}
      {!isLoading && !error && (loads ?? []).length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-semibold text-foreground">No loads match the current filters</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different search or status.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
        </div>
      )}

      {/* Table (md+) */}
      {!isLoading && !error && filtered.length > 0 && (
        <>
          <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {columns.map(col => (
                    <SortableTableHead
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      align={col.align}
                      sort={sort}
                      onSort={handleSort}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(l => (
                  <TableRow key={l.id} onClick={() => openLoad(l.id)} className="cursor-pointer">
                    {columns.map(col => (
                      <TableCell key={col.key} className={col.cellClassName}>
                        {col.render(l)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {(loads ?? []).length} load{(loads ?? []).length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Card list (mobile) — curated subset */}
          <div className="md:hidden space-y-2.5">
            {filtered.map(l => (
              <button
                key={l.id}
                onClick={() => openLoad(l.id)}
                className="w-full text-left rounded-lg border border-border bg-card p-3 active:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-sm text-foreground">{l.load_number}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <LoadStatusBadge status={l.status} />
                    {l.activeClaim && (
                      <LoadClaimIndicator
                        level={l.activeClaim.level}
                        claimType={l.activeClaim.claimType}
                        title={l.activeClaim.title}
                      />
                    )}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-muted-foreground">Broker</span>
                  <span className="text-foreground text-right truncate">{l.brokerName ?? '—'}</span>
                  <span className="text-muted-foreground">Driver</span>
                  <span className="text-foreground text-right truncate">{l.driverName ?? 'Unassigned'}</span>
                  <span className="text-muted-foreground">Rate</span>
                  <span className="text-foreground text-right tabular-nums">{rateOf(l)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
