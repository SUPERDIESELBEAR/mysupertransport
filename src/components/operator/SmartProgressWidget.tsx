import { useRef, useState } from 'react';
import { ArrowRight, Upload, FileText, Shield, AlertTriangle, CheckCircle2, User, Users, Zap, Loader2, HelpCircle, X, ChevronRight, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { validateFile } from '@/lib/validateFile';
import { useToast } from '@/hooks/use-toast';

type StageStatus = 'not_started' | 'in_progress' | 'complete' | 'action_required';

interface Stage {
  number: number;
  title: string;
  status: StageStatus;
  substeps: { label: string; value: string; status: StageStatus }[];
}

interface UploadedDoc {
  id: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

interface SmartProgressWidgetProps {
  stages: Stage[];
  onboardingStatus: Record<string, string | null>;
  isFullyOnboarded: boolean;
  onNavigateTo: (view: string) => void;
  operatorId?: string | null;
  uploadedDocs?: UploadedDoc[];
  onUploadComplete?: () => void;
  unackedRequiredDocs?: number;
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
        return `Your coordinator is waiting on: ${requested.join(', ')}.`;
      if (os.form_2290 === 'received' || os.truck_title === 'received')
        return 'Documents are being reviewed by your coordinator. You\'ll be notified once all are confirmed.';
      return 'Upload your Form 2290, truck title, photos, and inspection report.';
    },
    responsibleParty: 'operator',
    responsibleLabel: 'You upload · Coordinator reviews',
    steps: [
      { label: 'Form 2290 uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Form 2290')?.status !== 'not_started' },
      { label: 'Truck Title uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Truck Title')?.status !== 'not_started' },
      { label: 'Truck Photos uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Truck Photos')?.status !== 'not_started' },
      { label: 'Truck Inspection uploaded', who: 'operator', done: (os, st) => st.substeps.find(s => s.label === 'Truck Inspection')?.status !== 'not_started' },
      { label: 'All documents reviewed', who: 'coordinator', done: (os) => os.form_2290 === 'received' && os.truck_title === 'received' },
    ],
    ctaLabel: (os) => {
      const anyRequested = [os.form_2290, os.truck_title, os.truck_photos, os.truck_inspection].some(v => v === 'requested');
      // Only show the nav CTA when inline upload is unavailable (no operatorId)
      return anyRequested ? 'Upload Requested Documents' : 'Go to Documents';
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
    steps: [
      { label: 'MO docs submitted to state', who: 'coordinator', done: (os) => os.mo_docs_submitted === 'submitted' },
      { label: 'State approval received', who: 'coordinator', done: (os) => os.mo_reg_received === 'yes' },
    ],
  },
  5: {
    blockerText: (os) => {
      const eldDone = (os as any).eld_exempt === true || os.eld_installed === 'yes';
      const done = [os.decal_applied === 'yes', eldDone, os.fuel_card_issued === 'yes'];
      const eldLabel = (os as any).eld_exempt === true ? 'ELD (exempt)' : 'ELD Device';
      const remaining = ['Decal', eldLabel, 'Fuel Card'].filter((_, i) => !done[i]);
      if (remaining.length === 0) return 'All equipment is set up.';
      return `Your coordinator will arrange: ${remaining.join(', ')}. You'll be contacted to schedule installation.`;
    },
    responsibleParty: 'coordinator',
    responsibleLabel: 'Coordinator arranges installation',
    steps: [
      { label: 'Decal applied to truck', who: 'coordinator', done: (os) => os.decal_applied === 'yes' },
      { label: 'ELD device installed', who: 'coordinator', done: (os) => (os as any).eld_exempt === true || os.eld_installed === 'yes' },
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
    steps: [
      { label: 'Added to insurance policy', who: 'coordinator', done: (os) => !!os.insurance_added_date },
      { label: 'Unit number assigned', who: 'coordinator', done: (os) => !!os.unit_number },
    ],
  },
};

