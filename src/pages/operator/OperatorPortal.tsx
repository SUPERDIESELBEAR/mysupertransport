import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  MessageSquare, BookOpen, HelpCircle, FileText,
  LogOut, Menu, X, Upload, Shield, FileCheck, Truck, TriangleAlert, Phone
} from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
import OperatorDocumentUpload from '@/components/operator/OperatorDocumentUpload';
import { OperatorResourceLibrary, OperatorFAQ } from '@/components/operator/OperatorResourcesAndFAQ';
import OperatorMessagesView from '@/components/operator/OperatorMessagesView';
import NotificationBell from '@/components/NotificationBell';
import OperatorStatusPage from '@/components/operator/OperatorStatusPage';
import OperatorDispatchStatus from '@/components/operator/OperatorDispatchStatus';
import OperatorICASign from '@/components/operator/OperatorICASign';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';
type OperatorView = 'progress' | 'documents' | 'messages' | 'resources' | 'faq' | 'dispatch' | 'ica';

interface Stage {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: StageStatus;
  substeps: { label: string; value: string; status: StageStatus }[];
  hint?: string;
}

interface UploadedDoc {
  id: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

export default function OperatorPortal() {
  const { profile, user, signOut } = useAuth();
  const location = useLocation();
  const [view, setView] = useState<OperatorView>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'ica') return 'ica';
    return 'progress';
  });

  // React to in-app notification deep-links when navigate() is called while portal is already mounted
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'ica') setView('ica');
  }, [location.search]);
  const [onboardingStatus, setOnboardingStatus] = useState<Record<string, string | null>>({});
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [assignedDispatcher, setAssignedDispatcher] = useState<{ name: string; phone: string | null } | null>(null);
  const [messageInitialUserId, setMessageInitialUserId] = useState<string | null>(null);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const fetchDispatcherInfo = useCallback(async (dispatcherUserId: string | null) => {
    if (!dispatcherUserId) { setAssignedDispatcher(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('user_id', dispatcherUserId)
      .maybeSingle();
    if (data) {
      setAssignedDispatcher({
        name: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Dispatcher',
        phone: data.phone ?? null,
      });
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: op } = await supabase
      .from('operators')
      .select('id, onboarding_status(*), operator_documents(*)')
      .eq('user_id', user.id)
      .single();

    if (op) {
      const opId = (op as any).id;
      setOperatorId(opId);
      // onboarding_status is a 1:1 relation — returns object, not array
      const os = (op as any).onboarding_status ?? {};
      setOnboardingStatus(os);
      setUploadedDocs((op as any).operator_documents ?? []);

      // Fetch current dispatch status + assigned dispatcher
      const { data: dispatch } = await supabase
        .from('active_dispatch')
        .select('dispatch_status, assigned_dispatcher')
        .eq('operator_id', opId)
        .maybeSingle();
      setDispatchStatus((dispatch as any)?.dispatch_status ?? null);
      fetchDispatcherInfo((dispatch as any)?.assigned_dispatcher ?? null);
    }
  }, [user, fetchDispatcherInfo]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null);
    setUnreadCount(count ?? 0);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount]);

  // Realtime: update dispatch status live so the banner appears/disappears without refresh
  useEffect(() => {
    if (!operatorId) return;
    const channel = supabase
      .channel(`operator-dispatch-status-${operatorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'active_dispatch',
        filter: `operator_id=eq.${operatorId}`,
      }, (payload: any) => {
        setDispatchStatus(payload.new?.dispatch_status ?? null);
        fetchDispatcherInfo(payload.new?.assigned_dispatcher ?? null);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [operatorId, fetchDispatcherInfo]);

  // Clear unread count when messages tab is opened
  useEffect(() => {
    if (view === 'messages') {
      setUnreadCount(0);
    }
  }, [view]);

  // Realtime: increment badge when a new message arrives (subscribe once per user)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('operator-unread-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, () => {
        // Use ref so we never need to re-subscribe when view changes
        if (viewRef.current !== 'messages') {
          setUnreadCount(prev => prev + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // only re-subscribe when user changes

  const displayName = profile?.first_name ?? 'Operator';

  // ── Stage status logic ─────────────────────────────────────────────────
  const getStageStatus = (stageNum: number): StageStatus => {
    const s = onboardingStatus;
    switch (stageNum) {
      case 1:
        if (s.mvr_ch_approval === 'denied' || s.pe_screening_result === 'non_clear') return 'action_required';
        if (s.pe_screening_result === 'clear') return 'complete';
        if (s.mvr_status !== 'not_started' && s.mvr_status != null) return 'in_progress';
        return 'not_started';
      case 2:
        if (s.form_2290 === 'received' && s.truck_title === 'received' && s.truck_photos === 'received' && s.truck_inspection === 'received') return 'complete';
        if (s.form_2290 !== 'not_started' || s.truck_title !== 'not_started' || uploadedDocs.length > 0) return 'in_progress';
        return 'not_started';
      case 3:
        if (s.ica_status === 'complete') return 'complete';
        if (s.ica_status === 'sent_for_signature') return 'action_required';
        return 'not_started';
      case 4:
        if (s.registration_status === 'own_registration') return 'complete';
        if (s.mo_reg_received === 'yes') return 'complete';
        if (s.mo_docs_submitted === 'submitted') return 'in_progress';
        if (s.registration_status === 'needs_mo_reg') return 'not_started';
        return 'not_started';
      case 5:
        if (s.decal_applied === 'yes' && s.eld_installed === 'yes' && s.fuel_card_issued === 'yes') return 'complete';
        if (s.decal_applied === 'yes' || s.eld_installed === 'yes') return 'in_progress';
        return 'not_started';
      case 6:
        if (s.insurance_added_date) return 'complete';
        return 'not_started';
      default:
        return 'not_started';
    }
  };

  const fmt = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const stages: Stage[] = [
    {
      number: 1,
      title: 'Background Check',
      description: 'MVR, Clearinghouse, and pre-employment drug screening',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(1),
      substeps: [
        { label: 'MVR', value: fmt(onboardingStatus.mvr_status ?? 'not_started'), status: onboardingStatus.mvr_status === 'received' ? 'complete' : onboardingStatus.mvr_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'Clearinghouse', value: fmt(onboardingStatus.ch_status ?? 'not_started'), status: onboardingStatus.ch_status === 'received' ? 'complete' : onboardingStatus.ch_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'MVR/CH Approval', value: fmt(onboardingStatus.mvr_ch_approval ?? 'pending'), status: onboardingStatus.mvr_ch_approval === 'approved' ? 'complete' : onboardingStatus.mvr_ch_approval === 'denied' ? 'action_required' : 'in_progress' },
        { label: 'PE Screening', value: fmt(onboardingStatus.pe_screening ?? 'not_started'), status: onboardingStatus.pe_screening === 'results_in' ? 'complete' : onboardingStatus.pe_screening === 'scheduled' ? 'in_progress' : 'not_started' },
        { label: 'PE Result', value: fmt(onboardingStatus.pe_screening_result ?? 'pending'), status: onboardingStatus.pe_screening_result === 'clear' ? 'complete' : onboardingStatus.pe_screening_result === 'non_clear' ? 'action_required' : 'in_progress' },
      ],
      hint: 'Your onboarding coordinator will initiate your MVR, Clearinghouse, and drug screening. No action needed yet.',
    },
    {
      number: 2,
      title: 'Documents',
      description: 'Form 2290, truck title, photos, and inspection report',
      icon: <FileCheck className="h-4 w-4" />,
      status: getStageStatus(2),
      substeps: [
        { label: 'Form 2290', value: fmt(onboardingStatus.form_2290 ?? 'not_started'), status: onboardingStatus.form_2290 === 'received' ? 'complete' : onboardingStatus.form_2290 === 'requested' ? 'action_required' : uploadedDocs.some(d => d.document_type === 'form_2290') ? 'in_progress' : 'not_started' },
        { label: 'Truck Title', value: fmt(onboardingStatus.truck_title ?? 'not_started'), status: onboardingStatus.truck_title === 'received' ? 'complete' : onboardingStatus.truck_title === 'requested' ? 'action_required' : uploadedDocs.some(d => d.document_type === 'truck_title') ? 'in_progress' : 'not_started' },
        { label: 'Truck Photos', value: fmt(onboardingStatus.truck_photos ?? 'not_started'), status: onboardingStatus.truck_photos === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_photos') ? 'in_progress' : 'not_started' },
        { label: 'Truck Inspection', value: fmt(onboardingStatus.truck_inspection ?? 'not_started'), status: onboardingStatus.truck_inspection === 'received' ? 'complete' : uploadedDocs.some(d => d.document_type === 'truck_inspection') ? 'in_progress' : 'not_started' },
      ],
    },
    {
      number: 3,
      title: 'ICA Agreement',
      description: 'Independent Contractor Agreement — sign electronically',
      icon: <FileText className="h-4 w-4" />,
      status: getStageStatus(3),
      substeps: [
        { label: 'ICA Status', value: fmt(onboardingStatus.ica_status ?? 'not_issued'), status: onboardingStatus.ica_status === 'complete' ? 'complete' : onboardingStatus.ica_status === 'sent_for_signature' ? 'action_required' : 'not_started' },
      ],
    },
    {
      number: 4,
      title: 'Missouri Registration',
      description: onboardingStatus.registration_status === 'own_registration' ? 'Using own registration — no action needed' : onboardingStatus.mo_docs_submitted === 'submitted' ? 'Documents submitted, awaiting state approval' : 'Requires Form 2290, truck title + signed ICA',
      icon: <FileCheck className="h-4 w-4" />,
      status: getStageStatus(4),
      substeps: onboardingStatus.registration_status === 'needs_mo_reg' ? [
        { label: 'MO Docs Submitted', value: fmt(onboardingStatus.mo_docs_submitted ?? 'not_submitted'), status: onboardingStatus.mo_docs_submitted === 'submitted' ? 'in_progress' : 'not_started' },
        { label: 'MO Reg Received', value: fmt(onboardingStatus.mo_reg_received ?? 'not_yet'), status: onboardingStatus.mo_reg_received === 'yes' ? 'complete' : 'not_started' },
      ] : [],
    },
    {
      number: 5,
      title: 'Equipment Setup',
      description: 'Decal, ELD device, and fuel card',
      icon: <Truck className="h-4 w-4" />,
      status: getStageStatus(5),
      substeps: [
        { label: 'Decal Applied', value: fmt(onboardingStatus.decal_applied ?? 'no'), status: onboardingStatus.decal_applied === 'yes' ? 'complete' : 'not_started' },
        { label: 'ELD Installed', value: fmt(onboardingStatus.eld_installed ?? 'no'), status: onboardingStatus.eld_installed === 'yes' ? 'complete' : 'not_started' },
        { label: 'Fuel Card Issued', value: fmt(onboardingStatus.fuel_card_issued ?? 'no'), status: onboardingStatus.fuel_card_issued === 'yes' ? 'complete' : 'not_started' },
      ],
      hint: 'Your onboarding coordinator will arrange decal installation, ELD setup, and fuel card issuance.',
    },
    {
      number: 6,
      title: 'Insurance & Activation',
      description: onboardingStatus.insurance_added_date ? `Added to policy on ${new Date(onboardingStatus.insurance_added_date).toLocaleDateString()}` : 'Added to insurance policy and assigned unit number',
      icon: <Shield className="h-4 w-4" />,
      status: getStageStatus(6),
      substeps: [
        { label: 'Insurance', value: onboardingStatus.insurance_added_date ? 'Added' : 'Pending', status: onboardingStatus.insurance_added_date ? 'complete' : 'not_started' },
        ...(onboardingStatus.unit_number ? [{ label: 'Unit Number', value: onboardingStatus.unit_number, status: 'complete' as StageStatus }] : []),
      ],
    },
  ];

  const completedStages = stages.filter(s => s.status === 'complete').length;
  const progressPct = Math.round((completedStages / stages.length) * 100);
  const isFullyOnboarded = onboardingStatus.insurance_added_date != null;

  const currentStageIndex = stages.findIndex(s => s.status === 'action_required' || s.status === 'in_progress' || s.status === 'not_started');
  const currentStage = currentStageIndex >= 0 ? stages[currentStageIndex] : null;

  const navItems = [
    { view: 'progress' as OperatorView, label: 'My Progress', icon: <CheckCircle2 className="h-5 w-5" /> },
    { view: 'documents' as OperatorView, label: 'Documents', icon: <Upload className="h-5 w-5" /> },
    { view: 'ica' as OperatorView, label: 'ICA', icon: <FileText className="h-5 w-5" />, showIf: onboardingStatus.ica_status === 'sent_for_signature' || onboardingStatus.ica_status === 'complete' },
    { view: 'dispatch' as OperatorView, label: 'Dispatch', icon: <Truck className="h-5 w-5" />, onlyOnboarded: true },
    { view: 'messages' as OperatorView, label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
    { view: 'resources' as OperatorView, label: 'Resources', icon: <BookOpen className="h-5 w-5" /> },
    { view: 'faq' as OperatorView, label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> },
  ].filter(item => {
    if ('onlyOnboarded' in item && !isFullyOnboarded) return false;
    if ('showIf' in item && !item.showIf) return false;
    return true;
  });

  const statusConfig: Record<StageStatus, { color: string; badge: string; icon: React.ReactNode }> = {
    complete: { color: 'border-status-complete/30 bg-status-complete/5', badge: 'bg-status-complete/15 text-status-complete border-status-complete/30', icon: <CheckCircle2 className="h-5 w-5 text-status-complete" /> },
    in_progress: { color: 'border-gold/40 shadow-gold/10 shadow-md', badge: 'bg-gold/15 text-gold-muted border-gold/30', icon: <Clock className="h-5 w-5 text-gold" /> },
    action_required: { color: 'border-destructive/40 shadow-destructive/10 shadow-md', badge: 'bg-destructive/15 text-destructive border-destructive/30', icon: <AlertTriangle className="h-5 w-5 text-destructive" /> },
    not_started: { color: 'border-border', badge: 'bg-muted text-muted-foreground border-border', icon: <Circle className="h-5 w-5 text-muted-foreground/40" /> },
  };

  return (
    <div className="min-h-screen bg-secondary">
      {/* Top nav */}
      <header className="bg-surface-dark border-b border-surface-dark-border sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <img src={logo} alt="SUPERTRANSPORT" className="h-10 w-auto" />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  view === item.view
                    ? 'bg-gold/15 text-gold'
                    : 'text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card'
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {item.view === 'messages' && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <NotificationBell variant="dark" />
            <button
              onClick={signOut}
              className="hidden md:flex text-surface-dark-muted hover:text-destructive p-2 rounded-lg hover:bg-surface-dark-card transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <button
              className="md:hidden text-surface-dark-muted hover:text-surface-dark-foreground p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-surface-dark-border bg-surface-dark px-4 py-3">
            <div className="grid grid-cols-4 gap-2">
              {navItems.map(item => (
                <button
                  key={item.view}
                  onClick={() => { setView(item.view); setMobileMenuOpen(false); }}
                  className={`relative flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium transition-colors ${
                    view === item.view ? 'bg-gold/15 text-gold' : 'text-surface-dark-muted'
                  }`}
                >
                  <span className="relative">
                    {item.icon}
                    {item.view === 'messages' && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px]">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-surface-dark-border flex justify-center">
              <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-surface-dark-muted hover:text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ── TRUCK DOWN ALERT BANNER ── */}
        {dispatchStatus === 'truck_down' && (
          <div className="bg-destructive/10 border border-destructive/40 rounded-xl px-4 py-3.5 animate-fade-in space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 shrink-0">
                  <TriangleAlert className="h-4 w-4 text-destructive animate-pulse" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-destructive leading-tight">🔴 Your Truck is Marked Down</p>
                  <p className="text-xs text-destructive/70 mt-0.5 leading-snug">
                    Your dispatcher has flagged your truck as out of service. Contact your dispatcher immediately.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setView('messages')}
                className="shrink-0 flex items-center gap-1.5 bg-destructive text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-destructive/90 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Message Dispatcher
              </button>
            </div>
            {/* Dispatcher contact info */}
            {assignedDispatcher && (
              <div className="flex items-center gap-3 border-t border-destructive/20 pt-2.5">
                <div className="h-7 w-7 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                  <span className="text-destructive text-xs font-bold">
                    {assignedDispatcher.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{assignedDispatcher.name}</span>
                  {assignedDispatcher.phone ? (
                    <a
                      href={`tel:${assignedDispatcher.phone}`}
                      className="text-xs text-destructive font-medium hover:underline flex items-center gap-1"
                    >
                      <Phone className="h-3 w-3" />
                      {assignedDispatcher.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No phone on file — use messages</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ICA ACTION-REQUIRED BANNER ── */}
        {onboardingStatus.ica_status === 'sent_for_signature' && view !== 'ica' && (
          <div className="bg-[hsl(var(--gold)/0.08)] border border-[hsl(var(--gold)/0.5)] rounded-xl px-4 py-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--gold)/0.15)] shrink-0">
                  <FileText className="h-5 w-5 text-gold animate-pulse" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gold leading-tight">
                    ✍️ Action Required — Sign Your ICA Agreement
                  </p>
                  <p className="text-xs text-gold/70 mt-0.5 leading-snug">
                    Your Independent Contractor Agreement is ready and waiting for your signature.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setView('ica')}
                className="shrink-0 flex items-center gap-1.5 bg-gold text-surface-dark text-xs font-bold px-4 py-2 rounded-lg hover:bg-gold-light transition-colors shadow-sm"
              >
                <FileText className="h-3.5 w-3.5" />
                Review &amp; Sign Now
              </button>
            </div>
          </div>
        )}

        {/* ── DOCUMENTS REQUESTED BANNER ── */}
        {(() => {
          const requestedDocs = [
            onboardingStatus.form_2290 === 'requested' && 'Form 2290',
            onboardingStatus.truck_title === 'requested' && 'Truck Title',
            onboardingStatus.truck_photos === 'requested' && 'Truck Photos',
            onboardingStatus.truck_inspection === 'requested' && 'Truck Inspection',
          ].filter(Boolean) as string[];
          if (requestedDocs.length === 0 || view === 'documents') return null;
          return (
            <div className="bg-info/8 border border-info/40 rounded-xl px-4 py-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-info/15 shrink-0">
                    <Upload className="h-5 w-5 text-info animate-pulse" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-info leading-tight">
                      📎 Documents Requested — Upload Required
                    </p>
                    <p className="text-xs text-info/70 mt-0.5 leading-snug">
                      Your coordinator is waiting for:{' '}
                      <span className="font-semibold">{requestedDocs.join(', ')}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setView('documents')}
                  className="shrink-0 flex items-center gap-1.5 bg-info text-info-foreground text-xs font-bold px-4 py-2 rounded-lg hover:bg-info/90 transition-colors shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Documents
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── PROGRESS VIEW ── */}
        {view === 'progress' && (
          <OperatorStatusPage
            stages={stages}
            isFullyOnboarded={isFullyOnboarded}
            progressPct={progressPct}
            completedStages={completedStages}
            currentStage={currentStage}
            onboardingStatus={onboardingStatus}
            onNavigateTo={(v) => setView(v as OperatorView)}
            displayName={displayName}
          />
        )}

        {/* ── DOCUMENTS VIEW ── */}
        {view === 'documents' && operatorId && (
          <OperatorDocumentUpload
            operatorId={operatorId}
            uploadedDocs={uploadedDocs}
            onUploadComplete={fetchData}
          />
        )}
        {view === 'documents' && !operatorId && (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading your operator profile…</div>
        )}

        {/* ── RESOURCES VIEW ── */}
        {view === 'resources' && <OperatorResourceLibrary />}

        {/* ── FAQ VIEW ── */}
        {view === 'faq' && <OperatorFAQ />}

        {/* ── MESSAGES VIEW ── */}
        {view === 'messages' && (
          <OperatorMessagesView
            initialUserId={messageInitialUserId ?? undefined}
            onThreadSelected={() => setMessageInitialUserId(null)}
          />
        )}

        {/* ── DISPATCH STATUS VIEW ── */}
        {view === 'dispatch' && operatorId && (
          <OperatorDispatchStatus
            operatorId={operatorId}
            onMessageDispatcher={(dispatcherUserId) => {
              setMessageInitialUserId(dispatcherUserId);
              setView('messages');
            }}
          />
        )}

        {/* ── ICA SIGNING VIEW ── */}
        {view === 'ica' && <OperatorICASign />}
      </div>
    </div>
  );
}
