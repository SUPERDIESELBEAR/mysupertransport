import { CheckCircle2, Circle, Clock, AlertTriangle, Shield, FileCheck, FileText, Truck, ArrowRight, Upload, Mail, Phone, Hash, User, CalendarClock, ShieldAlert, X, CreditCard, Download, Eye, BookOpen, ChevronDown } from 'lucide-react';
import { downloadBlob } from '@/lib/downloadBlob';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import OnboardingChecklist from '@/components/operator/OnboardingChecklist';
import SmartProgressWidget from '@/components/operator/SmartProgressWidget';
import { FilePreviewModal } from '@/components/inspection/DocRow';

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
  assignedDispatcher?: { name: string; phone: string | null; userId?: string | null; avatarUrl?: string | null } | null;
  dispatchStatus?: string | null;
  onMessageDispatcher?: () => void;
  cdlExpiration?: string | null;
  medicalCertExpiration?: string | null;
  operatorId?: string | null;
  uploadedDocs?: { id: string; document_type: string; file_name: string | null; file_url: string | null; uploaded_at: string }[];
  onUploadComplete?: () => void;
  unackedRequiredDocs?: number;
  assignedCoordinator?: { name: string; phone: string | null; userId?: string | null; avatarUrl?: string | null } | null;
  onMessageCoordinator?: () => void;
  onOpenBinder?: (mode?: 'list' | 'pages') => void;
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