// ─── What's Next? modal data ───────────────────────────────────────────────────

interface WhatsNextStep {
  label: string;
  detail: string;
  who: 'operator' | 'coordinator';
  actionLabel?: string;
  actionView?: string;
}

interface WhatsNextStage {
  number: number;
  title: string;
  icon: 'shield' | 'upload' | 'file' | 'zap' | 'insurance';
  summary: string;
  steps: WhatsNextStep[];
}

const WHATS_NEXT_STAGES: WhatsNextStage[] = [
  {
    number: 1,
    title: 'Background Screening',
    icon: 'shield',
    summary: 'Safety checks before you can drive. Your coordinator handles the submissions — you just need to show up for the drug screening.',
    steps: [
      { label: 'MVR check submitted', detail: 'Your coordinator requests your Motor Vehicle Record from the state. No action needed from you.', who: 'coordinator' },
      { label: 'Clearinghouse check submitted', detail: 'A federal drug & alcohol violation check is run through FMCSA. Coordinator handles this too.', who: 'coordinator' },
      { label: 'Results received', detail: 'Results typically arrive within 2–5 business days. You\'ll be notified once in.', who: 'coordinator' },
      { label: 'Pre-employment drug screening', detail: 'You\'ll be sent a scheduling link to complete a DOT drug test at a nearby clinic. This is required before dispatch.', who: 'operator' },
      { label: 'MVR / Clearinghouse approval', detail: 'Your coordinator reviews the results and marks approval before moving to the next stage.', who: 'coordinator' },
    ],
  },
  {
    number: 2,
    title: 'Document Collection',
    icon: 'upload',
    summary: 'Upload your truck documents so your coordinator can file for Missouri registration and confirm your equipment.',
    steps: [
      { label: 'Form 2290 (Heavy Vehicle Use Tax)', detail: 'Your annual IRS tax form for vehicles over 55,000 lbs. Upload the stamped Schedule 1 page.', who: 'operator', actionLabel: 'Upload Documents', actionView: 'documents' },
      { label: 'Truck Title', detail: 'The official title showing ownership of your truck. A clear photo or PDF scan is fine.', who: 'operator', actionLabel: 'Upload Documents', actionView: 'documents' },
      { label: 'Truck Photos', detail: 'Photos of the front, sides, and rear of your truck. Used for inspection and MO registration filing.', who: 'operator', actionLabel: 'Upload Documents', actionView: 'documents' },
      { label: 'Truck Inspection Report', detail: 'A recent DOT/annual inspection report for your vehicle. Must be from within the last 12 months.', who: 'operator', actionLabel: 'Upload Documents', actionView: 'documents' },
      { label: 'Documents reviewed', detail: 'Your coordinator verifies all documents are complete and usable before proceeding.', who: 'coordinator' },
    ],
  },
  {
    number: 3,
    title: 'ICA Contract',
    icon: 'file',
    summary: 'Your Independent Contractor Agreement defines your working relationship, pay split, and responsibilities.',
    steps: [
      { label: 'ICA prepared by coordinator', detail: 'Your coordinator builds the contract using your truck info, rate split, and owner details. This happens after Stage 1 & 2 are complete.', who: 'coordinator' },
      { label: 'ICA sent to you for signing', detail: 'You\'ll receive an email with a signing link. You can also sign directly from the ICA tab in your portal.', who: 'coordinator' },
      { label: 'You sign the ICA', detail: 'Review and sign digitally. Once signed, your coordinator countersigns to finalize the contract.', who: 'operator', actionLabel: 'Go to ICA Tab', actionView: 'ica' },
    ],
  },
  {
    number: 4,
    title: 'Missouri Registration',
    icon: 'file',
    summary: 'If you need MO apportioned registration, your coordinator files everything on your behalf. Approval takes 2–4 weeks.',
    steps: [
      { label: 'MO filing submitted by coordinator', detail: 'Your coordinator submits the apportioned registration application to the state using your Form 2290, title, and signed ICA.', who: 'coordinator' },
      { label: 'State approval & plates received', detail: 'Once the state approves, your coordinator receives the registration and plates. This typically takes 2–4 weeks.', who: 'coordinator' },
    ],
  },
  {
    number: 5,
    title: 'Equipment Setup',
    icon: 'zap',
    summary: 'Your truck needs three things before dispatch: a company decal, an ELD device, and a fuel card.',
    steps: [
      { label: 'Decal applied to truck', detail: 'The company decal is applied to your truck, either at our shop or via UPS self-install kit. Your coordinator will arrange this.', who: 'coordinator' },
      { label: 'ELD device installed', detail: 'An Electronic Logging Device is installed to track your Hours of Service. Required by FMCSA for all CDL operators.', who: 'coordinator' },
      { label: 'Fuel card issued', detail: 'You\'ll receive a company fuel card (e.g. EFS or Comdata) for fuel purchases on the road. Your coordinator issues this.', who: 'coordinator' },
    ],
  },
  {
    number: 6,
    title: 'Insurance & Activation',
    icon: 'insurance',
    summary: 'Final step: your coordinator adds you to the company insurance policy and assigns your unit number. Then you\'re ready to dispatch!',
    steps: [
      { label: 'Added to insurance policy', detail: 'Your coordinator adds your truck and CDL info to the carrier\'s commercial auto insurance. You\'ll receive a certificate of insurance.', who: 'coordinator' },
      { label: 'Unit number assigned', detail: 'You\'re assigned a permanent unit number (e.g. "Unit 47") used for dispatch, fuel, and logs.', who: 'coordinator' },
    ],
  },
];

