import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Users, AlertTriangle, CheckCircle2, Clock, Filter, X, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DispatchStatus = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

const DISPATCH_BADGE: Record<DispatchStatus, { label: string; className: string; dot: string }> = {
  not_dispatched: { label: 'Not Dispatched', className: 'bg-muted text-muted-foreground border-border',          dot: 'bg-muted-foreground' },
  dispatched:     { label: 'Dispatched',     className: 'bg-status-complete/10 text-status-complete border-status-complete/30', dot: 'bg-status-complete' },
  home:           { label: 'Home',           className: 'bg-status-progress/10 text-status-progress border-status-progress/30', dot: 'bg-status-progress' },
  truck_down:     { label: 'Truck Down',     className: 'bg-destructive/10 text-destructive border-destructive/30',             dot: 'bg-destructive' },
};

interface OperatorRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  current_stage: string;
  fully_onboarded: boolean;
  mvr_ch_approval: string;
  pe_screening_result: string;
  ica_status: string;
  insurance_added_date: string | null;
  dispatch_status: DispatchStatus | null;
  doc_count: number;
  // Progress fields
  form_2290: string;
  truck_title: string;
  truck_photos: string;
  truck_inspection: string;
  mo_reg_received: string;
  decal_applied: string;
  eld_installed: string;
  fuel_card_issued: string;
  progress_pct: number;
}

interface StaffOption {
  user_id: string;
  full_name: string;
}

interface PipelineDashboardProps {
  onOpenOperator: (operatorId: string) => void;
}

function computeProgress(os: Record<string, string | boolean | null>): number {
  let done = 0;
  if (os.mvr_ch_approval === 'approved') done++;
  if (os.form_2290 === 'received' && os.truck_title === 'received' && os.truck_photos === 'received' && os.truck_inspection === 'received') done++;
  if (os.ica_status === 'complete') done++;
  if (os.mo_reg_received === 'yes') done++;
  if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') done++;
  if (os.insurance_added_date) done++;
  return Math.round((done / 6) * 100);
}

function computeStage(os: Record<string, string | boolean | null>): string {
  if (os.insurance_added_date) return 'Stage 6 — Insurance';
  if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') return 'Stage 5 — Equipment';
  if (os.ica_status === 'complete') return 'Stage 4 — MO Registration';
  if (os.pe_screening_result === 'clear') return 'Stage 3 — ICA';
  if (os.mvr_ch_approval === 'approved') return 'Stage 2 — Documents';
  return 'Stage 1 — Background';
}

const STAGES = [
  'Stage 1 — Background',
  'Stage 2 — Documents',
  'Stage 3 — ICA',
  'Stage 4 — MO Registration',
  'Stage 5 — Equipment',
  'Stage 6 — Insurance',
];

