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
import NotificationHistory from '@/components/management/NotificationHistory';
import StaffNotificationPreferencesModal from '@/components/staff/StaffNotificationPreferencesModal';
import ApplicationReviewDrawer, { type FullApplication } from '@/components/management/ApplicationReviewDrawer';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, MessageSquare, HelpCircle, BookOpen, SlidersHorizontal, Bell, Truck, TriangleAlert } from 'lucide-react';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type StaffView = 'pipeline' | 'operator-detail' | 'messages' | 'faq' | 'resources' | 'notifications';

export default function StaffPortal() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState<StaffView>('pipeline');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState(0);
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const [reviewApp, setReviewApp] = useState<FullApplication | null>(null);
  const [reviewFocusField, setReviewFocusField] = useState<'cdl' | 'medcert' | undefined>(undefined);
  const viewRef = useRef(currentView);

  // Deep-link: ?tab=notifications or ?operator=...
  useEffect(() => {
    const tab = searchParams.get('tab');
    const operatorId = searchParams.get('operator');
    if (tab === 'notifications') {
      setCurrentView('notifications');
    } else if (operatorId) {
      setSelectedOperatorId(operatorId);
      setCurrentView('operator-detail');
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
    { label: 'Pipeline', icon: <LayoutDashboard className="h-4 w-4" />, path: 'pipeline', badge: criticalExpiryCount || undefined },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages', badge: unreadCount },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Resources', icon: <BookOpen className="h-4 w-4" />, path: 'resources' },
    { label: 'Notifications', icon: <Bell className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount },
  ];

  const handleOpenOperator = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorHasUnsavedChanges(false);
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
  const [pipelineDispatchFilter, setPipelineDispatchFilter] = useState<'all' | 'truck_down'>('all');

  const fetchCriticalExpiries = useCallback(async () => {
    const { data } = await supabase
      .from('operators')
      .select('applications(cdl_expiration, medical_cert_expiration)')
      .not('application_id', 'is', null);
    if (!data) return;
    const today = startOfDay(new Date());
    let count = 0;
    (data as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      ['cdl_expiration', 'medical_cert_expiration'].forEach((field: string) => {
        const dateStr: string | null = app[field];
        if (!dateStr) return;
        const days = differenceInDays(startOfDay(parseISO(dateStr)), today);
        if (days <= 30) count++;
      });
    });
    setCriticalExpiryCount(count);
  }, []);

  useEffect(() => {
    fetchCriticalExpiries();
    const channel = supabase
      .channel('staff-compliance-badge')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' }, () => {
        fetchCriticalExpiries();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCriticalExpiries]);


  const fetchTruckDownOperators = useCallback(async () => {
    const { data } = await supabase
      .from('active_dispatch')
      .select(`
        operator_id,
        operators!inner(
          application_id,
          unit_number,
          applications(first_name, last_name),
          onboarding_status(unit_number)
        )
      `)
      .eq('dispatch_status', 'truck_down');

    if (!data) return;

    const ops = data.map((row: any) => {
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

  return (
    <>
    <StaffNotificationPreferencesModal open={prefOpen} onClose={() => setPrefOpen(false)} />
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
        <div className="mb-5 flex flex-wrap items-start sm:items-center justify-between gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 animate-fade-in">
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

      {currentView === 'pipeline' && (
        <PipelineDashboard
          onOpenOperator={op => { setPipelineDispatchFilter('all'); handleOpenOperator(op); }}
          initialDispatchFilter={pipelineDispatchFilter}
        />
      )}
      {currentView === 'operator-detail' && selectedOperatorId && (
        <OperatorDetailPanel
          operatorId={selectedOperatorId}
          onBack={handleBackToPipeline}
          onMessageOperator={handleMessageOperator}
          onUnsavedChangesChange={setOperatorHasUnsavedChanges}
        />
      )}
      {currentView === 'messages' && (
        <div className="h-full" style={{ height: 'calc(100vh - 160px - 64px)' }}>
          <MessagesView initialUserId={messageInitialUserId} />
        </div>
      )}
      {currentView === 'faq' && (
        <FaqManager />
      )}
      {currentView === 'resources' && (
        <ResourceLibraryManager />
      )}
      {currentView === 'notifications' && (
        <NotificationHistory />
      )}
    </StaffLayout>

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