// ─── What's Next? modal ───────────────────────────────────────────────────────

function WhatsNextModal({
  open,
  onClose,
  stages,
  onboardingStatus,
  onNavigateTo,
}: {
  open: boolean;
  onClose: () => void;
  stages: Stage[];
  onboardingStatus: Record<string, string | null>;
  onNavigateTo: (view: string) => void;
}) {
  const getStageStatus = (num: number): StageStatus =>
    stages.find(s => s.number === num)?.status ?? 'not_started';

  const stageIcon = (icon: WhatsNextStage['icon'], cls: string) => {
    if (icon === 'shield') return <Shield className={cls} />;
    if (icon === 'upload') return <Upload className={cls} />;
    if (icon === 'zap') return <Zap className={cls} />;
    return <FileText className={cls} />;
  };

  const statusColors: Record<StageStatus, { border: string; bg: string; label: string; labelColor: string; dot: string }> = {
    complete:         { border: 'border-status-complete/30', bg: 'bg-status-complete/5',   label: 'Complete',        labelColor: 'text-status-complete', dot: 'bg-status-complete' },
    in_progress:      { border: 'border-gold/30',            bg: 'bg-gold/5',               label: 'In Progress',     labelColor: 'text-gold',            dot: 'bg-gold' },
    action_required:  { border: 'border-destructive/30',     bg: 'bg-destructive/5',        label: 'Action Required', labelColor: 'text-destructive',     dot: 'bg-destructive' },
    not_started:      { border: 'border-border',             bg: 'bg-muted/20',             label: 'Not Started',     labelColor: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-md w-full rounded-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-4 w-4 text-primary" />
              </span>
              <div>
                <DialogTitle className="text-base font-bold leading-tight">What's Next?</DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">Your full onboarding roadmap</p>
              </div>
            </div>
            <button onClick={onClose} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-4 py-4 space-y-3">
            {WHATS_NEXT_STAGES.map((wStage) => {
              const status = getStageStatus(wStage.number);
              const colors = statusColors[status];
              const stepsForStage = STAGE_INFO[wStage.number]?.steps ?? [];
              const stepsWithDone = stepsForStage.map(s => ({
                ...s,
                isDone: s.done(onboardingStatus, stages.find(st => st.number === wStage.number)!),
              }));
              const isCurrentStage = status === 'action_required' || status === 'in_progress';

              return (
                <div key={wStage.number} className={`rounded-xl border overflow-hidden ${colors.border} ${colors.bg}`}>
                  {/* Stage header */}
                  <div className={`px-3.5 py-2.5 flex items-center gap-2.5 border-b ${colors.border}`}>
                    <span className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${
                      status === 'complete' ? 'bg-status-complete/15' :
                      status === 'in_progress' ? 'bg-gold/15' :
                      status === 'action_required' ? 'bg-destructive/15' : 'bg-muted/60'
                    }`}>
                      {status === 'complete'
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
                        : stageIcon(wStage.icon, `h-3.5 w-3.5 ${colors.labelColor}`)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[9.5px] font-bold uppercase tracking-widest leading-none mb-0.5 ${colors.labelColor}`}>
                        Stage {wStage.number} · {colors.label}
                      </p>
                      <p className="text-[13px] font-bold text-foreground leading-tight truncate">{wStage.title}</p>
                    </div>
                    {isCurrentStage && (
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                        status === 'action_required'
                          ? 'bg-destructive/10 border-destructive/20 text-destructive'
                          : 'bg-gold/10 border-gold/20 text-gold'
                      }`}>
                        Current
                      </span>
                    )}
                  </div>

                  {/* Stage summary */}
                  <p className="px-3.5 pt-2.5 pb-0 text-xs text-muted-foreground leading-relaxed">{wStage.summary}</p>

                  {/* Steps */}
                  <div className="px-3.5 pt-2.5 pb-3 space-y-3">
                    {wStage.steps.map((step, i) => {
                      const stepData = stepsWithDone[i];
                      const isDone = stepData?.isDone ?? false;
                      return (
                        <div key={i} className={`flex gap-2.5 ${isDone ? 'opacity-60' : ''}`}>
                          {/* Step number / done indicator */}
                          <div className="shrink-0 mt-0.5">
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4 text-status-complete" />
                            ) : (
                              <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold ${
                                isCurrentStage && !isDone && step.who === 'operator'
                                  ? 'border-destructive text-destructive'
                                  : 'border-border text-muted-foreground'
                              }`}>
                                {i + 1}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <p className={`text-xs font-semibold leading-tight ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {step.label}
                              </p>
                              <WhoChip who={step.who} />
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">{step.detail}</p>
                            {step.actionView && !isDone && status !== 'not_started' && (
                              <button
                                onClick={() => { onNavigateTo(step.actionView!); onClose(); }}
                                className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
                              >
                                {step.actionLabel} <ChevronRight className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-4 pb-5">
            <p className="text-center text-[10px] text-muted-foreground">
              Questions? Message your coordinator from the <button onClick={() => { onNavigateTo('messages'); onClose(); }} className="underline text-primary">Messages tab</button>.
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Doc slot config for inline upload ────────────────────────────────────────

const INLINE_SLOTS = [
  { key: 'form_2290',      label: 'Form 2290',           accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'truck_title',    label: 'Truck Title',          accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'truck_photos',   label: 'Truck Photos',         accept: '.jpg,.jpeg,.png,.heic' },
  { key: 'truck_inspection', label: 'Truck Inspection', accept: '.pdf,.jpg,.jpeg,.png' },
] as const;

type SlotKey = typeof INLINE_SLOTS[number]['key'];

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

// ─── Inline upload panel (Stage 2 only) ──────────────────────────────────────

function InlineDocUpload({
  operatorId,
  onboardingStatus,
  uploadedDocs,
  onUploadComplete,
  accentClass,
  isActionRequired,
}: {
  operatorId: string;
  onboardingStatus: Record<string, string | null>;
  uploadedDocs: UploadedDoc[];
  onUploadComplete: () => void;
  accentClass: string;
  isActionRequired: boolean;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<SlotKey | null>(null);
  const [justUploaded, setJustUploaded] = useState<Set<SlotKey>>(new Set());
  const fileRefs = useRef<Partial<Record<SlotKey, HTMLInputElement | null>>>({});

  // Only show slots that are currently requested by staff
  const requestedSlots = INLINE_SLOTS.filter(s => onboardingStatus[s.key] === 'requested');
  if (requestedSlots.length === 0) return null;

  const getUploaded = (key: SlotKey) => uploadedDocs.filter(d => d.document_type === key);

  const handleUpload = async (slotKey: SlotKey, slotLabel: string, accept: string, file: File) => {
    const allowDocs = false;
    const { valid, error: validationError } = validateFile(file, allowDocs);
    if (!valid) {
      toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
      return;
    }

    setUploading(slotKey);
    try {
      const ext = file.name.split('.').pop();
      const path = `${operatorId}/${slotKey}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('operator-documents')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { data: urlData } = supabase.storage.from('operator-documents').getPublicUrl(path);
      const fileUrl = signedData?.signedUrl ?? urlData?.publicUrl;

      await supabase.from('operator_documents').insert({
        operator_id: operatorId,
        document_type: slotKey as any,
        file_name: file.name,
        file_url: fileUrl,
      });

      // Trigger success flash animation, then refresh parent data
      setJustUploaded(prev => new Set(prev).add(slotKey));
      setTimeout(() => {
        setJustUploaded(prev => { const n = new Set(prev); n.delete(slotKey); return n; });
        onUploadComplete();
      }, 1800);

      toast({ title: 'Document uploaded', description: `${slotLabel} has been submitted for review.` });
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className={`mx-4 mb-0 mt-3 rounded-xl border overflow-hidden ${
      isActionRequired ? 'border-destructive/20 bg-destructive/3' : 'border-gold/20 bg-gold/3'
    }`}>
      <p className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border-b ${
        isActionRequired
          ? 'text-destructive border-destructive/15 bg-destructive/5'
          : 'text-gold border-gold/15 bg-gold/5'
      }`}>
        Upload Requested Documents
      </p>

      <div className="divide-y divide-border/40">
        {requestedSlots.map(slot => {
          const uploaded = getUploaded(slot.key);
          const isUploading = uploading === slot.key;
          const isSuccess = justUploaded.has(slot.key);
          const hasUploaded = uploaded.length > 0 || isSuccess;

          return (
            <div
              key={slot.key}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors duration-500 ${
                isSuccess ? 'bg-status-complete/10' : ''
              }`}
            >
              {/* Status icon */}
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0 animate-fade-in" />
              ) : hasUploaded ? (
                <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />
              ) : (
                <AlertTriangle className={`h-4 w-4 shrink-0 ${isActionRequired ? 'text-destructive' : 'text-gold'}`} />
              )}

              {/* Label + uploaded filename */}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold leading-tight transition-colors duration-300 ${
                  isSuccess ? 'text-status-complete' : hasUploaded ? 'text-muted-foreground line-through' : 'text-foreground'
                }`}>
                  {slot.label}
                </p>
                {isSuccess ? (
                  <p className="text-[10px] text-status-complete mt-0.5 font-semibold animate-fade-in">
                    ✓ Submitted for review
                  </p>
                ) : hasUploaded && uploaded.length > 0 ? (
                  <p className="text-[10px] text-status-complete mt-0.5 truncate">
                    ✓ {uploaded[uploaded.length - 1].file_name ?? 'Uploaded'}
                  </p>
                ) : null}
              </div>

              {/* Upload button */}
              <input
                ref={el => { fileRefs.current[slot.key] = el; }}
                type="file"
                accept={slot.accept}
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(slot.key, slot.label, slot.accept, file);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant={hasUploaded ? 'outline' : 'default'}
                disabled={isUploading || isSuccess}
                onClick={() => fileRefs.current[slot.key]?.click()}
                className={`shrink-0 text-xs h-8 px-3 gap-1.5 font-semibold transition-all duration-300 ${
                  isSuccess
                    ? 'border-status-complete text-status-complete bg-status-complete/10'
                    : !hasUploaded
                    ? isActionRequired
                      ? 'bg-destructive text-white hover:bg-destructive/90'
                      : 'bg-gold text-surface-dark hover:bg-gold-light'
                    : ''
                }`}
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isSuccess ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isUploading ? 'Uploading…' : isSuccess ? 'Uploaded!' : hasUploaded ? 'Replace' : 'Upload'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function SmartProgressWidget({
  stages,
  onboardingStatus,
  isFullyOnboarded,
  onNavigateTo,
  operatorId,
  uploadedDocs = [],
  onUploadComplete,
  unackedRequiredDocs = 0,
}: SmartProgressWidgetProps) {
  const [whatsNextOpen, setWhatsNextOpen] = useState(false);

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

  // Stage 2: show inline upload if operatorId is available and docs are requested
  const showInlineUpload =
    activeStage.number === 2 &&
    !!operatorId &&
    !!onUploadComplete &&
    [onboardingStatus.form_2290, onboardingStatus.truck_title, onboardingStatus.truck_photos, onboardingStatus.truck_inspection].some(v => v === 'requested');

  // Hide the nav CTA when inline upload is shown — no need to navigate away
  const showNavCta = !showInlineUpload && !!ctaLabel && !!info.ctaView;

  return (
    <>
    <div className={`rounded-2xl border overflow-hidden ${borderClass}`}>
      {/* ── Header (tappable to open What's Next) ── */}
      <button
        type="button"
        onClick={() => setWhatsNextOpen(true)}
        className={`w-full px-4 py-3 flex items-center gap-3 border-b text-left hover:brightness-95 active:brightness-90 transition-[filter] ${
          isActionRequired ? 'border-destructive/20' : isInProgress ? 'border-gold/20' : 'border-border'
        }`}
      >
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
        <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">Full guide</span>
        </span>
      </button>

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

      {/* ── Inline upload panel (Stage 2 when docs are requested) ── */}
      {showInlineUpload && (
        <InlineDocUpload
          operatorId={operatorId!}
          onboardingStatus={onboardingStatus}
          uploadedDocs={uploadedDocs}
          onUploadComplete={onUploadComplete!}
          accentClass={accentClass}
          isActionRequired={isActionRequired}
        />
      )}

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

        {showNavCta && (
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

    {/* ── Required Documents action card ────────────────────────────── */}
    {unackedRequiredDocs > 0 && (
      <div className="mt-3 rounded-2xl border border-primary/25 bg-primary/5 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 flex items-center gap-3 border-b border-primary/15">
          <span className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary leading-none mb-0.5">
              Action Required
            </p>
            <p className="text-sm font-bold text-foreground leading-tight">Required Documents</p>
          </div>
          <span className="shrink-0 flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
            {unackedRequiredDocs}
          </span>
        </div>
        {/* Body */}
        <div className="px-4 pt-2.5 pb-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            You have <span className="font-semibold text-foreground">{unackedRequiredDocs} required {unackedRequiredDocs === 1 ? 'document' : 'documents'}</span> in the Doc Hub that need your review and acknowledgment.
          </p>
        </div>
        {/* CTA */}
        <div className="px-4 pt-2 pb-3.5">
          <Button
            size="sm"
            onClick={() => onNavigateTo('docs-hub')}
            className="w-full text-xs h-8 gap-1.5 font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Review &amp; Acknowledge Documents
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )}

    <WhatsNextModal
      open={whatsNextOpen}
      onClose={() => setWhatsNextOpen(false)}
      stages={stages}
      onboardingStatus={onboardingStatus}
      onNavigateTo={onNavigateTo}
    />
    </>
  );
}
