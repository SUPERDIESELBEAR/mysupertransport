import { ArrowRight, Upload, FileText, Shield, AlertTriangle, CheckCircle2, User, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';

interface Stage {
  number: number;
  title: string;
  status: StageStatus;
  substeps: { label: string; value: string; status: StageStatus }[];
}

interface SmartProgressWidgetProps {
  stages: Stage[];
  onboardingStatus: Record<string, string | null>;
  isFullyOnboarded: boolean;
  onNavigateTo: (view: string) => void;
}

// ─── Per-stage knowledge base ─────────────────────────────────────────────────

interface StageInfo {
  blockerText: (os: Record<string, string | null>, stage: Stage) => string;
  responsibleParty: 'operator' | 'coordinator' | 'both';
  responsibleLabel: string;
  steps: Array<{
    label: string;
    who: 'operator' | 'coordinator';
    done: (os: Record<string, string | null>, stage: Stage) => boolean;
  }>;
  ctaLabel?: (os: Record<string, string | null>) => string | null;
  ctaView?: string;
}

const STAGE_INFO: Record<number, StageInfo> = {
  1: {
    blockerText: (os) => {
      if (os.mvr_ch_approval === 'denied' || os.pe_screening_result === 'non_clear')
        return 'An issue was found during background screening. Your coordinator will reach out with next steps.';
      if (os.pe_screening === 'scheduled')
        return 'Your pre-employment drug screening is scheduled. Complete it to move forward.';
      if (os.mvr_status === 'requested' || os.ch_status === 'requested')
        return 'Your MVR and Clearinghouse checks have been submitted. Results typically arrive in 2–5 business days.';
      return 'Your coordinator will initiate your MVR, Clearinghouse check, and schedule your pre-employment screening.';
    },
    responsibleParty: 'both',
    responsibleLabel: 'Coordinator initiates · You complete screening',
    eta: '3–7 business days',
    steps: [
      { label: 'MVR submitted', who: 'coordinator', done: (os) => os.mvr_status === 'requested' || os.mvr_status === 'received' },
      { label: 'Clearinghouse submitted', who: 'coordinator', done: (os) => os.ch_status === 'requested' || os.ch_status === 'received' },
      { label: 'Results received', who: 'coordinator', done: (os) => os.mvr_status === 'received' && os.ch_status === 'received' },
      { label: 'PE screening completed', who: 'operator', done: (os) => os.pe_screening === 'results_in' },
      { label: 'MVR/CH approved', who: 'coordinator', done: (os) => os.mvr_ch_approval === 'approved' },
    ],
  },
  2: {
    blockerText: (os) => {
      const requested = [
        os.form_2290 === 'requested' && 'Form 2290',
        os.truck_title === 'requested' && 'Truck Title',
        os.truck_photos === 'requested' && 'Truck Photos',
        os.truck_inspection === 'requested' && 'Truck Inspection',
      ].filter(Boolean) as string[];
      if (requested.length > 0)
        return `Your coordinator is waiting on: ${requested.join(', ')}. Upload them to the Documents tab to continue.`;
      if (os.form_2290 === 'received' || os.truck_title === 'received')
        return 'Documents are being reviewed by your coordinator. You\'ll be notified once all are confirmed.';
      return 'Upload your Form 2290, truck title, photos, and inspection report to the Documents tab.';
    },
    responsibleParty: 'operator',
    responsibleLabel: 'You upload · Coordinator reviews',
    eta: '1–3 business days',
    steps: [
      { label: 'Form 2290 uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Form 2290')?.status !== 'not_started' },
      { label: 'Truck Title uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Truck Title')?.status !== 'not_started' },
      { label: 'Truck Photos uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Truck Photos')?.status !== 'not_started' },
      { label: 'Truck Inspection uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Truck Inspection')?.status !== 'not_started' },
      { label: 'All documents reviewed', who: 'coordinator', done: (os) => os.form_2290 === 'received' && os.truck_title === 'received' },
    ],
    ctaLabel: (os) => {
      const requested = [os.form_2290, os.truck_title, os.truck_photos, os.truck_inspection].some(v => v === 'requested');
      return requested ? 'Upload Requested Documents' : 'Go to Documents';
    },
    ctaView: 'documents',
  },
  3: {
    blockerText: (os) => {
      if (os.ica_status === 'sent_for_signature')
        return 'Your ICA has been sent — check your email for the signing link, or use the ICA tab in your portal.';
      if (os.ica_status === 'complete')
        return 'Your ICA is signed and complete.';
      return 'Your coordinator will prepare and send your Independent Contractor Agreement once background screening and documents are complete.';
    },
    responsibleParty: 'both',
    responsibleLabel: 'Coordinator sends · You sign',
    eta: '1–2 business days',
    steps: [
      { label: 'ICA prepared by coordinator', who: 'coordinator', done: (os) => os.ica_status === 'sent_for_signature' || os.ica_status === 'complete' },
      { label: 'ICA signed by you', who: 'operator', done: (os) => os.ica_status === 'complete' },
    ],
    ctaLabel: (os) => os.ica_status === 'sent_for_signature' ? 'Sign ICA Now' : null,
    ctaView: 'ica',
  },
  4: {
    blockerText: (os) => {
      if (os.registration_status === 'own_registration')
        return 'You\'re using your own registration — no action needed for this stage.';
      if (os.mo_reg_received === 'yes')
        return 'Missouri registration received. This stage is complete.';
      if (os.mo_docs_submitted === 'submitted')
        return 'Your MO registration documents have been submitted to the state. Approval typically takes 2–4 weeks.';
      return 'Your coordinator will file for Missouri registration using your Form 2290, truck title, and signed ICA.';
    },
    responsibleParty: 'coordinator',
    responsibleLabel: 'Handled by your coordinator',
    eta: '2–4 weeks',
    steps: [
      { label: 'MO docs submitted to state', who: 'coordinator', done: (os) => os.mo_docs_submitted === 'submitted' },
      { label: 'State approval received', who: 'coordinator', done: (os) => os.mo_reg_received === 'yes' },
    ],
  },
  5: {
    blockerText: (os) => {
      const done = [os.decal_applied === 'yes', os.eld_installed === 'yes', os.fuel_card_issued === 'yes'];
      const remaining = ['Decal', 'ELD Device', 'Fuel Card'].filter((_, i) => !done[i]);
      if (remaining.length === 0) return 'All equipment is set up.';
      return `Your coordinator will arrange: ${remaining.join(', ')}. You'll be contacted to schedule installation.`;
    },
    responsibleParty: 'coordinator',
    responsibleLabel: 'Coordinator arranges installation',
    eta: '1–5 business days',
    steps: [
      { label: 'Decal applied to truck', who: 'coordinator', done: (os) => os.decal_applied === 'yes' },
      { label: 'ELD device installed', who: 'coordinator', done: (os) => os.eld_installed === 'yes' },
      { label: 'Fuel card issued', who: 'coordinator', done: (os) => os.fuel_card_issued === 'yes' },
    ],
  },
  6: {
    blockerText: (os) => {
      if (os.insurance_added_date)
        return `You were added to the insurance policy on ${new Date(os.insurance_added_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`;
      return 'Your coordinator will add you to the company insurance policy and assign your unit number.';
    },
    responsibleParty: 'coordinator',
    responsibleLabel: 'Handled by your coordinator',
    eta: '1–3 business days',
    steps: [
      { label: 'Added to insurance policy', who: 'coordinator', done: (os) => !!os.insurance_added_date },
      { label: 'Unit number assigned', who: 'coordinator', done: (os) => !!os.unit_number },
    ],
  },
};

