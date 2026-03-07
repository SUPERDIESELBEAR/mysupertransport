import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  Truck, Bell, MessageSquare, BookOpen, HelpCircle, FileText,
  LogOut, Menu, X, Upload, Shield, Package, FileCheck
} from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
import OperatorDocumentUpload from '@/components/operator/OperatorDocumentUpload';
import { OperatorResourceLibrary, OperatorFAQ } from '@/components/operator/OperatorResourcesAndFAQ';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';
type OperatorView = 'progress' | 'documents' | 'messages' | 'resources' | 'faq';

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
  const [view, setView] = useState<OperatorView>('progress');
  const [onboardingStatus, setOnboardingStatus] = useState<Record<string, string | null>>({});
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: op } = await supabase
      .from('operators')
      .select('id, onboarding_status(*), operator_documents(*)')
      .eq('user_id', user.id)
      .single();

    if (op) {
      setOperatorId((op as any).id);
      const os = (op as any).onboarding_status?.[0] ?? {};
      setOnboardingStatus(os);
      setUploadedDocs((op as any).operator_documents ?? []);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    { view: 'resources' as OperatorView, label: 'Resources', icon: <BookOpen className="h-5 w-5" /> },
    { view: 'faq' as OperatorView, label: 'FAQ', icon: <HelpCircle className="h-5 w-5" /> },
  ];

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
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  view === item.view
                    ? 'bg-gold/15 text-gold'
                    : 'text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button className="relative text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors">
              <Bell className="h-5 w-5" />
            </button>
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
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium transition-colors ${
                    view === item.view ? 'bg-gold/15 text-gold' : 'text-surface-dark-muted'
                  }`}
                >
                  {item.icon}
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

        {/* ── PROGRESS VIEW ── */}
        {view === 'progress' && (
          <>
            {/* Header greeting */}
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Welcome back, {displayName}.
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Here's your onboarding status.</p>
            </div>

            {/* Progress summary card */}
            <div className="bg-surface-dark rounded-2xl p-5 text-white shadow-xl">
              {isFullyOnboarded ? (
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-status-complete/20 border-2 border-status-complete flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-7 w-7 text-status-complete" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">Fully Onboarded!</p>
                    <p className="text-surface-dark-muted text-sm mt-0.5">Welcome to the SUPERTRANSPORT family. You're ready to dispatch.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-surface-dark-muted text-xs font-medium uppercase tracking-widest mb-1">Overall Progress</p>
                      <p className="text-3xl font-bold text-gold">{progressPct}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-surface-dark-muted text-xs">{completedStages} of {stages.length} stages</p>
                      {onboardingStatus.unit_number && (
                        <p className="text-gold font-semibold text-sm mt-1">Unit {onboardingStatus.unit_number}</p>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-surface-dark-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold rounded-full transition-all duration-700"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {/* What's next */}
                  {currentStage && (
                    <div className={`mt-4 p-3 rounded-xl border ${
                      currentStage.status === 'action_required'
                        ? 'bg-destructive/10 border-destructive/30'
                        : 'bg-gold/10 border-gold/25'
                    }`}>
                      <p className="text-xs font-semibold text-gold-muted uppercase tracking-wide mb-1">
                        {currentStage.status === 'action_required' ? '⚠ Action Required' : "What's Next"}
                      </p>
                      {currentStage.status === 'action_required' ? (
                        <p className="text-white text-sm">
                          Stage {currentStage.number}: <strong>{currentStage.title}</strong> requires your attention. Contact your coordinator.
                        </p>
                      ) : currentStage.status === 'not_started' && currentStage.number === 2 ? (
                        <p className="text-white text-sm">
                          Upload your documents in the <button onClick={() => setView('documents')} className="text-gold underline font-medium">Documents tab</button> to move forward.
                        </p>
                      ) : currentStage.number === 3 && onboardingStatus.ica_status === 'sent_for_signature' ? (
                        <p className="text-white text-sm">
                          Your ICA Agreement is ready to sign. Check your email for the PandaDoc link.
                        </p>
                      ) : (
                        <p className="text-white text-sm">
                          <strong>Stage {currentStage.number}: {currentStage.title}</strong> — {currentStage.description}.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Stage cards */}
            <div className="space-y-3">
              {stages.map((stage, idx) => {
                const cfg = statusConfig[stage.status];
                const isFuture = stage.status === 'not_started' && idx > (currentStageIndex >= 0 ? currentStageIndex : 0);
                const showSubsteps = stage.status !== 'not_started' && stage.substeps.length > 0;

                return (
                  <div
                    key={stage.number}
                    className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 ${cfg.color} ${isFuture ? 'opacity-50' : ''}`}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        {/* Stage number / icon */}
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                          stage.status === 'complete' ? 'bg-status-complete/15 text-status-complete' :
                          stage.status === 'action_required' ? 'bg-destructive/15 text-destructive' :
                          stage.status === 'in_progress' ? 'bg-gold/15 text-gold' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {stage.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : stage.number}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gold shrink-0">{stage.icon}</span>
                            <p className="font-semibold text-foreground text-sm">{stage.title}</p>
                            {stage.status !== 'not_started' && (
                              <Badge className={`text-[10px] px-1.5 py-0 border ${cfg.badge}`}>
                                {stage.status === 'complete' ? 'Complete' :
                                 stage.status === 'action_required' ? 'Action Required' :
                                 'In Progress'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>

                          {/* Substeps */}
                          {showSubsteps && (
                            <div className="mt-3 space-y-2 pl-1">
                              {stage.substeps.map(sub => (
                                <div key={sub.label} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{sub.label}</span>
                                  <span className={`font-medium ${
                                    sub.status === 'complete' ? 'text-status-complete' :
                                    sub.status === 'action_required' ? 'text-destructive' :
                                    sub.status === 'in_progress' ? 'text-gold' :
                                    'text-muted-foreground'
                                  }`}>{sub.value}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Hint for not_started stages that are next */}
                          {stage.status === 'not_started' && !isFuture && stage.hint && (
                            <p className="mt-2 text-xs text-muted-foreground italic">{stage.hint}</p>
                          )}

                          {/* ICA sign CTA */}
                          {stage.number === 3 && onboardingStatus.ica_status === 'sent_for_signature' && (
                            <div className="mt-3">
                              <Button className="bg-gold text-surface-dark hover:bg-gold-light text-xs h-8 gap-1.5 font-semibold">
                                <FileText className="h-3.5 w-3.5" /> Open ICA to Sign
                              </Button>
                            </div>
                          )}

                          {/* Documents upload shortcut */}
                          {stage.number === 2 && stage.status === 'not_started' && (
                            <div className="mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setView('documents')}
                                className="text-xs h-8 gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
                              >
                                <Upload className="h-3.5 w-3.5" /> Upload Documents
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Right status icon */}
                        <div className="shrink-0 mt-0.5">{cfg.icon}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Contact footer */}
            <div className="bg-white border border-border rounded-2xl p-5 text-center">
              <p className="text-sm font-medium text-foreground mb-1">Questions about your onboarding?</p>
              <p className="text-xs text-muted-foreground">
                Contact your coordinator or email{' '}
                <a href="mailto:recruiting@supertransportllc.com" className="text-gold hover:underline font-medium">
                  recruiting@supertransportllc.com
                </a>
              </p>
            </div>
          </>
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

        {/* ── MESSAGES placeholder ── */}
        {view === 'messages' && (
          <div className="bg-white border border-border rounded-2xl p-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h2 className="font-semibold text-foreground mb-1">Messages</h2>
            <p className="text-sm text-muted-foreground">Messaging with your coordinator — coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
