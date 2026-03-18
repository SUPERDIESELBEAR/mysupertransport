import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Users2, ArrowRight, Phone, RefreshCw, MessageSquare, AlertTriangle, AlertCircle, Clock } from 'lucide-react';

interface DriverRow {
  operator_id: string;
  operator_user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  unit_number: string | null;
  dispatch_status: 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';
  cdl_expiration: string | null;
  medical_cert_expiration: string | null;
}

type DispatchFilter = 'all' | 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';
type ComplianceFilter = 'all' | 'expired' | 'critical' | 'warning';

function getComplianceTier(cdl: string | null, med: string | null): ComplianceFilter {
  const getDays = (d: string | null) =>
    d ? differenceInDays(startOfDay(parseISO(d)), startOfDay(new Date())) : null;
  const days = [getDays(cdl), getDays(med)].filter((d): d is number => d !== null);
  if (days.length === 0) return 'all';
  const min = Math.min(...days);
  if (min < 0) return 'expired';
  if (min <= 7) return 'critical';
  if (min <= 30) return 'warning';
  return 'all';
}

interface DriverRosterProps {
  onOpenDriver: (operatorId: string) => void;
  onMessageDriver?: (userId: string) => void;
  /** If true, only shows dispatch-relevant columns (for Dispatch Portal) */
  dispatchMode?: boolean;
  /** Called whenever the selection set changes (operator IDs) */
  onSelectionChange?: (selectedOperatorIds: string[]) => void;
}

const DISPATCH_STATUS_CONFIG = {
  not_dispatched: { label: 'Not Dispatched', badgeClass: 'status-neutral border' },
  dispatched:     { label: 'Dispatched',     badgeClass: 'status-complete border' },
  home:           { label: 'Home',            badgeClass: 'status-progress border' },
  truck_down:     { label: 'Truck Down',      badgeClass: 'status-action border' },
};

