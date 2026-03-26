import { useState, useRef } from 'react';
import {
  CheckCircle2, Clock, Circle, Download, Upload,
  Loader2, FileText, ExternalLink, FlaskConical, AlertTriangle,
  XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { validateFile } from '@/lib/validateFile';

interface PEScreeningTimelineProps {
  onboardingStatus: Record<string, string | null>;
  operatorId?: string | null;
  uploadedDocs?: { id: string; document_type: string; file_name: string | null; file_url: string | null; uploaded_at: string }[];
  onUploadComplete?: () => void;
}

type StepState = 'complete' | 'active' | 'pending' | 'error';

interface TimelineStep {
  id: string;
  label: string;
  sublabel?: string;
  state: StepState;
  date?: string | null;
  action?: React.ReactNode;
}

function StepDot({ state }: { state: StepState }) {
  if (state === 'complete') return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-status-complete/15 border-2 border-status-complete shrink-0">
      <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
    </span>
  );
  if (state === 'active') return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 border-2 border-gold shrink-0">
      <Clock className="h-3.5 w-3.5 text-gold" />
    </span>
  );
  if (state === 'error') return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 border-2 border-destructive shrink-0">
      <XCircle className="h-3.5 w-3.5 text-destructive" />
    </span>
  );
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted border-2 border-border shrink-0">
      <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
    </span>
  );
}

