import { useState } from 'react';
import StaffLayout from '@/components/layouts/StaffLayout';
import PipelineDashboard from './PipelineDashboard';
import OperatorDetailPanel from './OperatorDetailPanel';
import FaqManager from '@/components/management/FaqManager';
import ResourceLibraryManager from '@/components/management/ResourceLibraryManager';
import MessagesView from '@/components/staff/MessagesView';
import { LayoutDashboard, MessageSquare, HelpCircle, BookOpen } from 'lucide-react';

type StaffView = 'pipeline' | 'operator-detail' | 'messages' | 'faq' | 'resources';

export default function StaffPortal() {
  const [currentView, setCurrentView] = useState<StaffView>('pipeline');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);

  const navItems = [
    { label: 'Pipeline', icon: <LayoutDashboard className="h-4 w-4" />, path: 'pipeline' },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages' },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Resources', icon: <BookOpen className="h-4 w-4" />, path: 'resources' },
  ];

  const handleOpenOperator = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setCurrentView('operator-detail');
  };

  const handleBackToPipeline = () => {
    setSelectedOperatorId(null);
    setCurrentView('pipeline');
  };

  return (
    <StaffLayout
      navItems={navItems}
      currentPath={currentView}
      onNavigate={(path) => setCurrentView(path as StaffView)}
      title="Onboarding"
    >
      {currentView === 'pipeline' && (
        <PipelineDashboard onOpenOperator={handleOpenOperator} />
      )}
      {currentView === 'operator-detail' && selectedOperatorId && (
        <OperatorDetailPanel operatorId={selectedOperatorId} onBack={handleBackToPipeline} />
      )}
      {currentView === 'messages' && (
        <div className="h-full" style={{ height: 'calc(100vh - 160px)' }}>
          <MessagesView />
        </div>
      )}
      {currentView === 'faq' && (
        <FaqManager />
      )}
      {currentView === 'resources' && (
        <ResourceLibraryManager />
      )}
    </StaffLayout>
  );
}
