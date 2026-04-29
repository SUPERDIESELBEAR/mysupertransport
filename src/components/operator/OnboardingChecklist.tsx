import { useState, useEffect } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  Shield, FileCheck, FileText, Truck, CreditCard,
  Upload, ArrowRight, ChevronDown, ChevronUp, Phone, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SmartProgressWidget from '@/components/operator/SmartProgressWidget';
import PEScreeningTimeline from '@/components/operator/PEScreeningTimeline';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';

interface Substep {
  label: string;
  value: string;
  status: StageStatus;
}

interface Stage {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: StageStatus;
  substeps: Substep[];
  hint?: string;
}

interface OnboardingChecklistProps {
  stages: Stage[];
  isFullyOnboarded: boolean;
  progressPct: number;
  completedStages: number;
  onboardingStatus: Record<string, string | null>;
  onNavigateTo: (view: string) => void;
  displayName: string;
  operatorId?: string | null;
  uploadedDocs?: { id: string; document_type: string; file_name: string | null; file_url: string | null; uploaded_at: string }[];
  onUploadComplete?: () => void;
  unackedRequiredDocs?: number;
  assignedCoordinator?: { name: string; phone: string | null; userId?: string | null; avatarUrl?: string | null } | null;
  onMessageCoordinator?: () => void;
}

const STAGE_COLORS: Record<StageStatus, {
  border: string;
  headerBg: string;
  pill: string;
  pillText: string;
  icon: string;
  opacity: string;
}> = {
  complete: {
    border: 'border-l-status-complete',
    headerBg: 'bg-status-complete/5',
    pill: 'bg-status-complete/10 border-status-complete/25',
    pillText: 'text-status-complete',
    icon: 'text-status-complete',
    opacity: '',
  },
  in_progress: {
    border: 'border-l-gold',
    headerBg: 'bg-gold/5',
    pill: 'bg-gold/10 border-gold/25',
    pillText: 'text-gold',
    icon: 'text-gold',
    opacity: '',
  },
  action_required: {
    border: 'border-l-destructive',
    headerBg: 'bg-destructive/5',
    pill: 'bg-destructive/10 border-destructive/25',
    pillText: 'text-destructive',
    icon: 'text-destructive',
    opacity: '',
  },
  not_started: {
    border: 'border-l-border',
    headerBg: 'bg-muted/30',
    pill: 'bg-muted border-border',
    pillText: 'text-muted-foreground/50',
    icon: 'text-muted-foreground/30',
    opacity: 'opacity-60',
  },
};

const STATUS_LABEL: Record<StageStatus, string> = {
  complete: 'Complete',
  in_progress: 'In Progress',
  action_required: 'Action Required',
  not_started: 'Pending',
};

const STAGE_HEADER_ICONS: Record<number, React.ReactNode> = {
  1: <Shield className="h-4 w-4" />,
  2: <FileCheck className="h-4 w-4" />,
  3: <FileText className="h-4 w-4" />,
  4: <FileCheck className="h-4 w-4" />,
  5: <Truck className="h-4 w-4" />,
  6: <Shield className="h-4 w-4" />,
  7: <CheckCircle2 className="h-4 w-4" />,
  8: <CreditCard className="h-4 w-4" />,
};

function SubstepIcon({ status }: { status: StageStatus }) {
  if (status === 'complete') return <CheckCircle2 className="h-3.5 w-3.5 text-status-complete shrink-0" />;
  if (status === 'action_required') return <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (status === 'in_progress') return <Clock className="h-3.5 w-3.5 text-gold shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/25 shrink-0" />;
}