function formatDate(d: string | null | undefined): string | undefined {
  if (!d) return undefined;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PEScreeningTimeline({
  onboardingStatus,
  operatorId,
  uploadedDocs = [],
  onUploadComplete,
}: PEScreeningTimelineProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const peScreening = onboardingStatus.pe_screening as string | null;
  const peResult = onboardingStatus.pe_screening_result as string | null;
  const scheduledDate = onboardingStatus.pe_scheduled_date;
  const resultsDate = onboardingStatus.pe_results_date;
  const qpassportUrl = onboardingStatus.qpassport_url;

  const receiptDoc = uploadedDocs.find(d => d.document_type === 'pe_receipt');
  const peReceiptUrl = onboardingStatus.pe_receipt_url ?? receiptDoc?.file_url ?? null;
  const receiptDate = receiptDoc?.uploaded_at ?? null;

  // Determine step states based on screening lifecycle
  const isScheduled = peScreening === 'scheduled' || peScreening === 'results_in' || peScreening === 'complete';
  const hasResult = peScreening === 'results_in' || peScreening === 'complete';
  const isClear = peResult === 'clear';
  const isFailed = peResult === 'failed';
  const isComplete = peScreening === 'complete' && isClear;

  // Don't show if screening hasn't started
  if (!peScreening || peScreening === 'not_started') return null;

  const handleReceiptUpload = async (file: File) => {
    if (!operatorId) return;
    const { valid, error: validationError } = validateFile(file, false);
    if (!valid) {
      toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${operatorId}/pe_receipt/${Date.now()}.${ext}`;

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
        document_type: 'pe_receipt' as any,
        file_name: file.name,
        file_url: fileUrl,
      });

      try {
        await supabase.functions.invoke('send-notification', {
          body: { type: 'pe_receipt_uploaded', operator_id: operatorId },
        });
      } catch {
        // non-critical
      }

      toast({ title: 'Receipt uploaded', description: 'Your PE screening receipt has been submitted.' });
      onUploadComplete?.();
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const steps: TimelineStep[] = [
    // Step 1: Screening Scheduled
    {
      id: 'scheduled',
      label: 'Screening Scheduled',
      sublabel: isScheduled ? 'Your coordinator has scheduled your drug screening.' : undefined,
      state: isScheduled ? 'complete' : 'pending',
      date: scheduledDate ? formatDate(scheduledDate) : undefined,
    },
    // Step 2: QPassport Available
    {
      id: 'qpassport',
      label: 'QPassport Ready',
      sublabel: qpassportUrl
        ? 'Download and bring this to the testing facility. The barcode confirms your identity.'
        : isScheduled
        ? 'Your QPassport will appear here once your coordinator uploads it.'
        : undefined,
      state: qpassportUrl ? 'complete' : isScheduled ? 'active' : 'pending',
      action: qpassportUrl ? (
        <a
          href={qpassportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gold border border-gold/30 bg-gold/10 hover:bg-gold/20 transition-colors px-3 py-1.5 rounded-lg"
        >
          <Download className="h-3.5 w-3.5" />
          Download QPassport
        </a>
      ) : undefined,
    },
    // Step 3: Receipt Uploaded
    {
      id: 'receipt',
      label: 'Receipt Submitted',
      sublabel: receiptDoc
        ? `Submitted ${formatDate(receiptDate)} — your coordinator has been notified.`
        : isScheduled
        ? 'After your appointment, upload the receipt you received from the facility.'
        : undefined,
      state: receiptDoc ? 'complete' : isScheduled ? 'active' : 'pending',
      action: !receiptDoc && isScheduled ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleReceiptUpload(file);
              e.target.value = '';
            }}
          />
          <button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-gold text-surface-dark hover:bg-gold-light transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="h-3.5 w-3.5" />Upload Receipt</>
            )}
          </button>
        </>
      ) : receiptDoc?.file_url ? (
        <a
          href={receiptDoc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileText className="h-3 w-3" />
          {receiptDoc.file_name ?? 'View receipt'}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : undefined,
    },
    // Step 4: Results
    {
      id: 'result',
      label: hasResult
        ? isClear
          ? 'Result: Cleared ✓'
          : isFailed
          ? 'Result: Flagged'
          : 'Results Received'
        : 'Results Pending',
      sublabel: hasResult
        ? isClear
          ? 'Your drug screening result is clear. You are cleared to proceed.'
          : isFailed
          ? 'An issue was found with your screening result. Your coordinator will reach out with next steps.'
          : resultsDate
          ? `Results received ${formatDate(resultsDate)}`
          : 'Results have been received and are under review.'
        : isScheduled
        ? 'Results will appear here after your coordinator processes them.'
        : undefined,
      state: hasResult
        ? isClear
          ? 'complete'
          : isFailed
          ? 'error'
          : 'active'
        : 'pending',
      date: resultsDate ? formatDate(resultsDate) : undefined,
    },
  ];

  return (
    <div className="border-t border-border/50">
      {/* Section header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors"
      >
        <FlaskConical className="h-3.5 w-3.5 text-gold shrink-0" />
        <span className="flex-1 text-left text-xs font-bold text-foreground uppercase tracking-wide">
          Background Check — Drug Screening
        </span>
        {isComplete ? (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-status-complete/10 border-status-complete/25 text-status-complete uppercase tracking-wide">
            Cleared
          </span>
        ) : isFailed ? (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-destructive/10 border-destructive/25 text-destructive uppercase tracking-wide">
            Action Needed
          </span>
        ) : (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-gold/10 border-gold/25 text-gold uppercase tracking-wide">
            In Progress
          </span>
        )}
        <span className="shrink-0 text-muted-foreground/40 ml-1">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {/* Info bar */}
          {!receiptDoc && isScheduled && !qpassportUrl && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-gold/8 border border-gold/20 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-gold shrink-0 mt-0.5" />
              <p className="text-[11px] text-foreground/70 leading-snug">
                Your QPassport must be presented at the testing facility. Wait for your coordinator to upload it before going.
              </p>
            </div>
          )}

          {/* Timeline */}
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border/50" aria-hidden="true" />

            <div className="space-y-0">
              {steps.map((step, i) => (
                <div key={step.id} className="flex gap-3 pb-4 last:pb-0 relative">
                  <StepDot state={step.state} />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-xs font-semibold leading-tight ${
                        step.state === 'complete' ? 'text-status-complete'
                          : step.state === 'error' ? 'text-destructive'
                          : step.state === 'active' ? 'text-foreground'
                          : 'text-muted-foreground/50'
                      }`}>
                        {step.label}
                      </span>
                      {step.date && (
                        <span className="text-[10px] text-muted-foreground">{step.date}</span>
                      )}
                    </div>
                    {step.sublabel && (
                      <p className={`text-[11px] mt-0.5 leading-snug ${
                        step.state === 'pending' ? 'text-muted-foreground/40' : 'text-muted-foreground'
                      }`}>
                        {step.sublabel}
                      </p>
                    )}
                    {step.action}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
