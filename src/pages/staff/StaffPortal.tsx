import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import StaffLayout from '@/components/layouts/StaffLayout';
import PipelineDashboard from './PipelineDashboard';
import OperatorDetailPanel from './OperatorDetailPanel';
import FaqManager from '@/components/management/FaqManager';
import ResourceLibraryManager from '@/components/management/ResourceLibraryManager';
import MessagesView from '@/components/staff/MessagesView';
import StaffNotificationPreferencesModal from '@/components/staff/StaffNotificationPreferencesModal';
import { LayoutDashboard, MessageSquare, HelpCircle, BookOpen, SlidersHorizontal } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type StaffView = 'pipeline' | 'operator-detail' | 'messages' | 'faq' | 'resources';

export default function StaffPortal() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<StaffView>('pipeline');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const viewRef = useRef(currentView);

  // Fetch initial unread count
  useEffect(() => {
    if (!user) return;
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [user]);

  // Clear badge when Messages tab is opened
  useEffect(() => {
    if (currentView === 'messages') setUnreadCount(0);
  }, [currentView]);

  // Realtime: increment badge when a new message arrives (subscribe once per user)
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

  const navItems = [
    { label: 'Pipeline', icon: <LayoutDashboard className="h-4 w-4" />, path: 'pipeline' },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages', badge: unreadCount },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Resources', icon: <BookOpen className="h-4 w-4" />, path: 'resources' },
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

  return (
    <>
    <StaffLayout
      navItems={navItems}
      currentPath={currentView}
      onNavigate={handleNavigate}
      title="Onboarding"
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
