import { useState, useEffect, useRef } from 'react';
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
import { LayoutDashboard, MessageSquare, HelpCircle, BookOpen, SlidersHorizontal, Bell } from 'lucide-react';
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
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
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
    { label: 'Pipeline', icon: <LayoutDashboard className="h-4 w-4" />, path: 'pipeline' },
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
      {currentView === 'pipeline' && (
        <PipelineDashboard onOpenOperator={handleOpenOperator} />
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
        <div className="h-full" style={{ height: 'calc(100vh - 160px)' }}>
          <MessagesView initialUserId={messageInitialUserId} />
        </div>
      )}
      {currentView === 'faq' && (
        <FaqManager />
      )}
      {currentView === 'resources' && (
        <ResourceLibraryManager />
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
