import { useState, useEffect, useRef, useCallback } from 'react';
import { reminderErrorToast } from '@/lib/reminderError';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Users, AlertTriangle, CheckCircle2, Clock, Filter, X, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Truck, MessageSquare, ShieldAlert, ChevronDown, ChevronUp, ShieldCheck, Send, CheckCheck, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, parseISO, format, formatDistanceToNowStrict } from 'date-fns';

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
  onboarding_updated_at: string | null;
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
  onOpenOperatorWithFocus?: (operatorId: string, focusField: 'cdl' | 'medcert') => void;
  initialDispatchFilter?: DispatchStatus | 'all';
  initialCoordinatorFilter?: string;
  initialCoordinatorName?: string;
  initialStageFilter?: string;
  initialIdleFilter?: boolean;
  complianceRefreshKey?: number;
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

export default function PipelineDashboard({ onOpenOperator, onOpenOperatorWithFocus, initialDispatchFilter, initialCoordinatorFilter, initialCoordinatorName, initialStageFilter, initialIdleFilter, complianceRefreshKey }: PipelineDashboardProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [complianceSort, setComplianceSort] = useState<'urgency' | 'last_action_asc' | 'last_action_desc'>('urgency');
  const [complianceExpanded, setComplianceExpanded] = useState(true);
  const [complianceNoActionOnly, setComplianceNoActionOnly] = useState(false);
  const [complianceDocFilter, setComplianceDocFilter] = useState<'all' | 'CDL' | 'Medical Cert'>('all');
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which operator rows are currently saving a coordinator assignment
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);
  // Track reminder send state per alert key (operatorId|docType)
  const [reminderSending, setReminderSending] = useState<Record<string, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  // Last reminded timestamps: key = "operatorId|docType" → ISO string
  const [lastReminded, setLastReminded] = useState<Record<string, string>>({});
  // Last reminded coordinator names: key = "operatorId|docType" → staff name
  const [lastRemindedBy, setLastRemindedBy] = useState<Record<string, string>>({});
  // Last reminded email outcome: key = "operatorId|docType" → { sent: bool, error?: string }
  const [lastReminderOutcome, setLastReminderOutcome] = useState<Record<string, { sent: boolean; error?: string }>>({});
  // Last renewed timestamps: key = "operatorId|docType" → ISO string
  const [lastRenewed, setLastRenewed] = useState<Record<string, string>>({});
  // Last renewed coordinator names: key = "operatorId|docType" → staff name
  const [lastRenewedBy, setLastRenewedBy] = useState<Record<string, string>>({});
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkSentCount, setBulkSentCount] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkRenewing, setBulkRenewing] = useState(false);
  const [bulkRenewedCount, setBulkRenewedCount] = useState<number | null>(null);
  const [showBulkRenewConfirm, setShowBulkRenewConfirm] = useState(false);
  const [noActionBulkSending, setNoActionBulkSending] = useState(false);
  const [noActionBulkSentCount, setNoActionBulkSentCount] = useState<number | null>(null);
  const [showNoActionBulkConfirm, setShowNoActionBulkConfirm] = useState(false);
  // Per-row renew state: key = "operatorId|docType"
  const [rowRenewing, setRowRenewing] = useState<Record<string, boolean>>({});
  const [rowRenewed, setRowRenewed] = useState<Record<string, boolean>>({});


  // Filter state
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(initialStageFilter ?? 'all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState(initialCoordinatorFilter ?? 'all');
  const [dispatchFilter, setDispatchFilter] = useState<'all' | DispatchStatus>(initialDispatchFilter ?? 'all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [idleFilter, setIdleFilter] = useState(initialIdleFilter ?? false);

  // Sync when the parent changes the initial filter (e.g. banner → View Pipeline)
  useEffect(() => {
    if (initialDispatchFilter) setDispatchFilter(initialDispatchFilter);
  }, [initialDispatchFilter]);

  useEffect(() => {
    if (initialCoordinatorFilter) setCoordinatorFilter(initialCoordinatorFilter);
  }, [initialCoordinatorFilter]);

  const [legendStageFilter, setLegendStageFilter] = useState<string | null>(initialStageFilter && initialStageFilter !== 'all' ? initialStageFilter : null);
  const [legendCoordinatorFilter, setLegendCoordinatorFilter] = useState<{ id: string; name: string } | null>(
    initialCoordinatorFilter && initialCoordinatorFilter !== 'all' && initialCoordinatorName
      ? { id: initialCoordinatorFilter, name: initialCoordinatorName }
      : null
  );

  useEffect(() => {
    const next = initialStageFilter ?? 'all';
    setStageFilter(next);
    setLegendStageFilter(next !== 'all' ? next : null);
  }, [initialStageFilter]);

  useEffect(() => {
    setIdleFilter(initialIdleFilter ?? false);
  }, [initialIdleFilter]);

  useEffect(() => {
    const next = initialCoordinatorFilter ?? 'all';
    setCoordinatorFilter(next);
    setLegendCoordinatorFilter(
      next !== 'all' && initialCoordinatorName
        ? { id: next, name: initialCoordinatorName }
        : null
    );
  }, [initialCoordinatorFilter, initialCoordinatorName]);

  // Sort state
  type SortKey = 'name' | 'stage' | 'coordinator' | 'progress' | 'last_activity';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // Track whether the current sort was auto-applied by the idle filter
  const idleAutoSorted = useRef(false);

  // Auto-sort by last activity (oldest first) when idle filter activates
  useEffect(() => {
    if (idleFilter) {
      setSortKey('last_activity');
      setSortDir('asc');
      idleAutoSorted.current = true;
    } else if (idleAutoSorted.current) {
      setSortKey(null);
      setSortDir('asc');
      idleAutoSorted.current = false;
    }
  }, [idleFilter]);

  const handleSort = (key: SortKey) => {
    idleAutoSorted.current = false; // manual sort overrides auto
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const fetchComplianceAlerts = useCallback(async () => {
    const today = new Date();

    const [{ data: ops }, { data: reminders }, { data: renewals }] = await Promise.all([
      supabase
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
        .not('application_id', 'is', null),
      supabase
        .from('cert_reminders')
        .select('operator_id, doc_type, sent_at, sent_by_name, email_sent, email_error')
        .order('sent_at', { ascending: false }),
      supabase
        .from('audit_log' as any)
        .select('entity_id, actor_name, created_at, metadata')
        .eq('action', 'cert_renewed')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (!ops) return;

    // Keep only the most recent reminder per operator+doc_type pair
    const remindedMap: Record<string, string> = {};
    const remindedByMap: Record<string, string> = {};
    const reminderOutcomeMap: Record<string, { sent: boolean; error?: string }> = {};
    (reminders ?? []).forEach((r: any) => {
      const key = `${r.operator_id}|${r.doc_type}`;
      if (!remindedMap[key]) {
        remindedMap[key] = r.sent_at; // first = most recent due to DESC order
        if (r.sent_by_name) remindedByMap[key] = r.sent_by_name;
        reminderOutcomeMap[key] = { sent: r.email_sent ?? true, error: r.email_error ?? undefined };
      }
    });
    setLastReminded(remindedMap);
    setLastRemindedBy(remindedByMap);
    setLastReminderOutcome(reminderOutcomeMap);

    // Keep only the most recent renewal per operator+doc_type pair
    const renewedMap: Record<string, string> = {};
    const renewedByMap: Record<string, string> = {};
    (renewals ?? []).forEach((r: any) => {
      const docType = r.metadata?.document_type as string | undefined;
      if (!r.entity_id || !docType) return;
      // Map "CDL" → "CDL", "Medical Cert" → "Medical Cert" (matches alert.doc_type)
      const key = `${r.entity_id}|${docType}`;
      if (!renewedMap[key]) {
        renewedMap[key] = r.created_at;
        if (r.actor_name) renewedByMap[key] = r.actor_name;
      }
    });
    setLastRenewed(renewedMap);
    setLastRenewedBy(renewedByMap);

    const alerts: ComplianceAlert[] = [];

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

    // Sort: urgency tier first (expired → critical ≤30d → warning 31-90d),
    // then never-renewed floats to top within each tier, then by days_until ascending
    const urgencyTier = (days: number) => days < 0 ? 0 : days <= 30 ? 1 : 2;
    alerts.sort((a, b) => {
      const tierDiff = urgencyTier(a.days_until) - urgencyTier(b.days_until);
      if (tierDiff !== 0) return tierDiff;
      const aRenewed = !!renewedMap[`${a.operator_id}|${a.doc_type}`];
      const bRenewed = !!renewedMap[`${b.operator_id}|${b.doc_type}`];
      if (aRenewed !== bRenewed) return aRenewed ? 1 : -1;
      return a.days_until - b.days_until;
    });
    setComplianceAlerts(alerts);
    setComplianceNoActionOnly(false);
    setComplianceSort('urgency');
    setNoActionBulkSentCount(null);
  }, []);

  useEffect(() => {
    fetchOperators();
    fetchComplianceAlerts();
  }, [fetchComplianceAlerts]);

  // Re-fetch compliance alerts when parent signals an expiry date was updated
  useEffect(() => {
    if (complianceRefreshKey === undefined || complianceRefreshKey === 0) return;
    fetchComplianceAlerts();
  }, [complianceRefreshKey, fetchComplianceAlerts]);

  // Realtime: re-fetch compliance alerts whenever an application's expiry dates change
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-applications-expiry-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'applications' },
        (payload: any) => {
          const { new: n, old: o } = payload;
          if (
            n?.cdl_expiration !== o?.cdl_expiration ||
            n?.medical_cert_expiration !== o?.medical_cert_expiration
          ) {
            fetchComplianceAlerts();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchComplianceAlerts]);

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
          mo_reg_received,
          updated_at
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
      const osRaw = op.onboarding_status;
      const os = Array.isArray(osRaw) ? (osRaw[0] ?? {}) : (osRaw ?? {});
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
        onboarding_updated_at: os.updated_at ?? null,
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

  const handleSendReminder = async (alert: ComplianceAlert) => {
    const key = `${alert.operator_id}|${alert.doc_type}`;
    setReminderSending(prev => ({ ...prev, [key]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          operator_id: alert.operator_id,
          doc_type: alert.doc_type,
          days_until: alert.days_until,
          expiration_date: alert.expiration_date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder');
      // Always update the timestamp — record was saved regardless of email outcome
      const now = new Date().toISOString();
      const senderName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
      setLastReminded(prev => ({ ...prev, [key]: now }));
      if (senderName) setLastRemindedBy(prev => ({ ...prev, [key]: senderName }));
      if (data.email_error) {
        // Email failed — record was still saved; show error state in tooltip
        setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
        setReminderSent(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
        const { title, description } = reminderErrorToast(new Error(data.email_error));
        toast({ title, description, variant: 'destructive' });
      } else {
        setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
        setReminderSent(prev => ({ ...prev, [key]: true }));
        toast({ title: 'Reminder sent', description: `Email sent to ${alert.operator_name}` });
        // Reset "sent" button badge after 8 seconds
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      }
    } catch (err: any) {
      const { title, description } = reminderErrorToast(err);
      toast({ title, description, variant: 'destructive' });
    } finally {
      setReminderSending(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSendAllCritical = async () => {
    const criticalAlerts = complianceAlerts.filter(a => a.days_until <= 30);
    if (criticalAlerts.length === 0) return;
    setBulkSending(true);
    setBulkSentCount(null);

    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    let successCount = 0;
    let failCount = 0;

    await Promise.all(
      criticalAlerts.map(async (alert) => {
        const key = `${alert.operator_id}|${alert.doc_type}`;
        // Skip already-sending or already-sent items
        if (reminderSending[key] || reminderSent[key]) { successCount++; return; }
        setReminderSending(prev => ({ ...prev, [key]: true }));
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token ?? ''}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              operator_id: alert.operator_id,
              doc_type: alert.doc_type,
              days_until: alert.days_until,
              expiration_date: alert.expiration_date,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Failed');
          const now = new Date().toISOString();
          setLastReminded(prev => ({ ...prev, [key]: now }));
          if (data.email_error) {
            setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
            failCount++;
          } else {
            setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
            successCount++;
          }
          setReminderSent(prev => ({ ...prev, [key]: true }));
          setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
        } catch {
          failCount++;
        } finally {
          setReminderSending(prev => ({ ...prev, [key]: false }));
        }
      })
    );

    setBulkSending(false);
    setBulkSentCount(successCount);
    if (failCount === 0) {
      toast({
        title: `${successCount} reminder${successCount !== 1 ? 's' : ''} sent`,
        description: `All critical operators have been notified.`,
      });
    } else {
      toast({
        title: `${successCount} sent, ${failCount} failed`,
        description: 'Some reminders could not be sent — check that the mysupertransport.com domain is verified at resend.com/domains.',
        variant: 'destructive',
      });
    }
    // Reset bulk sent indicator after 10 seconds
    setTimeout(() => setBulkSentCount(null), 10000);
  };

  // Bulk Send All — No Action rows only (no prior reminder AND no renewal)
  const handleSendAllNoAction = async () => {
    const noActionAlerts = complianceAlerts.filter(a => {
      const key = `${a.operator_id}|${a.doc_type}`;
      return !lastReminded[key] && !lastRenewed[key];
    });
    if (noActionAlerts.length === 0) return;
    setNoActionBulkSending(true);
    setNoActionBulkSentCount(null);

    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const senderName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;

    let successCount = 0;
    let failCount = 0;

    await Promise.all(
      noActionAlerts.map(async (alert) => {
        const key = `${alert.operator_id}|${alert.doc_type}`;
        if (reminderSending[key] || reminderSent[key]) { successCount++; return; }
        setReminderSending(prev => ({ ...prev, [key]: true }));
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token ?? ''}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              operator_id: alert.operator_id,
              doc_type: alert.doc_type,
              days_until: alert.days_until,
              expiration_date: alert.expiration_date,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Failed');
          const now = new Date().toISOString();
          setLastReminded(prev => ({ ...prev, [key]: now }));
          if (senderName) setLastRemindedBy(prev => ({ ...prev, [key]: senderName }));
          if (data.email_error) {
            setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
            failCount++;
          } else {
            setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
            successCount++;
          }
          setReminderSent(prev => ({ ...prev, [key]: true }));
          setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
        } catch {
          failCount++;
        } finally {
          setReminderSending(prev => ({ ...prev, [key]: false }));
        }
      })
    );

    setNoActionBulkSending(false);
    setNoActionBulkSentCount(successCount);
    if (failCount === 0) {
      toast({
        title: `${successCount} reminder${successCount !== 1 ? 's' : ''} sent`,
        description: 'All uncontacted operators have been notified.',
      });
    } else {
      toast({
        title: `${successCount} sent, ${failCount} failed`,
        description: 'Some reminders could not be sent — check that the mysupertransport.com domain is verified at resend.com/domains.',
        variant: 'destructive',
      });
    }
    setTimeout(() => setNoActionBulkSentCount(null), 10000);
  };

  // Bulk Mark as Renewed — extends all alerted docs by +1 year and writes audit log entries
  const handleBulkMarkRenewed = async () => {
    if (complianceAlerts.length === 0) return;
    setBulkRenewing(true);
    setBulkRenewedCount(null);

    const actorId = user?.id ?? null;
    const actorName = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null
      : null;

    const newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];

    let successCount = 0;
    let failCount = 0;

    const byOperator: Record<string, { operatorId: string; appId?: string; alerts: typeof complianceAlerts }> = {};
    complianceAlerts.forEach(alert => {
      if (!byOperator[alert.operator_id]) {
        byOperator[alert.operator_id] = { operatorId: alert.operator_id, alerts: [] };
      }
      byOperator[alert.operator_id].alerts.push(alert);
    });

    const operatorIds = Object.keys(byOperator);
    const { data: opRows } = await supabase
      .from('operators')
      .select('id, application_id')
      .in('id', operatorIds);
    (opRows ?? []).forEach((o: any) => {
      if (byOperator[o.id]) byOperator[o.id].appId = o.application_id;
    });

    await Promise.all(
      Object.values(byOperator).map(async ({ operatorId, appId, alerts }) => {
        if (!appId) { failCount += alerts.length; return; }
        for (const alert of alerts) {
          const col = alert.doc_type === 'CDL' ? 'cdl_expiration' : 'medical_cert_expiration';
          try {
            const { data: appData } = await supabase
              .from('applications')
              .select(col)
              .eq('id', appId)
              .single();
            const oldDateStr = (appData as any)?.[col] ?? null;
            const { error } = await supabase
              .from('applications')
              .update({ [col]: newDateStr })
              .eq('id', appId);
            if (error) throw error;
            await supabase.from('audit_log' as any).insert({
              actor_id: actorId,
              actor_name: actorName,
              action: 'cert_renewed',
              entity_type: 'operator',
              entity_id: operatorId,
              entity_label: alert.operator_name,
              metadata: {
                document_type: alert.doc_type,
                old_expiry: oldDateStr,
                new_expiry: newDateStr,
                operator_name: alert.operator_name,
                bulk: true,
              },
            });
            successCount++;
          } catch {
            failCount++;
          }
        }
      })
    );

    setBulkRenewing(false);
    setBulkRenewedCount(successCount);
    if (failCount === 0) {
      toast({
        title: `${successCount} document${successCount !== 1 ? 's' : ''} marked as renewed`,
        description: `Expiry dates extended to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.`,
      });
    } else {
      toast({
        title: `${successCount} renewed, ${failCount} failed`,
        description: 'Some documents could not be updated.',
        variant: 'destructive',
      });
    }
    setTimeout(() => setBulkRenewedCount(null), 10000);
  };

  // Per-row Mark as Renewed — extends a single document's expiry by +1 year
  const handleMarkRenewed = async (alert: ComplianceAlert) => {
    const key = `${alert.operator_id}|${alert.doc_type}`;
    setRowRenewing(prev => ({ ...prev, [key]: true }));

    const actorId = user?.id ?? null;
    const actorName = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null
      : null;

    const newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];
    const col = alert.doc_type === 'CDL' ? 'cdl_expiration' : 'medical_cert_expiration';

    try {
      const { data: opRow } = await supabase
        .from('operators')
        .select('application_id')
        .eq('id', alert.operator_id)
        .single();
      const appId = (opRow as any)?.application_id;
      if (!appId) throw new Error('No application found');

      const { data: appData } = await supabase
        .from('applications')
        .select(col)
        .eq('id', appId)
        .single();
      const oldDateStr = (appData as any)?.[col] ?? null;

      const { error } = await supabase
        .from('applications')
        .update({ [col]: newDateStr })
        .eq('id', appId);
      if (error) throw error;

      await supabase.from('audit_log' as any).insert({
        actor_id: actorId,
        actor_name: actorName,
        action: 'cert_renewed',
        entity_type: 'operator',
        entity_id: alert.operator_id,
        entity_label: alert.operator_name,
        metadata: {
          document_type: alert.doc_type,
          old_expiry: oldDateStr,
          new_expiry: newDateStr,
          operator_name: alert.operator_name,
        },
      });

      const renewedNow = new Date().toISOString();
      setRowRenewing(prev => ({ ...prev, [key]: false }));
      setRowRenewed(prev => ({ ...prev, [key]: true }));
      setLastRenewed(prev => ({ ...prev, [key]: renewedNow }));
      if (actorName) setLastRenewedBy(prev => ({ ...prev, [key]: actorName }));
      toast({
        title: `${alert.doc_type} marked as renewed`,
        description: `${alert.operator_name}'s expiry extended to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.`,
      });
      setTimeout(() => setRowRenewed(prev => { const n = { ...prev }; delete n[key]; return n; }), 8000);
    } catch {
      setRowRenewing(prev => ({ ...prev, [key]: false }));
      toast({ title: 'Failed to renew document', variant: 'destructive' });
    }
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
      const matchIdle = !idleFilter || (
        op.onboarding_updated_at != null &&
        differenceInDays(new Date(), parseISO(op.onboarding_updated_at)) >= 14
      );
      return matchSearch && matchStage && matchStatus && matchCoordinator && matchDispatch && matchProgress && matchCompliance && matchIdle;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      if (sortKey === 'progress') {
        const cmp = a.progress_pct - b.progress_pct;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortKey === 'last_activity') {
        const at = a.onboarding_updated_at ?? '';
        const bt = b.onboarding_updated_at ?? '';
        const cmp = at < bt ? -1 : at > bt ? 1 : 0;
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

  const idleCount = operators.filter(op =>
    op.onboarding_updated_at != null &&
    differenceInDays(new Date(), parseISO(op.onboarding_updated_at)) >= 14
  ).length;

  const activeFilterCount = [
    stageFilter !== 'all',
    statusFilter !== 'all',
    coordinatorFilter !== 'all',
    dispatchFilter !== 'all',
    progressFilter !== 'all',
    complianceFilter !== 'all',
    idleFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStageFilter('all');
    setStatusFilter('all');
    setCoordinatorFilter('all');
    setDispatchFilter('all');
    setProgressFilter('all');
    setComplianceFilter('all');
    setIdleFilter(false);
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
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
        {/* Idle 14d+ card — clickable to toggle idle filter */}
        {(() => {
          const isActive = idleFilter;
          return (
            <button
              onClick={() => setIdleFilter(v => !v)}
              className={`rounded-xl p-3 sm:p-4 shadow-sm border text-left transition-all ${
                isActive
                  ? 'bg-warning border-warning ring-2 ring-warning/30'
                  : idleCount > 0
                    ? 'bg-warning/5 border-warning/40 hover:bg-warning/10 hover:border-warning/60'
                    : 'bg-white border-border hover:border-foreground/20'
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-warning-foreground/20' : 'bg-warning/10'
                }`}>
                  <Clock className={`h-4 w-4 sm:h-5 sm:w-5 ${isActive ? 'text-warning-foreground' : ''}`} style={isActive ? {} : { color: 'hsl(var(--warning))' }} />
                </div>
                <div>
                  <p className={`text-xl sm:text-2xl font-bold ${isActive ? 'text-warning-foreground' : idleCount > 0 ? '' : 'text-foreground'}`} style={(!isActive && idleCount > 0) ? { color: 'hsl(var(--warning))' } : {}}>
                    {idleCount}
                  </p>
                  <p className={`text-xs ${isActive ? 'text-warning-foreground/80' : 'text-muted-foreground'}`}>
                    Idle 14d+
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
          <div className="flex items-center px-4 py-3 gap-2">
            {/* Expand/collapse toggle — takes remaining space */}
            <button
              onClick={() => setComplianceExpanded(v => !v)}
              className="flex-1 flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity min-w-0"
            >
              <div className="h-7 w-7 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-4 w-4 text-destructive" />
              </div>
              <span className="font-semibold text-sm text-destructive">Compliance Alerts</span>
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                {complianceAlerts.length}
              </span>
              {(() => {
                const neverRenewed = complianceAlerts.filter(a => !lastRenewed[`${a.operator_id}|${a.doc_type}`]).length;
                if (neverRenewed === 0) return null;
                return (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-destructive/10 border border-destructive/30 text-destructive text-[10px] font-semibold shrink-0 cursor-default">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                          {neverRenewed} Never Renewed
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-56 text-center text-xs">
                        These documents have never been marked as renewed by staff
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
              {(() => {
                const now = Date.now();
                const recentlySent = complianceAlerts.filter(a => {
                  const ts = lastReminded[`${a.operator_id}|${a.doc_type}`];
                  if (!ts) return false;
                  return now - new Date(ts).getTime() <= 30 * 24 * 60 * 60 * 1000;
                }).length;
                if (recentlySent === 0) return null;
                return (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-warning/10 border border-warning/30 text-warning-foreground text-[10px] font-semibold shrink-0 cursor-default" style={{color: 'hsl(var(--warning))'}}>
                          <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                          {recentlySent} Reminder Sent
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-56 text-center text-xs">
                        {recentlySent} operator{recentlySent !== 1 ? 's' : ''} received a manual reminder in the last 30 days
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
              <span className="text-xs text-muted-foreground hidden sm:inline truncate">
                {complianceAlerts.filter(a => a.days_until < 0).length > 0
                  ? `${complianceAlerts.filter(a => a.days_until < 0).length} expired · `
                  : ''}
                CDL or medical cert expiring within 90 days
              </span>
              {/* Doc-type filter chips */}
              <div className="hidden sm:flex items-center gap-1 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
                {(['all', 'CDL', 'Medical Cert'] as const).map(f => {
                  const count = f === 'all' ? complianceAlerts.length : complianceAlerts.filter(a => a.doc_type === f).length;
                  const active = complianceDocFilter === f && !complianceNoActionOnly;
                  return (
                    <button
                      key={f}
                      onClick={() => { setComplianceDocFilter(f); setComplianceNoActionOnly(false); }}
                      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold border transition-all ${
                        active
                          ? 'bg-destructive/15 border-destructive/40 text-destructive'
                          : 'bg-background border-border text-muted-foreground hover:border-destructive/30 hover:text-destructive/70'
                      }`}
                    >
                      {f === 'all' ? 'All' : f}
                      <span className={`text-[9px] font-bold ${active ? 'text-destructive' : 'text-muted-foreground'}`}>{count}</span>
                    </button>
                  );
                })}
                {/* No Action chip */}
                {(() => {
                  const noActionCount = complianceAlerts.filter(a => {
                    const key = `${a.operator_id}|${a.doc_type}`;
                    return !lastReminded[key] && !lastRenewed[key];
                  }).length;
                  if (noActionCount === 0) return null;
                  return (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setComplianceNoActionOnly(v => !v)}
                            className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold border transition-all ${
                              complianceNoActionOnly
                                ? 'bg-muted-foreground/15 border-muted-foreground/40 text-foreground'
                                : 'bg-background border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                            }`}
                          >
                            No Action
                            <span className={`text-[9px] font-bold ${complianceNoActionOnly ? 'text-foreground' : 'text-muted-foreground'}`}>{noActionCount}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
                          Show only operators with no reminder or renewal recorded
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              </div>
            </button>

            {/* Bulk send button — only when there are critical (≤30d) alerts */}
            {(() => {
              const criticalCount = complianceAlerts.filter(a => a.days_until <= 30).length;
              if (criticalCount === 0) return null;
              const allSent = bulkSentCount !== null;
              return (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setShowBulkConfirm(true); }}
                        disabled={bulkSending}
                        className={`shrink-0 h-7 px-3 text-xs gap-1.5 font-semibold transition-all ${
                          allSent
                            ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10'
                            : 'border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/15'
                        }`}
                      >
                        {bulkSending ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Sending…</>
                        ) : allSent ? (
                          <><CheckCheck className="h-3 w-3" />{bulkSentCount} Sent</>
                        ) : (
                          <><Send className="h-3 w-3" />Send All ({criticalCount})</>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[220px] text-center">
                      {allSent
                        ? `${bulkSentCount} reminder${bulkSentCount !== 1 ? 's' : ''} sent to critical operators`
                        : `Send renewal reminder emails to all ${criticalCount} operator${criticalCount !== 1 ? 's' : ''} with critical expiries (≤ 30 days)`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

            {/* Bulk Mark as Renewed button */}
            {(() => {
              const allRenewed = bulkRenewedCount !== null;
              return (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setShowBulkRenewConfirm(true); }}
                        disabled={bulkRenewing}
                        className={`shrink-0 h-7 px-3 text-xs gap-1.5 font-semibold transition-all ${
                          allRenewed
                            ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10'
                            : 'border-status-progress/40 text-status-progress bg-status-progress/5 hover:bg-status-progress/15'
                        }`}
                      >
                        {bulkRenewing ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Renewing…</>
                        ) : allRenewed ? (
                          <><CheckCheck className="h-3 w-3" />{bulkRenewedCount} Renewed</>
                        ) : (
                          <><RotateCcw className="h-3 w-3" />Mark All Renewed</>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[240px] text-center">
                      {allRenewed
                        ? `${bulkRenewedCount} document${bulkRenewedCount !== 1 ? 's' : ''} renewed successfully`
                        : `Extend all ${complianceAlerts.length} alerted document${complianceAlerts.length !== 1 ? 's' : ''} by +1 year from today`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

            {/* Bulk Send — No Action rows only */}
            {(() => {
              const noActionAlerts = complianceAlerts.filter(a => {
                const key = `${a.operator_id}|${a.doc_type}`;
                return !lastReminded[key] && !lastRenewed[key];
              });
              const allSent = noActionBulkSentCount !== null;
              // Show "N Sent" flash even after list empties, then hide once the timer expires
              if (noActionAlerts.length === 0 && !allSent && !noActionBulkSending) return null;
              return (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setShowNoActionBulkConfirm(true); }}
                        disabled={noActionBulkSending || allSent || noActionAlerts.length === 0}
                        className={`shrink-0 h-7 px-3 text-xs gap-1.5 font-semibold transition-all ${
                          allSent
                            ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10'
                            : 'border-muted-foreground/40 text-muted-foreground bg-muted/30 hover:border-foreground/40 hover:text-foreground hover:bg-muted/60'
                        }`}
                      >
                        {noActionBulkSending ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Sending…</>
                        ) : allSent ? (
                          <><CheckCheck className="h-3 w-3" />{noActionBulkSentCount} Sent</>
                        ) : (
                          <><Send className="h-3 w-3" />Remind Uncontacted ({noActionAlerts.length})</>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[240px] text-center">
                      {allSent
                        ? `${noActionBulkSentCount} reminder${noActionBulkSentCount !== 1 ? 's' : ''} sent to uncontacted operators`
                        : `Send reminders to ${noActionAlerts.length} operator${noActionAlerts.length !== 1 ? 's' : ''} with no prior reminder or renewal on record`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

            <button onClick={() => setComplianceExpanded(v => !v)} className="shrink-0 hover:opacity-80 transition-opacity">
              {complianceExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </button>
          </div>

          {/* Alert rows */}
          {complianceExpanded && (
            <div className="border-t border-destructive/20 divide-y divide-destructive/10">
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-1.5 bg-destructive/5">
                <span className="h-2 w-2 shrink-0" />
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Operator</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden sm:block shrink-0 w-[80px]">Expires</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 shrink-0 w-[60px] text-right">Status</span>
                <button
                  onClick={() => setComplianceSort(s =>
                    s === 'urgency' ? 'last_action_desc' : s === 'last_action_desc' ? 'last_action_asc' : 'urgency'
                  )}
                  className="hidden md:inline-flex items-center gap-1 w-[90px] justify-end text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground group shrink-0"
                  style={{ color: complianceSort !== 'urgency' ? 'hsl(var(--foreground))' : undefined }}
                >
                  <span className={complianceSort !== 'urgency' ? 'text-foreground' : 'text-muted-foreground/60'}>Last Action</span>
                  {complianceSort === 'urgency'
                    ? <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground/70" />
                    : complianceSort === 'last_action_desc'
                    ? <ArrowDown className="h-3 w-3 text-gold" />
                    : <ArrowUp className="h-3 w-3 text-gold" />}
                </button>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden xl:block shrink-0 w-[72px] text-right">Last Reminded</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden xl:block shrink-0 w-[72px] text-right">Last Renewed</span>
                <span className="shrink-0 w-[74px]" />
                <span className="shrink-0 w-[68px]" />
                <span className="shrink-0 w-[58px]" />
              </div>
                {(() => {
                  const base = complianceAlerts.filter(a => {
                    if (complianceNoActionOnly) {
                      const key = `${a.operator_id}|${a.doc_type}`;
                      if (lastReminded[key] || lastRenewed[key]) return false;
                    }
                    return complianceDocFilter === 'all' || a.doc_type === complianceDocFilter;
                  });
                  if (complianceSort === 'urgency') return base;
                  return [...base].sort((a, b) => {
                    const aTs = Math.max(
                      lastReminded[`${a.operator_id}|${a.doc_type}`] ? new Date(lastReminded[`${a.operator_id}|${a.doc_type}`]).getTime() : 0,
                      lastRenewed[`${a.operator_id}|${a.doc_type}`] ? new Date(lastRenewed[`${a.operator_id}|${a.doc_type}`]).getTime() : 0,
                    );
                    const bTs = Math.max(
                      lastReminded[`${b.operator_id}|${b.doc_type}`] ? new Date(lastReminded[`${b.operator_id}|${b.doc_type}`]).getTime() : 0,
                      lastRenewed[`${b.operator_id}|${b.doc_type}`] ? new Date(lastRenewed[`${b.operator_id}|${b.doc_type}`]).getTime() : 0,
                    );
                    return complianceSort === 'last_action_desc' ? bTs - aTs : aTs - bTs;
                  });
                })().map((alert, i) => {
                const expired = alert.days_until < 0;
                const critical = !expired && alert.days_until <= 30;
                const warning = !expired && !critical;
                const rowKey = `${alert.operator_id}|${alert.doc_type}`;
                const isSending = reminderSending[rowKey];
                const isSent = reminderSent[rowKey];
                const remindedAt = lastReminded[rowKey];
                const remindedBy = lastRemindedBy[rowKey];
                const reminderOutcome = lastReminderOutcome[rowKey];
                const isRowRenewing = rowRenewing[rowKey];
                const isRowRenewed = rowRenewed[rowKey];
                const renewedAt = lastRenewed[rowKey];
                const renewedByName = lastRenewedBy[rowKey];

                return (
                  <div key={`${alert.operator_id}-${alert.doc_type}`}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                      !renewedAt
                        ? 'bg-destructive/[0.04] hover:bg-destructive/[0.07] border-l-2 border-l-destructive/40'
                        : 'bg-background/60 hover:bg-background/80 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Urgency dot */}
                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                      expired ? 'bg-destructive animate-pulse' :
                      critical ? 'bg-destructive' :
                      'bg-yellow-500'
                    }`} />

                    {/* Name + doc type + never-renewed badge */}
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-sm text-foreground truncate">{alert.operator_name}</span>
                      <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded font-medium border ${
                        alert.doc_type === 'CDL'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}>
                        {alert.doc_type}
                      </span>
                      {!renewedAt && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-destructive/10 text-destructive border border-destructive/25 shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" />
                          Never Renewed
                        </span>
                      )}
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

                    {/* Last Action column — most recent of reminder or renewal */}
                    {(() => {
                      const remindedTs = remindedAt ? new Date(remindedAt).getTime() : 0;
                      const renewedTs = renewedAt ? new Date(renewedAt).getTime() : 0;
                      const hasAction = remindedTs > 0 || renewedTs > 0;
                      const lastActionTs = Math.max(remindedTs, renewedTs);
                      const lastActionDate = hasAction ? new Date(lastActionTs) : null;
                      const isRenewal = renewedTs >= remindedTs && renewedTs > 0;
                      const actionBy = isRenewal ? renewedByName : remindedBy;
                      const actionLabel = isRenewal ? 'Renewed' : 'Reminded';
                      const pillClass = isRenewal
                        ? 'bg-status-complete/10 text-status-complete border border-status-complete/25'
                        : 'bg-primary/10 text-primary border border-primary/25';
                      const Icon = isRenewal ? RotateCcw : CheckCheck;
                      return (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`hidden md:inline-flex items-center gap-1 text-[11px] shrink-0 cursor-default w-[90px] justify-end rounded px-1.5 py-0.5 transition-colors ${
                                hasAction ? pillClass : 'text-muted-foreground/40'
                              }`}>
                                {hasAction && lastActionDate ? (
                                  <>
                                    <Icon className="h-3 w-3 shrink-0" />
                                    {format(lastActionDate, 'MMM d')}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground/40">No action</span>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px]">
                              {hasAction && lastActionDate ? (
                                <span className="flex flex-col gap-0.5">
                                  <span className="font-medium">{actionLabel}</span>
                                  <span>{format(lastActionDate, "MMM d, yyyy 'at' h:mm a")}</span>
                                  {actionBy && <span className="text-muted-foreground">by {actionBy}</span>}
                                </span>
                              ) : 'No reminder or renewal recorded yet'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}

                    {/* Last reminded column — freshness-aware colour */}
                    {(() => {
                      let freshness: 'recent' | 'stale' | 'none' = 'none';
                      if (remindedAt) {
                        const daysSince = differenceInDays(new Date(), new Date(remindedAt));
                        freshness = daysSince <= 7 ? 'recent' : daysSince >= 30 ? 'stale' : 'none';
                      }
                      // If email failed, override pill to destructive
                      const emailFailed = remindedAt && reminderOutcome && !reminderOutcome.sent;
                      const pillClass = emailFailed
                        ? 'bg-destructive/10 text-destructive border border-destructive/30'
                        : freshness === 'recent'
                        ? 'bg-status-complete/10 text-status-complete border border-status-complete/25'
                        : freshness === 'stale'
                        ? 'bg-warning/10 text-warning border border-warning/25'
                        : '';
                      const iconClass = emailFailed
                        ? 'text-destructive'
                        : freshness === 'recent'
                        ? 'text-status-complete'
                        : freshness === 'stale'
                        ? 'text-warning'
                        : 'text-muted-foreground';
                      const freshnessLabel = freshness === 'recent' ? 'Fresh' : freshness === 'stale' ? 'Stale' : '';
                      return (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`hidden xl:inline-flex items-center gap-1 text-[11px] shrink-0 cursor-default w-[72px] justify-end rounded px-1 py-0.5 transition-colors ${
                                remindedAt ? `${pillClass}` : 'text-muted-foreground/40'
                              }`}>
                                {remindedAt ? (
                                  <>
                                    <CheckCheck className={`h-3 w-3 shrink-0 ${iconClass}`} />
                                    {format(new Date(remindedAt), 'MMM d')}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[240px]">
                              {remindedAt ? (
                                <span className="flex flex-col gap-0.5">
                                  <span>Last reminder {format(new Date(remindedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                                  {remindedBy && <span className="text-muted-foreground">by {remindedBy}</span>}
                                  {emailFailed ? (
                                    <span className="text-destructive font-medium">
                                      ✗ Email failed
                                      {reminderOutcome?.error
                                        ? ` — ${reminderOutcome.error.replace(/^Error:\s*/i, '').slice(0, 80)}`
                                        : ''}
                                    </span>
                                  ) : (
                                    <>
                                      <span className="text-status-complete font-medium">✓ Email delivered</span>
                                      {freshnessLabel && <span className="font-medium">{freshnessLabel}</span>}
                                    </>
                                  )}
                                </span>
                              ) : 'No reminder sent yet'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                       );
                    })()}

                    {/* Last Renewed column — matches Last Reminded pattern */}
                    {(() => {
                      const pillClass = renewedAt
                        ? 'bg-status-complete/10 text-status-complete border border-status-complete/25'
                        : '';
                      return (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`hidden xl:inline-flex items-center gap-1 text-[11px] shrink-0 cursor-default w-[72px] justify-end rounded px-1 py-0.5 transition-colors ${
                                renewedAt ? pillClass : 'text-muted-foreground/40'
                              }`}>
                                {renewedAt ? (
                                  <>
                                    <RotateCcw className="h-3 w-3 shrink-0 text-status-complete" />
                                    {format(new Date(renewedAt), 'MMM d')}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px]">
                              {renewedAt ? (
                                <span className="flex flex-col gap-0.5">
                                  <span>Last renewed {format(new Date(renewedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                                  {renewedByName && <span className="text-muted-foreground">by {renewedByName}</span>}
                                </span>
                              ) : 'Not yet renewed'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}

                    {/* Send Reminder button */}
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendReminder(alert)}
                            disabled={isSending || isSent}
                            className={`shrink-0 h-7 px-2 text-xs gap-1.5 transition-all ${
                              isSent
                                ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10'
                                : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5'
                            }`}
                          >
                            {isSending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isSent ? (
                              <><CheckCheck className="h-3 w-3" /><span className="hidden sm:inline">Sent</span></>
                            ) : (
                              <><Send className="h-3 w-3" /><span className="hidden sm:inline">Remind</span></>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {isSent ? 'Reminder sent!' : `Send email reminder to ${alert.operator_name}`}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Per-row Mark as Renewed button — muted/amber tint for warning range */}
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkRenewed(alert)}
                            disabled={isRowRenewing || isRowRenewed}
                            className={`relative shrink-0 h-7 px-2 text-xs gap-1.5 transition-all ${
                              isRowRenewed
                                ? 'border-status-complete/40 text-status-complete bg-status-complete/10 hover:bg-status-complete/10'
                                : warning
                                ? 'border-warning/40 text-warning/80 bg-warning/5 hover:border-warning/60 hover:text-warning hover:bg-warning/10'
                                : 'border-muted-foreground/30 text-muted-foreground hover:border-status-complete/50 hover:text-status-complete hover:bg-status-complete/5'
                            }`}
                          >
                            {isRowRenewing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isRowRenewed ? (
                              <><CheckCircle2 className="h-3 w-3" /><span className="hidden sm:inline">Renewed</span></>
                            ) : (
                              <><RotateCcw className="h-3 w-3" /><span className="hidden sm:inline">Renew</span></>
                            )}
                            {/* Warning dot badge — only shown for non-urgent (warning) rows */}
                            {warning && !isRowRenewed && !isRowRenewing && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-warning border border-background" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[200px] text-center">
                          {isRowRenewed
                            ? 'Document renewed!'
                            : warning
                            ? <>
                                <span className="font-semibold text-warning block">Not urgent yet</span>
                                <span>{alert.doc_type} expires in {alert.days_until}d — renewal not required until ≤ 30 days</span>
                              </>
                            : `Mark ${alert.doc_type} as renewed (+1 year)`
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Open button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const focusField = alert.doc_type === 'CDL' ? 'cdl' : 'medcert';
                        if (onOpenOperatorWithFocus) {
                          onOpenOperatorWithFocus(alert.operator_id, focusField);
                        } else {
                          onOpenOperator(alert.operator_id);
                        }
                      }}
                      className="text-xs text-gold hover:text-gold-light hover:bg-gold/10 shrink-0 h-7 px-2"
                    >
                      Open →
                    </Button>
                  </div>
                );
              })}
              {complianceAlerts.filter(a => {
                if (complianceNoActionOnly) {
                  const key = `${a.operator_id}|${a.doc_type}`;
                  if (lastReminded[key] || lastRenewed[key]) return false;
                }
                return complianceDocFilter === 'all' || a.doc_type === complianceDocFilter;
              }).length === 0 && (
                <div className="flex items-center justify-center gap-2 py-5 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="text-xs">
                    {complianceNoActionOnly
                      ? 'All operators have at least one reminder or renewal recorded'
                      : complianceDocFilter === 'all'
                      ? 'No compliance alerts within 90 days'
                      : `No ${complianceDocFilter} alerts found`}
                  </span>
                </div>
              )}
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
            {/* Idle 14d+ chip */}
            {idleCount > 0 && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIdleFilter(v => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        idleFilter
                          ? 'bg-warning text-warning-foreground border-warning'
                          : 'bg-warning/10 text-warning-foreground border-warning/30 hover:bg-warning/20'
                      }`}
                      style={idleFilter ? {} : { color: 'hsl(var(--warning))' }}
                    >
                      <Clock className={`h-3 w-3 ${idleFilter ? 'text-warning-foreground' : ''}`} style={idleFilter ? {} : { color: 'hsl(var(--warning))' }} />
                      Idle 14d+
                      <span className="font-bold">{idleCount}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px] text-center">
                    Show only operators whose onboarding status hasn't changed in 14+ days
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
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
          <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 animate-fade-in">
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

            {/* Idle Activity toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</label>
              <button
                onClick={() => setIdleFilter(v => !v)}
                className={`h-9 w-full rounded-md border px-3 flex items-center gap-2 text-sm font-medium transition-all ${
                  idleFilter
                    ? 'border-warning bg-warning/10 text-foreground'
                    : 'border-input bg-white text-muted-foreground hover:border-warning/50 hover:text-foreground'
                }`}
                style={idleFilter ? { borderColor: 'hsl(var(--warning))', color: 'hsl(var(--warning))' } : {}}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" style={idleFilter ? { color: 'hsl(var(--warning))' } : {}} />
                <span className="truncate">Idle 14d+</span>
                {idleCount > 0 && (
                  <span
                    className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      idleFilter ? 'bg-warning/20' : 'bg-muted'
                    }`}
                    style={idleFilter ? { color: 'hsl(var(--warning))' } : {}}
                  >
                    {idleCount}
                  </span>
                )}
              </button>
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
          {idleFilter && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-warning/10 border-warning/30" style={{ color: 'hsl(var(--warning))' }}>
              <Clock className="h-3 w-3" />
              Idle 14d+
              <button onClick={() => setIdleFilter(false)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Legend-stage banner — shown when arriving from Management workload card */}
      {legendStageFilter && stageFilter === legendStageFilter && (() => {
        const STAGE_BANNER: Record<string, { bg: string; border: string; text: string; dot: string; icon: string }> = {
          'Stage 1 — Background':      { bg: 'bg-muted/40',             border: 'border-border',              text: 'text-foreground',       dot: 'bg-muted-foreground', icon: '🔍' },
          'Stage 2 — Documents':       { bg: 'bg-status-progress/8',    border: 'border-status-progress/25',  text: 'text-status-progress',  dot: 'bg-status-progress',  icon: '📄' },
          'Stage 3 — ICA':             { bg: 'bg-gold/8',               border: 'border-gold/25',             text: 'text-gold',             dot: 'bg-gold',             icon: '📝' },
          'Stage 4 — MO Registration': { bg: 'bg-info/8',               border: 'border-info/25',             text: 'text-info',             dot: 'bg-info',             icon: '🗺️' },
          'Stage 5 — Equipment':       { bg: 'bg-purple-400/8',         border: 'border-purple-400/25',       text: 'text-purple-500',       dot: 'bg-purple-400',       icon: '🚛' },
          'Stage 6 — Insurance':       { bg: 'bg-orange-400/8',         border: 'border-orange-400/25',       text: 'text-orange-500',       dot: 'bg-orange-400',       icon: '🛡️' },
        };
        const s = STAGE_BANNER[legendStageFilter] ?? STAGE_BANNER['Stage 1 — Background'];
        return (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${s.bg} ${s.border}`}>
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`} />
            <p className={`text-sm font-medium flex-1 ${s.text}`}>
              Showing operators at <span className="font-semibold">{legendStageFilter}</span>
            </p>
            <button
              onClick={() => { setStageFilter('all'); setLegendStageFilter(null); }}
              className={`flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity ${s.text}`}
              title="Clear stage filter"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        );
      })()}

      {/* Coordinator deep-link banner — shown when arriving from Management workload card coordinator row */}
      {legendCoordinatorFilter && coordinatorFilter === legendCoordinatorFilter.id && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-gold/8 border-gold/25">
          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-gold" />
          <p className="text-sm font-medium flex-1 text-gold">
            Showing operators assigned to <span className="font-semibold">{legendCoordinatorFilter.name}</span>
          </p>
          <button
            onClick={() => { setCoordinatorFilter('all'); setLegendCoordinatorFilter(null); }}
            className="flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity text-gold"
            title="Clear coordinator filter"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
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
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-default">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          Dispatch
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[230px] text-center">
                        Current dispatch status for fully onboarded operators. Not Dispatched, Dispatched, Home, or Truck Down.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </th>
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 text-muted-foreground cursor-default">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Msgs
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-center">
                        Unread messages from this operator. Click the row to open the conversation.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </th>
                 <th className="px-4 py-3 text-center">
                   <TooltipProvider>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <span className="inline-flex cursor-default">
                           <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                         </span>
                       </TooltipTrigger>
                       <TooltipContent side="top" className="max-w-[230px] text-center">
                         CDL or Medical Certificate expiring within 90 days. 🔴 Red = expired or ≤ 30 days. 🟡 Amber = 31–90 days.
                       </TooltipContent>
                     </Tooltip>
                   </TooltipProvider>
                 </th>
                 <th className="text-left px-4 py-3 font-semibold text-foreground hidden xl:table-cell">
                   <TooltipProvider>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <button
                           onClick={() => handleSort('last_activity')}
                           className="inline-flex items-center gap-1 hover:text-gold transition-colors group whitespace-nowrap"
                         >
                           Last Activity
                           {sortKey === 'last_activity'
                             ? sortDir === 'asc'
                               ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                               : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                             : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                         </button>
                       </TooltipTrigger>
                       <TooltipContent side="top" className="max-w-[220px] text-center">
                         Time since the last onboarding status update for this operator. Operators with no change in 14+ days are highlighted in amber.
                       </TooltipContent>
                     </Tooltip>
                   </TooltipProvider>
                 </th>
                 <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={12} className="text-center py-12 text-muted-foreground">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-muted-foreground">
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
                     {/* Last Activity cell */}
                     <td className="px-4 py-3 hidden xl:table-cell whitespace-nowrap">
                       {op.onboarding_updated_at ? (
                         <TooltipProvider delayDuration={100}>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <span className={`inline-flex items-center gap-1 text-xs ${
                                 (() => {
                                   const diff = Math.floor((Date.now() - new Date(op.onboarding_updated_at).getTime()) / 86400000);
                                   return diff >= 14 ? 'text-warning font-medium' : 'text-muted-foreground';
                                 })()
                               }`}>
                                 <Clock className="h-3 w-3 shrink-0" />
                                 {formatDistanceToNowStrict(parseISO(op.onboarding_updated_at), { addSuffix: true })}
                               </span>
                             </TooltipTrigger>
                             <TooltipContent side="left" className="text-xs">
                               {format(parseISO(op.onboarding_updated_at), 'MMM d, yyyy h:mm a')}
                             </TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       ) : (
                         <span className="text-muted-foreground/40 text-xs">—</span>
                       )}
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
                    <td colSpan={12} className="px-4 py-2.5">
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
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
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

      {/* Bulk Send All Reminders — confirmation dialog */}
      {(() => {
        const criticalAlerts = complianceAlerts.filter(a => a.days_until <= 30);
        return (
          <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-destructive" />
                  Send All Reminders
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      The following {criticalAlerts.length} operator{criticalAlerts.length !== 1 ? 's' : ''} will receive a CDL/Med Cert expiry reminder email:
                    </p>
                    <ul className="divide-y divide-border rounded-md border border-border overflow-hidden text-sm">
                      {criticalAlerts.map(alert => (
                        <li key={`${alert.operator_id}|${alert.doc_type}`} className="flex items-center justify-between px-3 py-2 bg-background">
                          <span className="font-medium text-foreground">{alert.operator_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{alert.doc_type}</span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                              alert.days_until < 0
                                ? 'bg-destructive/15 text-destructive'
                                : alert.days_until <= 30
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-gold/10 text-gold'
                            }`}>
                              {alert.days_until < 0 ? `${Math.abs(alert.days_until)}d expired` : `${alert.days_until}d left`}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { setShowBulkConfirm(false); handleSendAllCritical(); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Send {criticalAlerts.length} Reminder{criticalAlerts.length !== 1 ? 's' : ''}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {/* Bulk Mark as Renewed — confirmation dialog */}
      {(() => {
        const newDate = new Date();
        newDate.setFullYear(newDate.getFullYear() + 1);
        const newDateStr = newDate.toLocaleDateString();
        return (
          <AlertDialog open={showBulkRenewConfirm} onOpenChange={setShowBulkRenewConfirm}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-status-progress" />
                  Mark All as Renewed
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      The following {complianceAlerts.length} document{complianceAlerts.length !== 1 ? 's' : ''} will have their expiry date extended to <span className="font-semibold text-foreground">{newDateStr}</span>:
                    </p>
                    <ul className="divide-y divide-border rounded-md border border-border overflow-hidden text-sm max-h-64 overflow-y-auto">
                      {complianceAlerts.map(alert => (
                        <li key={`${alert.operator_id}|${alert.doc_type}`} className="flex items-center justify-between px-3 py-2 bg-background">
                          <span className="font-medium text-foreground">{alert.operator_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{alert.doc_type}</span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                              alert.days_until < 0
                                ? 'bg-destructive/15 text-destructive'
                                : alert.days_until <= 30
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-gold/10 text-gold'
                            }`}>
                              {alert.days_until < 0 ? `${Math.abs(alert.days_until)}d expired` : `${alert.days_until}d left`}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Each renewal is logged in the Activity Log with the old and new dates.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { setShowBulkRenewConfirm(false); handleBulkMarkRenewed(); }}
                  className="bg-status-progress text-white hover:bg-status-progress/90"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Renew {complianceAlerts.length} Document{complianceAlerts.length !== 1 ? 's' : ''}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {/* Bulk Send — No Action rows confirmation dialog */}
      {(() => {
        const noActionAlerts = complianceAlerts.filter(a => {
          const key = `${a.operator_id}|${a.doc_type}`;
          return !lastReminded[key] && !lastRenewed[key];
        });
        return (
          <AlertDialog open={showNoActionBulkConfirm} onOpenChange={setShowNoActionBulkConfirm}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  Remind Uncontacted Operators
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      The following {noActionAlerts.length} operator{noActionAlerts.length !== 1 ? 's' : ''} have no reminder or renewal on record and will receive an expiry reminder email:
                    </p>
                    <ul className="divide-y divide-border rounded-md border border-border overflow-hidden text-sm max-h-64 overflow-y-auto">
                      {noActionAlerts.map(alert => (
                        <li key={`${alert.operator_id}|${alert.doc_type}`} className="flex items-center justify-between px-3 py-2 bg-background">
                          <span className="font-medium text-foreground">{alert.operator_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{alert.doc_type}</span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                              alert.days_until < 0
                                ? 'bg-destructive/15 text-destructive'
                                : alert.days_until <= 30
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-gold/10 text-gold'
                            }`}>
                              {alert.days_until < 0 ? `${Math.abs(alert.days_until)}d expired` : `${alert.days_until}d left`}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { setShowNoActionBulkConfirm(false); handleSendAllNoAction(); }}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Send {noActionAlerts.length} Reminder{noActionAlerts.length !== 1 ? 's' : ''}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
}