function MilestoneNode({ stage, isLast, onNavigateTo }: { stage: Stage; isLast: boolean; onNavigateTo: (view: string) => void }) {
  const isComplete = stage.status === 'complete';
  const isActionRequired = stage.status === 'action_required';
  const isInProgress = stage.status === 'in_progress';
  const isNotStarted = stage.status === 'not_started';

  return (
    <div id={stage.number === 1 ? 'stage-1-bg' : undefined} className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0">
        {/* Node — wrapped in tooltip showing stage sub-item status */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 cursor-default ${
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
            </TooltipTrigger>
            <TooltipContent side="right" className="text-left min-w-[160px] max-w-[220px] p-2.5 space-y-2">
              <p className="font-semibold text-xs">{stage.title}</p>
              {isComplete ? (
                <p className="text-xs" style={{ color: 'hsl(var(--status-complete))' }}>All items complete ✓</p>
              ) : stage.substeps.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Your coordinator handles this stage.</p>
              ) : (
                <div className="space-y-1">
                  {stage.substeps.filter(it => it.status === 'not_started' || it.status === 'in_progress').length > 0 && (
                    <>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive/80">Still needed</p>
                      <ul className="space-y-1">
                        {stage.substeps.filter(it => it.status === 'not_started' || it.status === 'in_progress').map(it => (
                          <li key={it.label} className="flex items-start gap-1.5 text-xs">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                            <span className="text-foreground">{it.label}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {stage.substeps.filter(it => it.status === 'complete').length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border">
                      <ul className="space-y-1">
                        {stage.substeps.filter(it => it.status === 'complete').map(it => (
                          <li key={it.label} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'hsl(var(--status-complete))' }} />
                            <span>{it.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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

          {/* Stage 8 Pay Setup CTA */}
          {stage.number === 8 && (stage.status === 'not_started' || stage.status === 'in_progress') && (
            <div className="mt-3 pt-3 border-t border-border/50">
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
  operatorId,
  uploadedDocs,
  onUploadComplete,
  unackedRequiredDocs = 0,
  assignedCoordinator,
  onMessageCoordinator,
  onOpenBinder,
}: OperatorStatusPageProps) {
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    return sessionStorage.getItem('cert_expiry_banner_dismissed') === 'true';
  });
  const dismissBanner = () => {
    sessionStorage.setItem('cert_expiry_banner_dismissed', 'true');
    setBannerDismissed(true);
  };
  const [viewingQPassport, setViewingQPassport] = useState(false);

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

  // QPassport banner: show when screening is scheduled and QPassport has been uploaded
  const qpassportUrl = onboardingStatus.qpassport_url;
  const peScreening = onboardingStatus.pe_screening;
  const showQPassportBanner = peScreening === 'scheduled' && !!qpassportUrl;

  // Receipt reminder banner: show when QPassport is available but receipt not yet uploaded
  const hasReceiptDoc = uploadedDocs?.some(d => d.document_type === 'pe_receipt') ?? false;
  const showReceiptReminderBanner = peScreening === 'scheduled' && !!qpassportUrl && !hasReceiptDoc;

  return (
    <>
    {/* ── MOBILE: Checklist view (< md) ── */}
    <div className="md:hidden -mx-4 -mt-4">
      {/* Pass banners first, then checklist */}
      {showCriticalBanner && (
        <div className="mx-4 mt-4">
          <div
            className={`relative rounded-2xl border-2 p-4 shadow-md overflow-hidden ${
              bannerIsExpired
                ? 'bg-destructive/10 border-destructive/50'
                : 'bg-destructive/8 border-destructive/40'
            }`}
          >
            <button
              onClick={dismissBanner}
              aria-label="Dismiss"
              className="absolute top-3 right-3 h-6 w-6 rounded-full flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-start gap-3 pr-6">
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
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">— expires {formatExpiry(doc.date)}</span>
                      </p>
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${doc.level === 'expired' ? 'bg-destructive/15 border-destructive/40 text-destructive' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
                        {daysLabel(doc.days)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
                  {bannerIsExpired
                    ? 'Your document has expired. Upload a renewed copy immediately to remain compliant.'
                    : 'Please renew and upload your document to your portal before it expires to stay compliant.'}
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
        </div>
      )}
      {/* ── QPASSPORT BANNER ── */}
      {showQPassportBanner && (
        <div className="mx-4 mt-3">
          <div className="rounded-2xl border-2 border-gold/40 bg-gold/8 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-gold bg-gold/15">
                <FileText className="h-4 w-4 text-gold" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gold mb-0.5">
                  Action Required — QPassport Ready
                </p>
                <p className="text-sm font-semibold text-foreground leading-tight">Your QPassport has been uploaded</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Download or view your QPassport and bring it to your drug screening appointment. The barcode confirms your identity at the facility.
                  After your appointment, upload your receipt in the Stage 1 card below.
                </p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setViewingQPassport(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold border border-gold/40 bg-gold/10 hover:bg-gold/20 transition-colors px-3 py-1.5 rounded-lg"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View QPassport
                  </button>
                  <button
                    onClick={() => downloadBlob(qpassportUrl!, 'QPassport.pdf')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border bg-muted/50 hover:bg-muted transition-colors px-3 py-1.5 rounded-lg"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── RECEIPT REMINDER BANNER (mobile) ── */}
      {showReceiptReminderBanner && (
        <div className="mx-4 mt-3">
          <div className="rounded-2xl border-2 border-primary/40 bg-primary/8 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary/60 bg-primary/10">
                <Upload className="h-4 w-4 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-0.5">
                  Next Step — Upload Receipt
                </p>
                <p className="text-sm font-semibold text-foreground leading-tight">Don't forget to upload your receipt</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  After your drug screening appointment, take a photo of your receipt and upload it below. Your coordinator needs it to process your results.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    onNavigateTo('progress');
                    setTimeout(() => {
                      document.getElementById('stage-1-bg')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                  className="mt-3 text-xs h-8 gap-1.5 font-semibold"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Receipt
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <OnboardingChecklist
        stages={stages}
        isFullyOnboarded={isFullyOnboarded}
        progressPct={progressPct}
        completedStages={completedStages}
        onboardingStatus={onboardingStatus}
        onNavigateTo={onNavigateTo}
        displayName={displayName}
        operatorId={operatorId}
        uploadedDocs={uploadedDocs}
        onUploadComplete={onUploadComplete}
        unackedRequiredDocs={unackedRequiredDocs}
        assignedCoordinator={assignedCoordinator}
        onMessageCoordinator={onMessageCoordinator}
      />
    </div>

    {/* ── DESKTOP: Original timeline view (≥ md) ── */}
    <div className="hidden md:block">
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

      {/* ── QPASSPORT BANNER (desktop) ── */}
      {showQPassportBanner && (
        <div className="rounded-2xl border-2 border-gold/40 bg-gold/8 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-gold bg-gold/15">
              <FileText className="h-4 w-4 text-gold" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold mb-0.5">
                Action Required — QPassport Ready
              </p>
              <p className="text-sm font-semibold text-foreground leading-tight">Your QPassport has been uploaded</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Download or view your QPassport and bring it to your drug screening appointment. The barcode confirms your identity at the facility.
                After your appointment, upload your receipt in the Stage 1 card below.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setViewingQPassport(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold border border-gold/40 bg-gold/10 hover:bg-gold/20 transition-colors px-3 py-1.5 rounded-lg"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View QPassport
                </button>
                <button
                  onClick={() => downloadBlob(qpassportUrl!, 'QPassport.pdf')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border bg-muted/50 hover:bg-muted transition-colors px-3 py-1.5 rounded-lg"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECEIPT REMINDER BANNER (desktop) ── */}
      {showReceiptReminderBanner && (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/8 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary/60 bg-primary/10">
              <Upload className="h-4 w-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-0.5">
                Next Step — Upload Receipt
              </p>
              <p className="text-sm font-semibold text-foreground leading-tight">Don't forget to upload your receipt</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                After your drug screening appointment, take a photo of your receipt and upload it in Stage 1. Your coordinator needs it to process your results.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  document.getElementById('stage-1-bg')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="mt-3 text-xs h-8 gap-1.5 font-semibold"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Receipt
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
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Truck className="h-3 w-3 text-surface-dark-muted" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-dark-muted">Dispatcher</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full overflow-hidden border border-white/10 shrink-0 flex items-center justify-center bg-surface-dark-card">
                    {assignedDispatcher.avatarUrl ? (
                      <img src={assignedDispatcher.avatarUrl} alt={assignedDispatcher.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-gold">{assignedDispatcher.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">{assignedDispatcher.name}</p>
                    {assignedDispatcher.phone ? (
                      <a
                        href={`tel:${assignedDispatcher.phone}`}
                        className="flex items-center gap-1 text-xs text-gold hover:text-gold-light transition-colors font-medium w-fit"
                      >
                        <Phone className="h-3 w-3" />
                        {assignedDispatcher.phone}
                      </a>
                    ) : (
                      <button
                        onClick={onMessageDispatcher}
                        className="flex items-center gap-1 text-xs text-gold hover:text-gold-light transition-colors font-medium w-fit"
                      >
                        <Mail className="h-3 w-3" />
                        Send Message
                      </button>
                    )}
                  </div>
                </div>
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

      {isFullyOnboarded ? (
        <>
          {/* ── INSPECTION BINDER HERO (post-onboarding primary feature) ── */}
          <div className="bg-surface-dark rounded-2xl p-5 shadow-xl border border-gold/20">
            <div className="flex items-start gap-4 mb-4">
              <div className="h-12 w-12 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
                <Shield className="h-6 w-6 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-lg font-bold text-white leading-tight">Inspection Binder</p>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-gold/20 text-gold border border-gold/30">DOT Ready</span>
                </div>
                <p className="text-surface-dark-muted text-xs mt-1 leading-snug">
                  Show this at any DOT roadside inspection. Tap below to open instantly.
                </p>
                {(() => {
                  const expiring = [
                    { label: 'CDL License', days: cdlDays, level: cdlLevel, date: cdlExpiration },
                    { label: 'Medical Certificate', days: medDays, level: medLevel, date: medicalCertExpiration },
                  ].filter(d => d.level !== null && d.level !== 'green');

                  if (expiring.length === 0) {
                    return (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="h-2 w-2 rounded-full bg-status-complete shrink-0" />
                        <span className="text-xs font-semibold text-status-complete">All documents current</span>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/10 divide-y divide-destructive/20 overflow-hidden">
                      <div className="px-2.5 py-1 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">Expiring Soon</span>
                      </div>
                      {expiring.map(doc => {
                        const isExpired = doc.level === 'expired';
                        return (
                          <div key={doc.label} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isExpired ? 'bg-destructive' : doc.level === 'yellow' ? 'bg-warning' : 'bg-warning'}`} />
                              <span className="text-xs font-semibold text-white truncate">{doc.label}</span>
                              <span className="text-[11px] text-surface-dark-muted truncate">· {formatExpiry(doc.date)}</span>
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${isExpired ? 'bg-destructive/20 text-destructive border border-destructive/40' : 'bg-warning/20 text-warning border border-warning/40'}`}>
                              {daysLabel(doc.days)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={() => (onOpenBinder ? onOpenBinder('list') : onNavigateTo('inspection-binder'))}
                className="bg-gold text-surface-dark hover:bg-gold-light h-12 font-bold text-sm gap-2"
              >
                <Shield className="h-4 w-4" />
                Open Binder
              </Button>
              <Button
                onClick={() => (onOpenBinder ? onOpenBinder('pages') : onNavigateTo('inspection-binder'))}
                variant="outline"
                className="h-12 font-bold text-sm gap-2 border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 hover:text-gold"
              >
                <BookOpen className="h-4 w-4" />
                Open Flipbook
              </Button>
            </div>
          </div>

          {/* ── Compact "Fully Onboarded" confirmation ── */}
          <div className="bg-surface-dark rounded-2xl p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-status-complete/20 border-2 border-status-complete flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-status-complete" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Fully Onboarded</p>
                <p className="text-surface-dark-muted text-xs mt-0.5">
                  You're ready to dispatch. Welcome to SUPERTRANSPORT.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-surface-dark rounded-2xl p-5 shadow-xl">
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
        </div>
      )}

      {/* ── SMART PROGRESS WIDGET ── */}
      {!isFullyOnboarded && (
        <SmartProgressWidget
          stages={stages}
          onboardingStatus={onboardingStatus}
          isFullyOnboarded={isFullyOnboarded}
          onNavigateTo={onNavigateTo}
          operatorId={operatorId}
          uploadedDocs={uploadedDocs}
          onUploadComplete={onUploadComplete}
        />
      )}

      {/* Quick-stats row (hidden post-onboarding to reduce clutter) */}
      {!isFullyOnboarded && (
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
      )}

      {/* Milestone timeline — collapsed into "Onboarding History" once fully onboarded */}
      {isFullyOnboarded ? (
        <Collapsible>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-status-complete/10 border border-status-complete/25 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-status-complete" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">Onboarding History</p>
                  <p className="text-xs text-muted-foreground mt-0.5">All {stages.length} stages complete · tap to review</p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pt-2 pb-4 border-t border-border">
              <div className="pt-3">
                {stages.map((stage, idx) => (
                  <MilestoneNode key={stage.number} stage={stage} isLast={idx === stages.length - 1} onNavigateTo={onNavigateTo} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">Onboarding Stages</h2>
          <div>
            {stages.map((stage, idx) => (
              <MilestoneNode key={stage.number} stage={stage} isLast={idx === stages.length - 1} onNavigateTo={onNavigateTo} />
            ))}
          </div>
        </div>
      )}

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
              <a href="mailto:onboarding@mysupertransport.com" className="text-gold hover:underline font-medium">
                onboarding@mysupertransport.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
    </div> {/* end desktop md:block */}
    {viewingQPassport && qpassportUrl && (
      <FilePreviewModal
        url={qpassportUrl}
        name="QPassport.pdf"
        onClose={() => setViewingQPassport(false)}
      />
    )}
    </> 
  );
}