function StageCard({
  stage,
  onNavigateTo,
  onboardingStatus,
  operatorId,
  uploadedDocs,
  onUploadComplete,
}: {
  stage: Stage;
  onNavigateTo: (view: string) => void;
  onboardingStatus: Record<string, string | null>;
  operatorId?: string | null;
  uploadedDocs?: { id: string; document_type: string; file_name: string | null; file_url: string | null; uploaded_at: string }[];
  onUploadComplete?: () => void;
}) {
  const colors = STAGE_COLORS[stage.status];
  const isNotStarted = stage.status === 'not_started';
  const isComplete = stage.status === 'complete';
  // Stage 8 (Pay Setup) is operator-actionable from day one — treat it as live
  // even when not_started so the CTA doesn't read as disabled.
  const isStage8NotStarted = stage.number === 8 && isNotStarted;
  // Complete stages start collapsed, others start expanded
  const [expanded, setExpanded] = useState(
    isStage8NotStarted ? true : !isComplete && !isNotStarted
  );

  const showSubsteps = stage.substeps.length > 0 && (!isNotStarted || isStage8NotStarted);
  const canToggle = showSubsteps;
  const cardOpacity = isStage8NotStarted ? '' : colors.opacity;

  // CTA logic
  const showDocsCTA = stage.number === 2 && (stage.status === 'in_progress' || stage.status === 'not_started');
  const showIcaCTA = stage.number === 3 && onboardingStatus.ica_status === 'sent_for_signature';
  const showPaySetupCTA = stage.number === 8 && (stage.status === 'not_started' || stage.status === 'in_progress');

  // Show PE timeline in Stage 1 when screening has started
  const showPETimeline = stage.number === 1 && onboardingStatus.pe_screening && onboardingStatus.pe_screening !== 'not_started';

  return (
    <div
      className={`rounded-xl border border-border border-l-4 overflow-hidden ${colors.border} ${cardOpacity}`}
    >
      {/* Stage header */}
      <button
        onClick={() => canToggle && setExpanded(e => !e)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
          canToggle ? 'cursor-pointer hover:bg-muted/30 active:bg-muted/40' : 'cursor-default'
        } ${colors.headerBg}`}
        disabled={!canToggle}
        aria-expanded={canToggle ? expanded : undefined}
      >
        {/* Stage number + icon */}
        <span className={`shrink-0 ${colors.icon}`}>
          {STAGE_HEADER_ICONS[stage.number]}
        </span>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${isNotStarted ? 'text-muted-foreground' : 'text-foreground'}`}>
            <span className="text-muted-foreground/50 font-normal mr-1">{stage.number}.</span>
            {stage.title}
          </p>
        </div>

        {/* Status pill */}
        <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${colors.pill} ${colors.pillText}`}>
          {STATUS_LABEL[stage.status]}
        </span>

        {/* Expand/collapse chevron */}
        {canToggle && (
          <span className="shrink-0 text-muted-foreground/40">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {/* Not-started hint */}
      {isNotStarted && stage.hint && (
        <div className="px-3 pb-2.5 pt-0">
          <p className="text-[11px] text-muted-foreground/60 italic leading-snug border-t border-border/50 pt-2">
            {stage.hint}
          </p>
        </div>
      )}

      {/* Pay Setup CTA — shown even when not_started, outside substeps gate */}
      {showPaySetupCTA && (
        <div className="px-3 pb-2.5">
          <Button
            size="sm"
            onClick={() => onNavigateTo('pay-setup')}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 gap-1.5 font-semibold"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Complete Pay Setup
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Substeps — only when expanded */}
      {showSubsteps && expanded && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {stage.substeps.map(sub => (
            <div key={sub.label} className="flex items-center gap-2 px-3 py-2 min-h-[36px]">
              <SubstepIcon status={sub.status} />
              <span className="flex-1 text-xs text-muted-foreground leading-tight">{sub.label}</span>
              <span className={`text-xs font-semibold shrink-0 ${
                sub.status === 'complete'
                  ? 'text-status-complete'
                  : sub.status === 'action_required'
                  ? 'text-destructive'
                  : sub.status === 'in_progress'
                  ? 'text-gold'
                  : 'text-muted-foreground/40'
              }`}>
                {sub.value}
              </span>
            </div>
          ))}

          {/* CTAs inside expanded card */}
          {showDocsCTA && (
            <div className="px-3 py-2.5">
              <Button
                size="sm"
                onClick={() => onNavigateTo('documents')}
                className="w-full bg-gold text-surface-dark hover:bg-gold-light text-xs h-8 gap-1.5 font-semibold"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Documents
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {showIcaCTA && (
            <div className="px-3 py-2.5">
              <Button
                size="sm"
                onClick={() => onNavigateTo('ica')}
                className="w-full bg-destructive text-white hover:bg-destructive/90 text-xs h-8 gap-1.5 font-semibold"
              >
                <FileText className="h-3.5 w-3.5" />
                Sign ICA Agreement
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* PE Screening Timeline — Stage 1 */}
          {showPETimeline && (
            <PEScreeningTimeline
              onboardingStatus={onboardingStatus}
              operatorId={operatorId}
              uploadedDocs={uploadedDocs}
              onUploadComplete={onUploadComplete}
            />
          )}
        </div>
      )}

      {/* PE Screening Timeline when stage has NO substeps but screening is active */}
      {showPETimeline && !showSubsteps && (
        <PEScreeningTimeline
          onboardingStatus={onboardingStatus}
          operatorId={operatorId}
          uploadedDocs={uploadedDocs}
          onUploadComplete={onUploadComplete}
        />
      )}
    </div>
  );
}

export default function OnboardingChecklist({
  stages,
  isFullyOnboarded,
  progressPct,
  completedStages,
  onboardingStatus,
  onNavigateTo,
  displayName,
  operatorId,
  uploadedDocs,
  onUploadComplete,
  unackedRequiredDocs = 0,
  assignedCoordinator,
  onMessageCoordinator,
}: OnboardingChecklistProps) {
  // Animate the progress bar in on mount
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(progressPct), 80);
    return () => clearTimeout(t);
  }, [progressPct]);

  const actionCount = stages.filter(s => s.status === 'action_required').length;

  return (
    <div className="flex flex-col">
      {/* ── STICKY PROGRESS BAR ── */}
      <div className="sticky top-16 z-30 bg-surface-dark border-b border-surface-dark-border shadow-lg">
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-dark-muted leading-none mb-0.5">
              Onboarding Progress
            </p>
            <p className="text-sm font-bold text-white leading-tight truncate">
              {isFullyOnboarded ? `Welcome, ${displayName}! 🎉` : `Hi, ${displayName}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-black text-gold leading-none">{progressPct}%</p>
            <p className="text-[10px] text-surface-dark-muted mt-0.5">
              {completedStages} of {stages.length} done
            </p>
          </div>
        </div>

        {/* Gold progress bar */}
        <div className="mx-4 mb-3 h-2 bg-surface-dark-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gold rounded-full transition-all duration-700 ease-out"
            style={{ width: `${barWidth}%` }}
          />
        </div>

        {/* Mini stage dots */}
        <div className="flex gap-1 px-4 pb-2.5 justify-center">
          {stages.map(s => (
            <div
              key={s.number}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                s.status === 'complete'
                  ? 'bg-status-complete'
                  : s.status === 'action_required'
                  ? 'bg-destructive'
                  : s.status === 'in_progress'
                  ? 'bg-gold'
                  : 'bg-surface-dark-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── ACTION REQUIRED BANNER ── */}
      {actionCount > 0 && (
        <div className="mx-4 mt-3 rounded-xl border border-destructive/30 bg-destructive/8 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-destructive uppercase tracking-wide">
              {actionCount} Stage{actionCount > 1 ? 's' : ''} Need{actionCount === 1 ? 's' : ''} Attention
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Review the highlighted stages below and take action.
            </p>
          </div>
        </div>
      )}

      {/* ── FULLY ONBOARDED BANNER ── */}
      {isFullyOnboarded && (
        <div className="mx-4 mt-3 rounded-xl border border-status-complete/30 bg-status-complete/8 p-3 flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-status-complete shrink-0" />
          <div>
            <p className="text-xs font-bold text-status-complete uppercase tracking-wide">Fully Onboarded</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">You're activated and ready to dispatch.</p>
          </div>
        </div>
      )}

      {/* ── SMART PROGRESS WIDGET ── */}
      {!isFullyOnboarded && (
        <div className="mx-4 mt-3">
          <SmartProgressWidget
            stages={stages}
            onboardingStatus={onboardingStatus}
            isFullyOnboarded={isFullyOnboarded}
            onNavigateTo={onNavigateTo}
            operatorId={operatorId}
            uploadedDocs={uploadedDocs}
            onUploadComplete={onUploadComplete}
            unackedRequiredDocs={unackedRequiredDocs}
          />
        </div>
      )}

      {/* ── COORDINATOR CARD ── */}
      {assignedCoordinator && (
        <div className="mx-4 mt-3 rounded-xl bg-surface-dark border border-surface-dark-border overflow-hidden">
          <div className="px-3 pt-2.5 pb-2 border-b border-surface-dark-border flex items-center gap-1.5">
            <Truck className="h-3 w-3 text-gold" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Your Coordinator</p>
          </div>
          <div className="px-3 py-2.5 flex items-center gap-3">
            {/* Avatar */}
            <div className="h-9 w-9 rounded-full overflow-hidden border border-white/10 shrink-0 flex items-center justify-center bg-surface-dark-card">
              {assignedCoordinator.avatarUrl ? (
                <img src={assignedCoordinator.avatarUrl} alt={assignedCoordinator.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-gold">{assignedCoordinator.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {/* Name + contact */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight truncate">{assignedCoordinator.name}</p>
              <p className="text-[11px] text-surface-dark-muted mt-0.5">Onboarding Coordinator</p>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {assignedCoordinator.phone && (
                <a
                  href={`tel:${assignedCoordinator.phone}`}
                  className="flex items-center justify-center h-8 w-8 rounded-lg bg-surface-dark-card border border-surface-dark-border text-gold hover:bg-surface-dark-border transition-colors"
                  title={`Call ${assignedCoordinator.name}`}
                >
                  <Phone className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                onClick={onMessageCoordinator}
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-gold/15 border border-gold/30 text-gold hover:bg-gold/25 transition-colors"
                title={`Message ${assignedCoordinator.name}`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE CARDS ── */}
      <div className="px-4 mt-3 pb-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Onboarding Stages</p>
        {stages.map(stage => (
          <StageCard
            key={stage.number}
            stage={stage}
            onNavigateTo={onNavigateTo}
            onboardingStatus={onboardingStatus}
            operatorId={operatorId}
            uploadedDocs={uploadedDocs}
            onUploadComplete={onUploadComplete}
          />
        ))}
      </div>
    </div>
  );
}
