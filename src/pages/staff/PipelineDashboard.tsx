import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Users, AlertTriangle, CheckCircle2, Clock, Filter, X, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Truck, MessageSquare, ShieldAlert, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, parseISO, format } from 'date-fns';

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
  unread_count: number;
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

interface ComplianceAlert {
  operator_id: string;
  operator_name: string;
  doc_type: 'CDL' | 'Medical Cert';
  expiration_date: string;
  days_until: number; // negative = already expired
}

interface PipelineDashboardProps {
  onOpenOperator: (operatorId: string) => void;
  initialDispatchFilter?: DispatchStatus | 'all';
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

export default function PipelineDashboard({ onOpenOperator, initialDispatchFilter }: PipelineDashboardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [complianceExpanded, setComplianceExpanded] = useState(true);
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
  const [dispatchFilter, setDispatchFilter] = useState<'all' | DispatchStatus>(initialDispatchFilter ?? 'all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'critical' | 'warning'>('all');

  // Sync when the parent changes the initial filter (e.g. banner → View Pipeline)
  useEffect(() => {
    if (initialDispatchFilter) setDispatchFilter(initialDispatchFilter);
  }, [initialDispatchFilter]);

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
    fetchComplianceAlerts();
  }, []);

  // Realtime: refresh unread counts when a new message arrives
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-messages-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        refreshUnreadCounts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        refreshUnreadCounts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime: update dispatch statuses live when a dispatcher changes a status
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-dispatch-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_dispatch' },
        (payload: any) => {
          const { new: newRow, old: oldRow, eventType } = payload;
          if (eventType === 'DELETE') {
            const operatorId = oldRow?.operator_id;
            if (operatorId) {
              setOperators(prev =>
                prev.map(op => op.id === operatorId ? { ...op, dispatch_status: null } : op)
              );
            }
          } else {
            const operatorId = newRow?.operator_id;
            const status = newRow?.dispatch_status as DispatchStatus | null;
            if (operatorId) {
              setOperators(prev =>
                prev.map(op => op.id === operatorId ? { ...op, dispatch_status: status } : op)
              );
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const refreshUnreadCounts = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', user.id)
      .is('read_at', null);
    if (!data) return;
    const map: Record<string, number> = {};
    (data as any[]).forEach((m: any) => {
      map[m.sender_id] = (map[m.sender_id] ?? 0) + 1;
    });
    setOperators(prev => prev.map(op => ({ ...op, unread_count: map[op.user_id] ?? 0 })));
  };

  const fetchComplianceAlerts = async () => {
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 90);

    // Fetch operators with their linked application data
    const { data: ops } = await supabase
      .from('operators')
      .select(`
        id,
        application_id,
        applications (
          first_name,
          last_name,
          cdl_expiration,
          medical_cert_expiration
        )
      `)
      .not('application_id', 'is', null);

    if (!ops) return;

    const alerts: ComplianceAlert[] = [];
    const todayStr = today.toISOString().split('T')[0];

    (ops as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const name = `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Unknown Operator';

      (['cdl_expiration', 'medical_cert_expiration'] as const).forEach(field => {
        const dateStr: string | null = app[field];
        if (!dateStr) return;
        const expDate = parseISO(dateStr);
        const days = differenceInDays(expDate, today);
        if (days <= 90) {
          alerts.push({
            operator_id: op.id,
            operator_name: name,
            doc_type: field === 'cdl_expiration' ? 'CDL' : 'Medical Cert',
            expiration_date: dateStr,
            days_until: days,
          });
        }
      });
    });

  // Sort by urgency: most urgent (smallest days_until, including negatives) first
    alerts.sort((a, b) => a.days_until - b.days_until);
    setComplianceAlerts(alerts);
  };

  // Build a lookup: operator_id → worst ComplianceAlert for that operator
  const complianceByOperator: Record<string, ComplianceAlert> = {};
  complianceAlerts.forEach(alert => {
    const existing = complianceByOperator[alert.operator_id];
    if (!existing || alert.days_until < existing.days_until) {
      complianceByOperator[alert.operator_id] = alert;
    }
  });

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

    const [profileResult, dispatchResult, docResult, unreadResult] = await Promise.all([
      allUserIds.length > 0
        ? supabase.from('profiles').select('user_id, first_name, last_name, phone, home_state').in('user_id', allUserIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length > 0
        ? supabase.from('active_dispatch').select('operator_id, dispatch_status').in('operator_id', operatorIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length > 0
        ? supabase.from('operator_documents').select('operator_id').in('operator_id', operatorIds)
        : Promise.resolve({ data: [] }),
      // Fetch all unread messages sent to the current staff user from operator user IDs
      user?.id && operatorUserIds.length > 0
        ? supabase
            .from('messages')
            .select('sender_id')
            .eq('recipient_id', user.id)
            .in('sender_id', operatorUserIds)
            .is('read_at', null)
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

    // Build unread count map keyed by operator user_id
    const unreadMap: Record<string, number> = {};
    ((unreadResult.data as any[]) ?? []).forEach((m: any) => {
      unreadMap[m.sender_id] = (unreadMap[m.sender_id] ?? 0) + 1;
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
        unread_count: unreadMap[op.user_id] ?? 0,
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
      const worstAlert = complianceByOperator[op.id];
      const matchCompliance = complianceFilter === 'all' ||
        (complianceFilter === 'critical' && worstAlert != null && worstAlert.days_until <= 30) ||
        (complianceFilter === 'warning' && worstAlert != null && worstAlert.days_until > 30 && worstAlert.days_until <= 90);
      return matchSearch && matchStage && matchStatus && matchCoordinator && matchDispatch && matchProgress && matchCompliance;
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
    progressFilter !== 'all',
    complianceFilter !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStageFilter('all');
    setStatusFilter('all');
    setCoordinatorFilter('all');
    setDispatchFilter('all');
    setProgressFilter('all');
    setComplianceFilter('all');
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
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Onboarding Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all operators through the onboarding process</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
        <div className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-gold" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{operators.length}</p>
              <p className="text-xs text-muted-foreground">Total in Pipeline</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-status-complete/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-status-complete" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{operators.filter(o => o.fully_onboarded).length}</p>
              <p className="text-xs text-muted-foreground">Fully Onboarded</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-status-progress/10 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-status-progress" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{operators.filter(o => !o.fully_onboarded).length}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{alertCount}</p>
              <p className="text-xs text-muted-foreground">Alerts / Denied</p>
            </div>
          </div>
        </div>
        {/* Truck Down card — clickable to toggle the dispatch filter */}
        {(() => {
          const truckDownCount = operators.filter(o => o.dispatch_status === 'truck_down').length;
          const isActive = dispatchFilter === 'truck_down';
          return (
            <button
              onClick={() => setDispatchFilter(isActive ? 'all' : 'truck_down')}
              className={`rounded-xl p-3 sm:p-4 shadow-sm border text-left transition-all ${
                isActive
                  ? 'bg-destructive border-destructive ring-2 ring-destructive/30'
                  : truckDownCount > 0
                    ? 'bg-destructive/5 border-destructive/40 hover:bg-destructive/10 hover:border-destructive/60'
                    : 'bg-white border-border hover:border-foreground/20'
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-destructive-foreground/20' : 'bg-destructive/10'
                }`}>
                  <Truck className={`h-4 w-4 sm:h-5 sm:w-5 ${isActive ? 'text-destructive-foreground' : 'text-destructive'}`} />
                </div>
                <div>
                  <p className={`text-xl sm:text-2xl font-bold ${isActive ? 'text-destructive-foreground' : truckDownCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {truckDownCount}
                  </p>
                  <p className={`text-xs ${isActive ? 'text-destructive-foreground/80' : 'text-muted-foreground'}`}>
                    Truck Down
                  </p>
                </div>
              </div>
            </button>
          );
        })()}
      </div>

