import { useState, useEffect, useCallback, useRef } from 'react';
import NotificationPreferencesModal from '@/components/management/NotificationPreferencesModal';
import InviteApplicantModal from '@/components/management/InviteApplicantModal';
import StaffApplicationModal from '@/components/management/StaffApplicationModal';
import { useSearchParams } from 'react-router-dom';
import StaffLayout from '@/components/layouts/StaffLayout';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PipelineDashboard from '../staff/PipelineDashboard';
import OperatorDetailPanel from '../staff/OperatorDetailPanel';
import ApplicationReviewDrawer, { type FullApplication } from '@/components/management/ApplicationReviewDrawer';
import StaffDirectory from '@/components/management/StaffDirectory';
import FaqManager from '@/components/management/FaqManager';
import ResourceLibraryManager from '@/components/management/ResourceLibraryManager';
import PipelineConfigEditor from '@/components/management/PipelineConfigEditor';
import ActivityLog from '@/components/management/ActivityLog';
import ApplicationErrorsPanel from '@/components/management/ApplicationErrorsPanel';
import NotificationHistory from '@/components/management/NotificationHistory';
import DispatchPortal from '../dispatch/DispatchPortal';
import MessagesView from '@/components/staff/MessagesView';
import BulkMessageModal from '@/components/staff/BulkMessageModal';
import ComplianceAlertsPanel from '@/components/inspection/ComplianceAlertsPanel';
import InspectionComplianceSummary from '@/components/inspection/InspectionComplianceSummary';
import { ScrollJumpButton } from '@/components/ui/ScrollJumpButton';
import {
  LayoutDashboard, Users, ClipboardList, Truck, UserPlus, HelpCircle, BookOpen,
  CheckCircle2, Clock, AlertTriangle, ChevronRight, ShieldAlert,
  Search, RefreshCcw, Eye, ScrollText, TriangleAlert, Settings2, BellRing, Library, Shield, Users2, AlertCircle, FileX,
  MailPlus, Send, Trash2, RotateCcw, Phone, Mail, Loader2, FileText,
  MessageSquare, ShieldCheck, XCircle, BellOff, HardDrive, GraduationCap, Car, LayoutTemplate, Megaphone, Container, Pen, FileSignature, Smartphone, Briefcase,
} from 'lucide-react';
import FleetRoster from '@/components/fleet/FleetRoster';
import FleetDetailDrawer from '@/components/fleet/FleetDetailDrawer';
import EquipmentInventory from '@/components/equipment/EquipmentInventory';
import MoPlateRegistry from '@/components/mo-plates/MoPlateRegistry';
import DocumentHub from '@/components/documents/DocumentHub';
import EmailCatalog from '@/components/management/EmailCatalog';
import FormsCatalog from '@/components/management/FormsCatalog';
import ServiceLibraryManager from '@/components/service-library/ServiceLibraryManager';
import ReleaseNotesManager from '@/components/management/ReleaseNotesManager';
import OperatorBroadcast from '@/components/management/OperatorBroadcast';
import CarrierSignatureSettings from '@/components/ica/CarrierSignatureSettings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TerminationsView from './TerminationsView';
import InspectionBinderAdmin from '@/components/inspection/InspectionBinderAdmin';
import DriverHubView from '@/components/drivers/DriverHubView';
import PendingInviteAcceptance from '@/components/management/PendingInviteAcceptance';
import { PwaReminderPreviewModal } from '@/components/management/PwaReminderPreviewModal';
import PEIQueuePanel from '@/components/pei/PEIQueuePanel';
import type { ComplianceCounts, ComplianceFilter } from '@/components/drivers/DriverRoster';
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

type ManagementView = 'overview' | 'pipeline' | 'operator-detail' | 'applications' | 'dispatch' | 'staff' | 'faq' | 'resource-center' | 'activity' | 'notifications' | 'docs-hub' | 'inspection-binder' | 'drivers' | 'pipeline-config' | 'messages' | 'compliance' | 'equipment' | 'email-catalog' | 'content-manager' | 'forms-catalog' | 'mo-plates' | 'whats-new' | 'vehicle-hub' | 'vehicle-detail' | 'carrier-signature' | 'terminations' | 'broadcast' | 'app-errors' | 'pei-queue';
type StatusFilter = 'pending' | 'revisions_requested' | 'approved' | 'denied' | 'all' | 'invited';

type ApplicationInvite = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  invited_by: string;
  invited_by_name: string | null;
  email_sent: boolean;
  email_error: string | null;
  resent_at: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress border-status-progress/30',
  approved: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  denied: 'bg-destructive/15 text-destructive border-destructive/30',
  revisions_requested: 'bg-status-progress/15 text-status-progress border-status-progress/30',
};

