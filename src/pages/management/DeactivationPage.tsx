import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import StaffLayout from '@/components/layouts/StaffLayout';
import { DeactivationWizardContent } from '@/components/management/DeactivationWizardContent';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  LayoutDashboard, Users, ClipboardList, Briefcase, MessageSquare, BellRing, ShieldCheck, Container, Users2, Truck, Shield, Library, HardDrive, Car, BookOpen, UserPlus, HelpCircle, LifeBuoy, Settings2, ScrollText, LayoutTemplate, FileText, Megaphone, Mail, MailPlus, Pen, FileSignature, GraduationCap,
} from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';

interface OperatorDetail {
  id: string;
  user_id: string | null;
  is_active: boolean;
  unit_number: string | null;
  first_name: string | null;
  last_name: string | null;
  application_first_name?: string | null;
  application_last_name?: string | null;
}

export default function DeactivationPage() {
  const { operatorId } = useParams<{ operatorId: string }>();
  const navigate = useNavigate();
  const { isManagement, isOwner, user } = useAuth();
  const { toast } = useToast();
  const { isDemo, exitDemo } = useDemoMode();

  const [operator, setOperator] = useState<OperatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [truckDownCount, setTruckDownCount] = useState(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState(0);

  useEffect(() => {
    if (!operatorId) {
      navigate('/management?view=drivers', { replace: true });
      return;
    }

    async function loadOperator() {
      const [{ data, error }, onbRes, plateRes] = await Promise.all([
        supabase
          .from('operators')
          .select('id, user_id, is_active, unit_number, applications!inner(first_name, last_name)')
          .eq('id', operatorId)
          .maybeSingle(),
        supabase
          .from('onboarding_status')
          .select('unit_number')
          .eq('operator_id', operatorId)
          .maybeSingle(),
        supabase
          .from('mo_plate_assignments')
          .select('unit_number, returned_at')
          .eq('operator_id', operatorId)
          .order('assigned_at', { ascending: false })
          .limit(5),
      ]);
      if (error) {
        console.error('Failed to load operator for deactivation', error);
        toast({ title: 'Error loading driver', description: error.message, variant: 'destructive' });
        navigate('/management?view=drivers', { replace: true });
        return;
      }
      if (!data) {
        toast({ title: 'Driver not found', variant: 'destructive' });
        navigate('/management?view=drivers', { replace: true });
        return;
      }
      const app = (data as any).applications;
      const application = Array.isArray(app) ? app[0] : app;
      const plateUnit = (plateRes.data ?? []).find((r: any) => !r.returned_at && r.unit_number)?.unit_number
        ?? (plateRes.data ?? []).find((r: any) => r.unit_number)?.unit_number
        ?? null;
      const resolvedUnit =
        (data.unit_number || (onbRes.data as any)?.unit_number || plateUnit || null) as string | null;
      setOperator({
        id: data.id,
        user_id: data.user_id ?? null,
        is_active: data.is_active ?? true,
        unit_number: resolvedUnit,
        first_name: application?.first_name ?? null,
        last_name: application?.last_name ?? null,
      });
      setLoading(false);
    }

    void loadOperator();
  }, [operatorId, navigate, toast]);

  useEffect(() => {
    if (!user?.id) return;
    const loadCounts = async () => {
      const { count: notif } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null);
      const { count: msg } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', user.id).is('read_at', null);
      const { data: td } = await supabase.from('active_dispatch').select('id', { count: 'exact', head: true }).eq('dispatch_status', 'truck_down');
      setUnreadNotifCount(notif ?? 0);
      setUnreadMsgCount(msg ?? 0);
      setTruckDownCount((td as any)?.count ?? 0);
    };
    void loadCounts();
  }, [user?.id]);


  const operatorName = operator
    ? [operator.first_name, operator.last_name].filter(Boolean).join(' ') || 'Unknown Driver'
    : 'Driver';

  const navItems = [
    { label: 'Management Overview', icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Applications', icon: <ClipboardList className="h-4 w-4" />, path: 'applications' },
    { label: 'Onboarding Pipeline', icon: <Users className="h-4 w-4" />, path: 'pipeline', badge: criticalExpiryCount || undefined },
    { label: 'PEI Queue', icon: <Briefcase className="h-4 w-4" />, path: 'pei-queue' },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages', badge: unreadMsgCount },
    { label: 'Notifications', icon: <BellRing className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount },
    { label: 'Fleet Compliance', icon: <ShieldCheck className="h-4 w-4" />, path: 'compliance', badge: criticalExpiryCount || undefined },
    { label: 'Driver Status', icon: <Container className="h-4 w-4" />, path: 'dispatch', badge: truckDownCount || undefined },
    { label: 'Driver Hub', icon: <Users2 className="h-4 w-4" />, path: 'drivers' },
    { label: 'Vehicle Hub', icon: <Truck className="h-4 w-4" />, path: 'vehicle-hub' },
    { label: 'DOT Inspection Binder', icon: <Shield className="h-4 w-4" />, path: 'inspection-binder' },
    { label: 'Document Hub', icon: <Library className="h-4 w-4" />, path: 'docs-hub' },
    { label: 'Onboard Systems', icon: <HardDrive className="h-4 w-4" />, path: 'equipment' },
    { label: 'License Plate Registry', icon: <Car className="h-4 w-4" />, path: 'mo-plates' },
    { label: 'Resource Center', icon: <BookOpen className="h-4 w-4" />, path: 'resource-center' },
    { label: 'Staff Directory', icon: <UserPlus className="h-4 w-4" />, path: 'staff' },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Staff Help', icon: <LifeBuoy className="h-4 w-4" />, path: 'staff-help' },
    { label: 'Pipeline Config', icon: <Settings2 className="h-4 w-4" />, path: 'pipeline-config' },
    { label: 'Activity Log', icon: <ScrollText className="h-4 w-4" />, path: 'activity' },
    { label: 'Content Manager', icon: <LayoutTemplate className="h-4 w-4" />, path: 'content-manager' },
    { label: 'Forms Catalog', icon: <FileText className="h-4 w-4" />, path: 'forms-catalog' },
    { label: "What's New", icon: <Megaphone className="h-4 w-4" />, path: 'whats-new' },
    { label: 'Broadcast Email', icon: <Mail className="h-4 w-4" />, path: 'broadcast' },
    { label: 'Email Log', icon: <MailPlus className="h-4 w-4" />, path: 'email-log' },
    { label: 'Carrier Signature', icon: <Pen className="h-4 w-4" />, path: 'carrier-signature' },
    { label: 'Lease Terminations', icon: <FileSignature className="h-4 w-4" />, path: 'terminations' },
    { label: 'Demo Mode', icon: <GraduationCap className="h-4 w-4" />, path: '__demo__' },
  ];

  const mobileNavItems = [
    { label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Pipeline', icon: <Users className="h-4 w-4" />, path: 'pipeline', badge: criticalExpiryCount || undefined },
    { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: 'messages', badge: unreadMsgCount },
    { label: 'Compliance', icon: <ShieldCheck className="h-4 w-4" />, path: 'compliance', badge: criticalExpiryCount || undefined },
    { label: 'Notifs', icon: <BellRing className="h-4 w-4" />, path: 'notifications', badge: unreadNotifCount },
  ];

  const handleNavigate = (path: string) => {
    if (path === '__demo__') {
      if (isDemo) exitDemo(); else navigate('/management?view=demo');
      return;
    }
    navigate(`/management?view=${path}`);
  };

  const handleComplete = () => {
    navigate(`/management?view=drivers&deactivated=${operatorId}`);
  };

  const handleCancel = () => {
    navigate(`/management?view=operator-detail&op=${operatorId}`);
  };

  if (loading) {
    return (
      <StaffLayout
        navItems={navItems}
        mobileNavItems={mobileNavItems}
        currentPath="drivers"
        onNavigate={handleNavigate}
        title="Management"
        isDemo={isDemo}
        onExitDemo={exitDemo}
        headerActions={
          <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      >
        <div className="flex items-center justify-center h-[60dvh]">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </StaffLayout>
    );
  }

  if (!operator) return null;

  return (
    <StaffLayout
      navItems={navItems}
      mobileNavItems={mobileNavItems}
      currentPath="drivers"
      onNavigate={handleNavigate}
      title="Management"
      isDemo={isDemo}
      onExitDemo={exitDemo}
      headerActions={
        <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      <div className="h-full flex flex-col min-w-0 overflow-x-clip">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handleCancel} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden border border-border rounded-xl bg-card p-4 lg:p-6 shadow-sm">
          <DeactivationWizardContent
            operatorId={operator.id}
            operatorName={operatorName}
            unitNumber={operator.unit_number}
            isActive={operator.is_active}
            isManagement={isManagement || isOwner}
            onComplete={handleComplete}
            onCancel={handleCancel}
            layout="page"
          />
        </div>
      </div>
    </StaffLayout>
  );
}
