import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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
import { LayoutDashboard, MessageSquare, HelpCircle, BookOpen, SlidersHorizontal, Bell, Truck, TriangleAlert, Users, Library, FileClock, Wrench, Shield, Users2, ShieldCheck, AlertTriangle, XCircle, BellOff } from 'lucide-react';
import ServiceLibraryManager from '@/components/service-library/ServiceLibraryManager';
import DriverHubView from '@/components/drivers/DriverHubView';
import DocumentHub from '@/components/documents/DocumentHub';
import InspectionBinderAdmin from '@/components/inspection/InspectionBinderAdmin';
import InspectionComplianceSummary from '@/components/inspection/InspectionComplianceSummary';
import ComplianceAlertsPanel from '@/components/inspection/ComplianceAlertsPanel';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type StaffView = 'pipeline' | 'operator-detail' | 'messages' | 'faq' | 'resources' | 'notifications' | 'docs-hub' | 'service-library' | 'inspection-binder' | 'drivers' | 'compliance';

export default function StaffPortal() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState<StaffView>('pipeline');
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
  const viewRef = useRef(currentView);
  const alertsPanelRef = useRef<HTMLDivElement>(null);
  const [alertsPanelHighlight, setAlertsPanelHighlight] = useState<'warning' | 'destructive' | false>(false);

  // Deep-link: ?tab=notifications or ?operator=... or ?view=inspection-binder
  useEffect(() => {
    const tab = searchParams.get('tab');
    const operatorId = searchParams.get('operator');
    const view = searchParams.get('view') as StaffView | null;
    if (tab === 'notifications') {
      setCurrentView('notifications');
    } else if (operatorId) {
      setSelectedOperatorId(operatorId);
      setCurrentView('operator-detail');
    } else if (view && ['pipeline','messages','faq','resources','notifications','docs-hub','service-library','inspection-binder','drivers','compliance'].includes(view)) {
      setCurrentView(view);
    }
  }, [searchParams]);

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

  // Realtime: increment notification badge
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('staff-unread-notif-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        if (viewRef.current !== 'notifications') {
          setUnreadNotifCount(prev => prev + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const navItems = [
    { label: 'Pipeline', icon: <LayoutDashboard className="h-4 w-4" />, path: 'pipeline' },
    { label: 'Drivers', icon: <Users2 className="h-4 w-4" />, path: 'drivers', badge: driverAlertCount || undefined },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages', badge: unreadCount },
    { label: 'Compliance', icon: <ShieldCheck className="h-4 w-4" />, path: 'compliance', badge: criticalExpiryCount || undefined },
    { label: 'Inspection Binder', icon: <Shield className="h-4 w-4" />, path: 'inspection-binder' },
    { label: 'Doc Hub', icon: <Library className="h-4 w-4" />, path: 'docs-hub' },
    { label: 'Service Library', icon: <Wrench className="h-4 w-4" />, path: 'service-library' },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Resources', icon: <BookOpen className="h-4 w-4" />, path: 'resources' },
    { label: 'Notifications', icon: <Bell className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount },
  ];

  const handleOpenOperator = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorHasUnsavedChanges(false);
    setScrollToInspectionBinder(false);
    setCurrentView('operator-detail');
  };

  const handleOpenOperatorAtBinder = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorHasUnsavedChanges(false);
    setScrollToInspectionBinder(true);
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
      {truckDownOperators.length > 0 && (
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
          onOpenAppReview={async (focusField) => {
            const { data: op } = await supabase
              .from('operators')
              .select('application_id, applications(*)')
              .eq('id', selectedOperatorId)
              .single();
            if (op?.applications) {
              setReviewApp(op.applications as FullApplication);
              setReviewFocusField(focusField);
            }
          }}
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
              onClick={() => setBulkMessageOpen(true)}
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
      {currentView === 'resources' && (
        <ResourceLibraryManager />
      )}
      {currentView === 'docs-hub' && (
        <DocumentHub isAdmin={true} />
      )}
      {currentView === 'service-library' && (
        <ServiceLibraryManager />
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
            {/* Expiring Within 30 Days — clickable, scrolls to alerts panel */}
            <button
              onClick={() => {
                alertsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setAlertsPanelHighlight(true);
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
            <div className={`border rounded-xl p-3 sm:p-4 shadow-sm ${expiredCount > 0 ? 'bg-destructive/5 border-destructive/30' : 'bg-white border-border'}`}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                </div>
                <div>
                  <p className={`text-xl sm:text-2xl font-bold ${expiredCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{expiredCount}</p>
                  <p className="text-xs text-muted-foreground">Already Expired</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-border rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BellOff className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-foreground">{noReminderCount}</p>
                  <p className="text-xs text-muted-foreground">No Reminder Sent</p>
                </div>
              </div>
            </div>
          </div>
          {/* Alerts panel — ref target for scroll-into-view from stat card */}
          <div
            ref={alertsPanelRef}
            className={`rounded-xl transition-all duration-300 ${alertsPanelHighlight ? 'ring-2 ring-warning/60 ring-offset-2' : ''}`}
          >
            <ComplianceAlertsPanel
              onOpenOperator={handleOpenOperator}
              onOpenOperatorWithFocus={async (operatorId, focusField) => {
                handleOpenOperator(operatorId);
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
    </>
  );
}