export default function ManagementPortal() {
  const { toast } = useToast();
  const { session } = useAuth();
  const { isDemo, enterDemo, exitDemo, guardDemo } = useDemoMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<ManagementView>(() => {
    const v = searchParams.get('view') as ManagementView | null;
    return (v && ['overview','pipeline','operator-detail','applications','dispatch','staff','faq','resource-center','activity','notifications','docs-hub','inspection-binder','drivers','pipeline-config','messages','compliance','equipment','email-catalog','content-manager','forms-catalog','mo-plates','whats-new','vehicle-hub','carrier-signature','terminations','broadcast','app-errors','pei-queue'].includes(v)) ? v : 'overview';
  });
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [scrollToStageKeyMgmt, setScrollToStageKeyMgmt] = useState<string | undefined>(undefined);
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const [applications, setApplications] = useState<FullApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get('status') as StatusFilter | null;
    return (s && ['pending','revisions_requested','approved','denied','all','invited'].includes(s)) ? s : 'pending';
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
  const [dispatchDefaultFilter, setDispatchDefaultFilter] = useState<'all' | 'dispatched' | 'not_dispatched' | 'home' | 'truck_down'>('all');
  const [dispatchLiveFlash, setDispatchLiveFlash] = useState(false);
  const [panelExpiryOverride, setPanelExpiryOverride] = useState<{ cdl: string | null; medcert: string | null } | undefined>(undefined);

  // Invite state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invites, setInvites] = useState<ApplicationInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deleteInviteId, setDeleteInviteId] = useState<string | null>(null);

  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [staffAppModalOpen, setStaffAppModalOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState(0);
  const [drawerFocusField, setDrawerFocusField] = useState<'cdl' | 'medcert' | undefined>(undefined);
  type ComplianceRow = { operatorId: string; name: string; daysUntil: number; docType: 'CDL' | 'Med Cert'; expiryDate: string };
  const [complianceSummary, setComplianceSummary] = useState<ComplianceRow[]>([]);
  const [driverComplianceCounts, setDriverComplianceCounts] = useState<ComplianceCounts>({ expired: 0, critical: 0, warning: 0, neverRenewed: 0, notYetReminded: 0, webOnly: 0, neverSignedIn: 0 });
  const [driverComplianceFilter, setDriverComplianceFilter] = useState<ComplianceFilter>('all');
  const [staffWorkload, setStaffWorkload] = useState<StaffWorkload[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [unassignedStages, setUnassignedStages] = useState<StageBreakdown>({ stage1_background: 0, stage2_documents: 0, stage3_ica: 0, stage4_mo_reg: 0, stage5_equipment: 0, stage6_insurance: 0, fully_onboarded: 0 });
  const [onboardingStageBreakdown, setOnboardingStageBreakdown] = useState<StageBreakdown>({ stage1_background: 0, stage2_documents: 0, stage3_ica: 0, stage4_mo_reg: 0, stage5_equipment: 0, stage6_insurance: 0, fully_onboarded: 0 });
  const [idleOnboardingCount, setIdleOnboardingCount] = useState(0);
  const [pipelineIdleFilter, setPipelineIdleFilter] = useState(false);
  const [pipelineCoordinatorFilter, setPipelineCoordinatorFilter] = useState<string>('all');
  const [pipelineCoordinatorName, setPipelineCoordinatorName] = useState<string | null>(null);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string>('all');

  // Messages state
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [bulkMessagePreselected, setBulkMessagePreselected] = useState<string[]>([]);
  const viewRef = useRef(view);

  // Compliance panel state
  const alertsPanelRef = useRef<HTMLDivElement>(null);
  const [alertsPanelHighlight, setAlertsPanelHighlight] = useState<'warning' | 'destructive' | 'muted' | false>(false);
  const [alertsPanelNoAction, setAlertsPanelNoAction] = useState(false);
  const [expiredCount, setExpiredCount] = useState(0);
  const [noReminderCount, setNoReminderCount] = useState(0);

  // App install tracking (operator PWA installs)
  const [installStats, setInstallStats] = useState<{ installed: number; webOnly: number; neverSignedIn: number; total: number }>({ installed: 0, webOnly: 0, neverSignedIn: 0, total: 0 });
  const [installSendOpen, setInstallSendOpen] = useState(false);
  const [installSending, setInstallSending] = useState(false);
  const [installPreviewOpen, setInstallPreviewOpen] = useState(false);

  // One-shot deep-link migration on mount (e.g. notification ?op=... links).
  // Initial state was already seeded from the URL by the lazy useState above.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const op = params.get('op');
    if (op) {
      setSelectedOperatorId(op);
      setView('operator-detail');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Writer: persist current view/operator/status to the URL so browser refresh
  // restores the section. Reads the URL imperatively and does NOT depend on
  // searchParams, so it can never feed back into itself.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (view && view !== 'overview') next.set('view', view); else next.delete('view');
    if (view === 'operator-detail' && selectedOperatorId) next.set('op', selectedOperatorId); else next.delete('op');
    if (view === 'applications' && statusFilter && statusFilter !== 'pending') next.set('status', statusFilter); else if (view !== 'applications') next.delete('status');
    const current = window.location.search.replace(/^\?/, '');
    if (next.toString() !== current) {
      setSearchParams(next, { replace: true });
    }
  }, [view, selectedOperatorId, statusFilter, setSearchParams]);


  const fetchTruckDownCount = useCallback(async () => {
    const { data } = await supabase
      .from('active_dispatch')
      .select('operator_id, operators!inner(excluded_from_dispatch, onboarding_status(fully_onboarded))')
      .eq('dispatch_status', 'truck_down');
    const count = (data ?? []).filter((row: any) => {
      if (row.operators?.excluded_from_dispatch === true) return false;
      const os = row.operators?.onboarding_status;
      const status = Array.isArray(os) ? os[0] : os;
      return status?.fully_onboarded === true;
    }).length;
    setTruckDownCount(count);
  }, []);

  const fetchDispatchBreakdown = useCallback(async () => {
    const { data } = await supabase
      .from('active_dispatch')
      .select('dispatch_status, updated_by, updated_at, operators!inner(excluded_from_dispatch, onboarding_status(fully_onboarded))')
      .order('updated_at', { ascending: false });
    if (!data) return;

    const breakdown = { not_dispatched: 0, dispatched: 0, home: 0, truck_down: 0 };
    // Track the most-recently-updated row per status
    const latestUpdatedBy: Record<string, string | null> = { not_dispatched: null, dispatched: null, home: null, truck_down: null };
    const latestUpdatedAt: Record<string, string | null> = { not_dispatched: null, dispatched: null, home: null, truck_down: null };
    const seenStatus = new Set<string>();

    for (const row of data) {
      // Skip operators excluded from the Dispatch Hub
      if ((row as any).operators?.excluded_from_dispatch === true) continue;
      // Only count fully-onboarded operators (matches Dispatch Board visibility)
      const os = (row as any).operators?.onboarding_status;
      const onboardingStatus = Array.isArray(os) ? os[0] : os;
      if (!onboardingStatus?.fully_onboarded) continue;

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
    const [{ data }, { data: reminders }] = await Promise.all([
      supabase
        .from('operators')
        .select('id, onboarding_status(fully_onboarded), applications(first_name, last_name, cdl_expiration, medical_cert_expiration)')
        .not('application_id', 'is', null),
      supabase.from('cert_reminders').select('operator_id, doc_type'),
    ]);
    if (!data) return;
    const today = startOfDay(new Date());
    let count = 0;
    let expired = 0;
    let noReminder = 0;
    const remindedKeys = new Set<string>();
    (reminders ?? []).forEach((r: any) => remindedKeys.add(`${r.operator_id}|${r.doc_type}`));
    const rows: ComplianceRow[] = [];
    const driverCounts: ComplianceCounts = { expired: 0, critical: 0, warning: 0, neverRenewed: 0, notYetReminded: 0, webOnly: 0, neverSignedIn: 0 };

    (data as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const isFullyOnboarded = os?.fully_onboarded === true;
      const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || 'Unknown';
      const docs: { field: string; label: 'CDL' | 'Med Cert'; docType: string }[] = [
        { field: 'cdl_expiration', label: 'CDL', docType: 'CDL' },
        { field: 'medical_cert_expiration', label: 'Med Cert', docType: 'Medical Cert' },
      ];
      docs.forEach(({ field, label, docType }) => {
        const dateStr: string | null = app[field];
        if (!dateStr) {
          if (isFullyOnboarded) driverCounts.neverRenewed++;
          return;
        }
        const days = differenceInDays(startOfDay(parseISO(dateStr)), today);
        if (days < 0) expired++;
        if (days <= 30) count++;
        if (days <= 90) {
          rows.push({ operatorId: op.id, name, daysUntil: days, docType: label, expiryDate: dateStr });
        }
        const key = `${op.id}|${docType}`;
        if (days <= 30 && !remindedKeys.has(key)) noReminder++;
        if (isFullyOnboarded) {
          if (days < 0) driverCounts.expired++;
          else if (days <= 30) driverCounts.critical++;
          else if (days <= 90) driverCounts.warning++;
        }
      });
    });
    rows.sort((a, b) => a.daysUntil - b.daysUntil);
    setCriticalExpiryCount(count);
    setExpiredCount(expired);
    setNoReminderCount(noReminder);
    setComplianceSummary(rows.slice(0, 5));
    setDriverComplianceCounts(driverCounts);
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
    const ch1 = supabase
      .channel('mgmt-critical-expiry-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        fetchCriticalExpiries();
      })
      .subscribe();
    const ch2 = supabase
      .channel('mgmt-critical-expiry-reminders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cert_reminders' }, () => {
        fetchCriticalExpiries();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchCriticalExpiries]);

  // Clear badge when visiting notifications/messages view
  useEffect(() => {
    viewRef.current = view;
    if (view === 'notifications') setUnreadNotifCount(0);
    if (view === 'messages') setUnreadMsgCount(0);
  }, [view]);

  // Fetch initial unread message count
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', session.user.id)
      .is('read_at', null)
      .then(({ count }) => setUnreadMsgCount(count ?? 0));
  }, [session?.user?.id]);

  // Realtime: increment message badge
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('mgmt-unread-msg-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${session.user.id}`,
      }, () => {
        if (viewRef.current !== 'messages') {
          setUnreadMsgCount(prev => prev + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

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
      .select('id, assigned_onboarding_staff, onboarding_status(mvr_ch_approval, form_2290, truck_title, truck_photos, truck_inspection, ica_status, mo_reg_received, decal_applied, eld_installed, eld_exempt, fuel_card_issued, insurance_added_date, fully_onboarded, updated_at)');

    // Helper: compute which stage an operator is currently on (first incomplete)
    const getStage = (os: any): keyof StageBreakdown => {
      if (!os) return 'stage1_background';
      if (os.fully_onboarded) return 'fully_onboarded';
      const docsComplete = os.form_2290 === 'received' && os.truck_title === 'received' && os.truck_photos === 'received' && os.truck_inspection === 'received';
      const icaComplete = os.ica_status === 'complete';
      const moComplete = os.mo_reg_received === 'yes';
      const equipComplete = os.decal_applied === 'yes' && os.fuel_card_issued === 'yes' && (os.eld_exempt === true || os.eld_installed === 'yes');
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
      supabase.from('operators').select('id, onboarding_status!inner(fully_onboarded)', { count: 'exact', head: true }).or('fully_onboarded.is.null,fully_onboarded.eq.false', { referencedTable: 'onboarding_status' }),
      supabase.from('active_dispatch').select('id, operators!inner(excluded_from_dispatch)', { count: 'exact' }).eq('operators.excluded_from_dispatch', false),
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
    // 'invited' tab is handled separately — don't query applications table
    if (statusFilter === 'invited') return;
    setLoadingApps(true);
    let query = supabase
      .from('applications')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (statusFilter === 'all') {
      // Show submitted apps + any awaiting revisions
      query = query.or('is_draft.eq.false,review_status.eq.revisions_requested');
    } else if (statusFilter === 'revisions_requested') {
      query = query.eq('review_status', 'revisions_requested');
    } else {
      query = query.eq('is_draft', false).eq('review_status', statusFilter as 'pending' | 'approved' | 'denied');
    }

    const { data } = await query;
    setApplications((data as FullApplication[]) ?? []);
    setLoadingApps(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Fetch PWA install stats for the Overview "App Install Status" card
  const fetchInstallStats = useCallback(async () => {
    const { data } = await supabase
      .from('operators')
      .select('id, pwa_installed_at, last_web_seen_at')
      .eq('is_active', true);
    const rows = (data as Array<{ id: string; pwa_installed_at: string | null; last_web_seen_at: string | null }> | null) ?? [];
    const installed = rows.filter(r => !!r.pwa_installed_at).length;
    const webOnly = rows.filter(r => !r.pwa_installed_at && !!r.last_web_seen_at).length;
    const neverSignedIn = rows.filter(r => !r.pwa_installed_at && !r.last_web_seen_at).length;
    setInstallStats({ installed, webOnly, neverSignedIn, total: rows.length });
  }, []);

  useEffect(() => {
    if (view === 'overview') fetchInstallStats();
  }, [view, fetchInstallStats]);

  const handleBulkInstallSend = useCallback(async () => {
    setInstallSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-pwa-install', { body: {} });
      if (error) throw error;
      const notified = (data as any)?.notified ?? 0;
      const skipped = (data as any)?.skipped ?? 0;
      toast({
        title: 'Install instructions sent',
        description: `Notified ${notified} operator${notified === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (sent within last 24h)` : ''}.`,
      });
      fetchInstallStats();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message ?? 'Could not send install instructions.', variant: 'destructive' });
    } finally {
      setInstallSending(false);
      setInstallSendOpen(false);
    }
  }, [toast, fetchInstallStats]);

  useEffect(() => {
    if (view === 'applications' || view === 'overview') {
      fetchApplications();
    }
  }, [view, fetchApplications]);

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    const { data } = await supabase
      .from('application_invites')
      .select('*')
      .order('created_at', { ascending: false });
    setInvites((data as ApplicationInvite[]) ?? []);
    setLoadingInvites(false);
  }, []);

  useEffect(() => {
    if (view === 'applications' && statusFilter === 'invited') {
      fetchInvites();
    }
  }, [view, statusFilter, fetchInvites]);

  const handleResendInvite = async (invite: ApplicationInvite) => {
    setResendingId(invite.id);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session: s } } = await supabase.auth.getSession();
      const authToken = s?.access_token ?? anonKey;
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-applicant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, 'apikey': anonKey },
        body: JSON.stringify({
          first_name: invite.first_name,
          last_name: invite.last_name,
          email: invite.email,
          phone: invite.phone,
          note: invite.note,
          invite_id: invite.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);
      toast({ title: '✅ Invite Resent', description: `Invite email resent to ${invite.email}.` });
      fetchInvites();
    } catch (err: unknown) {
      toast({ title: 'Resend Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    await supabase.from('application_invites').delete().eq('id', id);
    setDeleteInviteId(null);
    fetchInvites();
    toast({ title: 'Invite deleted' });
  };



  const handleApprove = async (appId: string, notes: string, options?: { skipInvite?: boolean }) => {
    try {
      const { data, error } = await supabase.functions.invoke('invite-operator', {
        body: { application_id: appId, reviewer_notes: notes || null, skip_invite: options?.skipInvite ? true : undefined },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: options?.skipInvite ? '✅ Corrections Re-approved' : '✅ Application Approved',
        description: options?.skipInvite
          ? 'The corrected application is approved. The operator continues onboarding — no new invite was sent.'
          : 'An invitation email has been sent. The operator record has been created.',
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
    if (path === '__demo__') {
      if (isDemo) exitDemo(); else enterDemo();
      return;
    }
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
    { label: 'Overview',          icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview',          dividerBefore: 'Dashboard' },
    { label: 'Applications',      icon: <ClipboardList className="h-4 w-4" />,   path: 'applications' },
    { label: 'Applicant Pipeline', icon: <Users className="h-4 w-4" />,          path: 'pipeline',          badge: criticalExpiryCount || undefined },
    { label: 'PEI Queue',         icon: <Briefcase className="h-4 w-4" />,       path: 'pei-queue' },
    { label: 'Messages',          icon: <MessageSquare className="h-4 w-4" />,   path: 'messages',          badge: unreadMsgCount },
    { label: 'Notifications',     icon: <BellRing className="h-4 w-4" />,        path: 'notifications',     badge: unreadNotifCount },
    { label: 'Compliance',        icon: <ShieldCheck className="h-4 w-4" />,     path: 'compliance',        badge: criticalExpiryCount || undefined, dividerBefore: 'Operations' },
    { label: 'Dispatch Board',    icon: <Container className="h-4 w-4" />,      path: 'dispatch',          badge: truckDownCount || undefined },
    { label: 'Driver Hub',        icon: <Users2 className="h-4 w-4" />,          path: 'drivers' },
    { label: 'Vehicle Hub',       icon: <Truck className="h-4 w-4" />,           path: 'vehicle-hub' },
    { label: 'Inspection Binder', icon: <Shield className="h-4 w-4" />,          path: 'inspection-binder' },
    { label: 'Document Hub',      icon: <Library className="h-4 w-4" />,         path: 'docs-hub' },
    { label: 'Resource Center',   icon: <BookOpen className="h-4 w-4" />,         path: 'resource-center',   dividerBefore: 'Admin' },
    { label: 'Staff',             icon: <UserPlus className="h-4 w-4" />,        path: 'staff' },
    { label: 'FAQ Manager',       icon: <HelpCircle className="h-4 w-4" />,      path: 'faq' },
    { label: 'Pipeline Config',   icon: <Settings2 className="h-4 w-4" />,       path: 'pipeline-config' },
    { label: 'Activity',          icon: <ScrollText className="h-4 w-4" />,      path: 'activity' },
    { label: 'Application Errors', icon: <AlertTriangle className="h-4 w-4" />, path: 'app-errors' },
    { label: 'Equipment',         icon: <HardDrive className="h-4 w-4" />,       path: 'equipment' },
    { label: 'MO Plate Registry', icon: <Car className="h-4 w-4" />,             path: 'mo-plates' },
    { label: 'Content Manager',   icon: <LayoutTemplate className="h-4 w-4" />,  path: 'content-manager' },
    { label: 'Forms Catalog',     icon: <FileText className="h-4 w-4" />,         path: 'forms-catalog' },
    { label: "What's New",        icon: <Megaphone className="h-4 w-4" />,        path: 'whats-new' },
    { label: 'Broadcast Email',   icon: <Mail className="h-4 w-4" />,             path: 'broadcast' },
    { label: 'Carrier Signature', icon: <Pen className="h-4 w-4" />,             path: 'carrier-signature' },
    { label: 'Terminations',      icon: <FileSignature className="h-4 w-4" />,   path: 'terminations' },
    { label: 'Demo Mode',         icon: <GraduationCap className="h-4 w-4" />,   path: '__demo__' },
  ];

  // Bottom nav on mobile: 5 priority items that fit cleanly at 375px
  const mobileNavItems = [
    { label: 'Overview',      icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Pipeline',      icon: <Users className="h-4 w-4" />,           path: 'pipeline', badge: criticalExpiryCount || undefined },
    { label: 'Messages',      icon: <MessageSquare className="h-4 w-4" />,   path: 'messages', badge: unreadMsgCount },
    { label: 'Compliance',    icon: <ShieldCheck className="h-4 w-4" />,     path: 'compliance', badge: criticalExpiryCount || undefined },
    { label: 'Notifs',        icon: <BellRing className="h-4 w-4" />,        path: 'notifications', badge: unreadNotifCount },
  ];

  return (
    <>
      <NotificationPreferencesModal open={notifPrefsOpen} onClose={() => setNotifPrefsOpen(false)} />
      <StaffApplicationModal
        open={staffAppModalOpen}
        onClose={() => setStaffAppModalOpen(false)}
        onSuccess={() => fetchApplications()}
      />
      <BulkMessageModal
        open={bulkMessageOpen}
        onClose={() => { setBulkMessageOpen(false); setBulkMessagePreselected([]); }}
        preselectedIds={bulkMessagePreselected}
      />
      <StaffLayout
        navItems={navItems}
        mobileNavItems={mobileNavItems}
        currentPath={view}
        onNavigate={handleNavigate}
        title="Management"
        notificationsPath="/dashboard?view=notifications"
        isDemo={isDemo}
        onExitDemo={exitDemo}
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
        {/* ── OVERVIEW ── */}
        {view === 'overview' && (
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Management Overview</h1>
              <p className="text-muted-foreground text-sm mt-1">Company-wide snapshot and pending reviews</p>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-4">
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

              {/* Active Drivers */}
              <TooltipProvider delayDuration={150}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { setDriverComplianceFilter('all'); setView('drivers'); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setDriverComplianceFilter('all'); setView('drivers'); } }}
                  className="border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left cursor-pointer group bg-white border-border"
                >
                  <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-lg bg-primary/10 flex items-center justify-center mb-2 sm:mb-3">
                    <Users2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{onboardingStageBreakdown.fully_onboarded}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">Active Drivers</p>
                  {onboardingStageBreakdown.fully_onboarded > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {([
                        { key: 'dispatched',     label: 'On Road',   dotClass: 'bg-status-complete' },
                        { key: 'home',           label: 'Home',      dotClass: 'bg-info' },
                        { key: 'not_dispatched', label: 'Available', dotClass: 'bg-muted-foreground' },
                        { key: 'truck_down',     label: 'Down',      dotClass: 'bg-destructive' },
                      ] as const).map(({ key, label, dotClass }) => {
                        const count = dispatchBreakdown[key];
                        if (!count) return null;
                        return (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold px-1 py-0.5 rounded bg-secondary border border-border text-foreground leading-none"
                              >
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                                {count}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">{label}: {count}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                  {/* Compliance chips — only show when there are issues */}
                  {(driverComplianceCounts.expired > 0 || driverComplianceCounts.critical > 0 || driverComplianceCounts.warning > 0 || driverComplianceCounts.neverRenewed > 0) && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-border/60">
                      {driverComplianceCounts.expired > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setDriverComplianceFilter('expired'); setView('drivers'); }}
                              className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none transition-colors"
                              style={{ background: 'hsl(var(--destructive) / 0.12)', borderColor: 'hsl(var(--destructive) / 0.35)', color: 'hsl(var(--destructive))' }}
                            >
                              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                              {driverComplianceCounts.expired} exp
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">{driverComplianceCounts.expired} driver{driverComplianceCounts.expired !== 1 ? 's' : ''} with expired CDL or Med Cert</TooltipContent>
                        </Tooltip>
                      )}
                      {driverComplianceCounts.critical > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setDriverComplianceFilter('critical'); setView('drivers'); }}
                              className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none transition-colors"
                              style={{ background: 'hsl(var(--destructive) / 0.12)', borderColor: 'hsl(var(--destructive) / 0.35)', color: 'hsl(var(--destructive))' }}
                            >
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                              {driverComplianceCounts.critical} crit
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">{driverComplianceCounts.critical} driver{driverComplianceCounts.critical !== 1 ? 's' : ''} expiring within 30 days</TooltipContent>
                        </Tooltip>
                      )}
                      {driverComplianceCounts.warning > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setDriverComplianceFilter('warning'); setView('drivers'); }}
                              className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none transition-colors"
                              style={{ background: 'hsl(var(--warning) / 0.12)', borderColor: 'hsl(var(--warning) / 0.4)', color: 'hsl(var(--warning))' }}
                            >
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              {driverComplianceCounts.warning} warn
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">{driverComplianceCounts.warning} driver{driverComplianceCounts.warning !== 1 ? 's' : ''} expiring within 90 days</TooltipContent>
                        </Tooltip>
                      )}
                      {driverComplianceCounts.neverRenewed > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setDriverComplianceFilter('never_renewed'); setView('drivers'); }}
                              className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none transition-colors"
                              style={{ background: 'hsl(var(--destructive) / 0.08)', borderColor: 'hsl(var(--destructive) / 0.25)', color: 'hsl(var(--destructive))' }}
                            >
                              <FileX className="h-2.5 w-2.5 shrink-0" />
                              {driverComplianceCounts.neverRenewed} miss
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">{driverComplianceCounts.neverRenewed} driver{driverComplianceCounts.neverRenewed !== 1 ? 's' : ''} missing expiration dates</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              </TooltipProvider>

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
                    <button
                      key={s.label}
                      onClick={() => {
                        setDispatchDefaultFilter(s.key as 'dispatched' | 'not_dispatched' | 'home' | 'truck_down');
                        setView('dispatch');
                      }}
                      className={`flex flex-col items-center justify-center py-4 sm:py-5 gap-1 ${s.bg} transition-colors duration-200 w-full cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
                      title={`View ${s.label} operators on the Dispatch Board`}
                    >
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
                    </button>
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

            {/* App Install Status */}
            {(() => {
              const { installed, webOnly, neverSignedIn, total } = installStats;
              const remaining = Math.max(0, total - installed);
              const pct = total > 0 ? Math.round((installed / total) * 100) : 0;
              return (
                <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                        <Smartphone className="h-4 w-4 text-gold" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-foreground">App Install Status</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {total === 0
                            ? 'No active operators yet.'
                            : `${installed} of ${total} active operator${total === 1 ? '' : 's'} have installed SUPERDRIVE`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setInstallPreviewOpen(true)}
                        className="text-xs gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview message
                      </Button>
                      {remaining > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { if (guardDemo()) return; setInstallSendOpen(true); }}
                          className="text-xs gap-1.5"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Email install instructions to remaining {remaining}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="px-4 sm:px-5 py-4">
                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-gold transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{pct}% installed</span>
                      {remaining === 0 && total > 0 && (
                        <span className="inline-flex items-center gap-1 text-status-complete font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> All operators installed
                        </span>
                      )}
                    </div>
                    {total > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border">
                        <div className="text-center">
                          <div className="text-base font-semibold text-emerald-600">{installed}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">Installed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-base font-semibold text-amber-600">{webOnly}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">Web only</div>
                        </div>
                        <div className="text-center">
                          <div className="text-base font-semibold text-muted-foreground">{neverSignedIn}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">Never signed in</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Pending Invite Acceptance — recovery panel for stuck applicants */}
            <PendingInviteAcceptance onResent={fetchInstallStats} />

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
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">Applications</h1>
                <p className="text-sm text-muted-foreground mt-1">Review applications and manage outreach invites</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStaffAppModalOpen(true)}
                  className="gap-1.5"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  New Application
                </Button>
                <Button
                  size="sm"
                  onClick={() => setInviteModalOpen(true)}
                  className="gap-1.5"
                >
                  <MailPlus className="h-3.5 w-3.5" />
                  Invite Someone
                </Button>
                {statusFilter !== 'invited' && (
                  <Button variant="outline" size="sm" onClick={fetchApplications} className="gap-1.5" disabled={loadingApps}>
                    <RefreshCcw className={`h-3.5 w-3.5 ${loadingApps ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              {statusFilter !== 'invited' && (
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
              )}
              {/* Status tabs */}
              <div className="flex rounded-lg border border-border bg-white overflow-hidden shrink-0">
                {(['pending', 'revisions_requested', 'approved', 'denied', 'all', 'invited'] as StatusFilter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 sm:px-3 py-2 text-xs font-medium capitalize transition-colors border-r border-border last:border-0 ${
                      statusFilter === s
                        ? 'bg-surface-dark text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    {s === 'all'
                      ? 'All'
                      : s === 'revisions_requested'
                      ? 'Revisions'
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                    {s === 'pending' && metrics.pending > 0 && (
                      <span className="ml-1 bg-status-progress text-white text-[10px] px-1.5 py-0.5 rounded-full">{metrics.pending}</span>
                    )}
                    {s === 'invited' && invites.length > 0 && (
                      <span className="ml-1 bg-gold text-surface-dark text-[10px] px-1.5 py-0.5 rounded-full">{invites.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Invited list ── */}
            {statusFilter === 'invited' ? (
              <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                {loadingInvites ? (
                  <div className="py-16 text-center text-muted-foreground text-sm">Loading invites…</div>
                ) : invites.length === 0 ? (
                  <div className="py-16 text-center">
                    <Mail className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-medium text-foreground">No invites sent yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">Use "Invite Someone" to reach out to a prospective driver.</p>
                    <Button size="sm" onClick={() => setInviteModalOpen(true)} className="gap-1.5">
                      <MailPlus className="h-3.5 w-3.5" /> Send First Invite
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    <div className="hidden sm:grid grid-cols-12 px-5 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span className="col-span-4">Person</span>
                      <span className="col-span-3">Contact</span>
                      <span className="col-span-2">Sent By</span>
                      <span className="col-span-2">Date</span>
                      <span className="col-span-1 text-right">Actions</span>
                    </div>
                    {invites.map(inv => {
                      const name = `${inv.first_name} ${inv.last_name}`;
                      return (
                        <div key={inv.id} className="hidden sm:grid grid-cols-12 items-center px-5 py-4 hover:bg-secondary/20 transition-colors">
                          <div className="col-span-4 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">{name}</p>
                              {!inv.email_sent && (
                                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">Failed</span>
                              )}
                            </div>
                            {inv.note && <p className="text-xs text-muted-foreground truncate mt-0.5 italic">"{inv.note}"</p>}
                          </div>
                          <div className="col-span-3 min-w-0">
                            <p className="text-xs text-foreground truncate flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground shrink-0" />{inv.email}</p>
                            {inv.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3 shrink-0" />{inv.phone}</p>}
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-foreground truncate">{inv.invited_by_name ?? '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-foreground">{new Date(inv.resent_at ?? inv.created_at).toLocaleDateString()}</p>
                            {inv.resent_at && <p className="text-[10px] text-muted-foreground">Resent</p>}
                          </div>
                          <div className="col-span-1 flex items-center justify-end gap-1">
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleResendInvite(inv)}
                                    disabled={resendingId === inv.id}
                                    className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  >
                                    {resendingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Resend invite</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setDeleteInviteId(inv.id)}
                                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Delete invite</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      );
                    })}
                    {/* Mobile cards */}
                    {invites.map(inv => (
                      <div key={`m-${inv.id}`} className="sm:hidden px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{inv.first_name} {inv.last_name}</p>
                            {!inv.email_sent && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">Failed</span>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{inv.email}</p>
                          {inv.phone && <p className="text-xs text-muted-foreground">{inv.phone}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">{new Date(inv.created_at).toLocaleDateString()} · {inv.invited_by_name}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleResendInvite(inv)} disabled={resendingId === inv.id} className="p-1.5 rounded hover:bg-secondary text-muted-foreground disabled:opacity-50">
                            {resendingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => setDeleteInviteId(inv.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
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
                          <div key={app.id} className="cursor-pointer group hover:bg-secondary/20 transition-colors" onClick={() => setSelectedApp(app)}>
                            <div className="hidden sm:grid grid-cols-12 items-center px-5 py-4">
                              <div className="col-span-4">
                                <p className="text-sm font-medium text-foreground group-hover:text-gold transition-colors">{name}</p>
                                {(app.cdl_state || app.cdl_class) && <p className="text-xs text-muted-foreground mt-0.5">CDL {app.cdl_class ?? '?'} · {app.cdl_state ?? '?'}</p>}
                              </div>
                              <div className="col-span-3">
                                <p className="text-xs text-foreground truncate">{app.email}</p>
                                <p className="text-xs text-muted-foreground">{app.phone ?? '—'}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs text-foreground">{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}</p>
                              </div>
                              <div className="col-span-2">
                                <Badge className={`text-xs border ${STATUS_COLORS[app.review_status] ?? ''}`}>{app.review_status}</Badge>
                              </div>
                              <div className="col-span-1 flex justify-end">
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-gold transition-colors" />
                              </div>
                            </div>
                            <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium text-foreground group-hover:text-gold transition-colors truncate">{name}</p>
                                  <Badge className={`text-[10px] border px-1.5 py-0 shrink-0 ${STATUS_COLORS[app.review_status] ?? ''}`}>{app.review_status}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{app.email}</p>
                                <p className="text-xs text-muted-foreground">{app.phone ?? 'No phone'}{app.submitted_at ? ` · ${new Date(app.submitted_at).toLocaleDateString()}` : ''}</p>
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
                  <p className="text-xs text-muted-foreground text-right">Showing {filteredApps.length} application{filteredApps.length !== 1 ? 's' : ''}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── PIPELINE ── */}
        {view === 'pipeline' && (
          <PipelineDashboard
            onOpenOperator={(id) => { setSelectedOperatorId(id); setScrollToStageKeyMgmt(undefined); setView('operator-detail'); }}
            onOpenOperatorWithFocus={async (operatorId, focusField) => {
              setSelectedOperatorId(operatorId);
              setScrollToStageKeyMgmt(undefined);
              setView('operator-detail');
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
            onOpenOperatorAtStage={(operatorId, stageKey) => {
              setSelectedOperatorId(operatorId);
              setScrollToStageKeyMgmt(stageKey);
              setView('operator-detail');
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
            onBack={() => { setOperatorHasUnsavedChanges(false); setScrollToStageKeyMgmt(undefined); setView('pipeline'); }}
            onUnsavedChangesChange={setOperatorHasUnsavedChanges}
            expiryOverride={panelExpiryOverride}
            scrollToStageKey={scrollToStageKeyMgmt}
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
          <DispatchPortal embedded defaultFilter={dispatchDefaultFilter} />
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

        {view === 'app-errors' && (
          <ApplicationErrorsPanel />
        )}

        {view === 'faq' && (
          <FaqManager />
        )}

        {view === 'resource-center' && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Resource Center</h1>
              <p className="text-muted-foreground text-sm mt-1">Manage service guides and company documents in one place</p>
            </div>
            <Tabs defaultValue="services" className="w-full">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="services" className="flex-1 sm:flex-none">Services & Tools</TabsTrigger>
                <TabsTrigger value="documents" className="flex-1 sm:flex-none">Company Documents</TabsTrigger>
              </TabsList>
              <TabsContent value="services">
                <ServiceLibraryManager />
              </TabsContent>
              <TabsContent value="documents">
                <ResourceLibraryManager />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {view === 'docs-hub' && (
          <DocumentHub isAdmin={true} />
        )}


        {view === 'inspection-binder' && (
          <InspectionBinderAdmin />
        )}

        {view === 'drivers' && (
          <DriverHubView
            canAddDriver={true}
            defaultComplianceFilter={driverComplianceFilter}
            onMessageDriver={() => {
              setView('dispatch');
            }}
          />
        )}

        {view === 'notifications' && (
          <NotificationHistory />
        )}

        {view === 'pipeline-config' && (
          <PipelineConfigEditor />
        )}

        {view === 'equipment' && (
          <EquipmentInventory isManagement={true} />
        )}

        {view === 'vehicle-hub' && (
          <FleetRoster onSelectOperator={(id) => { setSelectedOperatorId(id); setView('vehicle-detail' as ManagementView); }} />
        )}
        {view === 'vehicle-detail' && selectedOperatorId && (
          <FleetDetailDrawer operatorId={selectedOperatorId} onBack={() => setView('vehicle-hub' as ManagementView)} />
        )}

        {view === 'mo-plates' && (
          <MoPlateRegistry />
        )}

        {(view === 'email-catalog' || view === 'content-manager') && (
          <EmailCatalog />
        )}

        {view === 'forms-catalog' && (
          <FormsCatalog />
        )}

        {view === 'whats-new' && (
          <ReleaseNotesManager />
        )}

        {view === 'broadcast' && (
          <OperatorBroadcast />
        )}

        {view === 'carrier-signature' && (
          <CarrierSignatureSettings />
        )}

        {view === 'terminations' && (
          <TerminationsView />
        )}


        {view === 'messages' && (
          <div className="flex flex-col gap-0" style={{ height: 'calc(100vh - 160px - 64px)' }}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <p className="text-xs text-muted-foreground">
                Send individual 1-on-1 messages, or use Bulk Message to contact multiple operators at once.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { if (guardDemo()) return; setBulkMessageOpen(true); }}
                className="text-xs gap-2 shrink-0 ml-3"
              >
                <Users className="h-3.5 w-3.5" />
                Bulk Message
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <MessagesView initialUserId={messageInitialUserId} />
            </div>
          </div>
        )}

        {view === 'compliance' && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Fleet Compliance</h1>
              <p className="text-muted-foreground text-sm mt-1">Monitor CDL, Medical Cert, and fleet document expiries</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
              <button
                onClick={() => {
                  setAlertsPanelNoAction(false);
                  alertsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setAlertsPanelHighlight('warning');
                  setTimeout(() => setAlertsPanelHighlight(false), 1800);
                }}
                className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm text-left hover:border-warning/50 hover:bg-warning/5 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0 group-hover:bg-warning/20 transition-colors">
                    <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{criticalExpiryCount - expiredCount}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-warning/80 transition-colors">Expiring Within 30 Days ↓</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setAlertsPanelNoAction(false);
                  alertsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setAlertsPanelHighlight('destructive');
                  setTimeout(() => setAlertsPanelHighlight(false), 1800);
                }}
                className={`border rounded-xl p-3 sm:p-4 shadow-sm text-left transition-colors group cursor-pointer ${
                  expiredCount > 0
                    ? 'bg-destructive/5 border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50'
                    : 'bg-white border-border hover:border-destructive/30 hover:bg-destructive/5'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 group-hover:bg-destructive/20 transition-colors">
                    <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                  </div>
                  <div>
                    <p className={`text-xl sm:text-2xl font-bold ${expiredCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{expiredCount}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-destructive/80 transition-colors">Already Expired ↓</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  alertsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setAlertsPanelNoAction(true);
                  setAlertsPanelHighlight('muted');
                  setTimeout(() => setAlertsPanelHighlight(false), 1800);
                }}
                className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm text-left hover:border-primary/30 hover:bg-primary/5 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <BellOff className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{noReminderCount}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-primary/80 transition-colors">No Reminder Sent ↓</p>
                  </div>
                </div>
              </button>
            </div>
            <div
              ref={alertsPanelRef}
              className={`rounded-xl transition-all duration-300 ${
                alertsPanelHighlight === 'warning' ? 'ring-2 ring-warning/60 ring-offset-2' :
                alertsPanelHighlight === 'destructive' ? 'ring-2 ring-destructive/60 ring-offset-2' :
                alertsPanelHighlight === 'muted' ? 'ring-2 ring-primary/40 ring-offset-2' : ''
              }`}
            >
              <ComplianceAlertsPanel
                key={alertsPanelNoAction ? 'no-action' : 'default'}
                defaultNoActionOnly={alertsPanelNoAction}
                onOpenOperator={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }}
                onOpenOperatorWithFocus={async (operatorId, focusField) => {
                  setSelectedOperatorId(operatorId);
                  setView('operator-detail');
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
              />
            </div>
            <InspectionComplianceSummary
              defaultExpanded={true}
              onOpenOperator={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }}
              onOpenOperatorAtBinder={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }}
              onOpenInspectionBinder={() => setView('inspection-binder')}
            />
          </div>
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

      <InviteApplicantModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onInviteSent={() => { if (statusFilter === 'invited') fetchInvites(); }}
      />

      <AlertDialog open={!!deleteInviteId} onOpenChange={(open) => { if (!open) setDeleteInviteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the invite record. The person won't be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteInviteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteInviteId && handleDeleteInvite(deleteInviteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AlertDialog open={installSendOpen} onOpenChange={(open) => { if (!open && !installSending) setInstallSendOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send install instructions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email install instructions to every active operator who hasn't installed the SUPERDRIVE app yet
              and hasn't already received this notification. Operators already notified will be skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setInstallPreviewOpen(true)}
              className="text-xs gap-1.5 -ml-2"
              disabled={installSending}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview the exact in-app + email content
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={installSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkInstallSend(); }}
              disabled={installSending}
              className="bg-gold text-foreground hover:bg-gold/90"
            >
              {installSending ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</span>
              ) : 'Send emails'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PwaReminderPreviewModal open={installPreviewOpen} onOpenChange={setInstallPreviewOpen} />
      <ScrollJumpButton />
    </>
  );
}