export default function PipelineDashboard({ onOpenOperator }: PipelineDashboardProps) {
  const { toast } = useToast();
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which operator rows are currently saving a coordinator assignment
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState('all');
  const [dispatchFilter, setDispatchFilter] = useState<'all' | DispatchStatus>('all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');

  // Sort state
  type SortKey = 'name' | 'stage' | 'coordinator' | 'progress';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    setLoading(true);

    const [{ data: opData }, { data: staffRoles }] = await Promise.all([
      supabase.from('operators').select(`
        id,
        user_id,
        assigned_onboarding_staff,
        onboarding_status (
          mvr_ch_approval,
          pe_screening_result,
          ica_status,
          decal_applied,
          eld_installed,
          fuel_card_issued,
          insurance_added_date,
          fully_onboarded,
          form_2290,
          truck_title,
          truck_photos,
          truck_inspection,
          mo_reg_received
        )
      `),
      supabase.from('user_roles').select('user_id').in('role', ['onboarding_staff', 'management']),
    ]);

    if (!opData) { setLoading(false); return; }

    const allStaffUserIds = (staffRoles ?? []).map((r: any) => r.user_id);

    // Fetch dispatch statuses for all operators in parallel with profiles
    const operatorIds = opData.map((o: any) => o.id).filter(Boolean);
    const operatorUserIds = opData.map((o: any) => o.user_id).filter(Boolean);
    const assignedStaffIds = opData.map((o: any) => o.assigned_onboarding_staff).filter(Boolean);
    const allUserIds = [...new Set([...operatorUserIds, ...assignedStaffIds, ...allStaffUserIds])];

    const [profileResult, dispatchResult, docResult] = await Promise.all([
      allUserIds.length > 0
        ? supabase.from('profiles').select('user_id, first_name, last_name, phone, home_state').in('user_id', allUserIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length > 0
        ? supabase.from('active_dispatch').select('operator_id, dispatch_status').in('operator_id', operatorIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length > 0
        ? supabase.from('operator_documents').select('operator_id').in('operator_id', operatorIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, any> = {};
    ((profileResult.data as any[]) ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });

    const dispatchMap: Record<string, DispatchStatus> = {};
    ((dispatchResult.data as any[]) ?? []).forEach((d: any) => { dispatchMap[d.operator_id] = d.dispatch_status; });

    const docCountMap: Record<string, number> = {};
    ((docResult.data as any[]) ?? []).forEach((d: any) => {
      docCountMap[d.operator_id] = (docCountMap[d.operator_id] ?? 0) + 1;
    });

    // Build staff options
    const staffMap: Record<string, StaffOption> = {};
    allStaffUserIds.forEach((uid: string) => {
      const p = profileMap[uid];
      if (p) {
        staffMap[uid] = {
          user_id: uid,
          full_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || uid,
        };
      }
    });
    setStaffOptions(Object.values(staffMap));

    const rows: OperatorRow[] = opData.map((op: any) => {
      const os = op.onboarding_status?.[0] ?? {};
      const profile = profileMap[op.user_id] ?? {};
      const staffProfile = op.assigned_onboarding_staff ? profileMap[op.assigned_onboarding_staff] : null;
      const staffName = staffProfile
        ? `${staffProfile.first_name ?? ''} ${staffProfile.last_name ?? ''}`.trim() || null
        : null;
      return {
        id: op.id,
        user_id: op.user_id,
        first_name: profile.first_name ?? null,
        last_name: profile.last_name ?? null,
        phone: profile.phone ?? null,
        home_state: profile.home_state ?? null,
        assigned_staff_id: op.assigned_onboarding_staff ?? null,
        assigned_staff_name: staffName,
        current_stage: computeStage(os),
        fully_onboarded: os.fully_onboarded ?? false,
        mvr_ch_approval: os.mvr_ch_approval ?? 'pending',
        pe_screening_result: os.pe_screening_result ?? 'pending',
        ica_status: os.ica_status ?? 'not_issued',
        insurance_added_date: os.insurance_added_date ?? null,
        dispatch_status: dispatchMap[op.id] ?? null,
        doc_count: docCountMap[op.id] ?? 0,
        form_2290: os.form_2290 ?? 'not_started',
        truck_title: os.truck_title ?? 'not_started',
        truck_photos: os.truck_photos ?? 'not_started',
        truck_inspection: os.truck_inspection ?? 'not_started',
        mo_reg_received: os.mo_reg_received ?? 'not_yet',
        decal_applied: os.decal_applied ?? 'no',
        eld_installed: os.eld_installed ?? 'no',
        fuel_card_issued: os.fuel_card_issued ?? 'no',
        progress_pct: computeProgress(os),
      };
    });
    setOperators(rows);
    setLoading(false);
  };

  const getStatus = (op: OperatorRow) => {
    if (op.fully_onboarded) return 'onboarded';
    if (op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear') return 'alert';
    return 'in_progress';
  };

  const handleAssignCoordinator = async (operatorId: string, staffUserId: string | null) => {
    setAssigningMap(prev => ({ ...prev, [operatorId]: true }));

    const { error } = await supabase
      .from('operators')
      .update({ assigned_onboarding_staff: staffUserId })
      .eq('id', operatorId);

    if (error) {
      toast({ title: 'Failed to assign coordinator', description: error.message, variant: 'destructive' });
    } else {
      // Optimistic local update
      const staffOption = staffOptions.find(s => s.user_id === staffUserId) ?? null;
      setOperators(prev => prev.map(op =>
        op.id === operatorId
          ? { ...op, assigned_staff_id: staffUserId, assigned_staff_name: staffOption?.full_name ?? null }
          : op
      ));
      toast({
        title: staffUserId ? 'Coordinator assigned' : 'Coordinator removed',
        description: staffUserId
          ? `Assigned to ${staffOption?.full_name ?? 'coordinator'}`
          : 'Operator is now unassigned',
      });
    }

    setAssigningMap(prev => ({ ...prev, [operatorId]: false }));
  };



  const filtered = operators
    .filter(op => {
      const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.toLowerCase();
      const matchSearch = name.includes(search.toLowerCase()) || (op.phone ?? '').includes(search);
      const matchStage = stageFilter === 'all' || op.current_stage === stageFilter;
      const matchStatus = statusFilter === 'all' || getStatus(op) === statusFilter;
      const matchCoordinator = coordinatorFilter === 'all' ||
        (coordinatorFilter === 'unassigned' ? !op.assigned_staff_id : op.assigned_staff_id === coordinatorFilter);
      const matchDispatch = dispatchFilter === 'all' || op.dispatch_status === dispatchFilter ||
        (dispatchFilter === 'not_dispatched' && op.dispatch_status === null);
      const matchProgress = progressFilter === 'all' ||
        (progressFilter === 'low' && op.progress_pct <= 33) ||
        (progressFilter === 'mid' && op.progress_pct >= 34 && op.progress_pct <= 66) ||
        (progressFilter === 'high' && op.progress_pct >= 67);
      return matchSearch && matchStage && matchStatus && matchCoordinator && matchDispatch && matchProgress;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      if (sortKey === 'progress') {
        const cmp = a.progress_pct - b.progress_pct;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      let av = '';
      let bv = '';
      if (sortKey === 'name') {
        av = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
        bv = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
      } else if (sortKey === 'stage') {
        av = a.current_stage;
        bv = b.current_stage;
      } else if (sortKey === 'coordinator') {
        av = (a.assigned_staff_name ?? '').toLowerCase();
        bv = (b.assigned_staff_name ?? '').toLowerCase();
      }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const activeFilterCount = [
    stageFilter !== 'all',
    statusFilter !== 'all',
    coordinatorFilter !== 'all',
    dispatchFilter !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStageFilter('all');
    setStatusFilter('all');
    setCoordinatorFilter('all');
    setDispatchFilter('all');
    setSearch('');
  };

  const alertCount = operators.filter(op =>
    op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear'
  ).length;

  const stageCounts: Record<string, number> = {};
  operators.forEach(op => {
    stageCounts[op.current_stage] = (stageCounts[op.current_stage] ?? 0) + 1;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Onboarding Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all operators through the onboarding process</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{operators.length}</p>
              <p className="text-xs text-muted-foreground">Total in Pipeline</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-status-complete/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-status-complete" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{operators.filter(o => o.fully_onboarded).length}</p>
              <p className="text-xs text-muted-foreground">Fully Onboarded</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-status-progress/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-status-progress" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{operators.filter(o => !o.fully_onboarded).length}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{alertCount}</p>
              <p className="text-xs text-muted-foreground">Alerts / Denied</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stage breakdown (clickable) */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-3">Pipeline by Stage</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {STAGES.map((stage, i) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
              className={`text-center p-3 rounded-lg border transition-colors ${
                stageFilter === stage
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-border hover:border-gold/40 text-foreground'
              }`}
            >
              <p className="text-xl font-bold">{stageCounts[stage] ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Stage {i + 1}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter toolbar */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(v => !v)}
            className={`gap-2 ${showFilters || activeFilterCount > 0 ? 'border-gold text-gold bg-gold/5' : ''}`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 h-4 w-4 rounded-full bg-gold text-[10px] font-bold text-white flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {(activeFilterCount > 0 || search) && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground gap-1">
              <X className="h-3 w-3" />
              Clear all
            </Button>
          )}

          <p className="text-sm text-muted-foreground ml-auto">
            {filtered.length} of {operators.length} operators
          </p>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
            {/* Stage filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {STAGES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="onboarded">Fully Onboarded</SelectItem>
                  <SelectItem value="alert">Alert / Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dispatch filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Status</label>
              <Select value={dispatchFilter} onValueChange={v => setDispatchFilter(v as 'all' | DispatchStatus)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All dispatch statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dispatch statuses</SelectItem>
                  <SelectItem value="dispatched">🟢 Dispatched</SelectItem>
                  <SelectItem value="home">🟠 Home</SelectItem>
                  <SelectItem value="truck_down">🔴 Truck Down</SelectItem>
                  <SelectItem value="not_dispatched">⚫ Not Dispatched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Coordinator filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned Coordinator</label>
              <Select value={coordinatorFilter} onValueChange={setCoordinatorFilter}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All coordinators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coordinators</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffOptions.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {stageFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {stageFilter}
              <button onClick={() => setStageFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {statusFilter === 'in_progress' ? 'In Progress' : statusFilter === 'onboarded' ? 'Fully Onboarded' : 'Alert / Denied'}
              <button onClick={() => setStatusFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {coordinatorFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {coordinatorFilter === 'unassigned'
                ? 'Unassigned'
                : staffOptions.find(s => s.user_id === coordinatorFilter)?.full_name ?? coordinatorFilter}
              <button onClick={() => setCoordinatorFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {dispatchFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {DISPATCH_BADGE[dispatchFilter as DispatchStatus]?.label ?? dispatchFilter}
              <button onClick={() => setDispatchFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Operator table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  <button
                    onClick={() => handleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                  >
                    Name
                    {sortKey === 'name'
                      ? sortDir === 'asc'
                        ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                        : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                      : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">State</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  <button
                    onClick={() => handleSort('stage')}
                    className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                  >
                    Current Stage
                    {sortKey === 'stage'
                      ? sortDir === 'asc'
                        ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                        : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                      : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">
                  <button
                    onClick={() => handleSort('progress')}
                    className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                  >
                    Progress
                    {sortKey === 'progress'
                      ? sortDir === 'asc'
                        ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                        : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                      : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">Docs</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">Dispatch</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden xl:table-cell">
                  <button
                    onClick={() => handleSort('coordinator')}
                    className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                  >
                    Coordinator
                    {sortKey === 'coordinator'
                      ? sortDir === 'asc'
                        ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                        : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                      : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                  </button>
                </th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    {operators.length === 0 ? 'No operators in the pipeline yet.' : 'No operators match your filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map(op => (
                  <tr key={op.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {op.first_name || op.last_name ? `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() : '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{op.phone ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{op.home_state ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 min-w-[140px]">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-xs border-gold/40 text-gold bg-gold/5 truncate max-w-[120px]">
                            {op.current_stage}
                          </Badge>
                          <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                            op.progress_pct === 100 ? 'text-status-complete' : 'text-muted-foreground'
                          }`}>
                            {op.progress_pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${op.progress_pct}%`,
                              background: op.progress_pct === 100
                                ? 'hsl(var(--status-complete))'
                                : 'hsl(var(--gold-main))',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {op.fully_onboarded ? (
                        <Badge className="status-complete border text-xs">Onboarded</Badge>
                      ) : op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear' ? (
                        <Badge className="status-action border text-xs">Alert</Badge>
                      ) : (
                        <Badge className="status-progress border text-xs">In Progress</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${op.progress_pct}%`,
                              background: op.progress_pct === 100
                                ? 'hsl(var(--status-complete))'
                                : 'hsl(var(--gold-main))',
                            }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                          op.progress_pct === 100 ? 'text-status-complete' : 'text-muted-foreground'
                        }`}>
                          {op.progress_pct}%
                        </span>
                      </div>
                    </td>
                    {/* Dispatch status badge — only shown for fully onboarded operators */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {op.dispatch_status ? (() => {
                        const cfg = DISPATCH_BADGE[op.dispatch_status];
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })() : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex items-center gap-1.5 min-w-[160px]">
                        {assigningMap[op.id] && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                        )}
                        <Select
                          value={op.assigned_staff_id ?? 'unassigned'}
                          onValueChange={val => handleAssignCoordinator(op.id, val === 'unassigned' ? null : val)}
                          disabled={assigningMap[op.id]}
                        >
                          <SelectTrigger className="h-7 text-xs border-dashed hover:border-solid hover:border-gold/60 focus:ring-0 focus:border-gold/60 transition-colors bg-transparent">
                            <SelectValue>
                              {op.assigned_staff_name
                                ? <span className="text-foreground">{op.assigned_staff_name}</span>
                                : <span className="italic text-muted-foreground/60">Unassigned</span>
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              <span className="italic text-muted-foreground">Unassigned</span>
                            </SelectItem>
                            {staffOptions.map(s => (
                              <SelectItem key={s.user_id} value={s.user_id}>
                                {s.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenOperator(op.id)}
                        className="text-gold hover:text-gold-light hover:bg-gold/10 text-xs"
                      >
                        Open →
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