// ─── Responsibility badge ─────────────────────────────────────────────────────

function WhoChip({ who }: { who: 'operator' | 'coordinator' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
      who === 'operator'
        ? 'bg-primary/10 border-primary/25 text-primary'
        : 'bg-muted border-border text-muted-foreground'
    }`}>
      {who === 'operator' ? <User className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
      {who === 'operator' ? 'You' : 'Coordinator'}
    </span>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function SmartProgressWidget({
  stages,
  onboardingStatus,
  isFullyOnboarded,
  onNavigateTo,
}: SmartProgressWidgetProps) {
  if (isFullyOnboarded) return null;

  // Find the most urgent active stage (action_required > in_progress > not_started)
  const activeStage =
    stages.find(s => s.status === 'action_required') ||
    stages.find(s => s.status === 'in_progress') ||
    stages.find(s => s.status === 'not_started');

  if (!activeStage) return null;

  const info = STAGE_INFO[activeStage.number];
  if (!info) return null;

  const blockerText = info.blockerText(onboardingStatus, activeStage);
  const ctaLabel = info.ctaLabel?.(onboardingStatus) ?? null;
  const stepsWithStatus = info.steps.map(step => ({
    ...step,
    isDone: step.done(onboardingStatus, activeStage),
  }));
  const completedCount = stepsWithStatus.filter(s => s.isDone).length;

  const isActionRequired = activeStage.status === 'action_required';
  const isInProgress = activeStage.status === 'in_progress';

  const accentClass = isActionRequired
    ? 'text-destructive'
    : isInProgress
    ? 'text-gold'
    : 'text-primary';

  const borderClass = isActionRequired
    ? 'border-destructive/30 bg-destructive/5'
    : isInProgress
    ? 'border-gold/30 bg-gold/5'
    : 'border-border bg-muted/30';

  const iconBgClass = isActionRequired
    ? 'bg-destructive/15'
    : isInProgress
    ? 'bg-gold/15'
    : 'bg-primary/10';

  const stageIcon =
    activeStage.number === 1 ? <Shield className="h-4 w-4" /> :
    activeStage.number === 2 ? <Upload className="h-4 w-4" /> :
    activeStage.number === 3 ? <FileText className="h-4 w-4" /> :
    activeStage.number === 4 ? <FileText className="h-4 w-4" /> :
    activeStage.number === 5 ? <Zap className="h-4 w-4" /> :
    <Shield className="h-4 w-4" />;

  return (
    <div className={`rounded-2xl border overflow-hidden ${borderClass}`}>
      {/* ── Header ── */}
      <div className={`px-4 py-3 flex items-center gap-3 border-b ${
        isActionRequired ? 'border-destructive/20' : isInProgress ? 'border-gold/20' : 'border-border'
      }`}>
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${iconBgClass}`}>
          <span className={accentClass}>{stageIcon}</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5 ${accentClass}`}>
            {isActionRequired ? '⚠ Action Required' : isInProgress ? 'In Progress' : "What's Next"}
          </p>
          <p className="text-sm font-bold text-foreground leading-tight truncate">
            Stage {activeStage.number}: {activeStage.title}
          </p>
        </div>
        {/* ETA chip */}
        <span className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5">
          <Clock className="h-2.5 w-2.5" />
          {info.eta}
        </span>
      </div>

      {/* ── Blocker description ── */}
      <div className="px-4 pt-3 pb-0">
        <p className="text-xs text-muted-foreground leading-relaxed">{blockerText}</p>
      </div>

      {/* ── Responsibility badge + mini step-list ── */}
      <div className="px-4 pt-3 pb-0">
        {/* Responsible party */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${accentClass}`}>Responsible:</span>
          {info.responsibleParty === 'both' ? (
            <div className="flex gap-1.5">
              <WhoChip who="coordinator" />
              <span className="text-[10px] text-muted-foreground self-center">+</span>
              <WhoChip who="operator" />
            </div>
          ) : (
            <WhoChip who={info.responsibleParty as 'operator' | 'coordinator'} />
          )}
        </div>

        {/* Step checklist */}
        <div className="space-y-1.5">
          {stepsWithStatus.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              {step.isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-status-complete shrink-0" />
              ) : activeStage.status === 'action_required' && !step.isDone && step.who === 'operator' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-border shrink-0" />
              )}
              <span className={`flex-1 text-xs leading-tight ${step.isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {step.label}
              </span>
              <WhoChip who={step.who} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Progress fraction + CTA ── */}
      <div className="px-4 pt-3 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mini progress bar */}
          <div className="flex gap-0.5">
            {stepsWithStatus.map((s, i) => (
              <div
                key={i}
                className={`h-1.5 w-4 rounded-full transition-all ${
                  s.isDone
                    ? 'bg-status-complete'
                    : isActionRequired
                    ? 'bg-destructive/20'
                    : 'bg-border'
                }`}
              />
            ))}
          </div>
          <p className={`text-[11px] font-semibold ${accentClass}`}>
            {completedCount}/{stepsWithStatus.length} steps done
          </p>
        </div>

        {ctaLabel && info.ctaView && (
          <Button
            size="sm"
            onClick={() => onNavigateTo(info.ctaView!)}
            className={`shrink-0 text-xs h-8 gap-1.5 font-semibold ${
              isActionRequired
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : 'bg-gold text-surface-dark hover:bg-gold-light'
            }`}
          >
            {activeStage.number === 2 ? <Upload className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {ctaLabel}
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
