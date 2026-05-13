import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import StaffLayout from '@/components/layouts/StaffLayout';
import PipelineDashboard from './PipelineDashboard';
import OperatorDetailPanel from './OperatorDetailPanel';
import FaqManager from '@/components/management/FaqManager';
import ResourceLibraryManager from '@/components/management/ResourceLibraryManager';
import MessagesView from '@/components/staff/MessagesView';
import BulkMessageModal from '@/components/staff/BulkMessageModal';
import NotificationHistory from '@/components/management/NotificationHistory';
import StaffNotificationPreferencesModal from '@/components/staff/StaffNotificationPreferencesModal';
import ApplicationReviewDrawer, { type FullApplication } from '@/components/management/ApplicationReviewDrawer';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, MessageSquare, HelpCircle, BookOpen, SlidersHorizontal, Bell, Truck, TriangleAlert, Users, Library, FileClock, Shield, Users2, ShieldCheck, AlertTriangle, XCircle, BellOff, HardDrive, GraduationCap, Container, Eye, Briefcase } from 'lucide-react';
import FleetRoster from '@/components/fleet/FleetRoster';
import FleetDetailDrawer from '@/components/fleet/FleetDetailDrawer';
import EquipmentInventory from '@/components/equipment/EquipmentInventory';
import ServiceLibraryManager from '@/components/service-library/ServiceLibraryManager';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DriverHubView from '@/components/drivers/DriverHubView';
import DocumentHub from '@/components/documents/DocumentHub';
import InspectionBinderAdmin from '@/components/inspection/InspectionBinderAdmin';
import InspectionComplianceSummary from '@/components/inspection/InspectionComplianceSummary';
import { ScrollJumpButton } from '@/components/ui/ScrollJumpButton';
import ComplianceAlertsPanel from '@/components/inspection/ComplianceAlertsPanel';
import OperatorPreviewPicker from '@/components/operator/OperatorPreviewPicker';
import PEIQueuePanel from '@/components/pei/PEIQueuePanel';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type StaffView = 'pipeline' | 'operator-detail' | 'messages' | 'faq' | 'resource-center' | 'notifications' | 'docs-hub' | 'inspection-binder' | 'drivers' | 'compliance' | 'equipment' | 'vehicle-hub' | 'vehicle-detail' | 'operator-preview' | 'pei-queue';

