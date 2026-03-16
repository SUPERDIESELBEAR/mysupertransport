import { useState, useEffect, useCallback } from 'react';
import NotificationPreferencesModal from '@/components/management/NotificationPreferencesModal';
import { useSearchParams } from 'react-router-dom';
import StaffLayout from '@/components/layouts/StaffLayout';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PipelineDashboard from '../staff/PipelineDashboard';
import OperatorDetailPanel from '../staff/OperatorDetailPanel';
import ApplicationReviewDrawer, { type FullApplication } from '@/components/management/ApplicationReviewDrawer';
import StaffDirectory from '@/components/management/StaffDirectory';
import FaqManager from '@/components/management/FaqManager';
import ResourceLibraryManager from '@/components/management/ResourceLibraryManager';
import ActivityLog from '@/components/management/ActivityLog';
import NotificationHistory from '@/components/management/NotificationHistory';
import DispatchPortal from '../dispatch/DispatchPortal';
import {
  LayoutDashboard, Users, ClipboardList, Truck, UserPlus, HelpCircle, BookOpen,
  CheckCircle2, Clock, AlertTriangle, ChevronRight, ShieldAlert,
  Search, RefreshCcw, Eye, ScrollText, TriangleAlert, Settings2, BellRing, Library,
} from 'lucide-react';
import DocumentHub from '@/components/documents/DocumentHub';
import ServiceLibraryManager from '@/components/service-library/ServiceLibraryManager';
import { differenceInDays, formatDistanceToNowStrict, parseISO, startOfDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type StageBreakdown = {
  stage1_background: number;
  stage2_documents: number;
  stage3_ica: number;
  stage4_mo_reg: number;
  stage5_equipment: number;
  stage6_insurance: number;
  fully_onboarded: number;
};

type StaffWorkload = {
  user_id: string;
  full_name: string;
  email: string;
  assigned_operator_count: number;
  stages: StageBreakdown;
  lastUpdatedAt: string | null;
};

type ManagementView = 'overview' | 'pipeline' | 'operator-detail' | 'applications' | 'dispatch' | 'staff' | 'faq' | 'resources' | 'activity' | 'notifications' | 'docs-hub' | 'service-library';
type StatusFilter = 'pending' | 'approved' | 'denied' | 'all';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress border-status-progress/30',
  approved: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  denied: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function ManagementPortal() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<ManagementView>(() => {
    const v = searchParams.get('view') as ManagementView | null;
    return (v && ['overview','pipeline','operator-detail','applications','dispatch','staff','faq','resources','activity','notifications'].includes(v)) ? v : 'overview';
  });
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const [applications, setApplications] = useState<FullApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get('status') as StatusFilter | null;
    return (s && ['pending','approved','denied','all'].includes(s)) ? s : 'pending';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingApps, setLoadingApps] = useState(false);
  const [selectedApp, setSelectedApp] = useState<FullApplication | null>(null);
  const [metrics, setMetrics] = useState({ pending: 0, onboarding: 0, active: 0, alerts: 0 });
  const [dispatchBreakdown, setDispatchBreakdown] = useState({ not_dispatched: 0, dispatched: 0, home: 0, truck_down: 0 });
  const [dispatchLastChanged, setDispatchLastChanged] = useState<Record<string, string | null>>({ not_dispatched: null, dispatched: null, home: null, truck_down: null });
  const [dispatchLastChangedAt, setDispatchLastChangedAt] = useState<Record<string, string | null>>({ not_dispatched: null, dispatched: null, home: null, truck_down: null });
  const [complianceRefreshKey, setComplianceRefreshKey] = useState(0);
  const [truckDownCount, setTruckDownCount] = useState(0);
  const [dispatchLiveFlash, setDispatchLiveFlash] = useState(false);
  const [panelExpiryOverride, setPanelExpiryOverride] = useState<{ cdl: string | null; medcert: string | null } | undefined>(undefined);

  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState(0);
  const [drawerFocusField, setDrawerFocusField] = useState<'cdl' | 'medcert' | undefined>(undefined);
  type ComplianceRow = { operatorId: string; name: string; daysUntil: number; docType: 'CDL' | 'Med Cert'; expiryDate: string };
  const [complianceSummary, setComplianceSummary] = useState<ComplianceRow[]>([]);
  const [staffWorkload, setStaffWorkload] = useState<StaffWorkload[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [unassignedStages, setUnassignedStages] = useState<StageBreakdown>({ stage1_background: 0, stage2_documents: 0, stage3_ica: 0, stage4_mo_reg: 0, stage5_equipment: 0, stage6_insurance: 0, fully_onboarded: 0 });
  const [onboardingStageBreakdown, setOnboardingStageBreakdown] = useState<StageBreakdown>({ stage1_background: 0, stage2_documents: 0, stage3_ica: 0, stage4_mo_reg: 0, stage5_equipment: 0, stage6_insurance: 0, fully_onboarded: 0 });
  const [idleOnboardingCount, setIdleOnboardingCount] = useState(0);
  const [pipelineIdleFilter, setPipelineIdleFilter] = useState(false);
  const [pipelineCoordinatorFilter, setPipelineCoordinatorFilter] = useState<string>('all');
  const [pipelineCoordinatorName, setPipelineCoordinatorName] = useState<string | null>(null);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string>('all');

  // Sync view/statusFilter when URL params change (e.g. notification deep-links)
  useEffect(() => {
    const v = searchParams.get('view') as ManagementView | null;
    const s = searchParams.get('status') as StatusFilter | null;
    if (v && ['overview','pipeline','operator-detail','applications','dispatch','staff','faq','resources','activity','notifications'].includes(v)) {
      setView(v);
    }
    if (s && ['pending','approved','denied','all'].includes(s)) {
      setStatusFilter(s);
    }
  }, [searchParams]);


  const fetchTruckDownCount = useCallback(async () => {
    const { count } = await supabase
      .from('active_dispatch')
      .select('id', { count: 'exact', head: true })
      .eq('dispatch_status', 'truck_down');
    setTruckDownCount(count ?? 0);
  }, []);

  const fetchDispatchBreakdown = useCallback(async () => {
    const { data } = await supabase
      .from('active_dispatch')
      .select('dispatch_status, updated_by, updated_at')
      .order('updated_at', { ascending: false });
    if (!data) return;

    const breakdown = { not_dispatched: 0, dispatched: 0, home: 0, truck_down: 0 };
    // Track the most-recently-updated row per status
    const latestUpdatedBy: Record<string, string | null> = { not_dispatched: null, dispatched: null, home: null, truck_down: null };
    const latestUpdatedAt: Record<string, string | null> = { not_dispatched: null, dispatched: null, home: null, truck_down: null };
    const seenStatus = new Set<string>();

    for (const row of data) {
      const s = row.dispatch_status as keyof typeof breakdown;
      if (s in breakdown) {
        breakdown[s]++;
        if (!seenStatus.has(s)) {
          latestUpdatedBy[s] = row.updated_by ?? null;
          latestUpdatedAt[s] = row.updated_at ?? null;
          seenStatus.add(s);
        }
      }
    }

    // Resolve profile names for each unique updated_by uuid
    const uniqueIds = [...new Set(Object.values(latestUpdatedBy).filter(Boolean))] as string[];
    const nameMap: Record<string, string> = {};
    if (uniqueIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', uniqueIds);
      for (const p of profiles ?? []) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        if (name) nameMap[p.user_id] = name;
      }
    }

    const lastChanged: Record<string, string | null> = {};
    for (const [status, uid] of Object.entries(latestUpdatedBy)) {
      lastChanged[status] = uid ? (nameMap[uid] ?? null) : null;
    }

    setDispatchBreakdown(breakdown);
    setDispatchLastChanged(lastChanged);
    setDispatchLastChangedAt(latestUpdatedAt);
    setDispatchLiveFlash(true);
    setTimeout(() => setDispatchLiveFlash(false), 800);
  }, []);

  const fetchUnreadNotifCount = useCallback(async () => {
    if (!session?.user?.id) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .is('read_at', null);
    setUnreadNotifCount(count ?? 0);
  }, [session?.user?.id]);

  const fetchCriticalExpiries = useCallback(async () => {
    const { data } = await supabase
      .from('operators')
      .select('id, applications(first_name, last_name, cdl_expiration, medical_cert_expiration)')
      .not('application_id', 'is', null);
    if (!data) return;
    const today = startOfDay(new Date());
    let count = 0;
    const rows: ComplianceRow[] = [];
    (data as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || 'Unknown';
      const docs: { field: string; label: 'CDL' | 'Med Cert' }[] = [
        { field: 'cdl_expiration', label: 'CDL' },
        { field: 'medical_cert_expiration', label: 'Med Cert' },
      ];
      docs.forEach(({ field, label }) => {
        const dateStr: string | null = app[field];
        if (!dateStr) return;
        const days = differenceInDays(startOfDay(parseISO(dateStr)), today);
        if (days <= 30) count++;
        if (days <= 90) {
          rows.push({ operatorId: op.id, name, daysUntil: days, docType: label, expiryDate: dateStr });
        }
      });
    });
    rows.sort((a, b) => a.daysUntil - b.daysUntil);
    setCriticalExpiryCount(count);
    setComplianceSummary(rows.slice(0, 5));
  }, []);

  // Subscribe to realtime changes on active_dispatch to keep the banner + overview live
  useEffect(() => {
    fetchTruckDownCount();
    fetchDispatchBreakdown();
    const channel = supabase
      .channel('mgmt-truck-down-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_dispatch' }, () => {
        fetchTruckDownCount();
        fetchDispatchBreakdown();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTruckDownCount, fetchDispatchBreakdown]);

  // Subscribe to realtime for unread notification count
  useEffect(() => {
    fetchUnreadNotifCount();
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('mgmt-unread-notif-count')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchUnreadNotifCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchUnreadNotifCount, session?.user?.id]);

  // Fetch + subscribe to critical expiry count
  useEffect(() => {
    fetchCriticalExpiries();
    const channel = supabase
      .channel('mgmt-critical-expiry-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        fetchCriticalExpiries();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCriticalExpiries]);

  // Clear badge when visiting notifications view
  useEffect(() => {
    if (view === 'notifications') setUnreadNotifCount(0);
  }, [view]);

  const fetchStaffWorkload = useCallback(async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { data: { session: s } } = await supabase.auth.getSession();
    const authToken = s?.access_token ?? anonKey;
    const res = await fetch(`${supabaseUrl}/functions/v1/get-staff-list`, {
      headers: { Authorization: `Bearer ${authToken}`, apikey: anonKey },
    });
    if (!res.ok) return;
    const json = await res.json();

    // Fetch all operators with their onboarding_status to compute per-coordinator stage breakdown
    const { data: opsData } = await supabase
      .from('operators')
      .select('id, assigned_onboarding_staff, onboarding_status(mvr_ch_approval, form_2290, truck_title, truck_photos, truck_inspection, ica_status, mo_reg_received, decal_applied, eld_installed, fuel_card_issued, insurance_added_date, fully_onboarded, updated_at)');

    // Helper: compute which stage an operator is currently on (first incomplete)
    const getStage = (os: any): keyof StageBreakdown => {
      if (!os) return 'stage1_background';
      if (os.fully_onboarded) return 'fully_onboarded';
      const docsComplete = os.form_2290 === 'received' && os.truck_title === 'received' && os.truck_photos === 'received' && os.truck_inspection === 'received';
      const icaComplete = os.ica_status === 'complete';
      const moComplete = os.mo_reg_received === 'yes';
      const equipComplete = os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes';
      if (!os.mvr_ch_approval || os.mvr_ch_approval !== 'approved') return 'stage1_background';
      if (!docsComplete) return 'stage2_documents';
      if (!icaComplete) return 'stage3_ica';
      if (!moComplete) return 'stage4_mo_reg';
      if (!equipComplete) return 'stage5_equipment';
      return 'stage6_insurance';
    };

    const emptyBreakdown = (): StageBreakdown => ({
      stage1_background: 0, stage2_documents: 0, stage3_ica: 0,
      stage4_mo_reg: 0, stage5_equipment: 0, stage6_insurance: 0, fully_onboarded: 0,
    });

    // Build a map of user_id → stage counts + latest onboarding_status updated_at
    const breakdownMap: Record<string, StageBreakdown> = {};
    const lastUpdatedAtMap: Record<string, string | null> = {};
    for (const op of (opsData ?? [])) {
      const uid = op.assigned_onboarding_staff;
      if (!uid) continue;
      if (!breakdownMap[uid]) breakdownMap[uid] = emptyBreakdown();
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const stage = getStage(os);
      breakdownMap[uid][stage]++;
      // Track the most recent updated_at for this coordinator
      const updatedAt: string | null = os?.updated_at ?? null;
      if (updatedAt) {
        if (!lastUpdatedAtMap[uid] || updatedAt > lastUpdatedAtMap[uid]!) {
          lastUpdatedAtMap[uid] = updatedAt;
        }
      }
    }

    const onboarders: StaffWorkload[] = (json.staff ?? [])
      .filter((m: any) => (m.roles ?? []).includes('onboarding_staff'))
      .map((m: any) => ({
        user_id: m.user_id,
        full_name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email,
        email: m.email,
        assigned_operator_count: m.assigned_operator_count ?? 0,
        stages: breakdownMap[m.user_id] ?? emptyBreakdown(),
        lastUpdatedAt: lastUpdatedAtMap[m.user_id] ?? null,
      }));
    setStaffWorkload(onboarders);
    // Compute stage breakdown for unassigned operators
    const unassignedBreakdown = emptyBreakdown();
    for (const op of (opsData ?? [])) {
      if (op.assigned_onboarding_staff) continue;
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const stage = getStage(os);
      unassignedBreakdown[stage]++;
    }
    setUnassignedStages(unassignedBreakdown);
    // Count unassigned operators
    const unassignedTotal = Object.values(unassignedBreakdown).reduce((a, b) => a + b, 0);
    setUnassignedCount(unassignedTotal);
    // Compute global stage breakdown across all operators + idle count (14+ days)
    const globalBreakdown = emptyBreakdown();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    let idleCount = 0;
    for (const op of (opsData ?? [])) {
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const stage = getStage(os);
      globalBreakdown[stage]++;
      if (os?.updated_at && os.updated_at < fourteenDaysAgo && !os.fully_onboarded) idleCount++;
    }
    setOnboardingStageBreakdown(globalBreakdown);
    setIdleOnboardingCount(idleCount);
  }, []);

  useEffect(() => {
    if (view === 'overview') fetchStaffWorkload();
  }, [view, fetchStaffWorkload]);

  const fetchMetrics = useCallback(async () => {
    const [appsRes, opsRes, dispRes, alertsRes] = await Promise.all([
      supabase.from('applications').select('id', { count: 'exact' }).eq('review_status', 'pending').eq('is_draft', false),
      supabase.from('operators').select('id', { count: 'exact' }),
      supabase.from('active_dispatch').select('id', { count: 'exact' }),
      supabase.from('onboarding_status').select('id', { count: 'exact' }).or('mvr_ch_approval.eq.denied,pe_screening_result.eq.non_clear'),
    ]);
    setMetrics({
      pending: appsRes.count ?? 0,
      onboarding: opsRes.count ?? 0,
      active: dispRes.count ?? 0,
      alerts: alertsRes.count ?? 0,
    });
  }, []);

  const fetchApplications = useCallback(async () => {
    setLoadingApps(true);
    let query = supabase
      .from('applications')
      .select('*')
      .eq('is_draft', false)
      .order('submitted_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('review_status', statusFilter);
    }

    const { data } = await query;
    setApplications((data as FullApplication[]) ?? []);
    setLoadingApps(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (view === 'applications' || view === 'overview') {
      fetchApplications();
    }
  }, [view, fetchApplications]);

  const handleApprove = async (appId: string, notes: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('invite-operator', {
        body: { application_id: appId, reviewer_notes: notes || null },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: '✅ Application Approved',
        description: 'An invitation email has been sent. The operator record has been created.',
      });
      setSelectedApp(null);
      await Promise.all([fetchApplications(), fetchMetrics()]);
    } catch (err: unknown) {
      toast({
        title: 'Approval Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDeny = async (appId: string, notes: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('deny-application', {
        body: { application_id: appId, reviewer_notes: notes || null },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Application Denied',
        description: 'The application has been marked as denied.',
      });
      setSelectedApp(null);
      await Promise.all([fetchApplications(), fetchMetrics()]);
    } catch (err: unknown) {
      toast({
        title: 'Denial Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const filteredApps = applications.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${app.first_name ?? ''} ${app.last_name ?? ''}`.toLowerCase();
    return name.includes(q) || app.email.toLowerCase().includes(q) || (app.phone ?? '').includes(q);
  });

  const pendingApps = applications.filter(a => a.review_status === 'pending');

  const handleNavigate = (path: string) => {
    if (view === 'operator-detail' && operatorHasUnsavedChanges) {
      setPendingNavPath(path);
    } else {
      setView(path as ManagementView);
      if (path !== 'operator-detail') setSelectedOperatorId(null);
      if (path === 'pipeline') { setPipelineCoordinatorFilter('all'); setPipelineCoordinatorName(null); setPipelineStageFilter('all'); setPipelineIdleFilter(false); }
    }
  };

  const confirmNavigation = () => {
    if (pendingNavPath) {
      setOperatorHasUnsavedChanges(false);
      setView(pendingNavPath as ManagementView);
      if (pendingNavPath !== 'operator-detail') setSelectedOperatorId(null);
      if (pendingNavPath === 'pipeline') { setPipelineCoordinatorFilter('all'); setPipelineCoordinatorName(null); setPipelineStageFilter('all'); setPipelineIdleFilter(false); }
      setPendingNavPath(null);
    }
  };

  const navItems = [
    { label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Applications', icon: <ClipboardList className="h-4 w-4" />, path: 'applications' },
    { label: 'Pipeline', icon: <Users className="h-4 w-4" />, path: 'pipeline', badge: criticalExpiryCount || undefined },
    { label: 'Dispatch', icon: <Truck className="h-4 w-4" />, path: 'dispatch' },
    { label: 'Staff', icon: <UserPlus className="h-4 w-4" />, path: 'staff' },
    { label: 'Activity', icon: <ScrollText className="h-4 w-4" />, path: 'activity' },
    { label: 'Notifications', icon: <BellRing className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount },
    { label: 'Doc Hub', icon: <Library className="h-4 w-4" />, path: 'docs-hub' },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Resources', icon: <BookOpen className="h-4 w-4" />, path: 'resources' },
  ];

  // Bottom nav on mobile: 5 priority items that fit cleanly at 375px
  const mobileNavItems = [
    { label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Applic.', icon: <ClipboardList className="h-4 w-4" />, path: 'applications' },
    { label: 'Pipeline', icon: <Users className="h-4 w-4" />, path: 'pipeline', badge: criticalExpiryCount || undefined },
    { label: 'Dispatch', icon: <Truck className="h-4 w-4" />, path: 'dispatch' },
    { label: 'Notifs', icon: <BellRing className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount },
  ];

  return (
    <>
      <NotificationPreferencesModal open={notifPrefsOpen} onClose={() => setNotifPrefsOpen(false)} />
      <StaffLayout
        navItems={navItems}
        mobileNavItems={mobileNavItems}
        currentPath={view}
        onNavigate={handleNavigate}
        title="Management"
        notificationsPath="/dashboard?view=notifications"
        headerActions={
          <button
            onClick={() => setNotifPrefsOpen(true)}
            title="Notification preferences"
            className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted"
          >
            <Settings2 className="h-5 w-5" />
          </button>
        }
      >
        {/* ── TRUCK DOWN ALERT BANNER ── */}
        {truckDownCount > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 animate-fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 shrink-0">
                <TriangleAlert className="h-4 w-4 text-destructive animate-pulse" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-destructive leading-tight">
                  {truckDownCount} Operator{truckDownCount !== 1 ? 's' : ''} Truck Down
                </p>
                <p className="text-xs text-destructive/70 leading-tight mt-0.5">
                  Immediate attention may be required
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setView('dispatch')}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs gap-1.5 shrink-0"
            >
              <Truck className="h-3.5 w-3.5" />
              View Dispatch Board
            </Button>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {view === 'overview' && (
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Management Overview</h1>
              <p className="text-muted-foreground text-sm mt-1">Company-wide snapshot and pending reviews</p>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-4">
              {/* Pending Applications */}
              <button
                onClick={() => { setStatusFilter('pending'); setView('applications'); }}
                className="border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left group bg-white border-border"
              >
                <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-lg bg-status-progress/10 flex items-center justify-center mb-2 sm:mb-3">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-status-progress" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-foreground">{metrics.pending}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">Pending Applications</p>
              </button>

              {/* In Onboarding — with stage breakdown badges */}
              {(() => {
                const sb = onboardingStageBreakdown;
                const stageBadges = [
                  { label: 'BG',  count: sb.stage1_background, dotClass: 'bg-muted-foreground',   stageKey: 'Stage 1 — Background',   title: 'Background' },
                  { label: 'Doc', count: sb.stage2_documents,  dotClass: 'bg-status-progress',    stageKey: 'Stage 2 — Documents',    title: 'Documents' },
                  { label: 'ICA', count: sb.stage3_ica,        dotClass: 'bg-gold',               stageKey: 'Stage 3 — ICA',          title: 'ICA Contract' },
                  { label: 'MO',  count: sb.stage4_mo_reg,     dotClass: 'bg-info',               stageKey: 'Stage 4 — MO Reg',       title: 'MO Reg' },
                  { label: 'EQ',  count: sb.stage5_equipment,  dotClass: 'bg-purple-400',         stageKey: 'Stage 5 — Equipment',    title: 'Equipment' },
                  { label: 'Ins', count: sb.stage6_insurance,  dotClass: 'bg-orange-400',         stageKey: 'Stage 6 — Insurance',    title: 'Insurance' },
                  { label: '✓',   count: sb.fully_onboarded,   dotClass: 'bg-status-complete',    stageKey: 'all',                    title: 'Fully Onboarded' },
                ].filter(b => b.count > 0);
                return (
                  <TooltipProvider delayDuration={150}>
                    {/* Use div instead of button so inner badge buttons work correctly */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => { setPipelineCoordinatorFilter('all'); setView('pipeline'); }}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setPipelineCoordinatorFilter('all'); setView('pipeline'); } }}
                      className="border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left cursor-pointer group bg-white border-border"
                    >
                      <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-lg bg-gold/10 flex items-center justify-center mb-2 sm:mb-3">
                        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-gold" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-foreground">{metrics.onboarding}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">In Onboarding</p>
                      {stageBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {stageBadges.map(b => (
                            <Tooltip key={b.stageKey}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold px-1 py-0.5 rounded bg-secondary border border-border text-foreground leading-none hover:bg-secondary/70 transition-colors"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setPipelineStageFilter(b.stageKey !== 'all' ? b.stageKey : 'all');
                                    setPipelineCoordinatorFilter('all');
                                    setView('pipeline');
                                  }}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${b.dotClass}`} />
                                  {b.label} {b.count}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs">{b.title}: {b.count}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      )}
                      {idleOnboardingCount > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 mt-1.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none transition-colors"
                              style={{ background: 'hsl(var(--warning) / 0.12)', borderColor: 'hsl(var(--warning) / 0.4)', color: 'hsl(var(--warning))' }}
                              onClick={e => {
                                e.stopPropagation();
                                setPipelineIdleFilter(true);
                                setPipelineStageFilter('all');
                                setPipelineCoordinatorFilter('all');
                                setView('pipeline');
                              }}
                            >
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              Idle 14d+ {idleOnboardingCount}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            {idleOnboardingCount} operator{idleOnboardingCount !== 1 ? 's' : ''} with no activity in 14+ days
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                );
              })()}

              {/* Active Dispatch */}
              <button
                onClick={() => setView('dispatch')}
                className="border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left group bg-white border-border"
              >
                <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-lg bg-status-complete/10 flex items-center justify-center mb-2 sm:mb-3">
                  <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-status-complete" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-foreground">{metrics.active}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">Active Dispatch</p>
              </button>

              {/* Alerts */}
              <button
                onClick={() => { setPipelineCoordinatorFilter('all'); setView('pipeline'); }}
                className="border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left group bg-white border-border"
              >
                <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-lg bg-destructive/10 flex items-center justify-center mb-2 sm:mb-3">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-foreground">{metrics.alerts}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">Alerts</p>
              </button>

              {/* Critical Expiries */}
              <button
                onClick={() => { setPipelineCoordinatorFilter('all'); setView('pipeline'); }}
                className={`border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left group ${criticalExpiryCount > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-white border-border'}`}
              >
                <div className={`h-8 w-8 sm:h-11 sm:w-11 rounded-lg ${criticalExpiryCount > 0 ? 'bg-destructive/10' : 'bg-muted/30'} flex items-center justify-center mb-2 sm:mb-3`}>
                  <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                </div>
                <p className={`text-2xl sm:text-3xl font-bold ${criticalExpiryCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{criticalExpiryCount}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">Critical Expiries</p>
                {criticalExpiryCount > 0 && <p className="text-[10px] text-destructive/70 mt-1 leading-tight">≤ 30 days</p>}
              </button>
            </div>

            {/* Live Dispatch Breakdown */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">Fleet Status</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full transition-colors duration-300 ${
                      dispatchLiveFlash
                        ? 'bg-status-complete/30 text-status-complete'
                        : 'bg-status-complete/15 text-status-complete'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full bg-status-complete ${dispatchLiveFlash ? 'animate-ping' : 'animate-pulse'}`} />
                    Live
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setView('dispatch')} className="text-xs gap-1 text-muted-foreground h-7 px-2">
                    Open Board <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <TooltipProvider>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
                {[
                  { label: 'Dispatched', key: 'dispatched', value: dispatchBreakdown.dispatched, color: 'text-status-complete', bg: 'bg-status-complete/10' },
                  { label: 'Not Dispatched', key: 'not_dispatched', value: dispatchBreakdown.not_dispatched, color: 'text-muted-foreground', bg: 'bg-muted/30' },
                  { label: 'Home', key: 'home', value: dispatchBreakdown.home, color: 'text-gold', bg: 'bg-gold/10' },
                  { label: 'Truck Down', key: 'truck_down', value: dispatchBreakdown.truck_down, color: dispatchBreakdown.truck_down > 0 ? 'text-destructive' : 'text-muted-foreground', bg: dispatchBreakdown.truck_down > 0 ? 'bg-destructive/10' : 'bg-muted/20' },
                ].map((s) => {
                  const changedAt = dispatchLastChangedAt[s.key];
                  const changedByName = dispatchLastChanged[s.key];
                  const tooltipLabel = changedAt
                    ? new Date(changedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : null;
                  const hasTooltipData = !!(changedByName || tooltipLabel);
                  const triggerText = changedByName ?? (tooltipLabel ? 'Updated' : null);
                  return (
                    <div key={s.label} className={`flex flex-col items-center justify-center py-4 sm:py-5 gap-1 ${s.bg} transition-colors duration-300`}>
                      <span className={`text-2xl sm:text-3xl font-bold tabular-nums transition-all duration-300 ${s.color}`}>{s.value}</span>
                      <span className="text-xs text-muted-foreground font-medium text-center leading-tight">{s.label}</span>
                      {s.label === 'Truck Down' && s.value > 0 && (
                        <span className="mt-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                      )}
                      {hasTooltipData && triggerText && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5 truncate max-w-[80px] text-center cursor-default underline decoration-dotted underline-offset-2">
                              {triggerText}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            {changedByName && tooltipLabel
                              ? `${changedByName} · ${tooltipLabel}`
                              : changedByName
                              ? changedByName
                              : tooltipLabel
                              ? `Last changed ${tooltipLabel}`
                              : 'No details available'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
              </TooltipProvider>
            </div>

            {/* Compliance Summary */}
            {complianceSummary.length > 0 && (
              <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <div>
                      <h2 className="font-semibold text-foreground">Compliance Summary</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Operators with nearest document expiries</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setPipelineCoordinatorFilter('all'); setView('pipeline'); }} className="text-xs gap-1 text-muted-foreground h-7 px-2 shrink-0">
                    View all <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {complianceSummary.map((row, i) => {
                    const isCritical = row.daysUntil <= 30;
                    const isExpired = row.daysUntil < 0;
                    const urgencyColor = isExpired
                      ? 'text-destructive bg-destructive/10 border-destructive/20'
                      : isCritical
                      ? 'text-destructive bg-destructive/10 border-destructive/20'
                      : 'text-gold bg-gold/10 border-gold/20';
                    const label = isExpired
                      ? `Expired ${Math.abs(row.daysUntil)}d ago`
                      : row.daysUntil === 0
                      ? 'Expires today'
                      : `${row.daysUntil}d`;
                    return (
                      <div key={`${row.operatorId}-${row.docType}-${i}`} className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-secondary/30 transition-colors gap-3">
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${urgencyColor}`}>
                            {label}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm truncate">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.docType} · Expires {new Date(row.expiryDate + 'T00:00:00').toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { setSelectedOperatorId(row.operatorId); setView('operator-detail'); }}
                          className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5 transition-colors"
                        >
                          Open <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Staff Workload */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-foreground">Onboarding Staff Workload</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Operator assignments per coordinator</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setView('staff')} className="text-xs gap-1 text-muted-foreground h-7 px-2 shrink-0">
                  Manage Staff <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              {staffWorkload.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No onboarding staff found.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {staffWorkload.map(member => {
                    const count = member.assigned_operator_count;
                    const loadLabel = count >= 7 ? 'Heavy' : count >= 4 ? 'Moderate' : 'Low';
                    const loadColor = count >= 7
                      ? 'text-destructive bg-destructive/10 border-destructive/20'
                      : count >= 4
                      ? 'text-gold bg-gold/10 border-gold/20'
                      : 'text-status-complete bg-status-complete/10 border-status-complete/20';
                    const s = member.stages;
                    const stageRows: { label: string; count: number; dotClass: string }[] = [
                      { label: 'Background (MVR/CH)', count: s.stage1_background, dotClass: 'bg-muted-foreground' },
                      { label: 'Documents',           count: s.stage2_documents,  dotClass: 'bg-status-progress' },
                      { label: 'ICA Contract',        count: s.stage3_ica,        dotClass: 'bg-gold' },
                      { label: 'MO Registration',     count: s.stage4_mo_reg,     dotClass: 'bg-info' },
                      { label: 'Equipment',           count: s.stage5_equipment,  dotClass: 'bg-purple-400' },
                      { label: 'Insurance',           count: s.stage6_insurance,  dotClass: 'bg-orange-400' },
                      { label: 'Fully Onboarded',     count: s.fully_onboarded,   dotClass: 'bg-status-complete' },
                    ].filter(r => r.count > 0);
                    const totalForBar = stageRows.reduce((a, r) => a + r.count, 0);
                    return (
                      <TooltipProvider key={member.user_id} delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => { setPipelineCoordinatorFilter(member.user_id); setPipelineCoordinatorName(member.full_name); setView('pipeline'); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setPipelineCoordinatorFilter(member.user_id); setPipelineCoordinatorName(member.full_name); setView('pipeline'); } }}
                              className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-secondary/50 transition-colors cursor-pointer group"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="min-w-0">
                                    <p className="font-medium text-foreground text-sm truncate">{member.full_name}</p>
                                    {member.lastUpdatedAt && (
                                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                                        Updated {formatDistanceToNowStrict(parseISO(member.lastUpdatedAt), { addSuffix: true })}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${loadColor}`}>{loadLabel}</span>
                                  </div>
                                </div>
                                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                                  {stageRows.length > 0 ? stageRows.map(r => (
                                    <div
                                      key={r.label}
                                      className={`h-full transition-all duration-500 ${r.dotClass}`}
                                      style={{ width: `${(r.count / totalForBar) * 100}%` }}
                                    />
                                  )) : null}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors shrink-0" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="p-0 w-52" sideOffset={6}>
                            <div className="px-3 py-2 border-b border-border">
                              <p className="text-xs font-semibold text-foreground">{member.full_name}</p>
                              <p className="text-[11px] text-muted-foreground">Stage breakdown · {count} operator{count !== 1 ? 's' : ''}</p>
                            </div>
                            {stageRows.length === 0 ? (
                              <div className="px-3 py-2">
                                <p className="text-[11px] text-muted-foreground italic">No operators assigned</p>
                              </div>
                            ) : (
                              <div className="px-3 py-2 space-y-1.5">
                                {stageRows.map(r => (
                                  <div key={r.label} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.dotClass}`} />
                                      <span className="text-[11px] text-muted-foreground truncate">{r.label}</span>
                                    </div>
                                    <span className="text-[11px] font-semibold text-foreground tabular-nums shrink-0">{r.count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                  {unassignedCount > 0 ? (() => {
                    const unassignedStageRows: { label: string; count: number; dotClass: string; barClass: string }[] = [
                      { label: 'Background (MVR/CH)', count: unassignedStages.stage1_background, dotClass: 'bg-muted-foreground',  barClass: 'bg-muted-foreground' },
                      { label: 'Documents',           count: unassignedStages.stage2_documents,  dotClass: 'bg-status-progress',   barClass: 'bg-status-progress' },
                      { label: 'ICA Contract',        count: unassignedStages.stage3_ica,        dotClass: 'bg-gold',              barClass: 'bg-gold' },
                      { label: 'MO Registration',     count: unassignedStages.stage4_mo_reg,     dotClass: 'bg-info',              barClass: 'bg-info' },
                      { label: 'Equipment',           count: unassignedStages.stage5_equipment,  dotClass: 'bg-purple-400',        barClass: 'bg-purple-400' },
                      { label: 'Insurance',           count: unassignedStages.stage6_insurance,  dotClass: 'bg-orange-400',        barClass: 'bg-orange-400' },
                      { label: 'Fully Onboarded',     count: unassignedStages.fully_onboarded,   dotClass: 'bg-status-complete',   barClass: 'bg-status-complete' },
                    ].filter(r => r.count > 0);
                    const totalForBar = unassignedStageRows.reduce((a, r) => a + r.count, 0);
                    const lateStageCount = unassignedStages.stage3_ica + unassignedStages.stage5_equipment + unassignedStages.stage6_insurance;
                    return (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`flex items-center gap-3 px-4 sm:px-5 py-3 cursor-pointer transition-colors group ${lateStageCount > 0 ? 'bg-destructive/5 hover:bg-destructive/10 border-t border-destructive/15' : 'bg-muted/20 hover:bg-muted/40'}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => { setPipelineCoordinatorFilter('unassigned'); setPipelineCoordinatorName('Unassigned operators'); setView('pipeline'); }}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setPipelineCoordinatorFilter('unassigned'); setPipelineCoordinatorName('Unassigned operators'); setView('pipeline'); } }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors font-medium">Unassigned operators</p>
                                    {lateStageCount > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/25 shrink-0">
                                        <TriangleAlert className="h-2.5 w-2.5" />
                                        {lateStageCount} urgent
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold text-muted-foreground tabular-nums shrink-0">{unassignedCount}</span>
                                </div>
                                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                                  {unassignedStageRows.map(r => (
                                    <div
                                      key={r.label}
                                      className={`h-full transition-all duration-500 ${r.barClass}`}
                                      style={{ width: `${(r.count / totalForBar) * 100}%` }}
                                    />
                                  ))}
                                </div>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="p-0 w-52" sideOffset={6}>
                            <div className="px-3 py-2 border-b border-border">
                              <p className="text-xs font-semibold text-foreground">Unassigned operators</p>
                              <p className="text-[11px] text-muted-foreground">Stage breakdown · {unassignedCount} operator{unassignedCount !== 1 ? 's' : ''}</p>
                              {lateStageCount > 0 && (
                                <p className="text-[11px] text-destructive mt-0.5 font-medium">{lateStageCount} at ICA / Equipment / Insurance — needs coordinator</p>
                              )}
                            </div>
                            {unassignedStageRows.length === 0 ? (
                              <div className="px-3 py-2">
                                <p className="text-[11px] text-muted-foreground italic">No stage data available</p>
                              </div>
                            ) : (
                              <div className="px-3 py-2 space-y-1.5">
                                {unassignedStageRows.map(r => (
                                  <div key={r.label} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.dotClass}`} />
                                      <span className="text-[11px] text-muted-foreground truncate">{r.label}</span>
                                    </div>
                                    <span className="text-[11px] font-semibold text-foreground tabular-nums shrink-0">{r.count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })() : (
                    <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-status-complete/10 border-t border-status-complete/20">
                      <p className="text-sm text-status-complete font-medium">All operators assigned ✓</p>
                      <span className="text-xs text-status-complete/70">0 unassigned</span>
                    </div>
                  )}
                </div>
              )}
              {/* Stage color legend — click any chip to filter pipeline to that stage */}
              <div className="px-4 sm:px-5 py-2.5 border-t border-border bg-secondary/20 flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wide mr-1">Filter:</span>
                {[
                  { label: 'Background', dot: 'bg-muted-foreground',  stage: 'Stage 1 — Background',     activeDot: 'bg-muted-foreground',  activeText: 'text-foreground',       activeBg: 'bg-muted/50 border-border' },
                  { label: 'Documents',  dot: 'bg-status-progress',   stage: 'Stage 2 — Documents',      activeDot: 'bg-status-progress',   activeText: 'text-status-progress',  activeBg: 'bg-status-progress/10 border-status-progress/30' },
                  { label: 'ICA',        dot: 'bg-gold',              stage: 'Stage 3 — ICA',            activeDot: 'bg-gold',              activeText: 'text-gold',             activeBg: 'bg-gold/10 border-gold/30' },
                  { label: 'MO Reg',     dot: 'bg-info',              stage: 'Stage 4 — MO Registration',activeDot: 'bg-info',              activeText: 'text-info',             activeBg: 'bg-info/10 border-info/30' },
                  { label: 'Equipment',  dot: 'bg-purple-400',        stage: 'Stage 5 — Equipment',      activeDot: 'bg-purple-400',        activeText: 'text-purple-400',       activeBg: 'bg-purple-400/10 border-purple-400/30' },
                  { label: 'Insurance',  dot: 'bg-orange-400',        stage: 'Stage 6 — Insurance',      activeDot: 'bg-orange-400',        activeText: 'text-orange-400',       activeBg: 'bg-orange-400/10 border-orange-400/30' },
                  { label: 'Onboarded',  dot: 'bg-status-complete',   stage: null,                       activeDot: 'bg-status-complete',   activeText: 'text-status-complete',  activeBg: 'bg-status-complete/10 border-status-complete/30' },
                ].map(item => {
                  const isActive = item.stage !== null && pipelineStageFilter === item.stage;
                  return (
                    <button
                      key={item.label}
                      disabled={item.stage === null}
                      onClick={() => {
                        if (item.stage === null) return;
                        const next = isActive ? 'all' : item.stage;
                        setPipelineStageFilter(next);
                        setPipelineCoordinatorFilter('all');
                        setView('pipeline');
                      }}
                      title={item.stage ? `Filter pipeline: ${item.label}` : 'Onboarded operators'}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all text-[10px] font-medium
                        ${item.stage === null ? 'opacity-50 cursor-default border-transparent' : 'cursor-pointer hover:opacity-80'}
                        ${isActive ? `${item.activeBg} ${item.activeText}` : 'border-transparent text-muted-foreground hover:bg-secondary/60'}`}
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${item.dot}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pending queue preview */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="font-semibold text-foreground">Pending Application Reviews</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingApps.length > 0 ? `${pendingApps.length} application${pendingApps.length !== 1 ? 's' : ''} awaiting decision` : 'All caught up!'}
                  </p>
                </div>
                {pendingApps.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('pending'); setView('applications'); }} className="text-gold text-xs gap-1 shrink-0">
                    View all <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {pendingApps.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-status-complete mx-auto mb-3" />
                  <p className="font-medium text-foreground">All applications reviewed</p>
                  <p className="text-sm text-muted-foreground mt-1">No applications pending review.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {pendingApps.slice(0, 5).map(app => {
                    const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;
                    return (
                      <div key={app.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/30 transition-colors gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">{app.email} · {app.phone ?? 'No phone'}</p>
                          {app.submitted_at && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Submitted {new Date(app.submitted_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedApp(app); }}
                          className="text-xs gap-1.5 shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5" /> Review
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── APPLICATIONS ── */}
        {view === 'applications' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">Application Reviews</h1>
                <p className="text-sm text-muted-foreground mt-1">Review, approve, or deny driver applications</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchApplications} className="gap-1.5 shrink-0" disabled={loadingApps}>
                <RefreshCcw className={`h-3.5 w-3.5 ${loadingApps ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, or phone..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                />
              </div>
              {/* Status tabs */}
              <div className="flex rounded-lg border border-border bg-white overflow-hidden shrink-0">
                {(['pending', 'approved', 'denied', 'all'] as StatusFilter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 sm:px-3 py-2 text-xs font-medium capitalize transition-colors border-r border-border last:border-0 ${
                      statusFilter === s
                        ? 'bg-surface-dark text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                    {s === 'pending' && metrics.pending > 0 && (
                      <span className="ml-1 bg-status-progress text-white text-[10px] px-1.5 py-0.5 rounded-full">{metrics.pending}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Applications list */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              {loadingApps ? (
                <div className="py-16 text-center text-muted-foreground text-sm">Loading applications…</div>
              ) : filteredApps.length === 0 ? (
                <div className="py-16 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No {statusFilter !== 'all' ? statusFilter : ''} applications found</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {/* Table header — hidden on mobile */}
                  <div className="hidden sm:grid grid-cols-12 px-5 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span className="col-span-4">Applicant</span>
                    <span className="col-span-3">Contact</span>
                    <span className="col-span-2">Submitted</span>
                    <span className="col-span-2">Status</span>
                    <span className="col-span-1 text-right">Action</span>
                  </div>

                  {filteredApps.map(app => {
                    const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || '—';
                    return (
                      <div
                        key={app.id}
                        className="cursor-pointer group hover:bg-secondary/20 transition-colors"
                        onClick={() => setSelectedApp(app)}
                      >
                        {/* Desktop row */}
                        <div className="hidden sm:grid grid-cols-12 items-center px-5 py-4">
                          <div className="col-span-4">
                            <p className="text-sm font-medium text-foreground group-hover:text-gold transition-colors">{name}</p>
                            {(app.cdl_state || app.cdl_class) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                CDL {app.cdl_class ?? '?'} · {app.cdl_state ?? '?'}
                              </p>
                            )}
                          </div>
                          <div className="col-span-3">
                            <p className="text-xs text-foreground truncate">{app.email}</p>
                            <p className="text-xs text-muted-foreground">{app.phone ?? '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-foreground">
                              {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <Badge className={`text-xs border ${STATUS_COLORS[app.review_status] ?? ''}`}>
                              {app.review_status}
                            </Badge>
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-gold transition-colors" />
                          </div>
                        </div>
                        {/* Mobile card */}
                        <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-foreground group-hover:text-gold transition-colors truncate">{name}</p>
                              <Badge className={`text-[10px] border px-1.5 py-0 shrink-0 ${STATUS_COLORS[app.review_status] ?? ''}`}>
                                {app.review_status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{app.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {app.phone ?? 'No phone'}{app.submitted_at ? ` · ${new Date(app.submitted_at).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-gold transition-colors shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {filteredApps.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                Showing {filteredApps.length} application{filteredApps.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {/* ── PIPELINE ── */}
        {view === 'pipeline' && (
          <PipelineDashboard
            onOpenOperator={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }}
            onOpenOperatorWithFocus={async (operatorId, focusField) => {
              setSelectedOperatorId(operatorId);
              setView('operator-detail');
              // Fetch the application and open the review drawer focused on the expiry field
              const { data: op } = await supabase
                .from('operators')
                .select('application_id, applications(*)')
                .eq('id', operatorId)
                .single();
              if (op?.applications) {
                setSelectedApp(op.applications as FullApplication);
                setDrawerFocusField(focusField);
              }
            }}
            complianceRefreshKey={complianceRefreshKey}
            initialCoordinatorFilter={pipelineCoordinatorFilter}
            initialCoordinatorName={pipelineCoordinatorName ?? undefined}
            initialStageFilter={pipelineStageFilter}
            initialIdleFilter={pipelineIdleFilter}
          />
        )}

        {view === 'operator-detail' && selectedOperatorId && (
          <OperatorDetailPanel
            operatorId={selectedOperatorId}
            onBack={() => { setOperatorHasUnsavedChanges(false); setView('pipeline'); }}
            onUnsavedChangesChange={setOperatorHasUnsavedChanges}
            expiryOverride={panelExpiryOverride}
            onOpenAppReview={async (focusField) => {
              const { data: op } = await supabase
                .from('operators')
                .select('application_id, applications(*)')
                .eq('id', selectedOperatorId)
                .single();
              if (op?.applications) {
                setSelectedApp(op.applications as FullApplication);
                setDrawerFocusField(focusField);
              }
            }}
          />
        )}

        {view === 'dispatch' && (
          <DispatchPortal embedded />
        )}

        {view === 'staff' && (
          <StaffDirectory />
        )}

        {view === 'activity' && (
          <ActivityLog onNavigate={(action) => {
            if (action.type === 'operator' && action.operatorId) {
              setSelectedOperatorId(action.operatorId);
              setView('operator-detail');
            } else if (action.type === 'staff') {
              setView('staff');
            }
          }} />
        )}

        {view === 'faq' && (
          <FaqManager />
        )}

        {view === 'resources' && (
          <ResourceLibraryManager />
        )}

        {view === 'docs-hub' && (
          <DocumentHub isAdmin={true} />
        )}

        {view === 'notifications' && (
          <NotificationHistory />
        )}
      </StaffLayout>

      {/* Application Review Drawer (rendered outside layout to overlay correctly) */}
      {selectedApp && (
        <ApplicationReviewDrawer
          app={selectedApp}
          onClose={() => { setSelectedApp(null); setDrawerFocusField(undefined); }}
          onApprove={handleApprove}
          onDeny={handleDeny}
          onExpiryUpdated={async () => {
            setComplianceRefreshKey(k => k + 1);
            // Re-fetch fresh app data and push updated expiry dates into the panel
            const { data: fresh } = await supabase
              .from('applications')
              .select('*')
              .eq('id', selectedApp.id)
              .single();
            if (fresh) {
              setSelectedApp(fresh as FullApplication);
              setPanelExpiryOverride({
                cdl: (fresh as any).cdl_expiration ?? null,
                medcert: (fresh as any).medical_cert_expiration ?? null,
              });
            }
          }}
          focusField={drawerFocusField}
        />
      )}

      <AlertDialog open={!!pendingNavPath} onOpenChange={(open) => { if (!open) setPendingNavPath(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this operator. If you leave now, your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavPath(null)}>Stay & Save</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmNavigation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Without Saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