function expiryPill(dateStr: string | null, label: string) {
  if (!dateStr) return <span className="text-xs text-muted-foreground">—</span>;
  const days = differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
  const formatted = format(parseISO(dateStr), 'MM/dd/yyyy');
  if (days < 0) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5">
              {label} Expired
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatted}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (days <= 7) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5">
              {label} · {days}d
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatted}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (days <= 30) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--status-action))] bg-[hsl(var(--status-action))]/10 border border-[hsl(var(--status-action))]/30 rounded px-1.5 py-0.5">
              {label} · {days}d
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatted}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {label} · {days}d
          </span>
        </TooltipTrigger>
        <TooltipContent>{formatted}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function DriverRoster({ onOpenDriver, onMessageDriver, dispatchMode = false, onSelectionChange }: DriverRosterProps) {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DispatchFilter>('all');
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchDrivers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const { data } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        unit_number,
        onboarding_status!inner (fully_onboarded, unit_number),
        active_dispatch (dispatch_status),
        applications (first_name, last_name, phone, address_state, cdl_expiration, medical_cert_expiration)
      `)
      .eq('onboarding_status.fully_onboarded', true);

    if (data) {
      const getOne = (val: any) => (Array.isArray(val) ? val[0] : val) ?? null;

      const userIds = (data as any[]).map((op: any) => op.user_id).filter(Boolean);
      const profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, phone, home_state')
          .in('user_id', userIds);
        (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      const mapped: DriverRow[] = (data as any[]).map(op => {
        const os = getOne(op.onboarding_status);
        const ad = getOne(op.active_dispatch);
        const app = getOne(op.applications);
        const profile = profileMap[op.user_id] ?? {};
        return {
          operator_id: op.id,
          operator_user_id: op.user_id,
          first_name: profile.first_name ?? app?.first_name ?? null,
          last_name: profile.last_name ?? app?.last_name ?? null,
          phone: profile.phone ?? app?.phone ?? null,
          home_state: profile.home_state ?? app?.address_state ?? null,
          unit_number: os?.unit_number ?? op.unit_number ?? null,
          dispatch_status: (ad?.dispatch_status ?? 'not_dispatched') as DriverRow['dispatch_status'],
          cdl_expiration: app?.cdl_expiration ?? null,
          medical_cert_expiration: app?.medical_cert_expiration ?? null,
        };
      }).sort((a, b) => {
        const order: Record<DriverRow['dispatch_status'], number> = { truck_down: 0, not_dispatched: 1, home: 2, dispatched: 3 };
        return order[a.dispatch_status] - order[b.dispatch_status];
      });

      setDrivers(mapped);
      // Clear selections that no longer exist
      setSelected(prev => {
        const validIds = new Set(mapped.map(d => d.operator_id));
        const next = new Set([...prev].filter(id => validIds.has(id)));
        return next;
      });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDrivers();
    const channel = supabase
      .channel('driver-roster-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_dispatch' }, () => fetchDrivers(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_status' }, () => fetchDrivers(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchDrivers]);

  // Notify parent on selection changes
  useEffect(() => {
    onSelectionChange?.([...selected]);
  }, [selected, onSelectionChange]);

  // Compliance tier counts (over all drivers, before any filter)
  const complianceCounts = useMemo(() => {
    let expired = 0, critical = 0, warning = 0;
    for (const d of drivers) {
      const tier = getComplianceTier(d.cdl_expiration, d.medical_cert_expiration);
      if (tier === 'expired') expired++;
      else if (tier === 'critical') critical++;
      else if (tier === 'warning') warning++;
    }
    return { expired, critical, warning };
  }, [drivers]);

  const filtered = drivers.filter(d => {
    const matchesStatus = statusFilter === 'all' || d.dispatch_status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || `${d.first_name ?? ''} ${d.last_name ?? ''}`.toLowerCase().includes(q) ||
      (d.unit_number ?? '').toLowerCase().includes(q) ||
      (d.phone ?? '').includes(q);
    const tier = getComplianceTier(d.cdl_expiration, d.medical_cert_expiration);
    const matchesCompliance =
      complianceFilter === 'all' ||
      (complianceFilter === 'expired' && tier === 'expired') ||
      (complianceFilter === 'critical' && (tier === 'expired' || tier === 'critical')) ||
      (complianceFilter === 'warning' && (tier === 'expired' || tier === 'critical' || tier === 'warning'));
    return matchesStatus && matchesSearch && matchesCompliance;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(d => selected.has(d.operator_id));
  const someFilteredSelected = filtered.some(d => selected.has(d.operator_id));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(d => next.delete(d.operator_id));
      } else {
        filtered.forEach(d => next.add(d.operator_id));
      }
      return next;
    });
  };

  const toggleOne = (operatorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(operatorId) ? next.delete(operatorId) : next.add(operatorId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, unit, or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as DispatchFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="not_dispatched">Not Dispatched</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="truck_down">Truck Down</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDrivers(true)}
          disabled={refreshing}
          className="gap-1.5 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Compliance filter chips */}
      {!dispatchMode && (complianceCounts.expired + complianceCounts.critical + complianceCounts.warning) > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setComplianceFilter('all')}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              complianceFilter === 'all'
                ? 'bg-muted border-border text-foreground'
                : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            All Drivers
            <span className="font-semibold">{drivers.length}</span>
          </button>

          {complianceCounts.expired > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'expired' ? 'all' : 'expired')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'expired'
                  ? 'bg-destructive/15 border-destructive/40 text-destructive'
                  : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
              }`}
            >
              <AlertCircle className="h-3 w-3" />
              Expired
              <span className="font-semibold">{complianceCounts.expired}</span>
            </button>
          )}

          {complianceCounts.critical > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'critical' ? 'all' : 'critical')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'critical'
                  ? 'bg-destructive/15 border-destructive/40 text-destructive'
                  : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              Critical ≤ 7d
              <span className="font-semibold">{complianceCounts.critical}</span>
            </button>
          )}

          {complianceCounts.warning > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'warning' ? 'all' : 'warning')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'warning'
                  ? 'bg-[hsl(var(--warning))]/15 border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]'
                  : 'border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]/80 hover:bg-[hsl(var(--warning))]/10 hover:border-[hsl(var(--warning))]/50'
              }`}
            >
              <Clock className="h-3 w-3" />
              Warning ≤ 30d
              <span className="font-semibold">{complianceCounts.warning}</span>
            </button>
          )}
        </div>
      )}

      {/* Summary counts */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users2 className="h-3.5 w-3.5" />
          <strong className="text-foreground">{filtered.length}</strong> driver{filtered.length !== 1 ? 's' : ''}
          {filtered.length !== drivers.length && ` (of ${drivers.length})`}
        </span>
        {selected.size > 0 && (
          <span className="flex items-center gap-1.5 text-primary font-medium">
            · <strong>{selected.size}</strong> selected
          </span>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No active drivers found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {drivers.length === 0
              ? 'Fully onboarded operators will appear here automatically.'
              : complianceFilter !== 'all'
              ? `No drivers match the "${complianceFilter}" compliance filter.`
              : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {/* Select All checkbox */}
                <TableHead className="w-10 pr-0">
                  <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={allFilteredSelected}
                      data-state={someFilteredSelected && !allFilteredSelected ? 'indeterminate' : undefined}
                      onCheckedChange={toggleAll}
                      aria-label="Select all drivers"
                      className="data-[state=indeterminate]:opacity-60"
                    />
                  </div>
                </TableHead>
                <TableHead className="w-20">Unit #</TableHead>
                <TableHead>Driver</TableHead>
                {!dispatchMode && <TableHead className="hidden sm:table-cell">Phone</TableHead>}
                {!dispatchMode && <TableHead className="hidden md:table-cell">State</TableHead>}
                <TableHead>Status</TableHead>
                {!dispatchMode && <TableHead className="hidden lg:table-cell">Compliance</TableHead>}
                <TableHead className="w-20 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(driver => {
                const name = [driver.first_name, driver.last_name].filter(Boolean).join(' ') || 'Unknown Driver';
                const initials = [driver.first_name?.[0], driver.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
                const statusCfg = DISPATCH_STATUS_CONFIG[driver.dispatch_status];
                const isSelected = selected.has(driver.operator_id);

                // Compliance row highlighting
                const getDaysUntil = (dateStr: string | null) =>
                  dateStr ? differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date())) : null;
                const cdlDays = getDaysUntil(driver.cdl_expiration);
                const medDays = getDaysUntil(driver.medical_cert_expiration);
                const minDays = [cdlDays, medDays]
                  .filter((d): d is number => d !== null)
                  .reduce((a, b) => Math.min(a, b), Infinity);
                const rowHighlight =
                  minDays <= 7
                    ? 'border-l-4 border-l-destructive bg-destructive/[0.03]'
                    : minDays <= 30
                    ? 'border-l-4 border-l-[hsl(var(--status-action))] bg-[hsl(var(--status-action))]/[0.03]'
                    : '';

                return (
                  <TableRow
                    key={driver.operator_id}
                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${rowHighlight} ${isSelected ? 'bg-primary/[0.04]' : ''}`}
                    onClick={() => onOpenDriver(driver.operator_id)}
                  >
                    {/* Checkbox */}
                    <TableCell className="pr-0" onClick={e => toggleOne(driver.operator_id, e)}>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                          aria-label={`Select ${name}`}
                        />
                      </div>
                    </TableCell>

                    {/* Unit */}
                    <TableCell>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {driver.unit_number ?? <span className="text-muted-foreground text-xs">—</span>}
                      </span>
                    </TableCell>

                    {/* Driver Name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-surface-dark flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-gold">{initials}</span>
                        </div>
                        <span className="font-medium text-sm text-foreground">{name}</span>
                      </div>
                    </TableCell>

                    {/* Phone */}
                    {!dispatchMode && (
                      <TableCell className="hidden sm:table-cell">
                        {driver.phone
                          ? <a href={`tel:${driver.phone}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1" onClick={e => e.stopPropagation()}><Phone className="h-3 w-3" />{driver.phone}</a>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}

                    {/* State */}
                    {!dispatchMode && (
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{driver.home_state ?? '—'}</span>
                      </TableCell>
                    )}

                    {/* Dispatch Status */}
                    <TableCell>
                      <Badge className={`text-xs ${statusCfg.badgeClass}`}>
                        {statusCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Compliance pills */}
                    {!dispatchMode && (
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
                          {expiryPill(driver.cdl_expiration, 'CDL')}
                          {expiryPill(driver.medical_cert_expiration, 'Med Cert')}
                        </div>
                      </TableCell>
                    )}

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {onMessageDriver && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Message driver"
                            onClick={() => onMessageDriver(driver.operator_user_id)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="Open driver profile"
                          onClick={() => onOpenDriver(driver.operator_id)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