      {/* Compliance Alerts Panel */}
      {complianceAlerts.length > 0 && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setComplianceExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-destructive/10 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-4 w-4 text-destructive" />
              </div>
              <span className="font-semibold text-sm text-destructive">Compliance Alerts</span>
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                {complianceAlerts.length}
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {complianceAlerts.filter(a => a.days_until < 0).length > 0
                  ? `${complianceAlerts.filter(a => a.days_until < 0).length} expired · `
                  : ''}
                CDL or medical cert expiring within 90 days
              </span>
            </div>
            {complianceExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            }
          </button>

          {/* Alert rows */}
          {complianceExpanded && (
            <div className="border-t border-destructive/20 divide-y divide-destructive/10">
              {complianceAlerts.map((alert, i) => {
                const expired = alert.days_until < 0;
                const critical = !expired && alert.days_until <= 30;
                const warning = !expired && !critical;

                return (
                  <div key={`${alert.operator_id}-${alert.doc_type}`}
                    className="flex items-center gap-3 px-4 py-2.5 bg-background/60 hover:bg-background/80 transition-colors"
                  >
                    {/* Urgency dot */}
                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                      expired ? 'bg-destructive animate-pulse' :
                      critical ? 'bg-destructive' :
                      'bg-yellow-500'
                    }`} />

                    {/* Name + doc type */}
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-sm text-foreground truncate">{alert.operator_name}</span>
                      <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded font-medium border ${
                        alert.doc_type === 'CDL'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}>
                        {alert.doc_type}
                      </span>
                    </div>

                    {/* Expiry date */}
                    <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                      {format(parseISO(alert.expiration_date), 'MMM d, yyyy')}
                    </span>

                    {/* Badge */}
                    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${
                      expired
                        ? 'bg-destructive/10 text-destructive border-destructive/30'
                        : critical
                        ? 'bg-destructive/10 text-destructive border-destructive/30'
                        : 'bg-yellow-50 text-yellow-700 border-yellow-300'
                    }`}>
                      {expired
                        ? `Expired ${Math.abs(alert.days_until)}d ago`
                        : alert.days_until === 0
                        ? 'Expires today'
                        : `${alert.days_until}d left`}
                    </span>

                    {/* Open button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenOperator(alert.operator_id)}
                      className="text-xs text-gold hover:text-gold-light hover:bg-gold/10 shrink-0 h-7 px-2"
                    >
                      Open →
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stage breakdown (clickable) */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <p className="text-sm font-semibold text-foreground">Pipeline by Stage</p>
          {/* Dispatch + Compliance quick-filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {((['truck_down', 'dispatched', 'home', 'not_dispatched'] as DispatchStatus[]).map(status => {
              const badge = DISPATCH_BADGE[status];
              const count = operators.filter(op =>
                op.dispatch_status === status || (status === 'not_dispatched' && op.dispatch_status === null)
              ).length;
              if (count === 0 && status !== 'truck_down') return null;
              const isActive = dispatchFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setDispatchFilter(isActive ? 'all' : status)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    isActive
                      ? status === 'truck_down'
                        ? 'bg-destructive text-destructive-foreground border-destructive'
                        : 'bg-foreground text-background border-foreground'
                      : status === 'truck_down' && count > 0
                        ? 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
                        : 'bg-muted text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive && status !== 'truck_down' ? 'bg-background' : badge.dot}`} />
                  {badge.label}
                  <span className={`font-bold ${isActive && status !== 'truck_down' ? 'text-background' : ''}`}>{count}</span>
                </button>
              );
            }))}
            {/* Compliance filter chips */}
            {(() => {
              const criticalCount = operators.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until <= 30;
              }).length;
              const warningCount = operators.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until > 30 && a.days_until <= 90;
              }).length;
              return (
                <>
                  {(criticalCount > 0 || complianceFilter === 'critical') && (
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'critical' ? 'all' : 'critical')}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        complianceFilter === 'critical'
                          ? 'bg-destructive text-destructive-foreground border-destructive'
                          : 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
                      }`}
                    >
                      <ShieldAlert className={`h-3 w-3 ${complianceFilter === 'critical' ? 'text-destructive-foreground' : 'text-destructive'}`} />
                      Critical Expiry
                      <span className="font-bold">{criticalCount}</span>
                    </button>
                  )}
                  {(warningCount > 0 || complianceFilter === 'warning') && (
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'warning' ? 'all' : 'warning')}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        complianceFilter === 'warning'
                          ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100'
                      }`}
                    >
                      <ShieldAlert className={`h-3 w-3 ${complianceFilter === 'warning' ? 'text-white' : 'text-yellow-600'}`} />
                      Expiry Warning
                      <span className="font-bold">{warningCount}</span>
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
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
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
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

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(v => !v)}
              className={`gap-2 ${showFilters || activeFilterCount > 0 ? 'border-gold text-gold bg-gold/5' : ''}`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="h-4 w-4 rounded-full bg-gold text-[10px] font-bold text-white flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {(activeFilterCount > 0 || search) && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground gap-1">
                <X className="h-3 w-3" />
                <span className="hidden sm:inline">Clear all</span>
              </Button>
            )}
          </div>

          <p className="text-xs sm:text-sm text-muted-foreground w-full sm:w-auto sm:ml-auto">
            {filtered.length} of {operators.length} operators
          </p>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-fade-in">
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

            {/* Progress filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</label>
              <Select value={progressFilter} onValueChange={v => setProgressFilter(v as typeof progressFilter)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All progress" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All progress</SelectItem>
                  <SelectItem value="low">0–33% — Early stage</SelectItem>
                  <SelectItem value="mid">34–66% — Midway</SelectItem>
                  <SelectItem value="high">67–100% — Near complete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Compliance filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compliance</label>
              <Select value={complianceFilter} onValueChange={v => setComplianceFilter(v as typeof complianceFilter)}>
                <SelectTrigger className={`h-9 bg-white ${complianceFilter !== 'all' ? 'border-destructive text-destructive' : ''}`}>
                  <SelectValue placeholder="All compliance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All compliance</SelectItem>
                  <SelectItem value="critical">🔴 Critical — ≤30 days</SelectItem>
                  <SelectItem value="warning">🟡 Warning — 31–90 days</SelectItem>
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
          {progressFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {progressFilter === 'low' ? '0–33%' : progressFilter === 'mid' ? '34–66%' : '67–100%'}
              <button onClick={() => setProgressFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {complianceFilter !== 'all' && (
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${
              complianceFilter === 'critical'
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-yellow-50 text-yellow-700 border-yellow-300'
            }`}>
              <ShieldAlert className="h-3 w-3" />
              {complianceFilter === 'critical' ? 'Critical Expiry' : 'Expiry Warning'}
              <button onClick={() => setComplianceFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
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
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Msgs
                  </span>
                </th>
                <th className="px-4 py-3 text-center" title="Compliance">
                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                </th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={11} className="text-center py-12 text-muted-foreground">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-muted-foreground">
                    {operators.length === 0 ? 'No operators in the pipeline yet.' : 'No operators match your filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map(op => (
                  <tr key={op.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">
                          {op.first_name || op.last_name ? `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() : '—'}
                        </p>
                        {op.unread_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold leading-none shrink-0 md:hidden">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {op.unread_count}
                          </span>
                        )}
                      </div>
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
                    <td className="px-4 py-3 hidden md:table-cell">
                      {op.unread_count > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 text-[11px] font-semibold">
                          <MessageSquare className="h-3 w-3" />
                          {op.unread_count}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    {/* Compliance icon cell */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const alert = complianceByOperator[op.id];
                        if (!alert) {
                          return <ShieldCheck className="h-4 w-4 text-muted-foreground/25 mx-auto" />;
                        }
                        const expired = alert.days_until < 0;
                        const critical = !expired && alert.days_until <= 30;
                        const tooltipText = expired
                          ? `${alert.doc_type} expired ${Math.abs(alert.days_until)}d ago`
                          : alert.days_until === 0
                          ? `${alert.doc_type} expires today`
                          : `${alert.doc_type} expires in ${alert.days_until}d`;
                        return (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => onOpenOperator(op.id)}
                                  className="mx-auto block focus:outline-none"
                                  aria-label={tooltipText}
                                >
                                  <ShieldAlert
                                    className={`h-4 w-4 ${
                                      expired || critical
                                        ? 'text-destructive animate-pulse'
                                        : 'text-warning'
                                    }`}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs font-medium">
                                {tooltipText}
                                {alert.days_until >= 0 && (
                                  <span className="ml-1 text-muted-foreground">
                                    — exp. {format(parseISO(alert.expiration_date), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
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
            {!loading && filtered.length > 0 && (() => {
              const filteredCritical = filtered.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until <= 30;
              }).length;
              const filteredWarning = filtered.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until > 30 && a.days_until <= 90;
              }).length;
              const filteredClean = filtered.length - filteredCritical - filteredWarning;
              return (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={11} className="px-4 py-2.5">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Compliance summary — {filtered.length} visible
                        </span>
                        <div className="flex items-center gap-3 flex-wrap">
                          {filteredCritical > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              {filteredCritical} critical
                            </span>
                          )}
                          {filteredWarning > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-600">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              {filteredWarning} warning
                            </span>
                          )}
                          {filteredClean > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {filteredClean} compliant
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
}
