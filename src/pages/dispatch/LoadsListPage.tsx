import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import {
  EQUIPMENT_TYPES, LOAD_STATUSES, formatCurrency, formatEnumLabel, formatShortDate,
  type EquipmentType, type LoadStatus,
} from '@/lib/loadFormat';

interface LoadRow {
  id: string;
  load_number: string;
  status: LoadStatus;
  equipment_type: EquipmentType | null;
  linehaul_rate: number | null;
  total_load_value: number | null;
  created_at: string;
  operator_id: string | null;
  brokerName: string | null;
  driverName: string | null;
}

const STAT_GROUPS: { label: string; statuses: LoadStatus[] }[] = [
  { label: 'Available',         statuses: ['available'] },
  { label: 'Covered / Dispatched', statuses: ['covered', 'dispatched'] },
  { label: 'In Transit',        statuses: ['in_transit', 'at_delivery'] },
  { label: 'Delivered',         statuses: ['delivered', 'pod_received', 'accessorials_approved'] },
  { label: 'Ready to Invoice',  statuses: ['ready_to_invoice'] },
];

async function fetchLoads(): Promise<LoadRow[]> {
  const { data, error } = await supabase
    .from('loads')
    .select('id, load_number, status, equipment_type, linehaul_rate, total_load_value, created_at, operator_id, brokers:broker_id(company_name)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const operatorIds = Array.from(new Set(rows.map(r => r.operator_id).filter(Boolean))) as string[];

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

  return rows.map(r => ({
    id: r.id,
    load_number: r.load_number,
    status: r.status as LoadStatus,
    equipment_type: r.equipment_type as EquipmentType | null,
    linehaul_rate: r.linehaul_rate,
    total_load_value: r.total_load_value,
    created_at: r.created_at,
    operator_id: r.operator_id,
    brokerName: (r as { brokers?: { company_name: string } | null }).brokers?.company_name ?? null,
    driverName: r.operator_id ? driverNames[r.operator_id] ?? null : null,
  }));
}

export default function LoadsListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LoadStatus>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<'all' | EquipmentType>('all');
  const debouncedSearch = useDebouncedValue(search, 200);

  const { data: loads, isLoading, error, refetch } = useQuery({
    queryKey: ['dispatch-loads'],
    queryFn: fetchLoads,
  });

  const comingSoon = () => toast({ description: 'Load creation coming soon.' });

  const filtersActive = debouncedSearch.trim() !== '' || statusFilter !== 'all' || equipmentFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setEquipmentFilter('all'); };

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return (loads ?? []).filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (equipmentFilter !== 'all' && l.equipment_type !== equipmentFilter) return false;
      if (!q) return true;
      return [l.load_number, l.brokerName, l.driverName]
        .filter(Boolean)
        .some(v => (v as string).toLowerCase().includes(q));
    });
  }, [loads, debouncedSearch, statusFilter, equipmentFilter]);

  const counts = useMemo(() => STAT_GROUPS.map(g => ({
    label: g.label,
    count: (loads ?? []).filter(l => g.statuses.includes(l.status)).length,
  })), [loads]);

  const rateOf = (l: LoadRow) => formatCurrency(l.total_load_value ?? l.linehaul_rate);

  const createButton = (
    <Button onClick={comingSoon} className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light">
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
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search load #, broker, or driver…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'all' | LoadStatus)}>
          <SelectTrigger className="sm:w-52"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {LOAD_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{formatEnumLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={equipmentFilter} onValueChange={v => setEquipmentFilter(v as 'all' | EquipmentType)}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="All Equipment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Equipment</SelectItem>
            {EQUIPMENT_TYPES.map(t => (
              <SelectItem key={t} value={t}>{formatEnumLabel(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <div className="hidden md:block rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Load #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(l => (
                  <TableRow
                    key={l.id}
                    onClick={() => navigate(`/dispatch/loads/${l.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono font-medium text-foreground">{l.load_number}</TableCell>
                    <TableCell><LoadStatusBadge status={l.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{l.brokerName ?? '—'}</TableCell>
                    <TableCell className={l.driverName ? 'text-foreground' : 'text-muted-foreground'}>
                      {l.driverName ?? 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatEnumLabel(l.equipment_type)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rateOf(l)}</TableCell>
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                      {formatShortDate(l.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {(loads ?? []).length} load{(loads ?? []).length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Card list (mobile) */}
          <div className="md:hidden space-y-2.5">
            {filtered.map(l => (
              <button
                key={l.id}
                onClick={() => navigate(`/dispatch/loads/${l.id}`)}
                className="w-full text-left rounded-lg border border-border bg-card p-3 active:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-sm text-foreground">{l.load_number}</span>
                  <LoadStatusBadge status={l.status} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-muted-foreground">Broker</span>
                  <span className="text-foreground text-right truncate">{l.brokerName ?? '—'}</span>
                  <span className="text-muted-foreground">Driver</span>
                  <span className="text-foreground text-right truncate">{l.driverName ?? 'Unassigned'}</span>
                  <span className="text-muted-foreground">Equipment</span>
                  <span className="text-foreground text-right">{formatEnumLabel(l.equipment_type)}</span>
                  <span className="text-muted-foreground">Rate</span>
                  <span className="text-foreground text-right tabular-nums">{rateOf(l)}</span>
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground text-right">{formatShortDate(l.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}