import { useState, useEffect } from 'react';
import StaffLayout from '@/components/layouts/StaffLayout';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PipelineDashboard from '../staff/PipelineDashboard';
import OperatorDetailPanel from '../staff/OperatorDetailPanel';
import { 
  LayoutDashboard, Users, ClipboardList, Truck, UserPlus, 
  CheckCircle2, Clock, AlertTriangle, XCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ManagementView = 'overview' | 'pipeline' | 'operator-detail' | 'applications' | 'dispatch' | 'staff';

interface ApplicationReview {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  submitted_at: string | null;
  review_status: string;
}

export default function ManagementPortal() {
  const { toast } = useToast();
  const [view, setView] = useState<ManagementView>('overview');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [pendingApps, setPendingApps] = useState<ApplicationReview[]>([]);
  const [metrics, setMetrics] = useState({ pending: 0, onboarding: 0, active: 0, alerts: 0 });

  useEffect(() => {
    fetchMetrics();
    fetchPendingApps();
  }, []);

  const fetchMetrics = async () => {
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
  };

  const fetchPendingApps = async () => {
    const { data } = await supabase
      .from('applications')
      .select('id, first_name, last_name, email, phone, submitted_at, review_status')
      .eq('review_status', 'pending')
      .eq('is_draft', false)
      .order('submitted_at', { ascending: true });
    if (data) setPendingApps(data);
  };

  const handleApprove = async (appId: string) => {
    const { error } = await supabase
      .from('applications')
      .update({ review_status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', appId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Application Approved', description: 'The applicant will receive an invitation email.' });
      fetchPendingApps();
      fetchMetrics();
    }
  };

  const handleDeny = async (appId: string) => {
    const { error } = await supabase
      .from('applications')
      .update({ review_status: 'denied', reviewed_at: new Date().toISOString() })
      .eq('id', appId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Application Denied', description: 'A notification has been logged.' });
      fetchPendingApps();
      fetchMetrics();
    }
  };

  const navItems = [
    { label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Applications', icon: <ClipboardList className="h-4 w-4" />, path: 'applications' },
    { label: 'Pipeline', icon: <Users className="h-4 w-4" />, path: 'pipeline' },
    { label: 'Dispatch', icon: <Truck className="h-4 w-4" />, path: 'dispatch' },
    { label: 'Staff', icon: <UserPlus className="h-4 w-4" />, path: 'staff' },
  ];

  return (
    <StaffLayout navItems={navItems} currentPath={view} onNavigate={(p) => setView(p as ManagementView)} title="Management">
      {view === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Management Overview</h1>
            <p className="text-muted-foreground text-sm mt-1">Company-wide snapshot and pending reviews</p>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Pending Applications', value: metrics.pending, icon: <Clock className="h-5 w-5 text-status-progress" />, color: 'bg-status-progress/10', action: () => setView('applications') },
              { label: 'In Onboarding', value: metrics.onboarding, icon: <Users className="h-5 w-5 text-gold" />, color: 'bg-gold/10', action: () => setView('pipeline') },
              { label: 'Active Operators', value: metrics.active, icon: <Truck className="h-5 w-5 text-status-complete" />, color: 'bg-status-complete/10', action: () => setView('dispatch') },
              { label: 'Alerts', value: metrics.alerts, icon: <AlertTriangle className="h-5 w-5 text-destructive" />, color: 'bg-destructive/10', action: () => setView('pipeline') },
            ].map(m => (
              <button key={m.label} onClick={m.action} className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow text-left">
                <div className={`h-11 w-11 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                  {m.icon}
                </div>
                <p className="text-3xl font-bold text-foreground">{m.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{m.label}</p>
              </button>
            ))}
          </div>

          {/* Pending applications */}
          {pendingApps.length > 0 && (
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-foreground">Pending Application Reviews</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{pendingApps.length} applications awaiting decision</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setView('applications')} className="text-gold text-xs">View all</Button>
              </div>
              <div className="divide-y divide-border">
                {pendingApps.slice(0, 5).map(app => (
                  <div key={app.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="font-medium text-foreground text-sm">
                        {app.first_name || app.last_name ? `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() : app.email}
                      </p>
                      <p className="text-xs text-muted-foreground">{app.email} · {app.phone ?? 'No phone'}</p>
                      {app.submitted_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Submitted {new Date(app.submitted_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeny(app.id)}
                        className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10 h-8"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(app.id)}
                        className="text-xs bg-status-complete text-white hover:bg-status-complete/90 h-8"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingApps.length === 0 && (
            <div className="bg-white border border-border rounded-xl p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-status-complete mx-auto mb-3" />
              <p className="font-medium text-foreground">All applications reviewed</p>
              <p className="text-sm text-muted-foreground mt-1">No applications pending review.</p>
            </div>
          )}
        </div>
      )}

      {view === 'applications' && (
        <div className="space-y-6 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">Application Reviews</h1>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="divide-y divide-border">
              {pendingApps.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No pending applications.</div>
              ) : pendingApps.map(app => (
                <div key={app.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-medium text-foreground">{app.first_name || app.last_name ? `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() : app.email}</p>
                    <p className="text-xs text-muted-foreground">{app.email} · {app.phone ?? 'No phone'}</p>
                    {app.submitted_at && <p className="text-xs text-muted-foreground">Submitted {new Date(app.submitted_at).toLocaleDateString()}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleDeny(app.id)} className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
                    </Button>
                    <Button size="sm" onClick={() => handleApprove(app.id)} className="text-xs bg-status-complete text-white hover:bg-status-complete/90">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'pipeline' && (
        <PipelineDashboard onOpenOperator={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }} />
      )}

      {view === 'operator-detail' && selectedOperatorId && (
        <OperatorDetailPanel operatorId={selectedOperatorId} onBack={() => setView('pipeline')} />
      )}

      {view === 'dispatch' && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>Dispatch view — use the Dispatch portal tab</p>
        </div>
      )}

      {view === 'staff' && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>Staff directory — coming soon</p>
        </div>
      )}
    </StaffLayout>
  );
}