export default function StaffPortal() {
  const { user } = useAuth();
  const { isDemo, enterDemo, exitDemo, guardDemo } = useDemoMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState<StaffView>(() => {
    const v = searchParams.get('view') as StaffView | null;
    if (v && ['pipeline','messages','faq','resource-center','notifications','docs-hub','inspection-binder','drivers','compliance','equipment','vehicle-hub','operator-preview','operator-detail','pei-queue'].includes(v)) return v;
    return 'pipeline';
  });
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [noReminderCount, setNoReminderCount] = useState(0);
  const [driverAlertCount, setDriverAlertCount] = useState(0);
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const [reviewApp, setReviewApp] = useState<FullApplication | null>(null);
  const [reviewFocusField, setReviewFocusField] = useState<'cdl' | 'medcert' | undefined>(undefined);
  const [panelExpiryOverride, setPanelExpiryOverride] = useState<{ cdl: string | null; medcert: string | null } | undefined>(undefined);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [bulkMessagePreselected, setBulkMessagePreselected] = useState<string[]>([]);
  const [scrollToInspectionBinder, setScrollToInspectionBinder] = useState(false);
  const [scrollToStageKey, setScrollToStageKey] = useState<string | undefined>(undefined);
  const viewRef = useRef(currentView);
  const alertsPanelRef = useRef<HTMLDivElement>(null);
  const [alertsPanelHighlight, setAlertsPanelHighlight] = useState<'warning' | 'destructive' | 'muted' | false>(false);
  const [alertsPanelNoAction, setAlertsPanelNoAction] = useState(false);

  // Helper: resolve or create application record for an operator, then open review drawer
  const resolveAndOpenAppReview = useCallback(async (operatorId: string, focusField?: 'cdl' | 'medcert') => {
    const { data: op } = await supabase
      .from('operators')
      .select('application_id, applications(*), user_id')
      .eq('id', operatorId)
      .single();
    if (op?.applications) {
      setReviewApp(op.applications as FullApplication);
      setReviewFocusField(focusField);
      return;
    }
    // No application — create one on the fly
    const userId = op?.user_id;
    if (!userId) { toast.error('Could not resolve operator user.'); return; }
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, home_state')
      .eq('user_id', userId)
      .single();
    const { data: newApp, error } = await supabase
      .from('applications')
      .insert({
        email: '', // will be filled in by staff
        user_id: userId,
        first_name: profile?.first_name ?? '',
        last_name: profile?.last_name ?? '',
        phone: profile?.phone ?? '',
        address_state: profile?.home_state ?? '',
        review_status: 'approved' as any,
        is_draft: false,
      })
      .select('*')
      .single();
    if (error || !newApp) { toast.error(error?.message ?? 'Failed to create application record.'); return; }
    // Link to operator
    await supabase.from('operators').update({ application_id: newApp.id }).eq('id', operatorId);
    // Also persist to profiles for pipeline fallback
    if (profile?.phone || profile?.home_state) {
      await supabase.from('profiles').update({ phone: profile.phone, home_state: profile.home_state }).eq('user_id', userId);
    }
    setReviewApp(newApp as unknown as FullApplication);
    setReviewFocusField(focusField);
  }, []);

  // One-shot legacy deep-link migration on mount only.
  // Translates old ?tab=notifications and bare ?operator=... links into
  // the canonical ?view=... format so the writer effect below has nothing
  // to fight over.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.get('tab') === 'notifications') {
      params.delete('tab');
      params.set('view', 'notifications');
      setCurrentView('notifications');
      changed = true;
    }
    const legacyOperator = params.get('operator');
    const hasView = params.get('view');
    if (legacyOperator && !hasView) {
      params.set('view', 'operator-detail');
      setSelectedOperatorId(legacyOperator);
      setCurrentView('operator-detail');
      changed = true;
    }
    if (changed) setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Writer: persist current view/operator to the URL so browser refresh
  // restores the section. Reads the URL imperatively and does NOT depend on
  // searchParams, so it can never feed back into itself.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (currentView && currentView !== 'pipeline') next.set('view', currentView); else next.delete('view');
    if (currentView === 'operator-detail' && selectedOperatorId) next.set('operator', selectedOperatorId); else next.delete('operator');
    const current = window.location.search.replace(/^\?/, '');
    if (next.toString() !== current) {
      setSearchParams(next, { replace: true });
    }
  }, [currentView, selectedOperatorId, setSearchParams]);

  // Fetch initial unread message count
  useEffect(() => {
    if (!user) return;
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [user]);

  // Fetch initial unread notification count
  useEffect(() => {
    if (!user) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)
      .then(({ count }) => setUnreadNotifCount(count ?? 0));
  }, [user]);

  // Clear badges when tabs are opened
  useEffect(() => {
    if (currentView === 'messages') setUnreadCount(0);
    if (currentView === 'notifications') setUnreadNotifCount(0);
    // Re-fetch driver alerts when leaving the drivers tab (so count stays accurate)
    // Clear immediately on entry so the badge disappears while viewing
    if (currentView === 'drivers') setDriverAlertCount(0);
  }, [currentView]);

  // Keep viewRef in sync for realtime callbacks
  useEffect(() => { viewRef.current = currentView; }, [currentView]);

  // Realtime: increment message badge
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('staff-unread-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, () => {
        if (viewRef.current !== 'messages') {
          setUnreadCount(prev => prev + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Realtime: sync notification badge on any change (insert, update/read)
  useEffect(() => {
    if (!user) return;
    const refetchCount = () => {
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)
        .then(({ count }) => setUnreadNotifCount(count ?? 0));
    };
    const channel = supabase
      .channel('staff-unread-notif-badge')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, refetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const navItems = [
    { label: 'Applicant Pipeline', icon: <LayoutDashboard className="h-4 w-4" />, path: 'pipeline', dividerBefore: 'Operations' },
    { label: 'Driver Hub', icon: <Users2 className="h-4 w-4" />, path: 'drivers', badge: driverAlertCount || undefined },
    { label: 'Vehicle Hub', icon: <Truck className="h-4 w-4" />, path: 'vehicle-hub' },
    { label: 'Compliance', icon: <ShieldCheck className="h-4 w-4" />, path: 'compliance', badge: criticalExpiryCount || undefined },
    { label: 'Inspection Binder', icon: <Shield className="h-4 w-4" />, path: 'inspection-binder' },
    { label: 'PEI Queue', icon: <Briefcase className="h-4 w-4" />, path: 'pei-queue' },
    { label: 'Document Hub', icon: <Library className="h-4 w-4" />, path: 'docs-hub' },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages', badge: unreadCount, dividerBefore: 'Tools' },
    { label: 'Resource Center', icon: <BookOpen className="h-4 w-4" />, path: 'resource-center' },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Equipment', icon: <HardDrive className="h-4 w-4" />, path: 'equipment' },
    { label: 'Operator Preview', icon: <Eye className="h-4 w-4" />, path: 'operator-preview' },
    { label: 'Notifications', icon: <Bell className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount, dividerBefore: 'Admin' },
    { label: 'Demo Mode', icon: <GraduationCap className="h-4 w-4" />, path: '__demo__' },
  ];

  const handleOpenOperator = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorHasUnsavedChanges(false);
    setScrollToInspectionBinder(false);
    setScrollToStageKey(undefined);
    setCurrentView('operator-detail');
  };

  const handleOpenOperatorAtBinder = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorHasUnsavedChanges(false);
    setScrollToInspectionBinder(true);
    setScrollToStageKey(undefined);
    setCurrentView('operator-detail');
  };

  const handleOpenOperatorAtStage = (operatorId: string, stageKey: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorHasUnsavedChanges(false);
    setScrollToInspectionBinder(false);
    setScrollToStageKey(stageKey);
    setCurrentView('operator-detail');
  };



  const handleBackToPipeline = () => {
    setSelectedOperatorId(null);
    setOperatorHasUnsavedChanges(false);
    setCurrentView('pipeline');
  };

  const handleMessageOperator = (userId: string) => {
    setMessageInitialUserId(userId);
    setOperatorHasUnsavedChanges(false);
    setCurrentView('messages');
  };

  const handleNavigate = (path: string) => {
    if (path === '__demo__') {
      if (isDemo) exitDemo(); else enterDemo();
      return;
    }
    if (currentView === 'operator-detail' && operatorHasUnsavedChanges) {
      setPendingNavPath(path);
    } else {
      setCurrentView(path as StaffView);
    }
  };

  const confirmNavigation = () => {
    if (pendingNavPath) {
      setOperatorHasUnsavedChanges(false);
      setCurrentView(pendingNavPath as StaffView);
      if (pendingNavPath !== 'operator-detail') setSelectedOperatorId(null);
      setPendingNavPath(null);
    }
  };

  const [prefOpen, setPrefOpen] = useState(false);
  const [truckDownOperators, setTruckDownOperators] = useState<{ name: string; unit: string }[]>([]);
  const [icaDraftCount, setIcaDraftCount] = useState(0);
  const [icaDraftNames, setIcaDraftNames] = useState<string[]>([]);
  const [pipelineICAFilter, setPipelineICAFilter] = useState(false);
  const [pipelineDispatchFilter, setPipelineDispatchFilter] = useState<'all' | 'truck_down'>('all');

  const fetchCriticalExpiries = useCallback(async () => {
    const [{ data }, { data: reminders }] = await Promise.all([
      supabase
        .from('operators')
        .select('id, applications(cdl_expiration, medical_cert_expiration)')
        .not('application_id', 'is', null),
      supabase
        .from('cert_reminders')
        .select('operator_id, doc_type'),
    ]);
    if (!data) return;
    const today = startOfDay(new Date());

    // Build a set of operator+doctype keys that have at least one reminder
    const remindedKeys = new Set<string>();
    (reminders ?? []).forEach((r: any) => remindedKeys.add(`${r.operator_id}|${r.doc_type}`));

    let critical = 0;
    let expired = 0;
    let noReminder = 0;

    (data as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const fields: Array<[string, string]> = [
        ['cdl_expiration', 'CDL'],
        ['medical_cert_expiration', 'Medical Cert'],
      ];
      fields.forEach(([field, docType]) => {
        const dateStr: string | null = app[field];
        if (!dateStr) return;
        const days = differenceInDays(startOfDay(parseISO(dateStr)), today);
        if (days < 0) expired++;
        else if (days <= 30) critical++;
        const key = `${op.id}|${docType}`;
        if (days <= 30 && !remindedKeys.has(key)) noReminder++;
      });
    });

    setCriticalExpiryCount(critical + expired);
    setExpiredCount(expired);
    setNoReminderCount(noReminder);
  }, []);

  useEffect(() => {
    fetchCriticalExpiries();
    const ch1 = supabase
      .channel('staff-compliance-badge')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' }, () => {
        fetchCriticalExpiries();
      })
      .subscribe();
    const ch2 = supabase
      .channel('staff-compliance-badge-reminders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cert_reminders' }, () => {
        fetchCriticalExpiries();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchCriticalExpiries]);

  // Driver Hub alert badge: count of fully-onboarded drivers with expired/critical docs OR never reminded
  const fetchDriverAlertCount = useCallback(async () => {
    // 1. Get all fully-onboarded operators with their CDL/medcert dates
    const { data: ops } = await supabase
      .from('onboarding_status')
      .select('operator_id, operators!inner(applications(cdl_expiration, medical_cert_expiration))')
      .eq('fully_onboarded', true);
    if (!ops || ops.length === 0) { setDriverAlertCount(0); return; }

    const today = startOfDay(new Date());
    const alertOperatorIds = new Set<string>();

    for (const row of ops as any[]) {
      const app = Array.isArray(row.operators?.applications)
        ? row.operators.applications[0]
        : row.operators?.applications;
      if (!app) continue;
      const cdlDays = app.cdl_expiration
        ? differenceInDays(startOfDay(parseISO(app.cdl_expiration)), today)
        : null;
      const medDays = app.medical_cert_expiration
        ? differenceInDays(startOfDay(parseISO(app.medical_cert_expiration)), today)
        : null;
      const days = [cdlDays, medDays].filter((d): d is number => d !== null);
      if (days.length > 0 && Math.min(...days) <= 7) {
        alertOperatorIds.add(row.operator_id);
      }
    }

    // 2. Find operators that have NEVER received a cert reminder
    const operatorIds = ops.map((r: any) => r.operator_id);
    const { data: reminders } = await supabase
      .from('cert_reminders')
      .select('operator_id')
      .in('operator_id', operatorIds);
    const remindedSet = new Set((reminders ?? []).map((r: any) => r.operator_id));
    for (const id of operatorIds) {
      if (!remindedSet.has(id)) alertOperatorIds.add(id);
    }

    setDriverAlertCount(alertOperatorIds.size);
  }, []);

  useEffect(() => {
    fetchDriverAlertCount();
    const ch1 = supabase
      .channel('staff-driver-alert-badge-apps')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' }, () => fetchDriverAlertCount())
      .subscribe();
    const ch2 = supabase
      .channel('staff-driver-alert-badge-reminders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cert_reminders' }, () => fetchDriverAlertCount())
      .subscribe();
    const ch3 = supabase
      .channel('staff-driver-alert-badge-onboarding')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'onboarding_status' }, () => fetchDriverAlertCount())
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [fetchDriverAlertCount]);


  const fetchTruckDownOperators = useCallback(async () => {
    const { data } = await supabase
      .from('active_dispatch')
      .select(`
        operator_id,
        operators!inner(
          application_id,
          unit_number,
          applications(first_name, last_name),
          onboarding_status(unit_number, fully_onboarded)
        )
      `)
      .eq('dispatch_status', 'truck_down');

    if (!data) return;

    const ops = data
      .filter((row: any) => {
        const os = row.operators?.onboarding_status;
        const status = Array.isArray(os) ? os[0] : os;
        return status?.fully_onboarded === true;
      })
      .map((row: any) => {
        const op = row.operators;
        const app = op?.applications;
        const osUnit = op?.onboarding_status?.[0]?.unit_number ?? op?.onboarding_status?.unit_number;
        const unit = osUnit ?? op?.unit_number ?? '—';
        const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown';
        return { name, unit };
      });
    setTruckDownOperators(ops);
  }, []);

  // Subscribe to realtime changes on active_dispatch to keep the banner live
  useEffect(() => {
    fetchTruckDownOperators();
    const channel = supabase
      .channel('staff-truck-down-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_dispatch' }, () => {
        fetchTruckDownOperators();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTruckDownOperators]);

  // Fetch ICA drafts in progress
  const fetchIcaDrafts = useCallback(async () => {
    const { data } = await supabase
      .from('onboarding_status')
      .select(`
        operator_id,
        operators!inner(
          application_id,
          applications(first_name, last_name)
        )
      `)
      .eq('ica_status', 'in_progress');

    if (!data) return;
    const names = data.map((row: any) => {
      const app = row.operators?.applications;
      return [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown';
    });
    setIcaDraftCount(names.length);
    setIcaDraftNames(names);
  }, []);

  useEffect(() => {
    fetchIcaDrafts();
    const channel = supabase
      .channel('staff-ica-draft-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_status' }, () => {
        fetchIcaDrafts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchIcaDrafts]);

  return (
    <>
    <StaffNotificationPreferencesModal open={prefOpen} onClose={() => setPrefOpen(false)} />
    <BulkMessageModal
      open={bulkMessageOpen}
      onClose={() => { setBulkMessageOpen(false); setBulkMessagePreselected([]); }}
      preselectedIds={bulkMessagePreselected}
    />
    <StaffLayout
      navItems={navItems}
      currentPath={currentView}
      onNavigate={handleNavigate}
      title="Onboarding"
      isDemo={isDemo}
      onExitDemo={exitDemo}
      headerActions={
        <button
          onClick={() => setPrefOpen(true)}
          title="Notification preferences"
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
        </button>
      }
    >
      {/* ── TRUCK DOWN ALERT BANNER ── */}
      {truckDownOperators.length > 0 && currentView !== 'pipeline' && currentView !== 'operator-detail' && (
        <div className="mb-3 flex flex-wrap items-start sm:items-center justify-between gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 animate-fade-in">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 shrink-0 mt-0.5 sm:mt-0">
              <TriangleAlert className="h-4 w-4 text-destructive animate-pulse" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive leading-tight">
                {truckDownOperators.length} Operator{truckDownOperators.length !== 1 ? 's' : ''} Truck Down
              </p>
              <p className="text-xs text-destructive/70 leading-tight mt-0.5 break-words">
                {truckDownOperators.map(o => `${o.name} · ${o.unit}`).join('  ·  ')}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => { setPipelineDispatchFilter('truck_down'); setCurrentView('pipeline'); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs gap-1.5 shrink-0"
          >
            <Truck className="h-3.5 w-3.5" />
            View Pipeline
          </Button>
        </div>
      )}

      {/* ── ICA DRAFTS IN PROGRESS BANNER ── */}
      {icaDraftCount > 0 && (
        <div className="mb-3 flex flex-wrap items-start sm:items-center justify-between gap-3 bg-status-progress/10 border border-status-progress/30 rounded-xl px-4 py-3 animate-fade-in">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-progress/15 shrink-0 mt-0.5 sm:mt-0">
              <FileClock className="h-4 w-4 text-status-progress" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-status-progress leading-tight">
                {icaDraftCount} ICA Draft{icaDraftCount !== 1 ? 's' : ''} in Progress
              </p>
              <p className="text-xs text-status-progress/70 leading-tight mt-0.5 break-words">
                {icaDraftNames.slice(0, 4).join('  ·  ')}{icaDraftNames.length > 4 ? `  ·  +${icaDraftNames.length - 4} more` : ''}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setPipelineICAFilter(true); setCurrentView('pipeline'); }}
            className="border-status-progress/40 text-status-progress hover:bg-status-progress/10 text-xs gap-1.5 shrink-0"
          >
            <FileClock className="h-3.5 w-3.5" />
            View in Pipeline
          </Button>
        </div>
      )}

      {currentView === 'pipeline' && (
        <PipelineDashboard
          onOpenOperator={op => { setPipelineDispatchFilter('all'); setPipelineICAFilter(false); handleOpenOperator(op); }}
          onOpenOperatorWithFocus={async (operatorId, focusField) => {
            setPipelineDispatchFilter('all');
            setPipelineICAFilter(false);
            handleOpenOperator(operatorId);
            // Fetch the application and open the review drawer focused on the expiry field
            const { data: op } = await supabase
              .from('operators')
              .select('application_id, applications(*)')
              .eq('id', operatorId)
              .single();
            if (op?.applications) {
              setReviewApp(op.applications as FullApplication);
              setReviewFocusField(focusField);
            }
          }}
          onOpenOperatorAtBinder={op => { setPipelineDispatchFilter('all'); setPipelineICAFilter(false); handleOpenOperatorAtBinder(op); }}
          onOpenOperatorAtStage={(operatorId, stageKey) => { setPipelineDispatchFilter('all'); setPipelineICAFilter(false); handleOpenOperatorAtStage(operatorId, stageKey); }}
          onOpenInspectionBinder={() => setCurrentView('inspection-binder')}
          initialDispatchFilter={pipelineDispatchFilter}
          initialStageFilter={pipelineICAFilter ? 'Stage 3 — ICA' : undefined}
          onBulkMessage={(ids) => { setBulkMessagePreselected(ids); setBulkMessageOpen(true); }}
        />
      )}
      {currentView === 'operator-detail' && selectedOperatorId && (
        <OperatorDetailPanel
          operatorId={selectedOperatorId}
          onBack={handleBackToPipeline}
          onMessageOperator={handleMessageOperator}
          onUnsavedChangesChange={setOperatorHasUnsavedChanges}
          expiryOverride={panelExpiryOverride}
          scrollToInspectionBinder={scrollToInspectionBinder}
          scrollToStageKey={scrollToStageKey}
          onOpenAppReview={(focusField) => resolveAndOpenAppReview(selectedOperatorId, focusField)}
        />
      )}
      {currentView === 'messages' && (
        <div className="flex flex-col gap-0" style={{ height: 'calc(100vh - 160px - 64px)' }}>
          {/* Bulk Message toolbar */}
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
      {currentView === 'faq' && (
        <FaqManager />
      )}
      {currentView === 'resource-center' && (
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
      {currentView === 'docs-hub' && (
        <DocumentHub isAdmin={true} />
      )}
      {currentView === 'compliance' && (
        <div className="flex flex-col gap-4">
          {/* Page header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Fleet Compliance</h1>
            <p className="text-muted-foreground text-sm mt-1">Monitor CDL, Medical Cert, and fleet document expiries</p>
          </div>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            {/* Expiring Within 30 Days — clickable */}
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
            {/* Already Expired — clickable */}
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
            {/* No Reminder Sent — clickable, applies No Action filter */}
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
          {/* Alerts panel — ref target for scroll-into-view from stat cards */}
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
              onOpenOperator={handleOpenOperator}
              onOpenOperatorWithFocus={async (operatorId, focusField) => {
                handleOpenOperator(operatorId);
                await resolveAndOpenAppReview(operatorId, focusField);
              }}
            />
          </div>
          <InspectionComplianceSummary
            defaultExpanded={true}
            onOpenOperator={handleOpenOperator}
            onOpenOperatorAtBinder={handleOpenOperatorAtBinder}
            onOpenInspectionBinder={() => setCurrentView('inspection-binder')}
          />
        </div>
      )}
      {currentView === 'inspection-binder' && (
        <InspectionBinderAdmin />
      )}
      {currentView === 'drivers' && (
        <DriverHubView
          canAddDriver={false}
          onMessageDriver={userId => { setMessageInitialUserId(userId); setCurrentView('messages'); }}
        />
      )}
      {currentView === 'notifications' && (
        <NotificationHistory />
      )}
      {currentView === 'equipment' && (
        <EquipmentInventory isManagement={false} />
      )}
      {currentView === 'vehicle-hub' && (
        <FleetRoster onSelectOperator={(id) => { setSelectedOperatorId(id); setCurrentView('vehicle-detail' as StaffView); }} />
      )}
      {currentView === 'vehicle-detail' && selectedOperatorId && (
        <FleetDetailDrawer operatorId={selectedOperatorId} onBack={() => setCurrentView('vehicle-hub' as StaffView)} />
      )}
      {currentView === 'operator-preview' && (
        <OperatorPreviewPicker />
      )}
    </StaffLayout>

    {reviewApp && (
      <ApplicationReviewDrawer
        app={reviewApp}
        onClose={() => { setReviewApp(null); setReviewFocusField(undefined); }}
        onApprove={async () => {}}
        onDeny={async () => {}}
        onExpiryUpdated={async () => {
          // Re-fetch the application so the drawer shows the fresh value
          const { data: fresh } = await supabase
            .from('applications')
            .select('*')
            .eq('id', reviewApp.id)
            .single();
          if (fresh) {
            setReviewApp(fresh as FullApplication);
            // Push updated expiry dates into the OperatorDetailPanel's local state
            setPanelExpiryOverride({
              cdl: (fresh as any).cdl_expiration ?? null,
              medcert: (fresh as any).medical_cert_expiration ?? null,
            });
          }
        }}
        focusField={reviewFocusField}
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
      <ScrollJumpButton />
    </>
  );
}
