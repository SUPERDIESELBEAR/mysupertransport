import { useState, useEffect, useCallback } from 'react';
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
import DispatchPortal from '../dispatch/DispatchPortal';
import {
  LayoutDashboard, Users, ClipboardList, Truck, UserPlus, HelpCircle, BookOpen,
  CheckCircle2, Clock, AlertTriangle, ChevronRight,
  Search, RefreshCcw, Eye, ScrollText, TriangleAlert
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ManagementView = 'overview' | 'pipeline' | 'operator-detail' | 'applications' | 'dispatch' | 'staff' | 'faq' | 'resources' | 'activity';
type StatusFilter = 'pending' | 'approved' | 'denied' | 'all';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress border-status-progress/30',
  approved: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  denied: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function ManagementPortal() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [view, setView] = useState<ManagementView>('overview');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [operatorHasUnsavedChanges, setOperatorHasUnsavedChanges] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const [applications, setApplications] = useState<FullApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingApps, setLoadingApps] = useState(false);
  const [selectedApp, setSelectedApp] = useState<FullApplication | null>(null);
  const [metrics, setMetrics] = useState({ pending: 0, onboarding: 0, active: 0, alerts: 0 });
  const [truckDownCount, setTruckDownCount] = useState(0);

  const fetchTruckDownCount = useCallback(async () => {
    const { count } = await supabase
      .from('active_dispatch')
      .select('id', { count: 'exact', head: true })
      .eq('dispatch_status', 'truck_down');
    setTruckDownCount(count ?? 0);
  }, []);

  // Subscribe to realtime changes on active_dispatch to keep the banner live
  useEffect(() => {
    fetchTruckDownCount();
    const channel = supabase
      .channel('mgmt-truck-down-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_dispatch' }, () => {
        fetchTruckDownCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTruckDownCount]);

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
    }
  };

  const confirmNavigation = () => {
    if (pendingNavPath) {
      setOperatorHasUnsavedChanges(false);
      setView(pendingNavPath as ManagementView);
      if (pendingNavPath !== 'operator-detail') setSelectedOperatorId(null);
      setPendingNavPath(null);
    }
  };

  const navItems = [
    { label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, path: 'overview' },
    { label: 'Applications', icon: <ClipboardList className="h-4 w-4" />, path: 'applications' },
    { label: 'Pipeline', icon: <Users className="h-4 w-4" />, path: 'pipeline' },
    { label: 'Dispatch', icon: <Truck className="h-4 w-4" />, path: 'dispatch' },
    { label: 'Staff', icon: <UserPlus className="h-4 w-4" />, path: 'staff' },
    { label: 'Activity', icon: <ScrollText className="h-4 w-4" />, path: 'activity' },
    { label: 'FAQ Manager', icon: <HelpCircle className="h-4 w-4" />, path: 'faq' },
    { label: 'Resources', icon: <BookOpen className="h-4 w-4" />, path: 'resources' },
  ];

  return (
    <>
      <StaffLayout navItems={navItems} currentPath={view} onNavigate={(p) => setView(p as ManagementView)} title="Management">
        {/* ── TRUCK DOWN ALERT BANNER ── */}
        {truckDownCount > 0 && (
          <div className="mb-5 flex items-center justify-between gap-4 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 animate-fade-in">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 shrink-0">
                <TriangleAlert className="h-4 w-4 text-destructive animate-pulse" />
              </span>
              <div>
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
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Management Overview</h1>
              <p className="text-muted-foreground text-sm mt-1">Company-wide snapshot and pending reviews</p>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Pending Applications', value: metrics.pending, icon: <Clock className="h-5 w-5 text-status-progress" />, color: 'bg-status-progress/10', action: () => { setStatusFilter('pending'); setView('applications'); } },
                { label: 'In Onboarding', value: metrics.onboarding, icon: <Users className="h-5 w-5 text-gold" />, color: 'bg-gold/10', action: () => setView('pipeline') },
                { label: 'Active Dispatch', value: metrics.active, icon: <Truck className="h-5 w-5 text-status-complete" />, color: 'bg-status-complete/10', action: () => setView('dispatch') },
                { label: 'Alerts', value: metrics.alerts, icon: <AlertTriangle className="h-5 w-5 text-destructive" />, color: 'bg-destructive/10', action: () => setView('pipeline') },
              ].map(m => (
                <button key={m.label} onClick={m.action} className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow text-left group">
                  <div className={`h-11 w-11 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                    {m.icon}
                  </div>
                  <p className="text-3xl font-bold text-foreground">{m.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{m.label}</p>
                </button>
              ))}
            </div>

            {/* Pending queue preview */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-foreground">Pending Application Reviews</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingApps.length > 0 ? `${pendingApps.length} application${pendingApps.length !== 1 ? 's' : ''} awaiting decision` : 'All caught up!'}
                  </p>
                </div>
                {pendingApps.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('pending'); setView('applications'); }} className="text-gold text-xs gap-1">
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
                      <div key={app.id} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm">{name}</p>
                          <p className="text-xs text-muted-foreground">{app.email} · {app.phone ?? 'No phone'}</p>
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
                          className="ml-3 text-xs gap-1.5 shrink-0"
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
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Application Reviews</h1>
                <p className="text-sm text-muted-foreground mt-1">Review, approve, or deny driver applications</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchApplications} className="gap-1.5" disabled={loadingApps}>
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
                    className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-r border-border last:border-0 ${
                      statusFilter === s
                        ? 'bg-surface-dark text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                    {s === 'pending' && metrics.pending > 0 && (
                      <span className="ml-1.5 bg-status-progress text-white text-[10px] px-1.5 py-0.5 rounded-full">{metrics.pending}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Applications table */}
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
                  {/* Table header */}
                  <div className="grid grid-cols-12 px-5 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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
                        className="grid grid-cols-12 items-center px-5 py-4 hover:bg-secondary/20 transition-colors cursor-pointer group"
                        onClick={() => setSelectedApp(app)}
                      >
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
          <PipelineDashboard onOpenOperator={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }} />
        )}

        {view === 'operator-detail' && selectedOperatorId && (
          <OperatorDetailPanel operatorId={selectedOperatorId} onBack={() => setView('pipeline')} />
        )}

        {view === 'dispatch' && (
          <DispatchPortal embedded />
        )}

        {view === 'staff' && (
          <StaffDirectory />
        )}

        {view === 'activity' && (
          <ActivityLog />
        )}

        {view === 'faq' && (
          <FaqManager />
        )}

        {view === 'resources' && (
          <ResourceLibraryManager />
        )}
      </StaffLayout>

      {/* Application Review Drawer (rendered outside layout to overlay correctly) */}
      {selectedApp && (
        <ApplicationReviewDrawer
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}
    </>
  );
}
