import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, ChevronRight,
  Truck, Bell, MessageSquare, BookOpen, HelpCircle, FileText, LogOut, Menu, X
} from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';

interface Stage {
  number: number;
  title: string;
  description: string;
  status: StageStatus;
  substeps: { label: string; value: string; status: StageStatus }[];
}

type OperatorView = 'progress' | 'documents' | 'messages' | 'resources' | 'dot' | 'faq';

export default function OperatorPortal() {
  const { profile, user, signOut, activeRole } = useAuth();
  const [view, setView] = useState<OperatorView>('progress');
  const [onboardingStatus, setOnboardingStatus] = useState<Record<string, string | null>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [user]);

  const fetchStatus = async () => {
    if (!user) return;
    const { data: op } = await supabase
      .from('operators')
      .select('id, onboarding_status(*)')
      .eq('user_id', user.id)
      .single();
    if (op) {
      const os = (op as any).onboarding_status?.[0] ?? {};
      setOnboardingStatus(os);
    }
  };

  const displayName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : 'Operator';

  const getStageStatus = (stageNum: number): StageStatus => {
    const s = onboardingStatus;
    switch (stageNum) {
      case 1:
        if (s.mvr_ch_approval === 'denied' || s.pe_screening_result === 'non_clear') return 'action_required';
        if (s.pe_screening_result === 'clear') return 'complete';
        if (s.mvr_status !== 'not_started') return 'in_progress';
        return 'not_started';
      case 2:
        if (s.form_2290 === 'received' && s.truck_title === 'received' && s.truck_photos === 'received' && s.truck_inspection === 'received') return 'complete';
        if (s.form_2290 !== 'not_started' || s.truck_title !== 'not_started') return 'in_progress';
        return getStageStatus(1) === 'complete' ? 'not_started' : 'not_started';
      case 3:
        if (s.ica_status === 'complete') return 'complete';
        if (s.ica_status === 'sent_for_signature') return 'action_required';
        return 'not_started';
      case 4:
        if (s.registration_status !== 'needs_mo_reg') return 'complete';
        if (s.mo_reg_received === 'yes') return 'complete';
        if (s.mo_docs_submitted === 'submitted') return 'in_progress';
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

  const stages: Stage[] = [
    {
      number: 1,
      title: 'Background Check',
      description: 'MVR, Clearinghouse, and pre-employment drug screening',
      status: getStageStatus(1),
      substeps: [
        { label: 'MVR Status', value: onboardingStatus.mvr_status ?? 'not_started', status: onboardingStatus.mvr_status === 'received' ? 'complete' : onboardingStatus.mvr_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'Clearinghouse Status', value: onboardingStatus.ch_status ?? 'not_started', status: onboardingStatus.ch_status === 'received' ? 'complete' : onboardingStatus.ch_status === 'requested' ? 'in_progress' : 'not_started' },
        { label: 'MVR/CH Approval', value: onboardingStatus.mvr_ch_approval ?? 'pending', status: onboardingStatus.mvr_ch_approval === 'approved' ? 'complete' : onboardingStatus.mvr_ch_approval === 'denied' ? 'action_required' : 'in_progress' },
        { label: 'PE Screening', value: onboardingStatus.pe_screening ?? 'not_started', status: onboardingStatus.pe_screening === 'results_in' ? 'complete' : onboardingStatus.pe_screening === 'scheduled' ? 'in_progress' : 'not_started' },
        { label: 'PE Result', value: onboardingStatus.pe_screening_result ?? 'pending', status: onboardingStatus.pe_screening_result === 'clear' ? 'complete' : onboardingStatus.pe_screening_result === 'non_clear' ? 'action_required' : 'in_progress' },
      ],
    },
    {
      number: 2,
      title: 'Documents',
      description: 'Registration, 2290, truck title, photos, and inspection',
      status: getStageStatus(2),
      substeps: [
        { label: 'Registration', value: onboardingStatus.registration_status ?? '—', status: onboardingStatus.registration_status ? 'complete' : 'not_started' },
        { label: 'Form 2290', value: onboardingStatus.form_2290 ?? 'not_started', status: onboardingStatus.form_2290 === 'received' ? 'complete' : onboardingStatus.form_2290 === 'requested' ? 'action_required' : 'not_started' },
        { label: 'Truck Title', value: onboardingStatus.truck_title ?? 'not_started', status: onboardingStatus.truck_title === 'received' ? 'complete' : onboardingStatus.truck_title === 'requested' ? 'action_required' : 'not_started' },
        { label: 'Truck Photos', value: onboardingStatus.truck_photos ?? 'not_started', status: onboardingStatus.truck_photos === 'received' ? 'complete' : onboardingStatus.truck_photos === 'requested' ? 'action_required' : 'not_started' },
        { label: 'Truck Inspection', value: onboardingStatus.truck_inspection ?? 'not_started', status: onboardingStatus.truck_inspection === 'received' ? 'complete' : onboardingStatus.truck_inspection === 'requested' ? 'action_required' : 'not_started' },
      ],
    },
    {
      number: 3,
      title: 'ICA Agreement',
      description: 'Independent Contractor Agreement — sign electronically',
      status: getStageStatus(3),
      substeps: [
        { label: 'ICA Status', value: onboardingStatus.ica_status ?? 'not_issued', status: onboardingStatus.ica_status === 'complete' ? 'complete' : onboardingStatus.ica_status === 'sent_for_signature' ? 'action_required' : 'not_started' },
      ],
    },
    {
      number: 4,
      title: 'Missouri Registration',
      description: onboardingStatus.registration_status === 'needs_mo_reg' ? 'Documents submitted, awaiting state approval' : 'Using own registration — skipped',
      status: getStageStatus(4),
      substeps: [],
    },
    {
      number: 5,
      title: 'Equipment Setup',
      description: 'Decal, ELD device, and fuel card',
      status: getStageStatus(5),
      substeps: [
        { label: 'Decal Applied', value: onboardingStatus.decal_applied ?? 'no', status: onboardingStatus.decal_applied === 'yes' ? 'complete' : 'not_started' },
        { label: 'ELD Installed', value: onboardingStatus.eld_installed ?? 'no', status: onboardingStatus.eld_installed === 'yes' ? 'complete' : 'not_started' },
        { label: 'Fuel Card Issued', value: onboardingStatus.fuel_card_issued ?? 'no', status: onboardingStatus.fuel_card_issued === 'yes' ? 'complete' : 'not_started' },
      ],
    },
    {
      number: 6,
      title: 'Insurance & Activation',
      description: 'Added to insurance policy and assigned unit number',
      status: getStageStatus(6),
      substeps: [
        { label: 'Added to Insurance', value: onboardingStatus.insurance_added_date ? 'Complete' : 'Pending', status: onboardingStatus.insurance_added_date ? 'complete' : 'not_started' },
      ],
    },
  ];

  const currentStageIndex = stages.findIndex(s => s.status === 'in_progress' || s.status === 'action_required' || s.status === 'not_started');
  const currentStage = currentStageIndex >= 0 ? stages[currentStageIndex] : stages[stages.length - 1];

  const statusIcon = (status: StageStatus) => {
    switch (status) {
      case 'complete': return <CheckCircle2 className="h-5 w-5 text-status-complete" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-status-progress" />;
      case 'action_required': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const substepBadge = (status: StageStatus, value: string) => {
    const formatted = value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    switch (status) {
      case 'complete': return <span className="text-xs text-status-complete font-medium">{formatted}</span>;
      case 'action_required': return <Badge className="status-action border text-xs">{formatted}</Badge>;
      case 'in_progress': return <span className="text-xs text-status-progress font-medium">{formatted}</span>;
      default: return <span className="text-xs text-muted-foreground">{formatted}</span>;
    }
  };

  const navItems: { view: OperatorView; label: string; icon: React.ReactNode }[] = [
    { view: 'progress', label: 'My Progress', icon: <CheckCircle2 className="h-5 w-5" /> },
    { view: 'documents', label: 'Documents', icon: <FileText className="h-5 w-5" /> },
    { view: 'messages', label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
    { view: 'resources', label: 'Resources', icon: <BookOpen className="h-5 w-5" /> },
    { view: 'dot', label: 'DOT Inspection', icon: <Truck className="h-5 w-5" /> },
    { view: 'faq', label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-secondary">
      {/* Top navigation */}
      <header className="bg-surface-dark border-b border-surface-dark-border sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="SUPERTRANSPORT" className="h-10 w-auto" />
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  view === item.view
                    ? 'bg-gold/15 text-gold'
                    : 'text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button className="relative text-surface-dark-muted hover:text-surface-dark-foreground p-2">
              <Bell className="h-5 w-5" />
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
            <div className="grid grid-cols-3 gap-2">
              {navItems.map(item => (
                <button
                  key={item.view}
                  onClick={() => { setView(item.view); setMobileMenuOpen(false); }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium transition-colors ${
                    view === item.view ? 'bg-gold/15 text-gold' : 'text-surface-dark-muted'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Greeting */}
        {view === 'progress' && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Welcome back, {profile?.first_name ?? displayName}.</h1>

            {/* What's Next banner */}
            {currentStage && (
              <div className="mt-4 p-4 bg-gold/10 border border-gold/30 rounded-xl">
                <p className="text-xs font-semibold text-gold-muted uppercase tracking-wide mb-1">What's Next</p>
                {currentStage.status === 'action_required' ? (
                  <p className="text-foreground font-medium">
                    <AlertTriangle className="inline h-4 w-4 text-destructive mr-1.5" />
                    Action required in <strong>{currentStage.title}</strong> — please contact your onboarding coordinator.
                  </p>
                ) : currentStage.status === 'not_started' && currentStageIndex === 0 ? (
                  <p className="text-foreground font-medium">Your application has been approved! Your onboarding team will begin your background check shortly.</p>
                ) : (
                  <p className="text-foreground font-medium">
                    You're working on <strong>Stage {currentStage.number}: {currentStage.title}</strong>. {currentStage.description}.
                  </p>
                )}
              </div>
            )}

            {onboardingStatus.insurance_added_date && (
              <div className="mt-4 p-4 bg-status-complete/10 border border-status-complete/30 rounded-xl">
                <p className="text-status-complete font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> You're fully onboarded! Welcome to the SUPERTRANSPORT family.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress Tracker */}
        {view === 'progress' && (
          <div className="space-y-3">
            {stages.map((stage, idx) => {
              const isActive = stage.status === 'in_progress' || stage.status === 'action_required';
              const isFuture = stage.status === 'not_started' && idx > currentStageIndex;
              return (
                <div
                  key={stage.number}
                  className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${
                    isActive ? 'border-gold/40 shadow-md' :
                    stage.status === 'action_required' ? 'border-destructive/40' :
                    stage.status === 'complete' ? 'border-status-complete/30' :
                    'border-border'
                  } ${isFuture ? 'opacity-60' : ''}`}
                >
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                        stage.status === 'complete' ? 'bg-status-complete/15 text-status-complete' :
                        stage.status === 'action_required' ? 'bg-destructive/15 text-destructive' :
                        stage.status === 'in_progress' ? 'bg-gold/15 text-gold' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {stage.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : stage.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground text-sm">{stage.title}</p>
                          {stage.status === 'action_required' && <Badge className="status-action border text-xs">Action Required</Badge>}
                          {stage.status === 'complete' && <Badge className="status-complete border text-xs">Complete</Badge>}
                          {stage.status === 'in_progress' && <Badge className="status-progress border text-xs">In Progress</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                      </div>
                    </div>

                    {/* Substeps */}
                    {(isActive || stage.status === 'complete') && stage.substeps.length > 0 && (
                      <div className="mt-3 pl-11 space-y-2">
                        {stage.substeps.map(sub => (
                          <div key={sub.label} className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{sub.label}</span>
                            {substepBadge(sub.status, sub.value)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ICA Sign CTA */}
                    {stage.number === 3 && onboardingStatus.ica_status === 'sent_for_signature' && (
                      <div className="mt-3 pl-11">
                        <Button className="bg-gold text-surface-dark font-semibold hover:bg-gold-light text-sm h-9 gap-2 animate-pulse-gold">
                          <FileText className="h-4 w-4" /> Sign Your ICA Agreement
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Other views placeholder */}
        {view !== 'progress' && (
          <div className="bg-white border border-border rounded-xl p-8 text-center">
            <div className="h-14 w-14 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-3">
              {navItems.find(n => n.view === view)?.icon}
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {navItems.find(n => n.view === view)?.label}
            </h2>
            <p className="text-muted-foreground text-sm">This section is being built and will be available soon.</p>
          </div>
        )}

        {/* Sign out */}
        <div className="mt-8 text-center">
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5 mx-auto">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
