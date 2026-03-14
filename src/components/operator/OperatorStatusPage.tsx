import { CheckCircle2, Circle, Clock, AlertTriangle, Shield, FileCheck, FileText, Truck, ArrowRight, Upload, Mail, Phone, Hash, User, CalendarClock, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

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

interface OperatorStatusPageProps {
  stages: Stage[];
  isFullyOnboarded: boolean;
  progressPct: number;
  completedStages: number;
  currentStage: Stage | null;
  onboardingStatus: Record<string, string | null>;
  onNavigateTo: (view: string) => void;
  displayName: string;
  assignedDispatcher?: { name: string; phone: string | null; userId?: string | null } | null;
  dispatchStatus?: string | null;
  onMessageDispatcher?: () => void;
  cdlExpiration?: string | null;
  medicalCertExpiration?: string | null;
}

const STAGE_ICONS: Record<number, React.ReactNode> = {
  1: <Shield className="h-5 w-5" />,
  2: <FileCheck className="h-5 w-5" />,
  3: <FileText className="h-5 w-5" />,
  4: <FileCheck className="h-5 w-5" />,
  5: <Truck className="h-5 w-5" />,
  6: <Shield className="h-5 w-5" />,
};

const STATUS_LABEL: Record<StageStatus, string> = {
  complete: 'Complete',
  in_progress: 'In Progress',
  action_required: 'Action Required',
  not_started: 'Pending',
};

function MilestoneNode({ stage, isLast }: { stage: Stage; isLast: boolean }) {
  const isComplete = stage.status === 'complete';
  const isActionRequired = stage.status === 'action_required';
  const isInProgress = stage.status === 'in_progress';
  const isNotStarted = stage.status === 'not_started';

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0">
        {/* Node */}
        <div
          className={`relative h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 ${
            isComplete
              ? 'bg-status-complete/10 border-status-complete shadow-sm shadow-status-complete/20'
              : isActionRequired
              ? 'bg-destructive/10 border-destructive shadow-sm shadow-destructive/20 animate-pulse'
              : isInProgress
              ? 'bg-gold/10 border-gold shadow-sm shadow-gold/20'
              : 'bg-muted border-border'
          }`}
        >
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-status-complete" />
          ) : isActionRequired ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : isInProgress ? (
            <Clock className="h-5 w-5 text-gold" />
          ) : (
            <span className="text-sm font-bold text-muted-foreground/60">{stage.number}</span>
          )}
        </div>
        {/* Connector line */}
        {!isLast && (
          <div
            className={`w-0.5 flex-1 min-h-4 mt-1 rounded-full ${
              isComplete ? 'bg-status-complete/40' : 'bg-border'
            }`}
          />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
        <div
          className={`rounded-2xl border p-4 transition-all duration-200 ${
            isComplete
              ? 'bg-status-complete/5 border-status-complete/20'
              : isActionRequired
              ? 'bg-destructive/5 border-destructive/25 shadow-sm'
              : isInProgress
              ? 'bg-gold/5 border-gold/30 shadow-sm'
              : 'bg-white border-border opacity-60'
          }`}
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`shrink-0 ${
                  isComplete
                    ? 'text-status-complete'
                    : isActionRequired
                    ? 'text-destructive'
                    : isInProgress
                    ? 'text-gold'
                    : 'text-muted-foreground/40'
                }`}
              >
                {STAGE_ICONS[stage.number]}
              </span>
              <div className="min-w-0">
                <p
                  className={`font-semibold text-sm leading-tight ${
                    isNotStarted ? 'text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {stage.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{stage.description}</p>
              </div>
            </div>

            {/* Status pill */}
            <span
              className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border uppercase tracking-wide ${
                isComplete
                  ? 'bg-status-complete/10 text-status-complete border-status-complete/25'
                  : isActionRequired
                  ? 'bg-destructive/10 text-destructive border-destructive/25'
                  : isInProgress
                  ? 'bg-gold/10 text-gold border-gold/25'
                  : 'bg-muted text-muted-foreground/50 border-border'
              }`}
            >
              {STATUS_LABEL[stage.status]}
            </span>
          </div>

          {/* Substeps — checklist style */}
          {(isComplete || isInProgress || isActionRequired) && stage.substeps.length > 0 && (
            <div className="mt-3 space-y-1.5 pl-1 border-t border-current/10 pt-3">
              {stage.substeps.map(sub => (
                <div key={sub.label} className="flex items-center gap-2 text-xs">
                  {sub.status === 'complete' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-complete shrink-0" />
                  ) : sub.status === 'action_required' ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : sub.status === 'in_progress' ? (
                    <Clock className="h-3.5 w-3.5 text-gold shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                  )}
                  <span className="text-muted-foreground flex-1">{sub.label}</span>
                  <span
                    className={`font-medium ${
                      sub.status === 'complete'
                        ? 'text-status-complete'
                        : sub.status === 'action_required'
                        ? 'text-destructive'
                        : sub.status === 'in_progress'
                        ? 'text-gold'
                        : 'text-muted-foreground/50'
                    }`}
                  >
                    {sub.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Hint for not_started next stage */}
          {isNotStarted && stage.hint && (
            <p className="mt-2 text-xs text-muted-foreground/70 italic border-t border-border pt-2">{stage.hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OperatorStatusPage({
  stages,
  isFullyOnboarded,
  progressPct,
  completedStages,
  currentStage,
  onboardingStatus,
  onNavigateTo,
  displayName,
  assignedDispatcher,
  dispatchStatus,
  onMessageDispatcher,
  cdlExpiration,
  medicalCertExpiration,
}: OperatorStatusPageProps) {
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    return sessionStorage.getItem('cert_expiry_banner_dismissed') === 'true';
  });
  const dismissBanner = () => {
    sessionStorage.setItem('cert_expiry_banner_dismissed', 'true');
    setBannerDismissed(true);
  };

  // ── Expiry helpers ──────────────────────────────────────────────────────────
  const getDaysUntil = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(dateStr + 'T00:00:00'); // treat as local date
    return Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  type ExpiryLevel = 'expired' | 'red' | 'yellow' | 'green';
  const getExpiryLevel = (days: number | null): ExpiryLevel | null => {
    if (days === null) return null;
    if (days < 0) return 'expired';
    if (days <= 30) return 'red';
    if (days <= 90) return 'yellow';
    return 'green';
  };

  const cdlDays = getDaysUntil(cdlExpiration);
  const medDays = getDaysUntil(medicalCertExpiration);
  const cdlLevel = getExpiryLevel(cdlDays);
  const medLevel = getExpiryLevel(medDays);
  // Only show the card if at least one document is within 90 days or expired
  const showExpiryCard = cdlLevel !== null && cdlLevel !== 'green'
    ? true
    : medLevel !== null && medLevel !== 'green';

  const expiryConfig: Record<ExpiryLevel, { bg: string; border: string; label: string; text: string; dot: string }> = {
    expired: { bg: 'bg-destructive/8',    border: 'border-destructive/30',    label: 'Expired',       text: 'text-destructive',     dot: 'bg-destructive' },
    red:     { bg: 'bg-destructive/8',    border: 'border-destructive/30',    label: 'Expiring Soon', text: 'text-destructive',     dot: 'bg-destructive animate-pulse' },
    yellow:  { bg: 'bg-gold/8',           border: 'border-gold/30',           label: 'Expiring Soon', text: 'text-gold',            dot: 'bg-gold' },
    green:   { bg: 'bg-status-complete/8',border: 'border-status-complete/30',label: 'Valid',         text: 'text-status-complete', dot: 'bg-status-complete' },
  };

  const formatExpiry = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const daysLabel = (days: number | null): string => {
    if (days === null) return '';
    if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`;
    if (days === 0) return 'Expires today';
    return `${days} day${days !== 1 ? 's' : ''} remaining`;
  };

  const nextStepContent = () => {
    if (!currentStage) return null;

    if (currentStage.status === 'action_required') {
      if (currentStage.number === 3 && onboardingStatus.ica_status === 'sent_for_signature') {
        return {
          label: '⚠ Action Required',
          title: 'Sign Your ICA Agreement',
          body: 'Your Independent Contractor Agreement is ready. Check your email for the PandaDoc link to sign electronically.',
          cta: null,
          urgent: true,
        };
      }
      return {
        label: '⚠ Action Required',
        title: `${currentStage.title} Needs Attention`,
        body: 'There may be an issue with this stage. Please contact your onboarding coordinator for guidance.',
        cta: null,
        urgent: true,
      };
    }

    if (currentStage.number === 2 && currentStage.status === 'not_started') {
      return {
        label: "What's Next",
        title: 'Upload Your Documents',
        body: 'Head to the Documents tab to upload your Form 2290, truck title, truck photos, and inspection report to keep your onboarding moving.',
        cta: { label: 'Go to Documents', action: () => onNavigateTo('documents'), icon: <Upload className="h-3.5 w-3.5" /> },
        urgent: false,
      };
    }

    if (currentStage.number === 3 && onboardingStatus.ica_status === 'sent_for_signature') {
      return {
        label: "What's Next",
        title: 'Sign Your ICA Agreement',
        body: 'Your ICA has been sent for signature. Check your email for the PandaDoc link.',
        cta: null,
        urgent: false,
      };
    }

    return {
      label: "What's Next",
      title: `Stage ${currentStage.number}: ${currentStage.title}`,
      body: currentStage.hint ?? currentStage.description,
      cta: null,
      urgent: false,
    };
  };

  const nextStep = nextStepContent();

  const unitNumber = onboardingStatus.unit_number;
  const hasDispatcher = !!assignedDispatcher;
  const isOnboarded = isFullyOnboarded;

  const dispatchStatusLabel: Record<string, { label: string; color: string; dot: string }> = {
    dispatched:     { label: 'Dispatched',     color: 'text-status-complete', dot: 'bg-status-complete' },
    home:           { label: 'Home',            color: 'text-gold',            dot: 'bg-gold' },
    truck_down:     { label: 'Truck Down',      color: 'text-destructive',     dot: 'bg-destructive' },
    not_dispatched: { label: 'Not Dispatched',  color: 'text-muted-foreground',dot: 'bg-muted-foreground/40' },
  };
  const statusInfo = dispatchStatus ? dispatchStatusLabel[dispatchStatus] : null;

  // Critical docs: only ≤30 days or expired — these warrant the top banner
  const criticalDocs = [
    { label: 'CDL License', days: cdlDays, level: cdlLevel, date: cdlExpiration },
    { label: 'Medical Certificate', days: medDays, level: medLevel, date: medicalCertExpiration },
  ].filter(d => d.level === 'red' || d.level === 'expired');

  const showCriticalBanner = criticalDocs.length > 0 && !bannerDismissed;

  // Highest urgency level across critical docs
  const bannerIsExpired = criticalDocs.some(d => d.level === 'expired');

  return (
    <div className="space-y-6">
      {/* ── CRITICAL EXPIRY BANNER (≤30 days / expired) ── */}
      {showCriticalBanner && (
        <div
          className={`relative rounded-2xl border-2 p-4 shadow-md overflow-hidden ${
            bannerIsExpired
              ? 'bg-destructive/10 border-destructive/50'
              : 'bg-destructive/8 border-destructive/40'
          }`}
        >
          {/* Dismiss button */}
          <button
            onClick={dismissBanner}
            aria-label="Dismiss"
            className="absolute top-3 right-3 h-6 w-6 rounded-full flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-start gap-3 pr-6">
            {/* Pulsing icon */}
            <span className={`shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 ${bannerIsExpired ? 'border-destructive bg-destructive/15' : 'border-destructive/60 bg-destructive/10 animate-pulse'}`}>
              <ShieldAlert className="h-4.5 w-4.5 text-destructive" />
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-destructive mb-0.5">
                {bannerIsExpired ? 'Document Expired' : '⚠ Action Required — Document Expiring Soon'}
              </p>

              <div className="space-y-2">
                {criticalDocs.map(doc => (
                  <div key={doc.label} className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      {doc.label}
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                        — expires {formatExpiry(doc.date)}
                      </span>
                    </p>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${
                      doc.level === 'expired'
                        ? 'bg-destructive/15 border-destructive/40 text-destructive'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}>
                      {daysLabel(doc.days)}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
                {bannerIsExpired
                  ? 'Your document has expired. Upload a renewed copy immediately to remain compliant.'
                  : 'Please renew and upload your document to your portal before it expires to stay compliant and continue operating.'}
              </p>

              <Button
                size="sm"
                onClick={() => onNavigateTo('documents')}
                className="mt-3 bg-destructive text-white hover:bg-destructive/90 text-xs h-8 gap-1.5 font-semibold shadow-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Updated Document
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isFullyOnboarded ? `Welcome to the family, ${displayName}!` : `Hi, ${displayName}.`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isFullyOnboarded
            ? "You've completed all onboarding stages. You're fully activated and ready to dispatch."
            : 'Track your onboarding progress below.'}
        </p>
      </div>

      {/* ── OPERATOR IDENTITY CARD ── */}
      {(unitNumber || hasDispatcher) && (
        <div className="bg-surface-dark rounded-2xl overflow-hidden shadow-lg border border-surface-dark-border">
          {/* Card header stripe */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-surface-dark-border">
            <User className="h-3.5 w-3.5 text-gold" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold">My Account</p>
          </div>

          <div className={`grid ${unitNumber && hasDispatcher ? 'grid-cols-2 divide-x divide-surface-dark-border' : 'grid-cols-1'}`}>
            {/* Unit number cell */}
            {unitNumber && (
              <div className="px-4 py-3.5 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Hash className="h-3 w-3 text-surface-dark-muted" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-dark-muted">Unit Number</span>
                </div>
                <p className="text-2xl font-black text-gold leading-none tracking-tight">{unitNumber}</p>
                {isOnboarded && statusInfo && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={`h-2 w-2 rounded-full ${statusInfo.dot}`} />
                    <span className={`text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                  </div>
                )}
              </div>
            )}

            {/* Dispatcher cell */}
            {hasDispatcher && assignedDispatcher && (
              <div className="px-4 py-3.5 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Truck className="h-3 w-3 text-surface-dark-muted" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-dark-muted">Dispatcher</span>
                </div>
                <p className="text-sm font-bold text-white leading-tight">{assignedDispatcher.name}</p>
                {assignedDispatcher.phone ? (
                  <a
                    href={`tel:${assignedDispatcher.phone}`}
                    className="flex items-center gap-1 text-xs text-gold hover:text-gold-light transition-colors mt-0.5 font-medium w-fit"
                  >
                    <Phone className="h-3 w-3" />
                    {assignedDispatcher.phone}
                  </a>
                ) : (
                  <button
                    onClick={onMessageDispatcher}
                    className="flex items-center gap-1 text-xs text-gold hover:text-gold-light transition-colors mt-0.5 font-medium w-fit"
                  >
                    <Mail className="h-3 w-3" />
                    Send Message
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DOCUMENT EXPIRY ALERTS ── */}
      {showExpiryCard && (
        <div className="rounded-2xl border overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 flex items-center gap-2 bg-muted/50 border-b border-border">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Document Expiration</p>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: 'CDL License', days: cdlDays, level: cdlLevel, date: cdlExpiration },
              { label: 'Medical Certificate', days: medDays, level: medLevel, date: medicalCertExpiration },
            ]
              .filter(d => d.level !== null && d.level !== 'green')
              .map(doc => {
                const cfg = expiryConfig[doc.level!];
                return (
                  <div key={doc.label} className={`flex items-center justify-between gap-3 px-4 py-3 ${cfg.bg}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{doc.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Expires {formatExpiry(doc.date)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        {daysLabel(doc.days)}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="bg-surface-dark rounded-2xl p-5 shadow-xl">
        {isFullyOnboarded ? (
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-status-complete/20 border-2 border-status-complete flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-7 w-7 text-status-complete" />
            </div>
          <div>
              <p className="text-lg font-bold text-white">Fully Onboarded!</p>
              <p className="text-surface-dark-muted text-sm mt-0.5">
                You're ready to dispatch. Welcome to SUPERTRANSPORT.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div>
                <p className="text-surface-dark-muted text-xs font-medium uppercase tracking-widest mb-1">Overall Progress</p>
                <p className="text-4xl font-bold text-gold leading-none">{progressPct}%</p>
              </div>
              <div className="text-right">
                <div className="flex gap-1.5 justify-end mb-1 flex-wrap">
                  {stages.map(s => (
                    <div
                      key={s.number}
                      className={`h-2 w-5 rounded-full transition-all ${
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
                <p className="text-surface-dark-muted text-xs">{completedStages} of {stages.length} complete</p>
              </div>
            </div>

            {/* Full progress bar */}
            <div className="h-2.5 bg-surface-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* What's Next banner */}
      {!isFullyOnboarded && nextStep && (
        <div
          className={`rounded-2xl border p-4 ${
            nextStep.urgent
              ? 'bg-destructive/8 border-destructive/30'
              : 'bg-gold/8 border-gold/25'
          }`}
        >
          <p
            className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${
              nextStep.urgent ? 'text-destructive' : 'text-gold'
            }`}
          >
            {nextStep.label}
          </p>
          <p className="font-semibold text-foreground text-sm leading-snug">{nextStep.title}</p>
          <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{nextStep.body}</p>
          {nextStep.cta && (
            <Button
              size="sm"
              onClick={nextStep.cta.action}
              className="mt-3 bg-gold text-surface-dark hover:bg-gold-light text-xs h-8 gap-1.5 font-semibold"
            >
              {nextStep.cta.icon}
              {nextStep.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Quick-stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: 'Completed',
            value: stages.filter(s => s.status === 'complete').length,
            color: 'text-status-complete',
            bg: 'bg-status-complete/8 border-status-complete/20',
            icon: <CheckCircle2 className="h-4 w-4 text-status-complete" />,
          },
          {
            label: 'In Progress',
            value: stages.filter(s => s.status === 'in_progress' || s.status === 'action_required').length,
            color: 'text-gold',
            bg: 'bg-gold/8 border-gold/20',
            icon: <Clock className="h-4 w-4 text-gold" />,
          },
          {
            label: 'Remaining',
            value: stages.filter(s => s.status === 'not_started').length,
            color: 'text-muted-foreground',
            bg: 'bg-muted border-border',
            icon: <Circle className="h-4 w-4 text-muted-foreground/50" />,
          },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl border p-2.5 text-center ${stat.bg}`}>
            <div className="flex justify-center mb-1">{stat.icon}</div>
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Milestone timeline */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">Onboarding Stages</h2>
        <div>
          {stages.map((stage, idx) => (
            <MilestoneNode key={stage.number} stage={stage} isLast={idx === stages.length - 1} />
          ))}
        </div>
      </div>

      {/* Contact footer */}
      <div className="bg-white border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-gold" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Questions about your onboarding?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contact your coordinator or reach us at{' '}
              <a href="mailto:support@mysupertransport.com" className="text-gold hover:underline font-medium">
                support@mysupertransport.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
