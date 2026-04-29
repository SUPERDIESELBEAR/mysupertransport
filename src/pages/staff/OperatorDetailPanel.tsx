import { useState, useEffect, useRef, useCallback } from 'react';
import { isEquipmentFullyComplete, looksPre2000, ELD_EXEMPT_DEFAULT_REASON } from '@/lib/equipmentCompletion';
import * as React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn, formatPhoneDisplay } from '@/lib/utils';
import { sanitizeText } from '@/lib/sanitize';
import { syncAllDeviceFields } from '@/lib/equipmentSync';
import { saveTruckSpecs } from '@/lib/truckSync';
import { reminderErrorToast } from '@/lib/reminderError';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Save, FileCheck, FileText, Truck, Shield, CheckCircle2, AlertTriangle, Clock, FilePen, Trash2, Bell, Paperclip, ExternalLink, ChevronDown, ChevronUp, Copy, Check, MessageSquare, CheckCheck, RotateCcw, Send, History, RefreshCw, Mail, CalendarClock, CalendarIcon, Upload, Loader2, X, UserX, UserCheck, CreditCard, BookOpen, Download, ZoomIn, DollarSign, PauseCircle, Pencil, Cake, PartyPopper, Phone, MapPin, Eye, Smartphone, FileSignature, Rocket } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import ICABuilderModal from '@/components/ica/ICABuilderModal';
import ICAViewModal from '@/components/ica/ICAViewModal';
import LeaseTerminationBuilderModal from '@/components/ica/LeaseTerminationBuilderModal';
import LeaseTerminationViewModal from '@/components/ica/LeaseTerminationViewModal';
import OperatorBinderPanel from '@/components/inspection/OperatorBinderPanel';
import DriverVaultCard from '@/components/drivers/DriverVaultCard';
import TruckPhotoGridModal from '@/components/staff/TruckPhotoGridModal';
import { formatDistanceToNow, format, differenceInDays, parseISO, startOfDay } from 'date-fns';
import TruckInfoCard, { TruckInfo, TruckInfoCardEditPayload, TruckFieldsEditPayload, EquipmentShippingInfo } from '@/components/operator/TruckInfoCard';
import { US_STATES } from '@/components/application/types';
import { DateInput } from '@/components/ui/date-input';
import { Switch } from '@/components/ui/switch';
import { Suspense } from 'react';
const DocumentEditor = React.lazy(() => import('@/components/shared/DocumentEditor').then(m => ({ default: m.DocumentEditor })));
import { EditorErrorBoundary } from '@/components/shared/EditorErrorBoundary';
import SettlementForecast from '@/components/operator/SettlementForecast';

interface OperatorDetailPanelProps {
  operatorId: string;
  onBack: () => void;
  onMessageOperator?: (userId: string) => void;
  onUnsavedChangesChange?: (hasChanges: boolean) => void;
  /** Called when a compliance pill is clicked to open the app review drawer */
  onOpenAppReview?: (focusField: 'cdl' | 'medcert') => void;
  /** Called by parent to push refreshed expiry dates into this panel */
  expiryOverride?: { cdl: string | null; medcert: string | null };
  /** If true, scroll to the Inspection Binder section after load */
  scrollToInspectionBinder?: boolean;
  /** If set, scroll to this stage section after load (e.g. 'stage1', 'stage3') */
  scrollToStageKey?: string;
  backLabel?: string;
}

type OnboardingStatus = {
  id: string;
  mvr_status: string;
  ch_status: string;
  mvr_ch_approval: string;
  pe_screening: string;
  pe_screening_result: string;
  registration_status: string | null;
  form_2290: string;
  truck_title: string;
  truck_photos: string;
  truck_inspection: string;
  ica_status: string;
  mo_docs_submitted: string;
  mo_docs_submitted_date: string | null;
  mo_expected_approval_date: string | null;
  mo_reg_received: string;
  mo_notes: string | null;
  decal_method: string | null;
  decal_applied: string;
  decal_photo_ds_url: string | null;
  decal_photo_ps_url: string | null;
  eld_method: string | null;
  eld_installed: string;
  fuel_card_issued: string;
  // ELD exemption (pre-2000 trucks, FMCSA §395.8(a)(1)(iii))
  eld_exempt: boolean;
  eld_exempt_reason: string | null;
  // Stage 5 exceptions
  paper_logbook_approved: boolean;
  temp_decal_approved: boolean;
  exception_notes: string | null;
  exception_approved_by: string | null;
  exception_approved_at: string | null;
  insurance_added_date: string | null;
  insurance_policy_type: string | null;
  insurance_stated_value: number | null;
  insurance_ai_company: string | null;
  insurance_ai_address: string | null;
  insurance_ai_city: string | null;
  insurance_ai_state: string | null;
  insurance_ai_zip: string | null;
  insurance_ai_email: string | null;
  insurance_ch_company: string | null;
  insurance_ch_address: string | null;
  insurance_ch_city: string | null;
  insurance_ch_state: string | null;
  insurance_ch_zip: string | null;
  insurance_ch_email: string | null;
  insurance_ch_same_as_ai: boolean | null;
  insurance_notes: string | null;
  unit_number: string | null;
  fully_onboarded: boolean | null;
  bg_check_notes: string | null;
  mvr_requested_date: string | null;
  mvr_received_date: string | null;
  ch_requested_date: string | null;
  ch_received_date: string | null;
  pe_scheduled_date: string | null;
  pe_results_date: string | null;
  ica_sent_date: string | null;
  ica_signed_date: string | null;
  ica_notes: string | null;
  doc_notes: string | null;
  // Stage 5 — Device Numbers
  eld_serial_number: string | null;
  dash_cam_number: string | null;
  bestpass_number: string | null;
  fuel_card_number: string | null;
  // Stage 7 — Go Live & Dispatch Readiness
  dispatch_ready_orientation: boolean;
  dispatch_ready_consortium: boolean;
  dispatch_ready_first_assigned: boolean;
  go_live_date: string | null;
  operator_type: string | null;
  // Upfront Costs
  cost_mo_registration: number | null;
  cost_form_2290: number | null;
  cost_other: number | null;
  cost_other_description: string | null;
  cost_notes: string | null;
  // QPassport & PE Receipt & PE Results
  qpassport_url: string | null;
  pe_receipt_url: string | null;
  pe_results_doc_url: string | null;
  // Form 2290 owner-provided flag
  form_2290_owner_provided: boolean;
};

type DispatchHistoryEntry = {
  id: string;
  dispatch_status: string;
  current_load_lane: string | null;
  status_notes: string | null;
  changed_at: string;
  changed_by: string | null;
  changed_by_name?: string | null;
};

const DISPATCH_STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string; emoji: string }> = {
  not_dispatched: { label: 'Not Dispatched', dotClass: 'bg-muted-foreground', badgeClass: 'bg-muted text-muted-foreground border-border', emoji: '⏸' },
  dispatched:     { label: 'Dispatched',     dotClass: 'bg-status-complete',   badgeClass: 'bg-status-complete/10 text-status-complete border-status-complete/30', emoji: '🚛' },
  home:           { label: 'Home',           dotClass: 'bg-status-progress',   badgeClass: 'bg-status-progress/10 text-status-progress border-status-progress/30', emoji: '🏠' },
  truck_down:     { label: 'Truck Down',     dotClass: 'bg-destructive',       badgeClass: 'bg-destructive/10 text-destructive border-destructive/30', emoji: '🔴' },
};

// ── QPassport Uploader sub-component ────────────────────────────────────────
function QPassportUploader({
  operatorId,
  currentUrl,
  onUploaded,
}: {
  operatorId: string;
  currentUrl: string | null | undefined;
  onUploaded: (url: string) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast({ title: 'PDF only', description: 'QPassport must be a PDF file.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 10 MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const path = `${operatorId}/qpassport/${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from('operator-documents').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: sd } = await supabase.storage.from('operator-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
      const fileUrl = sd?.signedUrl ?? '';
      const { error: updateErr } = await supabase.from('onboarding_status').update({ qpassport_url: fileUrl }).eq('operator_id', operatorId);
      if (updateErr) throw updateErr;
      onUploaded(fileUrl);
      toast({ title: 'QPassport uploaded', description: 'The operator can now download it from their portal.' });
      // Fire-and-forget: notify operator that QPassport is ready
      supabase.functions.invoke('send-notification', {
        body: { type: 'qpassport_uploaded', operator_id: operatorId },
      }).catch((e) => console.warn('qpassport_uploaded notification failed:', e));
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as Record<string, unknown>).message)
          : 'Unknown error';
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">QPassport PDF</Label>
      <div className="flex items-center gap-2 flex-wrap">
        {currentUrl && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
            <ExternalLink className="h-3 w-3" /> View QPassport PDF
          </a>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <Button
          size="sm"
          variant={currentUrl ? 'outline' : 'default'}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={`text-xs gap-1 h-7 px-2.5 ${!currentUrl ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
        >
          {uploading
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
            : <><Upload className="h-3 w-3" /> {currentUrl ? 'Replace PDF' : 'Upload QPassport'}</>
          }
        </Button>
      </div>
    </div>
  );
}

// ── Stage 2 Doc Uploader sub-component (multi-file) ─────────────────────────
function Stage2DocUploader({
  operatorId,
  docType,
  label,
  existingFiles,
  onFilesAdded,
}: {
  operatorId: string;
  docType: string;
  label: string;
  existingFiles: { id: string; file_name: string | null; file_url: string | null; uploaded_at: string }[];
  onFilesAdded: (newFiles: { id: string; file_name: string | null; file_url: string | null; uploaded_at: string }[]) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const valid = lower.endsWith('.pdf') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.heic');
      if (!valid) {
        toast({ title: 'Invalid file type', description: `"${file.name}" — only PDF, JPG, PNG, or HEIC allowed.`, variant: 'destructive' });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'File too large', description: `"${file.name}" exceeds 10 MB.`, variant: 'destructive' });
        return;
      }
    }
    setUploading(true);
    const added: { id: string; file_name: string | null; file_url: string | null; uploaded_at: string }[] = [];
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `${operatorId}/${docType}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('operator-documents').upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        const { data: sd } = await supabase.storage.from('operator-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        const fileUrl = sd?.signedUrl ?? '';
        const { data: row, error: insErr } = await supabase.from('operator_documents').insert({
          operator_id: operatorId,
          document_type: docType as any,
          file_name: file.name,
          file_url: fileUrl,
        }).select('id, file_name, file_url, uploaded_at').single();
        if (insErr) throw insErr;
        if (row) added.push(row as any);
      }
      onFilesAdded(added);
      toast({ title: `${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded`, description: `${label} document${files.length > 1 ? 's' : ''} saved.` });
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as Record<string, unknown>).message)
          : 'Unknown error';
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-1">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-2 py-1 bg-background hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        <span>{uploading ? 'Uploading…' : existingFiles.length > 0 ? 'Upload more pages' : 'Upload document'}</span>
      </button>
    </div>
  );
}

export default function OperatorDetailPanel({ operatorId, onBack, onMessageOperator, onUnsavedChangesChange, onOpenAppReview, expiryOverride, scrollToInspectionBinder, scrollToStageKey, backLabel }: OperatorDetailPanelProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const { guardDemo } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidingICA, setVoidingICA] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorUserId, setOperatorUserId] = useState<string | null>(null);
  const [pwaInstalledAt, setPwaInstalledAt] = useState<string | null>(null);
  const [showICABuilder, setShowICABuilder] = useState(false);
  const [showICAView, setShowICAView] = useState(false);
  const [showTerminationBuilder, setShowTerminationBuilder] = useState(false);
  const [openTerminationId, setOpenTerminationId] = useState<string | null>(null);
  const [applicationData, setApplicationData] = useState<any>(null);
  const [icaDraftUpdatedAt, setIcaDraftUpdatedAt] = useState<string | null>(null);
  const [cdlExpiration, setCdlExpiration] = useState<string | null>(null);
  const [medCertExpiration, setMedCertExpiration] = useState<string | null>(null);
  const [dlFrontUrl, setDlFrontUrl] = useState<string | null>(null);
  const [dlRearUrl, setDlRearUrl] = useState<string | null>(null);
  const [medCertDocUrl, setMedCertDocUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [anticipatedStartDate, setAnticipatedStartDate] = useState<string>('');
  const [status, setStatus] = useState<Partial<OnboardingStatus>>({});
  const [statusId, setStatusId] = useState<string | null>(null);
  const [dispatchHistory, setDispatchHistory] = useState<DispatchHistoryEntry[]>([]);
  const [dispatchHistoryTotal, setDispatchHistoryTotal] = useState(0);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const HISTORY_PAGE_SIZE = 10;
  const [currentDispatchStatus, setCurrentDispatchStatus] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  type DocFileRow = { id: string; file_name: string | null; file_url: string | null; uploaded_at: string };
  const [docFiles, setDocFiles] = useState<Record<string, DocFileRow[]>>({});
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [onboardingHistoryExpanded, setOnboardingHistoryExpanded] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [truckPhotoGridOpen, setTruckPhotoGridOpen] = useState(false);
  const [stage2Preview, setStage2Preview] = useState<{ url: string; name: string; docType: string; appField?: string } | null>(null);
  const [stage2Editing, setStage2Editing] = useState<{ url: string; name: string; bucket: string; path: string } | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [costPreview, setCostPreview] = useState<{ url: string; name: string; slotKey: string } | null>(null);
  const [costEditing, setCostEditing] = useState<{ url: string; name: string; bucket: string; path: string; slotKey: string } | null>(null);

  // Contact Info editing state
  const [contactEditing, setContactEditing] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    dob: '' as string | null,
    go_live_date: '' as string | null,
  });

  // Stage 6 Insurance email settings
  const [insuranceEmailRecipients, setInsuranceEmailRecipients] = useState<string[]>([]);
  const [insuranceEmailInput, setInsuranceEmailInput] = useState('');
  const [savingInsuranceEmails, setSavingInsuranceEmails] = useState(false);
  const [sendingInsuranceEmail, setSendingInsuranceEmail] = useState(false);
  const [chSameAsAI, setChSameAsAI] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [chExpanded, setChExpanded] = useState(false);
  const [insuranceEmailSent, setInsuranceEmailSent] = useState(false);

  // Cert history timeline
  type CertHistoryEntry = {
    id: string;
    event_type: 'renewed' | 'reminder_sent' | 'expiry_changed';
    doc_type: string;
    actor_name: string | null;
    occurred_at: string;
    old_expiry?: string | null;
    new_expiry?: string | null;
    days_until?: number | null;
    // Email delivery fields (reminder_sent only)
    email_sent?: boolean | null;
    email_error?: string | null;
  };
  const [certHistory, setCertHistory] = useState<CertHistoryEntry[]>([]);
  const [certHistoryLoading, setCertHistoryLoading] = useState(false);
  const [certHistoryExpanded, setCertHistoryExpanded] = useState(false);
  const [certHistoryFilter, setCertHistoryFilter] = useState<'all' | 'reminders' | 'renewals' | 'failed'>('all');
  const savedSnapshot = useRef<{ status: Partial<OnboardingStatus>; notes: string } | null>(null);
  const [navGuard, setNavGuard] = useState<null | { action: () => void }>(null);
  const [renewingField, setRenewingField] = useState<'cdl' | 'medcert' | null>(null);
  const [reminderSending, setReminderSending] = useState<Record<string, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [lastReminded, setLastReminded] = useState<Record<string, string>>({});
  const [resendingInvite, setResendingInvite] = useState(false);
  const [inviteResent, setInviteResent] = useState(false);
  const [sendingInstallInstructions, setSendingInstallInstructions] = useState(false);
  // SUPERDRIVE launch invite state
  const [sendingSuperdriveInvite, setSendingSuperdriveInvite] = useState(false);
  const [superdriveInviteSent, setSuperdriveInviteSent] = useState(false);
  const [isPreExistingOperator, setIsPreExistingOperator] = useState(false);
  // Last renewal per doc type: key = 'CDL' | 'Medical Cert' → ISO timestamp
  const [lastRenewed, setLastRenewed] = useState<Record<string, string>>({});
  // Last renewed by name per doc type
  const [lastRenewedBy, setLastRenewedBy] = useState<Record<string, string>>({});

  // Deactivation state
  const [isActive, setIsActive] = useState(true);
  const [deactivating, setDeactivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState<string>('');
  // Dispatch Hub exclusion state
  const [excludedFromDispatch, setExcludedFromDispatch] = useState(false);
  const [excludedReason, setExcludedReason] = useState<string>('');
  const [savingExclusion, setSavingExclusion] = useState(false);
  const { isManagement } = useAuth();

  // On Hold state
  const [isOnHold, setIsOnHold] = useState(false);
  const [onHoldReason, setOnHoldReason] = useState('');
  const [onHoldDate, setOnHoldDate] = useState<string | null>(null);
  const [showOnHoldModal, setShowOnHoldModal] = useState(false);
  const [onHoldModalReason, setOnHoldModalReason] = useState('');
  const [onHoldModalDate, setOnHoldModalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [onHoldModalDateOpen, setOnHoldModalDateOpen] = useState(false);
  const [savingOnHold, setSavingOnHold] = useState(false);

  // Stage 8 — Contractor Pay Setup
  const [paySetupRecord, setPaySetupRecord] = useState<any>(null);
  const [paySetupLoaded, setPaySetupLoaded] = useState(false);

  // ICA truck info for TruckInfoCard
  const [icaTruckInfo, setIcaTruckInfo] = useState<TruckInfo | null>(null);
  const [equipmentShipping, setEquipmentShipping] = useState<EquipmentShippingInfo[]>([]);

  const [companyDocUrls, setCompanyDocUrls] = useState<{ overview: string | null; calendar: string | null }>({ overview: null, calendar: null });
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null);
  const [sendingPayrollDocs, setSendingPayrollDocs] = useState(false);

  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const inspectionBinderRef = useRef<HTMLDivElement | null>(null);

  // Show sticky bar when the main progress bar scrolls out of view
  useEffect(() => {
    const el = progressBarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  // Scroll to Inspection Binder section when requested (after data loads)
  useEffect(() => {
    if (!scrollToInspectionBinder || loading) return;
    const el = inspectionBinderRef.current;
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [scrollToInspectionBinder, loading]);

  // Scroll to a specific stage section when requested via deep-link from StageTrack
  useEffect(() => {
    if (!scrollToStageKey || loading) return;
    setTimeout(() => {
      scrollToStage(scrollToStageKey);
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToStageKey, loading]);



  const toggleStage = (stageKey: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      next.has(stageKey) ? next.delete(stageKey) : next.add(stageKey);
      return next;
    });
  };

  const scrollToStage = (stageKey: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      next.delete(stageKey);
      return next;
    });
    setTimeout(() => {
      stageRefs.current[stageKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // Track the last-saved values of milestone fields to detect transitions
  const savedMilestones = useRef<{
    ica_status: string;
    mvr_ch_approval: string;
    pe_screening_result: string;
    insurance_added_date: string | null;
    form_2290: string;
    truck_title: string;
    truck_photos: string;
    truck_inspection: string;
    decal_applied: string;
    eld_installed: string;
    fuel_card_issued: string;
    mo_reg_received: string;
    eld_serial_number: string | null;
    dash_cam_number: string | null;
    bestpass_number: string | null;
    fuel_card_number: string | null;
  }>({
    ica_status: '', mvr_ch_approval: '', pe_screening_result: '', insurance_added_date: null,
    form_2290: '', truck_title: '', truck_photos: '', truck_inspection: '',
    decal_applied: '', eld_installed: '', fuel_card_issued: '', mo_reg_received: '',
    eld_serial_number: null, dash_cam_number: null, bestpass_number: null, fuel_card_number: null,
  });

  useEffect(() => {
    fetchOperatorDetail();
    fetchDispatchHistory();
    fetchCertHistory();
    // Fetch Stage 8 pay setup record + signed URLs for files
    supabase
      .from('contractor_pay_setup' as any)
      .select('*')
      .eq('operator_id', operatorId)
      .maybeSingle()
      .then(async ({ data }) => {
        setPaySetupRecord(data);
        setPaySetupLoaded(true);
        // (no additional signed URLs needed for pay setup)
      });
    // Fetch signed URLs for company payroll reference docs
    Promise.all([
      supabase.storage.from('operator-documents').createSignedUrl('company-docs/payroll-deposit-overview.pdf', 3600).then(r => r.data?.signedUrl ?? null),
      supabase.storage.from('operator-documents').createSignedUrl('company-docs/payroll-calendar.pdf', 3600).then(r => r.data?.signedUrl ?? null),
    ]).then(([overview, calendar]) => {
      setCompanyDocUrls({ overview, calendar });
    });
  }, [operatorId]);

  // Fetch ICA draft updated_at when ica_status is in_progress
  useEffect(() => {
    if (status.ica_status !== 'in_progress') { setIcaDraftUpdatedAt(null); return; }
    supabase
      .from('ica_contracts' as any)
      .select('updated_at')
      .eq('operator_id', operatorId)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setIcaDraftUpdatedAt((data as any)?.updated_at ?? null));
  }, [operatorId, status.ica_status]);

  // When parent pushes refreshed expiry values (e.g. after drawer save), update local state instantly
  useEffect(() => {
    if (!expiryOverride) return;
    setCdlExpiration(expiryOverride.cdl);
    setMedCertExpiration(expiryOverride.medcert);
  }, [expiryOverride]);

  // Realtime: prepend new dispatch history entries as they arrive
  useEffect(() => {
    const channel = supabase
      .channel(`dispatch-history-${operatorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_status_history', filter: `operator_id=eq.${operatorId}` },
        async (payload: any) => {
          const entry = payload.new as DispatchHistoryEntry;
          // Resolve the changer's name if present
          let changed_by_name: string | null = null;
          if (entry.changed_by) {
            const map = await resolveStaffNames([entry.changed_by]);
            changed_by_name = map[entry.changed_by] ?? null;
          }
          setDispatchHistory(prev => [{ ...entry, changed_by_name }, ...prev]);
          setDispatchHistoryTotal(prev => prev + 1);
          // Also refresh the current status badge
          setCurrentDispatchStatus(entry.dispatch_status);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [operatorId]);

  // Realtime: keep equipment shipping chips fresh when assignments are
  // created / updated / returned anywhere (Equipment Inventory, History modal, etc.)
  useEffect(() => {
    if (!operatorId) return;
    const channel = supabase
      .channel(`equipment-assignments-${operatorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment_assignments', filter: `operator_id=eq.${operatorId}` },
        () => { refreshEquipmentShipping(operatorId); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [operatorId]);

  // Auto-collapse Stage 8 once pay setup data loads
  useEffect(() => {
    if (paySetupLoaded && paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted) {
      setCollapsedStages(prev => {
        const next = new Set(prev);
        next.add('stage8');
        return next;
      });
    }
  }, [paySetupLoaded, paySetupRecord]);



  // Notify parent of unsaved changes state
  useEffect(() => {
    const hasChanges = savedSnapshot.current !== null && (
      JSON.stringify(savedSnapshot.current.status) !== JSON.stringify(status) ||
      savedSnapshot.current.notes !== notes
    );
    onUnsavedChangesChange?.(hasChanges);
  }, [status, notes]);

  // Cmd+S / Ctrl+S keyboard shortcut to save (only when there are unsaved changes and not already saving)
  const saveShortcutRef = useRef<() => void>(() => {});
  saveShortcutRef.current = () => { if (!saving) handleSave(); };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveShortcutRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Helper: resolve an array of user UUIDs → { [userId]: displayName }
  const resolveStaffNames = async (userIds: string[]): Promise<Record<string, string>> => {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return {};
    const { data } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', unique);
    const map: Record<string, string> = {};
    (data ?? []).forEach((p: any) => {
      map[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Staff';
    });
    return map;
  };

  const fetchDispatchHistory = async (reset = true) => {
    const { data: dispatch } = await supabase
      .from('active_dispatch')
      .select('dispatch_status')
      .eq('operator_id', operatorId)
      .maybeSingle();
    setCurrentDispatchStatus((dispatch as any)?.dispatch_status ?? null);

    // Get total count for "load more"
    const { count } = await supabase
      .from('dispatch_status_history' as any)
      .select('id', { count: 'exact', head: true })
      .eq('operator_id', operatorId);
    setDispatchHistoryTotal(count ?? 0);

    const { data } = await supabase
      .from('dispatch_status_history' as any)
      .select('id, dispatch_status, current_load_lane, status_notes, changed_at, changed_by')
      .eq('operator_id', operatorId)
      .order('changed_at', { ascending: false })
      .limit(HISTORY_PAGE_SIZE);

    const rows = (data as unknown as DispatchHistoryEntry[]) ?? [];
    const nameMap = await resolveStaffNames(rows.map(r => r.changed_by).filter(Boolean) as string[]);
    const enriched = rows.map(r => ({ ...r, changed_by_name: r.changed_by ? nameMap[r.changed_by] ?? null : null }));
    if (reset) {
      setDispatchHistory(enriched);
    } else {
      setDispatchHistory(enriched);
    }
  };

  const loadMoreHistory = async () => {
    setLoadingMoreHistory(true);
    const { data } = await supabase
      .from('dispatch_status_history' as any)
      .select('id, dispatch_status, current_load_lane, status_notes, changed_at, changed_by')
      .eq('operator_id', operatorId)
      .order('changed_at', { ascending: false })
      .range(dispatchHistory.length, dispatchHistory.length + HISTORY_PAGE_SIZE - 1);
    const rows = (data as unknown as DispatchHistoryEntry[]) ?? [];
    const nameMap = await resolveStaffNames(rows.map(r => r.changed_by).filter(Boolean) as string[]);
    const enriched = rows.map(r => ({ ...r, changed_by_name: r.changed_by ? nameMap[r.changed_by] ?? null : null }));
    setDispatchHistory(prev => [...prev, ...enriched]);
    setLoadingMoreHistory(false);
  };



  const handleMarkRenewed = async (field: 'cdl' | 'medcert') => {
    if (!applicationData?.id && !operatorId) return;
    setRenewingField(field);
    const col = field === 'cdl' ? 'cdl_expiration' : 'medical_cert_expiration';
    const label = field === 'cdl' ? 'CDL' : 'Med Cert';
    const oldDateStr = field === 'cdl' ? cdlExpiration : medCertExpiration;
    const newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];

    // We need the application id — fetch it from the operator if not already in applicationData
    let appId: string | null = applicationData?.id ?? null;
    if (!appId) {
      const { data: op } = await supabase.from('operators').select('application_id').eq('id', operatorId).single();
      appId = (op as any)?.application_id ?? null;
    }
    if (!appId) { setRenewingField(null); return; }

    // Resolve actor display name in parallel with the update
    const actorId = session?.user?.id ?? null;
    const [{ error }, actorProfile] = await Promise.all([
      supabase.from('applications').update({ [col]: newDateStr }).eq('id', appId),
      actorId
        ? supabase.from('profiles').select('first_name, last_name').eq('user_id', actorId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      if (field === 'cdl') setCdlExpiration(newDateStr);
      else setMedCertExpiration(newDateStr);
      toast({ title: `${label} marked as renewed`, description: `New expiry set to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.` });

      // ── Write audit log entry, then refresh timeline ─────────────────
      const profileData = (actorProfile as any)?.data;
      const actorName = profileData
        ? `${profileData.first_name ?? ''} ${profileData.last_name ?? ''}`.trim() || null
        : null;
      const { error: auditErr } = await supabase.from('audit_log' as any).insert({
        actor_id: actorId,
        actor_name: actorName,
        action: 'cert_renewed',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: {
          document_type: label,
          old_expiry: oldDateStr ?? null,
          new_expiry: newDateStr,
          operator_name: operatorName,
        },
      });
      if (auditErr) {}
      // Optimistically update 'Renewed by' indicator
      const docTypeKey = label === 'CDL' ? 'CDL' : 'Medical Cert';
      const renewedNow = new Date().toISOString();
      setLastRenewed(prev => ({ ...prev, [docTypeKey]: renewedNow }));
      if (actorName) setLastRenewedBy(prev => ({ ...prev, [docTypeKey]: actorName }));
      // Refresh history timeline AFTER audit log write completes
      fetchCertHistory();
    }
    setRenewingField(null);
  };

  const handleSendReminder = async (docType: 'CDL' | 'Medical Cert', dateStr: string) => {
    const key = docType;
    setReminderSending(prev => ({ ...prev, [key]: true }));
    try {
      const days = differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          operator_id: operatorId,
          doc_type: docType,
          days_until: days,
          expiration_date: dateStr,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder');
      setLastReminded(prev => ({ ...prev, [key]: new Date().toISOString() }));
      setReminderSent(prev => ({ ...prev, [key]: true }));
      if (data.email_error) {
        const { title, description } = reminderErrorToast(new Error(data.email_error));
        toast({ title, description, variant: 'destructive' });
      } else {
        toast({ title: 'Reminder sent', description: `Email sent to ${operatorName}` });
      }
      setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      // Brief delay so DB insert is visible before fetching history
      setTimeout(() => fetchCertHistory(), 600);
    } catch (err: any) {
      const { title, description } = reminderErrorToast(err);
      toast({ title, description, variant: 'destructive' });
    } finally {
      setReminderSending(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleResendInvite = async () => {
    if (!operatorEmail || resendingInvite) return;
    setResendingInvite(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/resend-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email: operatorEmail, staff_override: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invitation');
      setInviteResent(true);
      toast({ title: 'Invitation sent', description: `A new invite email was sent to ${operatorEmail}.` });
      setTimeout(() => setInviteResent(false), 8000);
    } catch (err: any) {
      toast({ title: 'Failed to resend invite', description: err.message, variant: 'destructive' });
    } finally {
      setResendingInvite(false);
    }
  };

  const handleSendSuperdriveInvite = async () => {
    if (!operatorId || sendingSuperdriveInvite) return;
    setSendingSuperdriveInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('launch-superdrive-invite', {
        body: { operator_ids: [operatorId] },
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (error || (data as any)?.error) {
        throw new Error(error?.message ?? (data as any)?.error ?? 'Failed to send SUPERDRIVE invite');
      }
      const result = ((data as any).results ?? [])[0];
      if (result?.status === 'sent') {
        setSuperdriveInviteSent(true);
        toast({
          title: 'SUPERDRIVE invite sent',
          description: `Welcome email sent to ${result.email}.`,
        });
        setTimeout(() => setSuperdriveInviteSent(false), 8000);
      } else if (result?.status === 'recently_invited') {
        toast({
          title: 'Recently invited',
          description: 'This operator was invited within the last 30 days. Skipped to avoid duplicate sends.',
        });
      } else {
        toast({
          title: 'Could not send invite',
          description: result?.message ?? `Status: ${result?.status ?? 'unknown'}`,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Failed to send SUPERDRIVE invite',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSendingSuperdriveInvite(false);
    }
  };

  const fetchCertHistory = async () => {
    setCertHistoryLoading(true);
    try {
      // Fetch cert_reminders (authoritative send log) and audit_log (renewals + days_until context) in parallel
      const [remindersRes, auditRes] = await Promise.all([
        supabase
          .from('cert_reminders')
          .select('id, doc_type, sent_at, sent_by_name, email_sent, email_error')
          .eq('operator_id', operatorId)
          .order('sent_at', { ascending: false })
          .limit(200),
        supabase
          .from('audit_log')
          .select('id, action, actor_name, created_at, metadata')
          .eq('entity_id', operatorId)
          .in('action', ['cert_renewed', 'cert_reminder_sent'])
          .order('created_at', { ascending: false })
          .limit(200) as unknown as Promise<{ data: any[] | null }>,
      ]);

      // Build audit-log lookup for days_until context: keyed by doc_type + ISO-minute
      // The audit log cert_reminder_sent row is written ~0-2 seconds after the cert_reminders row
      const auditDaysLookup: Record<string, number | null> = {};
      (auditRes.data ?? []).forEach((row: any) => {
        if (row.action !== 'cert_reminder_sent') return;
        const meta = row.metadata ?? {};
        const docType = meta.document_type ?? meta.doc_type ?? 'CDL';
        // Use a 2-minute window: store minute key AND minute+1 key so nearby timestamps match
        const ts = new Date(row.created_at);
        [0, -1, 1].forEach(offsetMin => {
          const shifted = new Date(ts.getTime() + offsetMin * 60_000);
          const key = `${docType}|${shifted.toISOString().slice(0, 16)}`;
          if (!(key in auditDaysLookup)) auditDaysLookup[key] = meta.days_until ?? null;
        });
      });

      const entries: CertHistoryEntry[] = [];

      // 1. All reminder send attempts — from cert_reminders (authoritative)
      ((remindersRes as any).data ?? []).forEach((r: any) => {
        const minuteKey = `${r.doc_type}|${r.sent_at?.slice(0, 16)}`;
        const daysUntil = auditDaysLookup[minuteKey] ?? null;
        entries.push({
          id: `cr-${r.id}`,
          event_type: 'reminder_sent',
          doc_type: r.doc_type,
          actor_name: r.sent_by_name ?? null,
          occurred_at: r.sent_at,
          days_until: daysUntil,
          email_sent: r.email_sent ?? true,
          email_error: r.email_error ?? null,
        });
      });

      // 2. Renewal events — from audit_log only
      (auditRes.data ?? []).forEach((row: any) => {
        if (row.action !== 'cert_renewed') return;
        const meta = row.metadata ?? {};
        entries.push({
          id: row.id,
          event_type: 'renewed',
          doc_type: meta.document_type ?? meta.doc_type ?? 'CDL',
          actor_name: row.actor_name,
          occurred_at: row.created_at,
          old_expiry: meta.old_expiry ?? null,
          new_expiry: meta.new_expiry ?? null,
        });
      });

      // Sort combined list newest-first
      entries.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
      setCertHistory(entries);

      // Extract most-recent renewal per doc type for the 'Renewed by' indicator
      const renewedMap: Record<string, string> = {};
      const renewedByMap: Record<string, string> = {};
      entries.forEach(e => {
        if (e.event_type === 'renewed' && !renewedMap[e.doc_type]) {
          renewedMap[e.doc_type] = e.occurred_at;
          if (e.actor_name) renewedByMap[e.doc_type] = e.actor_name;
        }
      });
      setLastRenewed(renewedMap);
      setLastRenewedBy(renewedByMap);

      // Auto-expand if any event occurred within the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hasRecentActivity = entries.some(e => new Date(e.occurred_at) >= sevenDaysAgo);
      if (hasRecentActivity) setCertHistoryExpanded(true);
    } finally {
      setCertHistoryLoading(false);
    }
  };

  const fetchOperatorDetail = async () => {

    // Fetch operator core data and doc files in parallel
    const [{ data: op }, { data: opDocs }] = await Promise.all([
      supabase
        .from('operators')
        .select(`id, user_id, notes, anticipated_start_date, is_active, on_hold, on_hold_reason, on_hold_date, pwa_installed_at, last_web_seen_at, onboarding_status (*), applications (id, email, first_name, last_name, phone, address_street, address_city, address_state, address_zip, cdl_expiration, medical_cert_expiration, dob, dl_front_url, dl_rear_url, medical_cert_url, reviewer_notes)`)
        .eq('id', operatorId)
        .single(),
      supabase
        .from('operator_documents')
        .select('id, document_type, file_name, file_url, uploaded_at')
        .eq('operator_id', operatorId)
        .order('uploaded_at', { ascending: false }),
    ]);

    // Group doc files by document_type
    const grouped: Record<string, DocFileRow[]> = {};
    for (const doc of (opDocs ?? []) as any[]) {
      if (!grouped[doc.document_type]) grouped[doc.document_type] = [];
      grouped[doc.document_type].push(doc);
    }
    setDocFiles(grouped);

    if (op) {
      setIsActive((op as any).is_active ?? true);
      setIsOnHold((op as any).on_hold ?? false);
      setOnHoldReason((op as any).on_hold_reason ?? '');
      setOnHoldDate((op as any).on_hold_date ?? null);
      setExcludedFromDispatch((op as any).excluded_from_dispatch === true);
      setExcludedReason((op as any).excluded_from_dispatch_reason ?? '');
      // Fetch profile separately to avoid FK hint issues
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, home_state')
        .eq('user_id', (op as any).user_id)
        .maybeSingle();

      const appForName = (op as any).applications;
      const appFirst = appForName?.first_name;
      const appLast = appForName?.last_name;
      setOperatorName(
        `${appFirst || profile?.first_name || ''} ${appLast || profile?.last_name || ''}`.trim() || 'Unknown Operator'
      );
      setOperatorUserId((op as any).user_id ?? null);
      setPwaInstalledAt((op as any).pwa_installed_at ?? null);
      const app = (op as any).applications;
      // Resolve email: from application if present, otherwise fetch from auth via profiles email or leave editable
      const resolvedEmail = app?.email ?? '';
      setOperatorEmail(resolvedEmail);
      setIsPreExistingOperator(app?.reviewer_notes === 'Pre-existing operator added directly');
      if (app) {
        setApplicationData(app);
      } else {
        // Synthesize minimal contact object from profile for non-applicant operators
        setApplicationData({
          id: null,
          phone: profile?.phone ?? '',
          email: resolvedEmail,
          address_street: '',
          address_city: '',
          address_state: profile?.home_state ?? '',
          address_zip: '',
          dob: null,
        });
      }
      setCdlExpiration(app?.cdl_expiration ?? null);
      setMedCertExpiration(app?.medical_cert_expiration ?? null);
      setDlFrontUrl(app?.dl_front_url ?? null);
      setDlRearUrl(app?.dl_rear_url ?? null);
      setMedCertDocUrl(app?.medical_cert_url ?? null);
      setNotes((op as any).notes ?? '');
      setAnticipatedStartDate((op as any).anticipated_start_date ?? '');
      const os = (op as any).onboarding_status ?? null;
      if (os) {
        setStatus(os);
        setStatusId(os.id);
        setChSameAsAI(os.insurance_ch_same_as_ai ?? false);
        // Default Operator Type to Solo Driver if unset, and persist the default
        if (!os.operator_type) {
          os.operator_type = 'solo';
          setStatus((prev: any) => ({ ...prev, operator_type: 'solo' }));
          if (os.id) {
            supabase
              .from('onboarding_status' as any)
              .update({ operator_type: 'solo' })
              .eq('id', os.id)
              .then(({ error }) => { if (error) console.error('default operator_type backfill failed', error); });
          }
        }
        savedSnapshot.current = { status: os, notes: (op as any).notes ?? '' };
        savedMilestones.current = {
          ica_status: os.ica_status ?? '',
          mvr_ch_approval: os.mvr_ch_approval ?? '',
          pe_screening_result: os.pe_screening_result ?? '',
          insurance_added_date: os.insurance_added_date ?? null,
          form_2290: os.form_2290 ?? '',
          truck_title: os.truck_title ?? '',
          truck_photos: os.truck_photos ?? '',
          truck_inspection: os.truck_inspection ?? '',
          decal_applied: os.decal_applied ?? '',
          eld_installed: os.eld_installed ?? '',
          fuel_card_issued: os.fuel_card_issued ?? '',
          mo_reg_received: os.mo_reg_received ?? '',
          eld_serial_number: os.eld_serial_number ?? null,
          dash_cam_number: os.dash_cam_number ?? null,
          bestpass_number: os.bestpass_number ?? null,
          fuel_card_number: os.fuel_card_number ?? null,
        };
        // Auto-collapse stages that are already complete on load
        const autoCollapse = new Set<string>();
        if ((os.mvr_status === 'requested' || os.mvr_status === 'received') &&
            (os.ch_status === 'requested' || os.ch_status === 'received') &&
            os.mvr_ch_approval === 'approved' &&
            os.pe_screening_result === 'clear') autoCollapse.add('stage1');
        if (os.form_2290 === 'received' && os.truck_title === 'received' && os.truck_photos === 'received' && os.truck_inspection === 'received') autoCollapse.add('stage2');
        if (os.ica_status === 'complete') autoCollapse.add('stage3');
        if ((os.mo_reg_received === 'yes' || os.registration_status === 'own_registration') &&
            os.mo_docs_submitted === 'submitted') autoCollapse.add('stage4');
        if (isEquipmentFullyComplete(os as any)) autoCollapse.add('stage5');
        if (os.insurance_added_date) autoCollapse.add('stage6');
        if (os.go_live_date) autoCollapse.add('stage7');
        if (autoCollapse.size > 0) setCollapsedStages(autoCollapse);
      }
    }

    // Load persistent insurance email recipients
    const { data: insSettings } = await supabase
      .from('insurance_email_settings' as any)
      .select('recipient_emails')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    if (insSettings) {
      setInsuranceEmailRecipients((insSettings as any).recipient_emails ?? []);
    }

    // Build truck info: prefer onboarding_status fields, fall back to ICA
    const osTruck = (op as any)?.onboarding_status as any;
    const { data: icaData } = await supabase
      .from('ica_contracts' as any)
      .select('truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number')
      .eq('operator_id', operatorId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ica = icaData as any;
    const merged: TruckInfo = {
      truck_year: osTruck?.truck_year || ica?.truck_year || null,
      truck_make: osTruck?.truck_make || ica?.truck_make || null,
      truck_vin: osTruck?.truck_vin || ica?.truck_vin || null,
      truck_plate: osTruck?.truck_plate || ica?.truck_plate || null,
      truck_plate_state: osTruck?.truck_plate_state || ica?.truck_plate_state || null,
      trailer_number: osTruck?.trailer_number || ica?.trailer_number || null,
    };
    if (Object.values(merged).some(Boolean)) {
      setIcaTruckInfo(merged);
    } else {
      setIcaTruckInfo(null);
    }

    // Fetch equipment shipping info (carrier / tracking # / receipt) per device.
    // Uses the same operator-scoped RPC the operator portal uses, so staff see exactly what the operator sees.
    await refreshEquipmentShipping(operatorId);

    setLoading(false);
  };

  // Re-fetch shipping info for the current operator. Called on initial load
  // and from the equipment_assignments realtime subscription so chips update
  // instantly after any assign / edit / return done in another view.
  const refreshEquipmentShipping = async (opId: string) => {
    const { data: shippingData } = await supabase.rpc(
      'get_equipment_shipping_for_operator' as any,
      { p_operator_id: opId },
    );
    if (Array.isArray(shippingData)) {
      setEquipmentShipping((shippingData as any[]).map(r => ({
        device_type: r.device_type,
        shipping_carrier: r.shipping_carrier,
        tracking_number: r.tracking_number,
        ship_date: r.ship_date,
        tracking_receipt_url: r.tracking_receipt_url,
      })));
    } else {
      setEquipmentShipping([]);
    }
  };

  // Map doc field keys to human-readable labels
  const DOC_LABELS: Record<string, string> = {
    form_2290: 'Form 2290',
    truck_title: 'Truck Title',
    truck_photos: 'Truck Photos',
    truck_inspection: 'Truck Inspection Report',
  };

  const handleSaveInsuranceEmails = async () => {
    setSavingInsuranceEmails(true);
    try {
      const { error } = await supabase
        .from('insurance_email_settings' as any)
        .update({ recipient_emails: insuranceEmailRecipients, updated_at: new Date().toISOString(), updated_by: session?.user?.id ?? null })
        .eq('id', '00000000-0000-0000-0000-000000000001');
      if (error) throw error;
      toast({ title: 'Insurance email recipients saved', description: `${insuranceEmailRecipients.length} recipient(s) saved.` });
    } catch (err: any) {
      toast({ title: 'Failed to save recipients', description: err.message, variant: 'destructive' });
    } finally {
      setSavingInsuranceEmails(false);
    }
  };

  const handleSendInsuranceEmail = async () => {
    setSendingInsuranceEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-insurance-request', {
        body: { operator_id: operatorId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error || !data?.success) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
      setInsuranceEmailSent(true);
      toast({ title: 'Insurance email sent', description: `Sent to ${(data.sent_to as string[]).join(', ')}` });
      setTimeout(() => setInsuranceEmailSent(false), 5000);
    } catch (err: any) {
      toast({ title: 'Failed to send insurance email', description: err.message, variant: 'destructive' });
    } finally {
      setSendingInsuranceEmail(false);
    }
  };

  const handleSendInstallInstructions = async () => {
    if (guardDemo()) return;
    setSendingInstallInstructions(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-pwa-install', {
        body: { operator_id: operatorId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw new Error(error.message ?? 'Unknown error');
      toast({ title: 'Install instructions sent', description: `SUPERDRIVE install instructions sent to ${operatorName || 'operator'}.` });
    } catch (err: any) {
      toast({ title: 'Failed to send install instructions', description: err.message, variant: 'destructive' });
    } finally {
      setSendingInstallInstructions(false);
    }
  };

  const handleSave = async () => {
    if (guardDemo()) return;
    setSaving(true);

    // ── Detect milestone transitions before saving ──────────────────────
    const prev = savedMilestones.current;
    const isNewlyFullyOnboarded =
      !prev.insurance_added_date && !!status.insurance_added_date;

    // ── Auto-stamp exception_approved_by/at when exceptions are first toggled ──
    const prevSnap = savedSnapshot.current?.status as Partial<OnboardingStatus> | undefined;
    const wasExceptionActive = prevSnap?.paper_logbook_approved || prevSnap?.temp_decal_approved;
    const isExceptionNowActive = status.paper_logbook_approved || status.temp_decal_approved;
    if (!wasExceptionActive && isExceptionNowActive && !status.exception_approved_by) {
      const actorId = session?.user?.id ?? null;
      setStatus(prev => ({
        ...prev,
        exception_approved_by: actorId,
        exception_approved_at: new Date().toISOString(),
      }));
      // Also update the status object used for the DB write below
      status.exception_approved_by = actorId;
      status.exception_approved_at = new Date().toISOString();
    }

    // ── Detect go-live transitions ────────────────────────────────────────
    const prevGoLive = prevSnap?.go_live_date ?? null;
    const newGoLive = status.go_live_date ?? null;
    const isNewlyGoLive = !prevGoLive && !!newGoLive;
    const goLiveDateChanged = prevGoLive !== newGoLive && !!newGoLive;

    // ── Capture insurance field changes before writing ────────────────────
    const INSURANCE_FIELD_LABELS: Record<string, string> = {
      insurance_policy_type:    'Coverage Type',
      insurance_stated_value:   'Stated Value',
      insurance_added_date:     'Added to Policy Date',
      insurance_ai_company:     'AI — Company',
      insurance_ai_address:     'AI — Address',
      insurance_ai_city:        'AI — City',
      insurance_ai_state:       'AI — State',
      insurance_ai_zip:         'AI — ZIP',
      insurance_ai_email:       'AI — Email',
      insurance_ch_company:     'CH — Company',
      insurance_ch_address:     'CH — Address',
      insurance_ch_city:        'CH — City',
      insurance_ch_state:       'CH — State',
      insurance_ch_zip:         'CH — ZIP',
      insurance_ch_email:       'CH — Email',
      insurance_ch_same_as_ai:  'CH Same as AI',
      insurance_notes:          'Insurance Notes',
    };
    const prevStatus = savedSnapshot.current.status as Partial<OnboardingStatus>;
    const insuranceChanges: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(INSURANCE_FIELD_LABELS)) {
      const k = key as keyof OnboardingStatus;
      if (prevStatus[k] !== status[k]) {
        insuranceChanges[INSURANCE_FIELD_LABELS[key]] = {
          from: prevStatus[k] ?? null,
          to:   status[k]    ?? null,
        };
      }
    }
    const hasInsuranceChanges = Object.keys(insuranceChanges).length > 0;

    // Check if all docs are now received (all four fields = 'received')
    const allDocsReceived =
      status.form_2290 === 'received' &&
      status.truck_title === 'received' &&
      status.truck_photos === 'received' &&
      status.truck_inspection === 'received';
    const wasAllDocsReceived =
      prev.form_2290 === 'received' &&
      prev.truck_title === 'received' &&
      prev.truck_photos === 'received' &&
      prev.truck_inspection === 'received';

    // Check if any doc transitioned to 'requested' (first time)
    const anyDocJustRequested =
      (prev.form_2290 !== 'requested' && status.form_2290 === 'requested') ||
      (prev.truck_title !== 'requested' && status.truck_title === 'requested') ||
      (prev.truck_photos !== 'requested' && status.truck_photos === 'requested') ||
      (prev.truck_inspection !== 'requested' && status.truck_inspection === 'requested');

    // Equipment ready: all three equipment items just became complete together
    const equipmentReady = isEquipmentFullyComplete(status as any);
    const wasEquipmentReady = isEquipmentFullyComplete(prev as any);

    const milestones: { key: string; label: string; triggered: boolean }[] = [
      {
        key: 'ica_sent',
        label: 'ICA Agreement Sent for Signature',
        triggered: prev.ica_status !== 'sent_for_signature' && status.ica_status === 'sent_for_signature',
      },
      {
        key: 'ica_complete',
        label: 'ICA Agreement Signed & Complete',
        triggered: prev.ica_status !== 'complete' && status.ica_status === 'complete',
      },
      {
        key: 'mvr_approved',
        label: 'MVR / Clearinghouse Background Check Approved',
        triggered: prev.mvr_ch_approval !== 'approved' && status.mvr_ch_approval === 'approved',
      },
      {
        key: 'pe_clear',
        label: 'Pre-Employment Screening — Clear',
        triggered: prev.pe_screening_result !== 'clear' && status.pe_screening_result === 'clear',
      },
      {
        key: 'docs_requested',
        label: 'Documents Requested — Please Upload Your Documents',
        triggered: anyDocJustRequested,
      },
      {
        key: 'docs_approved',
        label: 'All Documents Received & Approved',
        triggered: !wasAllDocsReceived && allDocsReceived,
      },
      {
        key: 'equipment_ready',
        label: 'Equipment Setup Complete (Decal, ELD, Fuel Card)',
        triggered: !wasEquipmentReady && equipmentReady,
      },
      {
        key: 'mo_reg_received',
        label: 'Missouri Registration Received',
        triggered: prev.mo_reg_received !== 'yes' && status.mo_reg_received === 'yes',
      },
      {
        key: 'fully_onboarded',
        label: 'Fully Onboarded — Welcome to SUPERTRANSPORT!',
        triggered: isNewlyFullyOnboarded,
      },
    ];
    const triggeredMilestones = milestones.filter(m => m.triggered);

    const { error } = await supabase
      .from('operators')
      .update({ notes: sanitizeText(notes) })
      .eq('id', operatorId);

    let statusError: { message: string } | null = null;
    if (statusId) {
      // fully_onboarded is a DB-generated column (insurance_added_date IS NOT NULL) — never write it
      // Truck fields are saved independently via handleTruckInfoEdit — exclude them here.
      // Device serial fields ARE included in the main save (and additionally synced to Equipment Inventory below)
      // so that staff who type them directly into the Stage 5 form and click the main Save button get them persisted.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {
        id: _id, fully_onboarded: _fo, operator_id: _oid, updated_at: _ua, updated_by: _ub,
        // Truck fields — saved separately via handleTruckInfoEdit
        truck_year: _ty, truck_make: _tm, truck_vin: _tv,
        truck_plate: _tp, truck_plate_state: _tps, trailer_number: _tn,
        ...updateData
      } = status as any;
      const { error: stErr } = await supabase
        .from('onboarding_status')
        .update(updateData)
        .eq('id', statusId);
      statusError = stErr;

      // Reflect generated value in local state immediately so header badge updates
      if (!stErr && isNewlyFullyOnboarded) {
        setStatus(prev => ({ ...prev, fully_onboarded: true }));
      }

      // Two-way sync: if any device serial changed via the main save, mirror to Equipment Inventory
      if (!stErr && operatorId) {
        const oldDevices = {
          eld_serial_number: prev.eld_serial_number,
          dash_cam_number: prev.dash_cam_number,
          bestpass_number: prev.bestpass_number,
          fuel_card_number: prev.fuel_card_number,
        };
        const newDevices = {
          eld_serial_number: status.eld_serial_number,
          dash_cam_number: status.dash_cam_number,
          bestpass_number: status.bestpass_number,
          fuel_card_number: status.fuel_card_number,
        };
        const changed = Object.keys(oldDevices).some(
          k => (oldDevices as any)[k] !== (newDevices as any)[k],
        );
        if (changed) {
          try {
            await syncAllDeviceFields(operatorId, oldDevices, newDevices, session?.user?.id ?? null);
          } catch (syncErr) {
            console.error('[OperatorDetailPanel] Equipment Inventory sync failed:', syncErr);
          }
        }
      }
    }

    if (error || statusError) {
      const msg = error?.message || statusError?.message || 'Unknown error';
      toast({ title: 'Error saving', description: msg, variant: 'destructive' });
      setSaving(false);
      return;
    } else {
      toast({ title: 'Saved successfully', description: 'Operator record has been updated.' });

      // ── Fire milestone notifications ──────────────────────────────────
      if (triggeredMilestones.length > 0) {
        for (const m of triggeredMilestones) {
          try {
            await supabase.functions.invoke('send-notification', {
              body: {
                type: 'onboarding_milestone',
                operator_id: operatorId,
                operator_name: operatorName,
                operator_email: operatorEmail || undefined,
                milestone: m.label,
                milestone_key: m.key,
              },
              headers: session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : undefined,
            });
            toast({
              title: m.key === 'fully_onboarded' ? '🎉 Operator fully onboarded!' : `📩 Operator notified`,
              description: `${operatorName}: ${m.label}`,
            });
          } catch (notifErr) {
            // silent — notification failure should not block the save
          }
        }
      }

      // ── Update snapshot (always, so re-saves don't re-fire) ──────────
      savedMilestones.current = {
        ica_status: status.ica_status ?? prev.ica_status,
        mvr_ch_approval: status.mvr_ch_approval ?? prev.mvr_ch_approval,
        pe_screening_result: status.pe_screening_result ?? prev.pe_screening_result,
        insurance_added_date: status.insurance_added_date ?? prev.insurance_added_date,
        form_2290: status.form_2290 ?? prev.form_2290,
        truck_title: status.truck_title ?? prev.truck_title,
        truck_photos: status.truck_photos ?? prev.truck_photos,
        truck_inspection: status.truck_inspection ?? prev.truck_inspection,
        decal_applied: status.decal_applied ?? prev.decal_applied,
        eld_installed: status.eld_installed ?? prev.eld_installed,
        fuel_card_issued: status.fuel_card_issued ?? prev.fuel_card_issued,
        mo_reg_received: status.mo_reg_received ?? prev.mo_reg_received,
        eld_serial_number: status.eld_serial_number ?? prev.eld_serial_number,
        dash_cam_number: status.dash_cam_number ?? prev.dash_cam_number,
        bestpass_number: status.bestpass_number ?? prev.bestpass_number,
        fuel_card_number: status.fuel_card_number ?? prev.fuel_card_number,
      };

      // ── Per-doc received notifications → operator ─────────────────────
      if (operatorUserId) {
        const docFields: Array<keyof OnboardingStatus> = ['form_2290', 'truck_title', 'truck_photos', 'truck_inspection'];
        const justReceived = docFields.filter(
          f => prev[f as keyof typeof prev] !== 'received' && status[f] === 'received'
        );
        for (const f of justReceived) {
          const docLabel = DOC_LABELS[f as string] ?? f;
          await supabase.from('notifications').insert({
            user_id: operatorUserId,
            type: 'doc_received',
            title: `Your ${docLabel} has been received`,
            body: `Your ${docLabel} has been reviewed and received by your onboarding coordinator.`,
            channel: 'in_app',
            link: '/operator?tab=documents',
          });
          toast({
            title: `✅ ${docLabel} received`,
            description: `${operatorName} has been notified.`,
          });
        }
      }

      // ── Write audit log for operator status changes ───────────────────
      if (triggeredMilestones.length > 0) {
        supabase.from('audit_log' as any).insert({
          actor_id: session?.user?.id ?? null,
          actor_name: operatorName,
          action: 'operator_status_updated',
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: {
            milestones: triggeredMilestones.map(m => m.label),
          },
        }).then(({ error }) => { if (error) {} });
      }
      // ── Write a dedicated onboarding_completed entry ─────────────
      if (isNewlyFullyOnboarded) {
        supabase.from('audit_log' as any).insert({
          actor_id: session?.user?.id ?? null,
          actor_name: operatorName,
          action: 'onboarding_completed',
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: {
            completed_at: new Date().toISOString(),
            insurance_added_date: status.insurance_added_date,
            unit_number: status.unit_number ?? null,
          },
        }).then(({ error }) => { if (error) {} });
      }

      // ── Write audit log for insurance field changes ───────────────────
      if (hasInsuranceChanges) {
        void supabase.from('audit_log' as any).insert({
          actor_id: session?.user?.id ?? null,
          actor_name: operatorName,
          action: 'insurance_fields_updated',
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: { changes: insuranceChanges },
        }).then(({ error }) => { if (error) {} });
      }

      // ── Write audit log when exceptions are first approved ────────────
      if (!wasExceptionActive && isExceptionNowActive) {
        void supabase.from('audit_log' as any).insert({
          actor_id: session?.user?.id ?? null,
          actor_name: operatorName,
          action: 'exception_approved',
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: {
            paper_logbook: status.paper_logbook_approved ?? false,
            temp_decal: status.temp_decal_approved ?? false,
            exception_notes: status.exception_notes ?? null,
            approved_at: new Date().toISOString(),
          },
        }).then(({ error }) => { if (error) {} });
      }

      // ── Write audit log when go-live date is set or changed ───────────
      if (goLiveDateChanged) {
        void supabase.from('audit_log' as any).insert({
          actor_id: session?.user?.id ?? null,
          actor_name: operatorName,
          action: 'go_live_updated',
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: {
            go_live_date: newGoLive,
            operator_type: status.operator_type ?? null,
            dispatch_ready_orientation: status.dispatch_ready_orientation ?? false,
            dispatch_ready_consortium: status.dispatch_ready_consortium ?? false,
            dispatch_ready_first_assigned: status.dispatch_ready_first_assigned ?? false,
            is_first_go_live: isNewlyGoLive,
            previous_go_live_date: prevGoLive,
          },
        }).then(({ error }) => { if (error) {} });
      }
    }

    // Re-read the saved row so the snapshot matches DB-managed fields (updated_at, fully_onboarded, etc.)
    if (statusId) {
      const { data: freshRow } = await supabase
        .from('onboarding_status')
        .select('*')
        .eq('id', statusId)
        .single();
      if (freshRow) {
        setStatus(freshRow as any);
        savedSnapshot.current = { status: freshRow as any, notes };
      } else {
        savedSnapshot.current = { status, notes };
      }
    } else {
      savedSnapshot.current = { status, notes };
    }
    setSaving(false);
  };

  const handleVoidICA = async () => {
    setVoidingICA(true);
    try {
      // Delete the ica_contracts record for this operator
      const { error: delError } = await supabase
        .from('ica_contracts' as any)
        .delete()
        .eq('operator_id', operatorId);
      if (delError) throw delError;

      // Reset ica_status on onboarding_status
      if (statusId) {
        const { error: updError } = await supabase
          .from('onboarding_status')
          .update({ ica_status: 'not_issued' })
          .eq('id', statusId);
        if (updError) throw updError;
      }

      // Log the void action
      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        actor_name: null,
        action: 'ica_voided',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: { previous_ica_status: status.ica_status },
      });

      setStatus(prev => ({ ...prev, ica_status: 'not_issued' }));
      savedMilestones.current.ica_status = 'not_issued';
      setShowVoidConfirm(false);
      toast({ title: 'ICA voided', description: 'The contract has been cleared. You can now prepare a new ICA.' });
    } catch (err: any) {
      toast({ title: 'Error voiding ICA', description: err.message, variant: 'destructive' });
    } finally {
      setVoidingICA(false);
    }
  };

  const handleToggleActive = async () => {
    setDeactivating(true);
    const newActive = !isActive;
    try {
      const { error } = await supabase
        .from('operators')
        .update({ is_active: newActive } as any)
        .eq('id', operatorId);
      if (error) throw error;

      // Log the action
      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        actor_name: null,
        action: newActive ? 'operator_reactivated' : 'operator_deactivated',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: newActive
          ? { is_active: true }
          : { is_active: false, reason: deactivateReason || null },
      });

      setIsActive(newActive);
      setDeactivateReason('');
      setShowDeactivateConfirm(false);
      toast({
        title: newActive ? 'Driver reactivated' : 'Driver deactivated',
        description: newActive
          ? `${operatorName} has been reactivated and will appear in the active roster.`
          : `${operatorName} has been deactivated and removed from the active roster.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeactivating(false);
    }
  };

  const handleToggleDispatchExclusion = async (nextExcluded: boolean) => {
    setSavingExclusion(true);
    const trimmedReason = nextExcluded ? excludedReason.trim() : '';
    try {
      const { error } = await supabase
        .from('operators')
        .update({
          excluded_from_dispatch: nextExcluded,
          excluded_from_dispatch_reason: nextExcluded && trimmedReason ? trimmedReason : null,
          excluded_from_dispatch_at: nextExcluded ? new Date().toISOString() : null,
          excluded_from_dispatch_by: nextExcluded ? (session?.user?.id ?? null) : null,
        } as any)
        .eq('id', operatorId);
      if (error) throw error;

      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        actor_name: null,
        action: 'operator.dispatch_exclusion_changed',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: { from: !nextExcluded, to: nextExcluded, reason: trimmedReason || null },
      });

      setExcludedFromDispatch(nextExcluded);
      if (!nextExcluded) setExcludedReason('');
      toast({
        title: nextExcluded ? 'Excluded from Dispatch Hub' : 'Included in Dispatch Hub',
        description: nextExcluded
          ? `${operatorName} is hidden from the Dispatch Board and removed from daily counts.`
          : `${operatorName} now appears in the Dispatch Board and is counted in daily tiles.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingExclusion(false);
    }
  };

  const handleSaveOnHold = async () => {
    if (!onHoldModalReason.trim()) {
      toast({ title: 'Reason required', description: 'Please enter a reason for placing this operator on hold.', variant: 'destructive' });
      return;
    }
    setSavingOnHold(true);
    try {
      const { error } = await supabase
        .from('operators')
        .update({ on_hold: true, on_hold_reason: onHoldModalReason.trim(), on_hold_date: onHoldModalDate } as any)
        .eq('id', operatorId);
      if (error) throw error;
      setIsOnHold(true);
      setOnHoldReason(onHoldModalReason.trim());
      setOnHoldDate(onHoldModalDate);
      setShowOnHoldModal(false);
      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        actor_name: null,
        action: 'operator_placed_on_hold',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: { reason: onHoldModalReason.trim(), on_hold_date: onHoldModalDate },
      });
      toast({ title: 'Operator placed on hold', description: `${operatorName} is now marked as On Hold.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingOnHold(false);
    }
  };

  const handleRemoveOnHold = async () => {
    setSavingOnHold(true);
    try {
      const { error } = await supabase
        .from('operators')
        .update({ on_hold: false, on_hold_reason: null, on_hold_date: null } as any)
        .eq('id', operatorId);
      if (error) throw error;
      setIsOnHold(false);
      setOnHoldReason('');
      setOnHoldDate(null);
      void supabase.from('audit_log' as any).insert({
        actor_id: session?.user?.id ?? null,
        actor_name: null,
        action: 'operator_removed_from_hold',
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        metadata: {},
      });
      toast({ title: 'On Hold status removed', description: `${operatorName} has been returned to the active pipeline.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingOnHold(false);
    }
  };

  const updateStatus = (field: keyof OnboardingStatus, value: string | null) => {
    setStatus(prev => ({ ...prev, [field]: value }));
  };

  // Handle editing device numbers from TruckInfoCard
  const handleTruckDeviceEdit = async (payload: TruckInfoCardEditPayload) => {
    if (!statusId) return;
    const { error } = await supabase
      .from('onboarding_status')
      .update({
        unit_number: payload.unit_number,
        eld_serial_number: payload.eld_serial_number,
        dash_cam_number: payload.dash_cam_number,
        bestpass_number: payload.bestpass_number,
        fuel_card_number: payload.fuel_card_number,
      })
      .eq('id', statusId);
    if (error) throw error;

    // Two-way sync: update Equipment Inventory
    if (operatorId) {
      const oldValues = {
        eld_serial_number: status.eld_serial_number,
        dash_cam_number: status.dash_cam_number,
        bestpass_number: status.bestpass_number,
        fuel_card_number: status.fuel_card_number,
      };
      const newValues = {
        eld_serial_number: payload.eld_serial_number,
        dash_cam_number: payload.dash_cam_number,
        bestpass_number: payload.bestpass_number,
        fuel_card_number: payload.fuel_card_number,
      };
      await syncAllDeviceFields(operatorId, oldValues, newValues, session?.user?.id ?? null);
    }

    setStatus(prev => ({
      ...prev,
      unit_number: payload.unit_number,
      eld_serial_number: payload.eld_serial_number,
      dash_cam_number: payload.dash_cam_number,
      bestpass_number: payload.bestpass_number,
      fuel_card_number: payload.fuel_card_number,
    }));
    // Keep milestone snapshot in sync so the main Save button doesn't re-fire
    // the "Equipment Setup Complete" milestone after a popover-only device edit.
    savedMilestones.current = {
      ...savedMilestones.current,
      eld_serial_number: payload.eld_serial_number,
      dash_cam_number: payload.dash_cam_number,
      bestpass_number: payload.bestpass_number,
      fuel_card_number: payload.fuel_card_number,
    };
    if (savedSnapshot.current) {
      savedSnapshot.current = {
        ...savedSnapshot.current,
        status: { ...savedSnapshot.current.status, ...payload },
      };
    }
    toast({ title: 'Device numbers saved' });
  };

  // Handle editing truck info fields from TruckInfoCard
  const handleTruckInfoEdit = async (payload: TruckFieldsEditPayload) => {
    if (!statusId) return;
    const truckFields = {
      truck_year: payload.truck_year,
      truck_make: payload.truck_make,
      truck_vin: payload.truck_vin,
      truck_plate: payload.truck_plate,
      truck_plate_state: payload.truck_plate_state,
      trailer_number: payload.trailer_number,
    };

    const result = await saveTruckSpecs(
      operatorId!,
      statusId,
      truckFields,
      session?.user?.id ?? null,
      { entityLabel: operatorName },
    );
    if (!result.ok) throw new Error(result.error || 'Failed to save truck info');

    // Update local truck info state + main status state
    setStatus(prev => ({ ...prev, ...truckFields }));
    setIcaTruckInfo(prev => ({
      ...prev,
      ...payload,
    }));
    if (savedSnapshot.current) {
      savedSnapshot.current = {
        ...savedSnapshot.current,
        status: { ...savedSnapshot.current.status, ...truckFields },
      };
    }
    toast({ title: 'Truck info saved' });
  };

  // Track which doc fields are currently being "requested" (for button loading state)
  const [requestingDoc, setRequestingDoc] = useState<string | null>(null);
  const [markingReceived, setMarkingReceived] = useState<string | null>(null);

  const handleRequestDoc = async (field: keyof OnboardingStatus, label: string) => {
    if (!statusId) return;
    setRequestingDoc(field as string);
    try {
      const { error } = await supabase
        .from('onboarding_status')
        .update({ [field]: 'requested' })
        .eq('id', statusId);
      if (error) throw error;

      // Update local state & milestone snapshot
      setStatus(prev => ({ ...prev, [field]: 'requested' }));
      savedMilestones.current = { ...savedMilestones.current, [field]: 'requested' };

      // Notify the operator via the existing edge function
      await supabase.functions.invoke('send-notification', {
        body: {
          type: 'onboarding_milestone',
          operator_id: operatorId,
          operator_name: operatorName,
          operator_email: operatorEmail || undefined,
          milestone: `Documents Requested — Please Upload Your Documents`,
          milestone_key: 'docs_requested',
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      toast({
        title: `${label} requested`,
        description: `${operatorName} has been notified to upload this document.`,
      });
    } catch (err: any) {
      toast({ title: 'Error requesting document', description: err.message, variant: 'destructive' });
    } finally {
      setRequestingDoc(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  const SelectField = ({ label, field, options }: { label: string; field: keyof OnboardingStatus; options: { value: string; label: string }[] }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Select value={(status[field] as string) || undefined} onValueChange={v => updateStatus(field, v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const StageDatePicker = ({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) => {
    const [open, setOpen] = useState(false);
    const parsed = value ? new Date(value + 'T12:00:00') : undefined;
    return (
      <div className="space-y-1.5 pl-2 border-l-2 border-muted">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
        <div className="flex gap-2 items-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('h-8 text-xs justify-start font-normal flex-1', !value && 'text-muted-foreground')}>
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                {parsed ? format(parsed, 'MMM d, yyyy') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={parsed}
                onSelect={d => { onChange(d ? format(d, 'yyyy-MM-dd') : null); setOpen(false); }}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          {value && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => onChange(null)}>
              ×
            </Button>
          )}
        </div>
      </div>
    );
  };

  const mvrOptions = [{ value: 'not_started', label: 'Not Started' }, { value: 'requested', label: 'Requested' }, { value: 'received', label: 'Received' }];
  const approvalOptions = [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'denied', label: 'Denied' }];
  const screeningOptions = [{ value: 'not_started', label: 'Not Started' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'results_in', label: 'Results In' }];
  const resultOptions = [{ value: 'pending', label: 'Pending' }, { value: 'clear', label: 'Clear' }, { value: 'non_clear', label: 'Non-Clear' }];
  const docOptions = [{ value: 'not_started', label: 'Not Started' }, { value: 'requested', label: 'Requested' }, { value: 'received', label: 'Received' }];
  const regOptions = [{ value: 'own_registration', label: 'O/O Has Own Registration' }, { value: 'needs_mo_reg', label: 'Needs MO Reg' }];
  const icaOptions = [{ value: 'not_issued', label: 'Not Issued' }, { value: 'in_progress', label: 'In Progress (Draft)' }, { value: 'sent_for_signature', label: 'Sent for Signature' }, { value: 'complete', label: 'Complete' }];
  const moDocsOptions = [{ value: 'not_submitted', label: 'Not Submitted' }, { value: 'submitted', label: 'Submitted' }];
  const moRegOptions = [{ value: 'not_yet', label: 'Not Yet' }, { value: 'yes', label: 'Yes' }];
  const methodOptions = [
    { value: 'owner_operator_install', label: 'Owner-Operator Install' },
    { value: 'supertransport_shop',    label: 'SUPERTRANSPORT Shop' },
  ];
  const yesNoOptions = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];

  const isAlert = status.mvr_ch_approval === 'denied' || status.pe_screening_result === 'non_clear';
  const isQuickView = !!status.fully_onboarded;

  const hasUnsavedChanges = savedSnapshot.current !== null && (
    JSON.stringify(savedSnapshot.current.status) !== JSON.stringify(status) ||
    savedSnapshot.current.notes !== notes
  );

  const guardedNavigate = (action: () => void) => {
    if (hasUnsavedChanges) {
      setNavGuard({ action });
    } else {
      action();
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-4xl w-full">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => guardedNavigate(onBack)} className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{backLabel ?? 'Pipeline'}</span>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2 flex-wrap">
              <span className="truncate">{operatorName}</span>
              {isAlert && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
              {status.fully_onboarded && <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{operatorEmail}</p>
          </div>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="flex items-center gap-2 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => isOnHold ? handleRemoveOnHold() : (() => { setOnHoldModalReason(''); setOnHoldModalDate(new Date().toISOString().split('T')[0]); setShowOnHoldModal(true); })()}
                  disabled={savingOnHold}
                  className={isOnHold
                    ? 'gap-2 text-blue-600 border-blue-400 bg-blue-50 hover:bg-blue-100 hover:text-blue-700'
                    : 'gap-2 text-muted-foreground border-border hover:text-blue-600 hover:border-blue-400'
                  }
                >
                  {savingOnHold
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                    : <PauseCircle className="h-3.5 w-3.5" />
                  }
                  <span className="hidden sm:inline">{isOnHold ? 'Remove Hold' : 'Place On Hold'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isOnHold ? 'Remove On Hold status and return to active pipeline' : 'Place operator on hold with a reason'}
              </TooltipContent>
            </Tooltip>
            {isManagement && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeactivateConfirm(true)}
                    disabled={deactivating}
                    className={isActive
                      ? 'gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive'
                      : 'gap-2 text-status-complete border-status-complete/40 hover:bg-status-complete/10 hover:text-status-complete'
                    }
                  >
                    {isActive
                      ? <UserX className="h-3.5 w-3.5" />
                      : <UserCheck className="h-3.5 w-3.5" />
                    }
                    <span className="hidden sm:inline">{isActive ? 'Deactivate' : 'Reactivate'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {isActive ? 'Remove from active roster' : 'Restore to active roster'}
                </TooltipContent>
              </Tooltip>
            )}
            {operatorEmail && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendInvite}
                    disabled={resendingInvite}
                    className="gap-2 text-muted-foreground hover:text-foreground"
                  >
                    {resendingInvite
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                      : inviteResent
                      ? <Check className="h-3.5 w-3.5 text-status-complete" />
                      : <Send className="h-3.5 w-3.5" />
                    }
                    <span className="hidden sm:inline">{inviteResent ? 'Invite Sent' : 'Resend Invite'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {inviteResent ? '✓ Invitation sent to ' + operatorEmail : 'Resend invitation email to ' + operatorEmail}
                </TooltipContent>
              </Tooltip>
            )}
            {isPreExistingOperator && operatorEmail && isManagement && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendSuperdriveInvite}
                    disabled={sendingSuperdriveInvite}
                    className="gap-2 border-gold/40 text-gold-muted hover:bg-gold/10 hover:text-gold"
                  >
                    {sendingSuperdriveInvite
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : superdriveInviteSent
                      ? <Check className="h-3.5 w-3.5 text-status-complete" />
                      : <Rocket className="h-3.5 w-3.5" />
                    }
                    <span className="hidden sm:inline">{superdriveInviteSent ? 'SUPERDRIVE Invite Sent' : 'Send SUPERDRIVE Invite'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {superdriveInviteSent
                    ? `✓ Welcome to SUPERDRIVE email sent to ${operatorEmail}`
                    : `Send branded "Welcome to SUPERDRIVE" launch email with password setup link`}
                </TooltipContent>
              </Tooltip>
            )}
            {/* Collapse/Expand All Stages */}
            {(() => {
              const allKeys = ['stage1','stage2','stage3','stage4','stage5','stage6','stage7'];
              const allCollapsed = allKeys.every(k => collapsedStages.has(k));
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCollapsedStages(allCollapsed ? new Set() : new Set(allKeys))}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {allCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {allCollapsed ? 'Expand all stages' : 'Collapse all stages'}
                  </TooltipContent>
                </Tooltip>
              );
            })()}
            {/* Copy Email */}
            {operatorEmail && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(operatorEmail);
                      setCopiedEmail(true);
                      setTimeout(() => setCopiedEmail(false), 2000);
                    }}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {copiedEmail ? <Check className="h-3.5 w-3.5 text-status-complete" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {copiedEmail ? '✓ Copied!' : `Copy email — ${operatorEmail}`}
                </TooltipContent>
              </Tooltip>
            )}
            {/* Message Driver */}
            {onMessageOperator && operatorUserId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => guardedNavigate(() => onMessageOperator(operatorUserId))}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Message driver
                </TooltipContent>
              </Tooltip>
            )}
            {/* Send Install Instructions + App Installed Badge */}
            {operatorUserId && (
              <>
                <Badge variant="outline" className={cn("gap-1 text-[11px] py-0.5", pwaInstalledAt ? "text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400" : "text-muted-foreground border-muted bg-muted/30")}>
                  {pwaInstalledAt ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      App Installed {format(parseISO(pwaInstalledAt), 'M/d/yy')}
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-3 w-3" />
                      App Not Installed
                    </>
                  )}
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendInstallInstructions}
                      disabled={sendingInstallInstructions}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {sendingInstallInstructions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {pwaInstalledAt ? 'Resend SUPERDRIVE install instructions' : 'Send SUPERDRIVE install instructions'}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleSave} disabled={saving} className="bg-gold text-surface-dark font-semibold hover:bg-gold-light gap-2 shrink-0">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs flex items-center gap-1.5">
                <span className="text-muted-foreground">Keyboard shortcut:</span>
                <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-foreground font-mono text-[10px] leading-none">
                  {navigator.platform.startsWith('Mac') ? '⌘S' : 'Ctrl+S'}
                </kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* On Hold Banner */}
      {isOnHold && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-blue-300 bg-blue-50">
          <PauseCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-800">On Hold</p>
            {onHoldReason && <p className="text-xs text-blue-700 mt-0.5">{onHoldReason}</p>}
            {onHoldDate && <p className="text-xs text-blue-600 mt-0.5">Since {new Date(onHoldDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
          </div>
        </div>
      )}

      {/* Status overview */}
      <div className="flex flex-wrap gap-2">
        {!isActive && <Badge className="bg-muted text-muted-foreground border text-xs">⊘ Inactive</Badge>}
        {isOnHold && <Badge className="bg-blue-100 text-blue-700 border border-blue-300 text-xs">⏸ On Hold</Badge>}
        {excludedFromDispatch && <Badge className="bg-gold/10 text-gold border border-gold/30 text-xs">🚫 Excluded from Dispatch</Badge>}
        {isAlert && <Badge className="status-action border text-xs">⚠ Alert — Review Required</Badge>}
        {status.fully_onboarded && <Badge className="status-complete border text-xs">✓ Fully Onboarded</Badge>}
        {status.ica_status === 'complete' && <Badge className="status-complete border text-xs">ICA Signed</Badge>}
        {status.pe_screening_result === 'clear' && <Badge className="status-complete border text-xs">PE Clear</Badge>}
      </div>

      {/* Exclude from Dispatch Hub toggle (staff & management only) */}
      {isActive && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🚫</span>
                <Label className="text-sm font-semibold text-foreground cursor-pointer" htmlFor="exclude-dispatch-toggle">
                  Exclude from Dispatch Hub
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                Hides this driver from the Dispatch Board and removes them from daily counts (Total Active, Dispatched, Home, Truck Down, Not Dispatched).
                Use for backup-only drivers, owners who don't run loads daily, or test accounts.
                Driver remains fully active everywhere else.
              </p>
            </div>
            <Switch
              id="exclude-dispatch-toggle"
              checked={excludedFromDispatch}
              disabled={savingExclusion}
              onCheckedChange={(checked) => handleToggleDispatchExclusion(checked)}
              className="data-[state=checked]:bg-gold shrink-0"
            />
          </div>
          {excludedFromDispatch && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Reason (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={excludedReason}
                  onChange={(e) => setExcludedReason(e.target.value)}
                  placeholder='e.g., "Backup driver for Truck 412 — runs only when primary driver is off"'
                  maxLength={200}
                  className="h-8 text-xs flex-1"
                  disabled={savingExclusion}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleDispatchExclusion(true)}
                  disabled={savingExclusion}
                  className="h-8 text-xs gap-1 px-2.5 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold shrink-0"
                >
                  {savingExclusion ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Top Completion Summary ── */}
      {(!isQuickView || onboardingHistoryExpanded) && <div style={isQuickView ? { order: 20 } : undefined}>{(() => {
        const _exceptionActive = status.paper_logbook_approved || status.temp_decal_approved;
        const _allEquipFull = status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes';
        const _moNa = status.registration_status === 'own_registration';
        const _stageStatuses: { key: string; label: string; complete: boolean; exception?: boolean }[] = [
          { key: 'stage1', label: 'BG',    complete: status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear' },
          { key: 'stage2', label: 'Docs',  complete: status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received' },
          { key: 'stage3', label: 'ICA',   complete: status.ica_status === 'complete' },
          { key: 'stage4', label: 'MO',    complete: _moNa || status.mo_reg_received === 'yes' },
          { key: 'stage5', label: 'Equip', complete: _allEquipFull, exception: _exceptionActive && !_allEquipFull },
          { key: 'stage6', label: 'Ins',   complete: !!status.insurance_added_date },
          { key: 'stage7', label: 'Live',  complete: !!(status.go_live_date) },
          { key: 'stage8', label: 'Pay',   complete: !!(paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted) },
        ];
        const _completedCount = _stageStatuses.filter(s => s.complete).length;
        const _pct = Math.round((_completedCount / _stageStatuses.length) * 100);
        const _allDone = _completedCount === _stageStatuses.length;
        return (
          <div className="bg-white border border-border rounded-xl px-5 py-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{_completedCount} of {_stageStatuses.length} stages complete</span>
                {_allDone && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Fully Onboarded</span>}
              </div>
              <span className={`text-sm font-bold tabular-nums ${_allDone ? 'text-status-complete' : 'text-gold'}`}>{_pct}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${_pct}%`, background: _allDone ? 'hsl(var(--status-complete))' : 'hsl(var(--gold-main))' }}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {_stageStatuses.map(s => (
                <button
                  key={s.key}
                  onClick={() => scrollToStage(s.key)}
                  title={`Jump to ${s.label}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                    s.complete
                      ? 'bg-status-complete/10 text-status-complete border-status-complete/30 hover:bg-status-complete/20'
                      : s.exception
                        ? 'bg-gold/10 text-gold border-gold/30 hover:bg-gold/20'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                  }`}
                >
                  {s.complete
                    ? <CheckCircle2 className="h-2.5 w-2.5" />
                    : s.exception
                      ? <span className="font-bold text-[10px] leading-none">E</span>
                      : <span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" />
                  }
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}</div>}

      {/* ── Compliance Alert Banner ─────────────────────────────────────── */}
      {(() => {
        type Issue = {
          label: string;
          severity: 'expired' | 'critical' | 'missing';
          focusField: 'cdl' | 'medcert';
          daysLabel?: string;
        };
        const issues: Issue[] = [];

        const checkDoc = (label: string, dateStr: string | null, focusField: 'cdl' | 'medcert') => {
          if (!dateStr) {
            issues.push({ label, severity: 'missing', focusField });
            return;
          }
          const days = differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
          if (days < 0) {
            issues.push({ label, severity: 'expired', focusField, daysLabel: `${Math.abs(days)}d ago` });
          } else if (days <= 30) {
            issues.push({ label, severity: 'critical', focusField, daysLabel: `${days}d left` });
          }
        };

        checkDoc('CDL', cdlExpiration, 'cdl');
        checkDoc('Med Cert', medCertExpiration, 'medcert');

        if (issues.length === 0) return null;

        const hasExpired  = issues.some(i => i.severity === 'expired');
        const hasCritical = issues.some(i => i.severity === 'critical');
        const hasMissing  = issues.some(i => i.severity === 'missing');

        const bannerBg   = hasExpired || hasCritical
          ? 'bg-destructive/5 border-destructive/25'
          : 'bg-yellow-50 border-yellow-200';
        const iconColor  = hasExpired || hasCritical ? 'text-destructive' : 'text-yellow-600';
        const titleColor = hasExpired || hasCritical ? 'text-destructive' : 'text-yellow-800';
        const tagBg: Record<Issue['severity'], string> = {
          expired:  'bg-destructive/10 text-destructive border-destructive/30',
          critical: 'bg-destructive/10 text-destructive border-destructive/25',
          missing:  'bg-muted text-muted-foreground border-border',
        };
        const tagLabel: Record<Issue['severity'], string> = {
          expired:  'Expired',
          critical: 'Critical',
          missing:  'No date on file',
        };

        const title = hasMissing && !hasExpired && !hasCritical
          ? 'Missing compliance dates'
          : hasExpired
          ? 'Expired compliance document'
          : 'Critical compliance expiry';

        return (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${bannerBg}`}>
            <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${titleColor}`}>{title}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {issues.map(issue => (
                  <button
                    key={issue.focusField}
                    onClick={onOpenAppReview ? () => onOpenAppReview(issue.focusField) : undefined}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all ${tagBg[issue.severity]} ${onOpenAppReview ? 'hover:opacity-75 cursor-pointer' : 'cursor-default'}`}
                  >
                    <span>{issue.label}</span>
                    <span className="opacity-60">·</span>
                    <span>{issue.daysLabel ?? tagLabel[issue.severity]}</span>
                    {onOpenAppReview && <span className="opacity-50 text-[10px]">✎</span>}
                  </button>
                ))}
              </div>
            </div>
            {onOpenAppReview && (
              <button
                onClick={() => onOpenAppReview(issues[0].focusField)}
                className={`text-[10px] font-semibold shrink-0 mt-0.5 ${titleColor} opacity-60 hover:opacity-100 transition-opacity`}
              >
                Update →
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Contact Info Card ── */}
      {applicationData && (() => {
        const formatPhoneInput = (val: string) => {
          const digits = val.replace(/\D/g, '').slice(0, 10);
          if (digits.length === 0) return '';
          if (digits.length <= 3) return `(${digits}`;
          if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        };

        const handleContactEdit = () => {
          setContactDraft({
            first_name: applicationData.first_name ?? '',
            last_name: applicationData.last_name ?? '',
            phone: applicationData.phone ?? '',
            email: applicationData.email ?? '',
            address_street: applicationData.address_street ?? '',
            address_city: applicationData.address_city ?? '',
            address_state: applicationData.address_state ?? '',
            address_zip: applicationData.address_zip ?? '',
            dob: applicationData.dob ?? null,
            go_live_date: status.go_live_date ?? null,
          });
          setContactEditing(true);
        };

        const handleContactSave = async () => {
          setContactSaving(true);
          try {
            if (applicationData?.id) {
              // Has a real application row — update applications table
              const { error } = await supabase
                .from('applications')
                .update({
                  first_name: contactDraft.first_name || null,
                  last_name: contactDraft.last_name || null,
                  phone: contactDraft.phone || null,
                  email: contactDraft.email,
                  address_street: contactDraft.address_street || null,
                  address_city: contactDraft.address_city || null,
                  address_state: contactDraft.address_state || null,
                  address_zip: contactDraft.address_zip || null,
                  dob: contactDraft.dob || null,
                })
                .eq('id', applicationData.id);
              if (error) throw error;

              // Sync name to profiles table
              if (operatorUserId) {
                await supabase
                  .from('profiles')
                  .update({
                    first_name: contactDraft.first_name || null,
                    last_name: contactDraft.last_name || null,
                  })
                  .eq('user_id', operatorUserId);
              }

              // Audit log if name changed
              const oldFirst = applicationData.first_name ?? '';
              const oldLast = applicationData.last_name ?? '';
              if (oldFirst !== contactDraft.first_name || oldLast !== contactDraft.last_name) {
                await supabase.from('audit_log').insert({
                  action: 'name_updated',
                  entity_type: 'operator',
                  entity_id: operatorId || undefined,
                  entity_label: `${contactDraft.first_name} ${contactDraft.last_name}`.trim() || null,
                  actor_id: (await supabase.auth.getUser()).data.user?.id || undefined,
                  actor_name: null,
                  metadata: { old_first: oldFirst, old_last: oldLast, new_first: contactDraft.first_name, new_last: contactDraft.last_name },
                });
              }
            } else if (operatorUserId) {
              // No application — create an application record so all contact fields persist
              const { data: newApp, error: insertErr } = await supabase
                .from('applications')
                .insert({
                  email: contactDraft.email || '',
                  phone: contactDraft.phone || null,
                  address_street: contactDraft.address_street || null,
                  address_city: contactDraft.address_city || null,
                  address_state: contactDraft.address_state || null,
                  address_zip: contactDraft.address_zip || null,
                  dob: contactDraft.dob || null,
                  user_id: operatorUserId,
                  review_status: 'approved' as any,
                  is_draft: false,
                  first_name: contactDraft.first_name || null,
                  last_name: contactDraft.last_name || null,
                })
                .select('id')
                .single();
              if (insertErr) throw insertErr;

              // Link the new application to the operator
              if (newApp?.id && operatorId) {
                const { error: linkErr } = await supabase
                  .from('operators')
                  .update({ application_id: newApp.id })
                  .eq('id', operatorId);
                if (linkErr) throw linkErr;
              }

              // Also update profiles for pipeline fallback
              await supabase
                .from('profiles')
                .update({
                  first_name: contactDraft.first_name || null,
                  last_name: contactDraft.last_name || null,
                  phone: contactDraft.phone || null,
                  home_state: contactDraft.address_state || null,
                })
                .eq('user_id', operatorUserId);

              // Update local applicationData with the new id so future saves use the normal path
              setApplicationData((prev: any) => ({
                ...prev,
                id: newApp?.id,
                phone: contactDraft.phone || null,
                email: contactDraft.email,
                address_street: contactDraft.address_street || null,
                address_city: contactDraft.address_city || null,
                address_state: contactDraft.address_state || null,
                address_zip: contactDraft.address_zip || null,
                dob: contactDraft.dob || null,
              }));
            }
            // Save go_live_date to onboarding_status if changed
            if (operatorId && contactDraft.go_live_date !== (status.go_live_date ?? null)) {
              await supabase
                .from('onboarding_status')
                .update({ go_live_date: contactDraft.go_live_date || null })
                .eq('operator_id', operatorId);
              setStatus((prev: any) => ({ ...prev, go_live_date: contactDraft.go_live_date || null }));
            }
            // Update local state
            setApplicationData((prev: any) => ({
              ...prev,
              first_name: contactDraft.first_name || null,
              last_name: contactDraft.last_name || null,
              phone: contactDraft.phone || null,
              email: contactDraft.email,
              address_street: contactDraft.address_street || null,
              address_city: contactDraft.address_city || null,
              address_state: contactDraft.address_state || null,
              address_zip: contactDraft.address_zip || null,
              dob: contactDraft.dob || null,
            }));
            // Update header name immediately
            const newName = `${contactDraft.first_name} ${contactDraft.last_name}`.trim();
            if (newName) setOperatorName(newName);
            if (contactDraft.email) setOperatorEmail(contactDraft.email);
            setContactEditing(false);
            toast({ title: 'Contact info updated' });
          } catch (err: any) {
            toast({ title: 'Failed to save contact info', description: err.message, variant: 'destructive' });
          } finally {
            setContactSaving(false);
          }
        };

        const dobStr = applicationData.dob;
        const goLiveStr = status.go_live_date;
        const today = new Date();
        const isBirthdayToday = dobStr && (() => {
          const d = new Date(dobStr + 'T12:00:00');
          return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
        })();
        const isAnniversaryToday = goLiveStr && (() => {
          const d = new Date(goLiveStr + 'T12:00:00');
          return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() !== today.getFullYear();
        })();
        const yearsOfService = goLiveStr ? (() => {
          const d = new Date(goLiveStr + 'T12:00:00');
          let y = today.getFullYear() - d.getFullYear();
          if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) y--;
          return y;
        })() : null;

        const addressParts = [applicationData.address_street, applicationData.address_city, applicationData.address_state, applicationData.address_zip].filter(Boolean);

        return (
          <div className="bg-white border border-border rounded-xl px-5 py-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Contact Info
              </h3>
              {!contactEditing ? (
                <Button variant="ghost" size="sm" onClick={handleContactEdit} className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setContactEditing(false)} className="h-7 px-2 text-xs text-muted-foreground" disabled={contactSaving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleContactSave} disabled={contactSaving} className="h-7 px-3 text-xs bg-gold text-surface-dark hover:bg-gold-light gap-1">
                    {contactSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                </div>
              )}
            </div>

            {contactEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">First Name</Label>
                  <Input
                    value={contactDraft.first_name}
                    onChange={e => setContactDraft(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="First name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Last Name</Label>
                  <Input
                    value={contactDraft.last_name}
                    onChange={e => setContactDraft(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Last name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={contactDraft.phone}
                    onChange={e => setContactDraft(prev => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                    placeholder="(555) 123-4567"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={contactDraft.email}
                    onChange={e => setContactDraft(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="driver@email.com"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Street Address</Label>
                  <Input
                    value={contactDraft.address_street}
                    onChange={e => setContactDraft(prev => ({ ...prev, address_street: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input
                    value={contactDraft.address_city}
                    onChange={e => setContactDraft(prev => ({ ...prev, address_city: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">State</Label>
                    <Select value={contactDraft.address_state} onValueChange={v => setContactDraft(prev => ({ ...prev, address_state: v }))}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">ZIP</Label>
                    <Input
                      value={contactDraft.address_zip}
                      onChange={e => setContactDraft(prev => ({ ...prev, address_zip: e.target.value }))}
                      maxLength={10}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Birthday</Label>
                  <DateInput
                    value={contactDraft.dob ?? ''}
                    onChange={v => setContactDraft(prev => ({ ...prev, dob: v || null }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Start Date (Anniversary)</Label>
                  <DateInput
                    value={contactDraft.go_live_date ?? ''}
                    onChange={v => setContactDraft(prev => ({ ...prev, go_live_date: v || null }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{formatPhoneDisplay(applicationData.phone) || <span className="text-muted-foreground italic">No phone</span>}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground truncate">{applicationData.email || <span className="text-muted-foreground italic">No email</span>}</span>
                  </div>
                  {addressParts.length > 0 && (
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-foreground">{addressParts.join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Birthday & Anniversary row */}
                {isQuickView ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/50 mt-2">
                    <div className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${isBirthdayToday ? 'bg-pink-50 border border-pink-200' : 'bg-muted/40 border border-border/50'}`}>
                      <Cake className={`h-4 w-4 shrink-0 ${isBirthdayToday ? 'text-pink-500' : 'text-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Birthday</p>
                        {dobStr ? (
                          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            {format(new Date(dobStr + 'T12:00:00'), 'MMMM d, yyyy')}
                            {isBirthdayToday && (
                              <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-[10px] px-1.5 py-0 h-4">
                                🎂 Today!
                              </Badge>
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Not set</p>
                        )}
                      </div>
                    </div>
                    <div className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${isAnniversaryToday ? 'bg-gold/5 border border-gold/30' : 'bg-muted/40 border border-border/50'}`}>
                      <PartyPopper className={`h-4 w-4 shrink-0 ${isAnniversaryToday ? 'text-gold' : 'text-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Anniversary</p>
                        {goLiveStr ? (
                          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            {format(new Date(goLiveStr + 'T12:00:00'), 'MMMM d, yyyy')}
                            {yearsOfService !== null && yearsOfService > 0 && (
                              <span className="text-muted-foreground font-normal">({yearsOfService} yr{yearsOfService !== 1 ? 's' : ''})</span>
                            )}
                            {isAnniversaryToday && (
                              <Badge className="bg-gold/10 text-gold border-gold/30 text-[10px] px-1.5 py-0 h-4">
                                🎉 Today!
                              </Badge>
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Not set</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-border/50 mt-2">
                    {dobStr && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Cake className={`h-3.5 w-3.5 ${isBirthdayToday ? 'text-pink-500' : 'text-muted-foreground'}`} />
                        <span>{format(new Date(dobStr + 'T12:00:00'), 'MMM d, yyyy')}</span>
                        {isBirthdayToday && (
                          <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-[10px] px-1.5 py-0 h-4">
                            🎂 Birthday today!
                          </Badge>
                        )}
                      </span>
                    )}
                    {goLiveStr && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <PartyPopper className={`h-3.5 w-3.5 ${isAnniversaryToday ? 'text-gold' : 'text-muted-foreground'}`} />
                        <span>Active since {format(new Date(goLiveStr + 'T12:00:00'), 'MMM d, yyyy')}</span>
                        {yearsOfService !== null && yearsOfService > 0 && (
                          <span className="text-foreground font-medium">({yearsOfService} yr{yearsOfService !== 1 ? 's' : ''})</span>
                        )}
                        {isAnniversaryToday && (
                          <Badge className="bg-gold/10 text-gold border-gold/30 text-[10px] px-1.5 py-0 h-4">
                            🎉 Anniversary!
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Uploaded Application Documents ── */}
      {(dlFrontUrl || dlRearUrl || medCertDocUrl) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2" style={isQuickView ? { order: 5 } : undefined}>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Uploaded Documents
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'DL Front', url: dlFrontUrl, appField: 'dl_front_url' },
              { label: 'DL Rear', url: dlRearUrl, appField: 'dl_rear_url' },
              { label: 'Medical Certificate', url: medCertDocUrl, appField: 'medical_cert_url' },
            ].filter(d => d.url).map(doc => (
              <button
                key={doc.label}
                className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                onClick={async () => {
                  const raw = doc.url!;
                  // Extract storage path: if it's a plain path (no http), use as-is;
                  // otherwise extract after /object/public/application-documents/
                  let path = raw;
                  if (raw.startsWith('http')) {
                    const marker = '/object/public/application-documents/';
                    const idx = raw.indexOf(marker);
                    if (idx !== -1) {
                      path = decodeURIComponent(raw.slice(idx + marker.length).split('?')[0]);
                    } else {
                      const marker2 = '/application-documents/';
                      const idx2 = raw.indexOf(marker2);
                      if (idx2 !== -1) {
                        path = decodeURIComponent(raw.slice(idx2 + marker2.length).split('?')[0]);
                      }
                    }
                  }
                  const { data } = await supabase.storage.from('application-documents').createSignedUrl(path, 3600);
                  if (data?.signedUrl) {
                    let url = data.signedUrl;
                    if (url.startsWith('/')) {
                      const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
                      url = `${base}${url}`;
                    }
                    setStage2Preview({ url, name: doc.label, docType: 'application_doc', appField: doc.appField });
                  } else {
                    toast({ title: 'Could not load document preview', variant: 'destructive' });
                  }
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                {doc.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={isQuickView ? { order: 10 } : undefined}>{(cdlExpiration || medCertExpiration) && (() => {
        const buildPill = (label: string, dateStr: string, focusField: 'cdl' | 'medcert') => {
          const days = differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
          const expired  = days < 0;
          const critical = !expired && days <= 30;
          const warning  = !expired && days <= 90;
          const needsRenew = expired || critical || warning;
          const colorClass = expired || critical
            ? 'bg-destructive/10 text-destructive border-destructive/30'
            : warning
            ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
            : 'bg-status-complete/10 text-status-complete border-status-complete/30';
          const dotClass = expired || critical ? 'bg-destructive' : warning ? 'bg-yellow-500' : 'bg-status-complete';
          const renewBtnClass = expired || critical
            ? 'text-destructive hover:bg-destructive/10 border-destructive/30'
            : 'text-yellow-700 hover:bg-yellow-100 border-yellow-300';
          const dayLabel = expired
            ? `Expired ${Math.abs(days)}d ago`
            : days === 0 ? 'Expires today'
            : `${days}d left`;
          const isClickable = !!onOpenAppReview;
          const isRenewing = renewingField === focusField;
          const docType = focusField === 'cdl' ? 'CDL' : 'Medical Cert' as 'CDL' | 'Medical Cert';
          const isSending = !!reminderSending[docType];
          const isSent = !!reminderSent[docType];
          const lastReminderAt = lastReminded[docType];
          const renewedAt = lastRenewed[docType];
          const renewedByName = lastRenewedBy[docType];
          const pill = (
            <span
              onClick={isClickable ? () => onOpenAppReview(focusField) : undefined}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border font-medium ${colorClass} ${isClickable ? 'cursor-pointer hover:opacity-80 hover:shadow-sm transition-all' : 'cursor-default'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass} ${expired ? 'animate-pulse' : ''}`} />
              <span className="font-semibold">{label}</span>
              <span className="opacity-70">·</span>
              <span>{dayLabel}</span>
              {isClickable && <span className="opacity-50 ml-0.5">✎</span>}
            </span>
          );
          const tooltipMsg = label + ' expires ' + format(parseISO(dateStr), 'MMM d, yyyy') + (expired ? ' — already expired' : critical ? ' — critical, renew immediately' : warning ? ' — follow up soon' : ' — on track');
          return (
            <span key={label} className="inline-flex items-center gap-1">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>{pill}</TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {tooltipMsg}{isClickable ? '. Click to edit.' : ''}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {needsRenew && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleMarkRenewed(focusField)}
                        disabled={isRenewing || renewingField !== null}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${renewBtnClass}`}
                      >
                        <RotateCcw className={`h-2.5 w-2.5 ${isRenewing ? 'animate-spin' : ''}`} />
                        {isRenewing ? '…' : 'Renew'}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Mark as renewed — sets expiry to {new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString()}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {needsRenew && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSendReminder(docType, dateStr)}
                        disabled={isSending || isSent}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSent
                            ? 'text-status-complete border-status-complete/40 bg-status-complete/10'
                            : 'text-info border-info/40 hover:bg-info/10'
                        }`}
                      >
                        {isSending ? (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                        ) : isSent ? (
                          <CheckCheck className="h-2.5 w-2.5" />
                        ) : (
                          <Send className="h-2.5 w-2.5" />
                        )}
                        {isSending ? '…' : isSent ? 'Sent' : 'Remind'}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {isSent
                        ? '✓ Reminder email sent'
                        : lastReminderAt
                        ? `Send renewal reminder email · Last sent ${format(new Date(lastReminderAt), 'MMM d')}`
                        : 'Send renewal reminder email to operator'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Renewed by indicator */}
              {renewedAt && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-status-complete/10 text-status-complete border-status-complete/25 cursor-default shrink-0">
                        <RotateCcw className="h-2.5 w-2.5" />
                        {format(new Date(renewedAt), 'MMM d')}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs space-y-0.5">
                      <p className="font-semibold">Last renewed</p>
                      <p>{format(new Date(renewedAt), 'MMM d, yyyy · h:mm a')}</p>
                      {renewedByName && <p className="text-muted-foreground">by {renewedByName}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </span>
          );
        };
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Compliance</span>
            {cdlExpiration && buildPill('CDL', cdlExpiration, 'cdl')}
            {medCertExpiration && buildPill('Med Cert', medCertExpiration, 'medcert')}
          </div>
        );
      })()}</div>

      {/* ── Upfront Costs Card ── staff-only, always visible ── */}
      {(!isQuickView || onboardingHistoryExpanded) && <div style={isQuickView ? { order: 21 } : undefined}>{(() => {
        const ownerProvided2290 = !!status.form_2290_owner_provided;
        const moVal   = status.cost_mo_registration ?? null;
        const f2290   = ownerProvided2290 ? null : (status.cost_form_2290 ?? null);
        const other   = status.cost_other ?? null;
        const total   = (moVal ?? 0) + (f2290 ?? 0) + (other ?? 0);
        const hasAny  = moVal !== null || f2290 !== null || other !== null;

        const CostAttachment = ({ slotKey, label }: { slotKey: string; label: string }) => {
          const [uploading, setUploading] = useState(false);
          const [attachUrl, setAttachUrl] = useState<string | null>(null);
          const [attachName, setAttachName] = useState<string | null>(null);
          const inputRef = useRef<HTMLInputElement>(null);

          // Load existing attachment from operator_documents
          useEffect(() => {
            if (!operatorId) return;
            supabase
              .from('operator_documents')
              .select('file_url, file_name')
              .eq('operator_id', operatorId)
              .eq('document_type', slotKey as any)
              .order('uploaded_at', { ascending: false })
              .limit(1)
              .maybeSingle()
              .then(({ data }) => {
                if (data) { setAttachUrl(data.file_url); setAttachName(data.file_name); }
              });
          }, [slotKey]);

          const handleFile = async (file: File) => {
            setUploading(true);
            try {
              const ext = file.name.split('.').pop();
              const path = `${operatorId}/cost-${slotKey}/${Date.now()}.${ext}`;
              const { error: upErr } = await supabase.storage.from('operator-documents').upload(path, file, { upsert: false });
              if (upErr) throw upErr;
              const { data: sd } = await supabase.storage.from('operator-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
              const fileUrl = sd?.signedUrl ?? '';
              await supabase.from('operator_documents').insert({ operator_id: operatorId, document_type: slotKey as any, file_name: file.name, file_url: fileUrl });
              setAttachUrl(fileUrl);
              setAttachName(file.name);
              toast({ title: 'Attachment saved', description: `${label} receipt uploaded.` });
            } catch {
              toast({ title: 'Upload failed', variant: 'destructive' });
            } finally {
              setUploading(false);
            }
          };

          return (
            <div className="mt-1.5">
              <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {attachUrl ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCostPreview({ url: attachUrl, name: attachName ?? 'View receipt', slotKey })}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline truncate max-w-[160px]"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{attachName ?? 'View receipt'}</span>
                    <ZoomIn className="h-3 w-3 shrink-0" />
                  </button>
                  <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-gray-500 hover:text-gray-700 underline">Replace</button>
                  <button
                    type="button"
                    title="Delete attachment"
                    onClick={async () => {
                      try {
                        // Delete from operator_documents table
                        await supabase.from('operator_documents').delete().eq('operator_id', operatorId).eq('document_type', slotKey as any);
                        // Try to remove from storage (best-effort)
                        const storagePath = `${operatorId}/cost-${slotKey}`;
                        const { data: files } = await supabase.storage.from('operator-documents').list(storagePath);
                        if (files?.length) {
                          await supabase.storage.from('operator-documents').remove(files.map(f => `${storagePath}/${f.name}`));
                        }
                        setAttachUrl(null);
                        setAttachName(null);
                        toast({ title: 'Attachment deleted', description: `${label} receipt removed.` });
                      } catch {
                        toast({ title: 'Delete failed', variant: 'destructive' });
                      }
                    }}
                    className="text-xs text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 rounded px-2 py-1 bg-white hover:bg-gray-50 transition-colors"
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  <span>{uploading ? 'Uploading…' : 'Attach receipt'}</span>
                </button>
              )}
            </div>
          );
        };

        return (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-900">Upfront Costs Paid by SUPERTRANSPORT</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {/* MO Registration */}
              <div>
                <Label className="text-xs text-gray-700 mb-1 block">MO Registration</Label>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-gray-600">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={status.cost_mo_registration ?? ''}
                    onChange={e => setStatus(prev => ({ ...prev, cost_mo_registration: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                    className="h-8 text-sm bg-white border-amber-200 focus:border-amber-400"
                  />
                </div>
                <CostAttachment slotKey="registration" label="MO Registration" />
              </div>
              {/* Form 2290 */}
              {ownerProvided2290 ? (
                <div className="flex items-center justify-center">
                  <p className="text-xs text-muted-foreground italic text-center">Operator provided own IRS 2290 — not a company cost</p>
                </div>
              ) : (
                <div>
                  <Label className="text-xs text-gray-700 mb-1 block">Form 2290</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-gray-600">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={status.cost_form_2290 ?? ''}
                      onChange={e => setStatus(prev => ({ ...prev, cost_form_2290: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                      className="h-8 text-sm bg-white border-amber-200 focus:border-amber-400"
                    />
                  </div>
                  <CostAttachment slotKey="form_2290" label="Form 2290" />
                </div>
              )}
              {/* Other */}
              <div>
                <Label className="text-xs text-gray-700 mb-1 block">Other</Label>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-gray-600">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={status.cost_other ?? ''}
                    onChange={e => setStatus(prev => ({ ...prev, cost_other: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                    className="h-8 text-sm bg-white border-amber-200 focus:border-amber-400"
                  />
                </div>
                <CostAttachment slotKey="other" label="Other" />
              </div>
            </div>
            {/* Other description — only when Other has a value */}
            {(other !== null && other > 0) && (
              <div className="mb-3">
                <Label className="text-xs text-gray-700 mb-1 block">Other — Description</Label>
                <Input
                  placeholder="e.g. Permit fee, vendor name…"
                  value={status.cost_other_description ?? ''}
                  onChange={e => setStatus(prev => ({ ...prev, cost_other_description: e.target.value }))}
                  className="h-8 text-sm bg-white border-amber-200 focus:border-amber-400"
                />
              </div>
            )}
            {/* Running total */}
            {hasAny && (
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-semibold text-gray-700">Total Paid</span>
                <span className="text-sm font-bold text-gray-900">
                  ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {/* Cost notes */}
            <div>
              <Label className="text-xs text-gray-700 mb-1 block">Cost Notes</Label>
              <Textarea
                placeholder="Vendor details, payment date, receipts reference…"
                value={status.cost_notes ?? ''}
                onChange={e => setStatus(prev => ({ ...prev, cost_notes: e.target.value }))}
                className="text-sm min-h-[60px] bg-white border-amber-200 focus:border-amber-400 resize-none"
              />
            </div>
          </div>
        );
      })()}</div>}

      {/* ── Truck & Equipment Card ── */}
      <div style={isQuickView ? { order: 6 } : undefined}>
        <TruckInfoCard
          truckInfo={icaTruckInfo}
          deviceInfo={{
            unit_number: status.unit_number,
            eld_serial_number: status.eld_serial_number,
            dash_cam_number: status.dash_cam_number,
            bestpass_number: status.bestpass_number,
            fuel_card_number: status.fuel_card_number,
          }}
          shippingInfo={equipmentShipping}
          onEdit={handleTruckDeviceEdit}
          onTruckEdit={handleTruckInfoEdit}
        />
      </div>
      {/* Sticky mini progress bar — shown when main bar scrolls out of view */}
      {!isQuickView && (() => {
        const exceptionActive = status.paper_logbook_approved || status.temp_decal_approved;
        const allEquipFull = status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes';
        const stages = [
          { label: 'Background', key: 'stage1', complete: status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear', fullName: 'Background Check', items: [
              { label: 'MVR Check Requested',     done: status.mvr_status === 'requested' || status.mvr_status === 'received' },
              { label: 'Clearinghouse Requested', done: status.ch_status === 'requested' || status.ch_status === 'received' },
              { label: 'MVR & CH Approved',       done: status.mvr_ch_approval === 'approved' },
              { label: 'PE Screening Clear',      done: status.pe_screening_result === 'clear' },
            ]},
          { label: 'Documents',  key: 'stage2', complete: status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received', fullName: 'Documents', items: [
              { label: 'Form 2290',      done: status.form_2290 === 'received' },
              { label: 'Truck Title',    done: status.truck_title === 'received' },
              { label: 'Truck Photos',   done: status.truck_photos === 'received' },
              { label: 'Truck Inspection', done: status.truck_inspection === 'received' },
            ]},
          { label: 'ICA',        key: 'stage3', complete: status.ica_status === 'complete', fullName: 'ICA Contract', items: [
              { label: 'ICA Issued',        done: status.ica_status !== 'not_issued' },
              { label: 'ICA Signed',        done: status.ica_status === 'complete' },
            ]},
          { label: 'MO Reg',     key: 'stage4', complete: status.mo_reg_received === 'yes', fullName: 'MO Registration', items: [
              { label: 'MO Docs Submitted',      done: status.mo_docs_submitted === 'submitted' },
              { label: 'MO Registration Received', done: status.mo_reg_received === 'yes' },
            ]},
          { label: 'Equipment',  key: 'stage5', complete: allEquipFull, fullName: 'Equipment', exception: exceptionActive && !allEquipFull, items: [
              { label: 'Decal Applied',    done: status.decal_applied === 'yes' || (status.temp_decal_approved && status.decal_method === 'supertransport_shop') },
              { label: 'ELD Installed',    done: status.eld_installed === 'yes' || (status.paper_logbook_approved && status.eld_method === 'supertransport_shop') },
              { label: 'Fuel Card Issued', done: status.fuel_card_issued === 'yes' },
            ]},
          { label: 'Insurance',  key: 'stage6', complete: !!status.insurance_added_date, fullName: 'Insurance', items: [
              { label: 'Insurance Added', done: !!status.insurance_added_date },
            ]},
          { label: 'Go Live',    key: 'stage7', complete: !!status.go_live_date, fullName: 'Go Live & Dispatch Readiness', items: [
              { label: 'Go-Live Date Set',       done: !!status.go_live_date },
            ]},
          { label: 'Pay',        key: 'stage8', complete: !!(paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted), fullName: 'Contractor Pay Setup', items: [
              { label: 'Docs Acknowledged',     done: !!(paySetupRecord?.deposit_overview_acknowledged && paySetupRecord?.payroll_calendar_acknowledged) },
              { label: 'Pay Setup Submitted',   done: !!(paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted) },
            ]},
        ];
        const completedCount = stages.filter(s => s.complete).length;
        const pct = Math.round((completedCount / stages.length) * 100);
        return (
          <div
            className="sticky top-0 z-30 -mx-6 px-6"
          >
            <div className="bg-white/95 backdrop-blur border-b border-border shadow-sm py-2 px-4">
              <div className="flex items-center gap-3 max-w-4xl">
                {/* Operator name + unit number */}
                {/* Unsaved changes indicator */}
                {hasUnsavedChanges && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap border"
                    style={{ color: 'hsl(35 90% 40%)', background: 'hsl(35 90% 97%)', borderColor: 'hsl(35 80% 75%)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'hsl(35 90% 45%)' }} />
                    Unsaved
                  </span>
                )}
                <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-semibold text-foreground whitespace-nowrap">{operatorName}</span>
                  {status.unit_number && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border whitespace-nowrap">
                      #{status.unit_number}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground hidden sm:block">·</span>
                {/* Progress percentage — prominent */}
                <span
                  className="text-sm font-bold whitespace-nowrap shrink-0 tabular-nums"
                  style={{ color: completedCount === stages.length ? 'hsl(var(--status-complete))' : 'hsl(var(--gold-main))' }}
                >
                  {pct}%
                </span>
                {/* Dispatch status badge */}
                {currentDispatchStatus && currentDispatchStatus !== 'not_dispatched' && (() => {
                  const cfg = DISPATCH_STATUS_CONFIG[currentDispatchStatus];
                  return cfg ? (
                    <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badgeClass} whitespace-nowrap shrink-0`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass} shrink-0`} />
                      {cfg.emoji} {cfg.label}
                    </span>
                  ) : null;
                })()}
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: completedCount === stages.length
                        ? 'hsl(var(--status-complete))'
                        : 'hsl(var(--gold-main))',
                    }}
                  />
                </div>
                <TooltipProvider delayDuration={150}>
                {/* Colored dot strip — matches the summary row below */}
                <div className="flex items-center gap-px bg-muted/40 rounded-lg px-2 py-1.5 border border-border/50 shrink-0">
                    {(() => {
                      type StickyDotState = 'complete' | 'progress' | 'exception' | 'na' | 'none';
                      const stickyDots: { key: string; shortLabel: string; state: StickyDotState; tooltip: string; items: { label: string; done: boolean }[] }[] = [
                        {
                          key: 'stage1', shortLabel: 'BG',
                          state: (status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear') ? 'complete'
                            : ([status.mvr_status, status.ch_status].some(v => v === 'requested' || v === 'received') || status.mvr_ch_approval === 'approved' || status.pe_screening_result === 'clear') ? 'progress'
                            : 'none',
                          tooltip: (status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear') ? 'Complete' : 'In Progress',
                          items: stages.find(s => s.key === 'stage1')?.items ?? [],
                        },
                        {
                          key: 'stage2', shortLabel: 'Docs',
                          state: (status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received') ? 'complete'
                            : ([status.form_2290, status.truck_title, status.truck_photos, status.truck_inspection].some(v => v === 'requested' || v === 'received')) ? 'progress'
                            : 'none',
                          tooltip: (() => { const n = [status.form_2290, status.truck_title, status.truck_photos, status.truck_inspection].filter(v => v === 'received').length; return n === 4 ? 'Complete' : n > 0 ? `${n}/4 received` : 'Not started'; })(),
                          items: stages.find(s => s.key === 'stage2')?.items ?? [],
                        },
                        {
                          key: 'stage3', shortLabel: 'ICA',
                          state: status.ica_status === 'complete' ? 'complete' : (status.ica_status === 'in_progress' || status.ica_status === 'sent_for_signature') ? 'progress' : 'none',
                          tooltip: status.ica_status === 'complete' ? 'Complete' : status.ica_status === 'sent_for_signature' ? 'Awaiting Signature' : status.ica_status === 'in_progress' ? 'Draft In Progress' : 'Not started',
                          items: stages.find(s => s.key === 'stage3')?.items ?? [],
                        },
                        {
                          key: 'stage4', shortLabel: 'MO',
                          state: status.registration_status === 'own_registration' ? 'na' : status.mo_reg_received === 'yes' ? 'complete' : status.mo_docs_submitted === 'submitted' ? 'progress' : 'none',
                          tooltip: status.registration_status === 'own_registration' ? 'N/A — O/O Has Own Reg' : status.mo_reg_received === 'yes' ? 'Complete' : status.mo_docs_submitted === 'submitted' ? 'Docs Submitted' : 'Not started',
                          items: stages.find(s => s.key === 'stage4')?.items ?? [],
                        },
                        {
                          key: 'stage5', shortLabel: 'Equip',
                          state: allEquipFull ? 'complete' : exceptionActive ? 'exception' : ([status.decal_applied, status.eld_installed, status.fuel_card_issued].some(v => v === 'yes')) ? 'progress' : 'none',
                          tooltip: allEquipFull ? 'Complete' : exceptionActive ? 'Exception Active — en route to shop' : (() => { const n = [status.decal_applied, status.eld_installed, status.fuel_card_issued].filter(v => v === 'yes').length; return n > 0 ? `${n}/3 done` : 'Not started'; })(),
                          items: stages.find(s => s.key === 'stage5')?.items ?? [],
                        },
                        {
                          key: 'stage6', shortLabel: 'Ins',
                          state: status.insurance_added_date ? 'complete' : (docFiles['insurance_cert'] ?? []).length > 0 || status.insurance_ai_company || status.insurance_ch_company ? 'progress' : 'none',
                          tooltip: status.insurance_added_date ? 'Complete' : (docFiles['insurance_cert'] ?? []).length > 0 ? 'Cert on File' : (status.insurance_ai_company || status.insurance_ch_company) ? 'In Progress' : 'Not started',
                          items: stages.find(s => s.key === 'stage6')?.items ?? [],
                        },
                        {
                          key: 'stage7', shortLabel: 'Go Live',
                          state: status.go_live_date ? 'complete' : 'none',
                          tooltip: status.go_live_date ? `Go Live: ${format(new Date(status.go_live_date + 'T12:00:00'), 'MMM d, yyyy')}` : 'Not started',
                          items: stages.find(s => s.key === 'stage7')?.items ?? [],
                        },
                        {
                          key: 'stage8', shortLabel: 'Pay',
                          state: (paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted) ? 'complete' : paySetupRecord ? 'progress' : 'none',
                          tooltip: (paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted) ? 'Pay Setup Complete' : paySetupRecord ? 'In Progress' : 'Not started',
                          items: stages.find(s => s.key === 'stage8')?.items ?? [],
                        },
                      ];
                      const dotCls: Record<StickyDotState, string> = {
                        complete:  'bg-status-complete border-status-complete/40',
                        progress:  'bg-gold border-gold/40',
                        exception: 'bg-gold border-gold/60',
                        na:        'bg-muted-foreground/30 border-muted-foreground/20',
                        none:      'bg-muted border-border',
                      };
                      const labelCls: Record<StickyDotState, string> = {
                        complete:  'text-status-complete',
                        progress:  'text-gold-muted',
                        exception: 'text-gold-muted',
                        na:        'text-muted-foreground/50',
                        none:      'text-muted-foreground/60',
                      };
                      return stickyDots.map(dot => (
                        <Tooltip key={dot.key}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => scrollToStage(dot.key)}
                              className="flex flex-col items-center gap-0.5 group focus:outline-none px-1.5 py-0.5"
                            >
                              <div className={`h-2.5 w-2.5 rounded-full border transition-all group-hover:scale-125 group-hover:shadow-md ${dotCls[dot.state]}`} />
                              <span className={`text-[9px] font-semibold leading-none transition-colors ${labelCls[dot.state]}`}>{dot.shortLabel}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-left min-w-[160px] max-w-[220px] p-2.5 space-y-2">
                            <p className="font-semibold text-xs">{dot.shortLabel} · {dot.tooltip}</p>
                            {dot.items.length > 0 && (
                              <div className="space-y-1">
                                {dot.items.filter(it => !it.done).length > 0 && (
                                  <>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive/80">Still needed</p>
                                    <ul className="space-y-1">
                                      {dot.items.filter(it => !it.done).map(it => (
                                        <li key={it.label} className="flex items-start gap-1.5 text-xs">
                                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                                          <span className="text-foreground">{it.label}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {dot.items.filter(it => it.done).length > 0 && (
                                  <div className={`space-y-1 ${dot.items.filter(it => !it.done).length > 0 ? 'pt-1 border-t border-border' : ''}`}>
                                    <ul className="space-y-1">
                                      {dot.items.filter(it => it.done).map(it => (
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
                            <p className="text-[10px] text-muted-foreground italic">Click to jump to section</p>
                          </TooltipContent>
                        </Tooltip>
                      ));
                    })()}
                  </div>
                  {/* Collapse All / Expand All quick-action */}
                  {(() => {
                    const stickyAllKeys = ['stage1','stage2','stage3','stage4','stage5','stage6','stage7'];
                    const stickyAllCollapsed = stickyAllKeys.every(k => collapsedStages.has(k));
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setCollapsedStages(stickyAllCollapsed ? new Set() : new Set(stickyAllKeys))}
                            className="ml-1 h-6 w-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-gold transition-all"
                          >
                            {stickyAllCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {stickyAllCollapsed ? 'Expand all stages' : 'Collapse all stages'}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()}
                  {/* Copy email quick-action */}
                  {operatorEmail && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(operatorEmail);
                            setCopiedEmail(true);
                            setTimeout(() => setCopiedEmail(false), 2000);
                          }}
                          className="ml-1 h-6 w-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-gold transition-all"
                        >
                          {copiedEmail ? <Check className="h-3 w-3 text-status-complete" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {copiedEmail ? '✓ Copied!' : `Copy email — ${operatorEmail}`}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Message operator quick-action */}
                  {onMessageOperator && operatorUserId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => guardedNavigate(() => onMessageOperator(operatorUserId))}
                          className="ml-1 h-6 w-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-gold transition-all"
                        >
                          <MessageSquare className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Message {operatorName}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Resend invite quick-action */}
                  {operatorEmail && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleResendInvite}
                          disabled={resendingInvite}
                          className="ml-1 h-6 w-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-gold transition-all disabled:opacity-50"
                        >
                          {resendingInvite
                            ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                            : inviteResent
                            ? <Check className="h-3 w-3 text-status-complete" />
                            : <Send className="h-3 w-3" />
                          }
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {inviteResent ? '✓ Invite sent!' : 'Resend invite email'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="ml-1 h-6 px-2 rounded flex items-center gap-1 bg-gold text-surface-dark hover:bg-gold-light transition-all disabled:opacity-50 text-[10px] font-semibold"
                      >
                        {saving
                          ? <span className="h-3 w-3 animate-spin rounded-full border border-gold border-t-transparent" />
                          : <Save className="h-3 w-3" />
                        }
                        <span className="hidden sm:inline">Save</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs flex items-center gap-1.5">
                      <span className="text-muted-foreground">Save Changes</span>
                      <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-foreground font-mono text-[10px] leading-none">
                        {navigator.platform.startsWith('Mac') ? '⌘S' : 'Ctrl+S'}
                      </kbd>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── On Hold Modal ── */}
      <Dialog open={showOnHoldModal} onOpenChange={setShowOnHoldModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-blue-600" />
              Place Operator On Hold
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="e.g. Awaiting insurance, personal situation, truck repairs…"
                value={onHoldModalReason}
                onChange={e => setOnHoldModalReason(e.target.value)}
                className="resize-none min-h-[80px] text-sm"
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground text-right">{onHoldModalReason.length}/300</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Placed On Hold</Label>
              <Popover open={onHoldModalDateOpen} onOpenChange={setOnHoldModalDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal text-sm h-9">
                    <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                    {onHoldModalDate ? new Date(onHoldModalDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={onHoldModalDate ? new Date(onHoldModalDate + 'T12:00:00') : undefined}
                    onSelect={d => { if (d) { setOnHoldModalDate(d.toISOString().split('T')[0]); } setOnHoldModalDateOpen(false); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowOnHoldModal(false)} disabled={savingOnHold}>Cancel</Button>
            <Button
              onClick={handleSaveOnHold}
              disabled={savingOnHold || !onHoldModalReason.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {savingOnHold ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              Place On Hold
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Confirmation Dialog ── */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={open => { if (!open) setDeactivateReason(''); setShowDeactivateConfirm(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? 'Deactivate this driver?' : 'Reactivate this driver?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? `${operatorName} will be removed from the active Driver Hub roster. Their onboarding record and history will be preserved. You can reactivate them at any time.`
                : `${operatorName} will be restored to the active Driver Hub roster and appear as a fully-onboarded driver.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isActive && (
            <div className="px-0 pb-2 space-y-2">
              <Label className="text-xs font-medium text-foreground">Reason for deactivation</Label>
              <Select
                value={deactivateReason === '' || ['Resigned','Terminated','No Loads','Medical','Abandoned'].includes(deactivateReason) ? deactivateReason : 'Other'}
                onValueChange={val => {
                  if (val !== 'Other') setDeactivateReason(val);
                  else setDeactivateReason('Other');
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a reason (optional)…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Resigned">Resigned</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                  <SelectItem value="No Loads">No Loads</SelectItem>
                  <SelectItem value="Medical">Medical</SelectItem>
                  <SelectItem value="Abandoned">Abandoned</SelectItem>
                  <SelectItem value="Other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {(deactivateReason === 'Other' || (!['', 'Resigned','Terminated','No Loads','Medical','Abandoned'].includes(deactivateReason) && deactivateReason !== '')) && (
                <Input
                  className="h-9 text-sm"
                  placeholder="Describe the reason…"
                  value={deactivateReason === 'Other' ? '' : deactivateReason}
                  onChange={e => setDeactivateReason(e.target.value)}
                  autoFocus
                  maxLength={120}
                />
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              disabled={deactivating}
              className={isActive ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
            >
              {deactivating
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{isActive ? 'Deactivating…' : 'Reactivating…'}</>
                : isActive ? 'Yes, deactivate' : 'Yes, reactivate'
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* ── Cert Expiry History Timeline ─────────────────────── */}
      {(cdlExpiration || medCertExpiration) && (<div style={isQuickView ? { order: 11 } : undefined}>
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Header row: title + filter chips */}
          <button
            onClick={() => {
              if (!certHistoryExpanded && certHistory.length === 0) fetchCertHistory();
              setCertHistoryExpanded(v => !v);
            }}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cert Expiry History</span>
              {certHistory.length > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold leading-none">
                  {certHistory.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {certHistoryExpanded && (
                <button
                  onClick={(e) => { e.stopPropagation(); fetchCertHistory(); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Refresh history"
                >
                  <RefreshCw className={`h-3 w-3 ${certHistoryLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
              {certHistoryExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </div>
          </button>

          {certHistoryExpanded && (
            <div className="border-t border-border">
              {/* Filter chips */}
              {certHistory.length > 0 && (() => {
                const countReminders = certHistory.filter(e => e.event_type === 'reminder_sent').length;
                const countRenewals  = certHistory.filter(e => e.event_type === 'renewed').length;
                const countFailed    = certHistory.filter(e => e.event_type === 'reminder_sent' && e.email_sent === false).length;
                type FilterKey = 'all' | 'reminders' | 'renewals' | 'failed';
                const chips: { key: FilterKey; label: string; count: number; activeClass: string }[] = [
                  { key: 'all',      label: 'All',      count: certHistory.length, activeClass: 'bg-muted text-foreground border-border'          },
                  { key: 'reminders',label: 'Reminders',count: countReminders,     activeClass: 'bg-info/10 text-info border-info/30'              },
                  { key: 'renewals', label: 'Renewals', count: countRenewals,      activeClass: 'bg-status-complete/10 text-status-complete border-status-complete/30' },
                  { key: 'failed',   label: 'Failed',   count: countFailed,        activeClass: 'bg-destructive/10 text-destructive border-destructive/30' },
                ];
                return (
                  <div className="flex items-center gap-1.5 px-4 py-2 flex-wrap">
                    {chips.map(({ key, label, count, activeClass }) => (
                      <button
                        key={key}
                        onClick={() => setCertHistoryFilter(key)}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                          certHistoryFilter === key
                            ? activeClass
                            : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
                        }`}
                      >
                        {label}
                        <span className={`inline-flex items-center justify-center h-3.5 min-w-3.5 px-0.5 rounded-full text-[9px] font-bold leading-none ${
                          certHistoryFilter === key ? 'bg-current/20' : 'bg-muted'
                        }`}>{count}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              <div className="px-4 pb-3">
                {certHistoryLoading ? (
                  <div className="flex items-center gap-2 py-4 justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    <span className="text-xs text-muted-foreground">Loading history…</span>
                  </div>
                ) : certHistory.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 py-5 text-center">
                    <History className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No renewals or reminders recorded yet.</p>
                  </div>
                ) : (() => {
                  const filtered = certHistory.filter(entry => {
                    if (certHistoryFilter === 'all')      return true;
                    if (certHistoryFilter === 'reminders') return entry.event_type === 'reminder_sent';
                    if (certHistoryFilter === 'renewals')  return entry.event_type === 'renewed';
                    if (certHistoryFilter === 'failed')    return entry.event_type === 'reminder_sent' && entry.email_sent === false;
                    return true;
                  });
                  if (filtered.length === 0) {
                    const labelMap: Record<string, string> = { reminders: 'reminders', renewals: 'renewals', failed: 'failed reminders' };
                    return (
                      <div className="flex flex-col items-center gap-1.5 py-5 text-center">
                        <History className="h-6 w-6 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">No {labelMap[certHistoryFilter]} recorded yet.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="relative">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-4 ml-5">
                        {filtered.map((entry) => {
                          const isRenewal = entry.event_type === 'renewed';
                          const isReminder = entry.event_type === 'reminder_sent';
                          const emailFailed = isReminder && entry.email_sent === false;
                          const emailDelivered = isReminder && entry.email_sent === true;
                          const dotClass = isRenewal
                            ? 'bg-status-complete border-status-complete/40'
                            : isReminder
                              ? emailFailed
                                ? 'bg-destructive border-destructive/40'
                                : emailDelivered
                                ? 'bg-info border-info/40'
                                : 'bg-muted-foreground border-muted-foreground/40'
                              : 'bg-gold border-gold/40';
                          const IconComp = isRenewal ? RotateCcw : isReminder ? Mail : CalendarClock;
                          const iconColorClass = isRenewal
                            ? 'text-status-complete'
                            : isReminder
                              ? emailFailed ? 'text-destructive' : emailDelivered ? 'text-info' : 'text-muted-foreground'
                              : 'text-gold';
                          return (
                            <div key={entry.id} className="relative flex gap-3 items-start">
                              <div className={`absolute -left-5 mt-0.5 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${dotClass}`}>
                                <IconComp className={`h-2 w-2 ${iconColorClass}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className={`text-[11px] font-bold uppercase tracking-wide ${iconColorClass}`}>
                                    {isRenewal ? 'Renewed' : isReminder ? 'Reminder Sent' : 'Expiry Updated'}
                                  </span>
                                  <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                                    entry.doc_type === 'CDL'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-purple-50 text-purple-700 border-purple-200'
                                  }`}>
                                    {entry.doc_type}
                                  </span>
                                  {isReminder && entry.email_sent !== null && entry.email_sent !== undefined && (
                                    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                                      emailFailed
                                        ? 'bg-destructive/10 text-destructive border-destructive/30'
                                        : 'bg-status-complete/10 text-status-complete border-status-complete/30'
                                    }`}>
                                      {emailFailed ? '✗ Failed' : '✓ Delivered'}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                                    {format(new Date(entry.occurred_at), 'MMM d, yyyy · h:mm a')}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {isRenewal && entry.old_expiry && entry.new_expiry && (
                                    <>
                                      <span className="line-through opacity-60">{format(parseISO(entry.old_expiry), 'MMM d, yyyy')}</span>
                                      {' → '}
                                      <span className="font-medium text-status-complete">{format(parseISO(entry.new_expiry), 'MMM d, yyyy')}</span>
                                    </>
                                  )}
                                  {isRenewal && (!entry.old_expiry || !entry.new_expiry) && 'Expiry extended by 1 year'}
                                  {isReminder && entry.days_until !== null && entry.days_until !== undefined && (
                                    entry.days_until < 0
                                      ? <span className="text-destructive font-medium">{Math.abs(entry.days_until)}d past expiry at time of send</span>
                                      : entry.days_until === 0
                                      ? <span className="text-destructive font-medium">Expires today</span>
                                      : <span>{entry.days_until}d remaining at time of send</span>
                                  )}
                                  {' '}
                                  {entry.actor_name && (
                                    <span className="text-muted-foreground/70">by {entry.actor_name}</span>
                                  )}
                                </p>
                                {emailFailed && entry.email_error && (
                                  <p className="text-[10px] text-destructive/80 mt-0.5 font-mono break-all leading-tight">
                                    {entry.email_error.replace(/^Error:\s*/i, '').slice(0, 120)}
                                    {entry.email_error.length > 120 && '…'}
                                  </p>
                                )}
                                {emailFailed && (() => {
                                  const dateStr = entry.doc_type === 'CDL' ? cdlExpiration : medCertExpiration;
                                  if (!dateStr) return null;
                                  const docType = entry.doc_type as 'CDL' | 'Medical Cert';
                                  const isSending = reminderSending[docType];
                                  const wasSent = reminderSent[docType];
                                  // Urgency badge calculation
                                  const daysLeft = differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
                                  const urgencyClass = daysLeft < 0
                                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                                    : daysLeft <= 30
                                    ? 'bg-destructive/10 text-destructive border-destructive/25'
                                    : daysLeft <= 90
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    : 'bg-status-complete/10 text-status-complete border-status-complete/30';
                                  const urgencyLabel = daysLeft < 0
                                    ? `${Math.abs(daysLeft)}d expired`
                                    : daysLeft === 0
                                    ? 'Expires today'
                                    : `${daysLeft}d left`;
                                  return (
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <button
                                        onClick={() => handleSendReminder(docType, dateStr)}
                                        disabled={isSending || wasSent}
                                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isSending
                                          ? <><div className="h-2.5 w-2.5 rounded-full border border-destructive border-t-transparent animate-spin" />Sending…</>
                                          : wasSent
                                          ? <><Check className="h-2.5 w-2.5" />Sent</>
                                          : <><Send className="h-2.5 w-2.5" />Re-send</>
                                        }
                                      </button>
                                      <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${urgencyClass}`}>
                                        {urgencyLabel}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>)}


      {(!isQuickView || onboardingHistoryExpanded) && <div style={isQuickView ? { order: 22 } : undefined}>{(() => {
        const stages = [
          { label: 'Background', key: 'stage1', complete: status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear', fullName: 'Background Check', items: [
              { label: 'MVR Check Requested',     done: status.mvr_status === 'requested' || status.mvr_status === 'received' },
              { label: 'Clearinghouse Requested', done: status.ch_status === 'requested' || status.ch_status === 'received' },
              { label: 'MVR & CH Approved',       done: status.mvr_ch_approval === 'approved' },
              { label: 'PE Screening Clear',      done: status.pe_screening_result === 'clear' },
            ]},
          { label: 'Documents',  key: 'stage2', complete: status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received', fullName: 'Documents', items: [
              { label: 'Form 2290',      done: status.form_2290 === 'received' },
              { label: 'Truck Title',    done: status.truck_title === 'received' },
              { label: 'Truck Photos',   done: status.truck_photos === 'received' },
              { label: 'Truck Inspection', done: status.truck_inspection === 'received' },
            ]},
          { label: 'ICA',        key: 'stage3', complete: status.ica_status === 'complete', fullName: 'ICA Contract', items: [
              { label: 'ICA Issued',  done: status.ica_status !== 'not_issued' },
              { label: 'ICA Signed',  done: status.ica_status === 'complete' },
            ]},
          { label: 'MO Reg',     key: 'stage4', complete: status.mo_reg_received === 'yes', fullName: 'MO Registration', items: [
              { label: 'MO Docs Submitted',        done: status.mo_docs_submitted === 'submitted' },
              { label: 'MO Registration Received', done: status.mo_reg_received === 'yes' },
            ]},
          { label: 'Equipment',  key: 'stage5', complete: status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes', fullName: 'Equipment', items: [
              { label: 'Decal Applied',    done: status.decal_applied === 'yes' },
              { label: 'ELD Installed',    done: status.eld_installed === 'yes' },
              { label: 'Fuel Card Issued', done: status.fuel_card_issued === 'yes' },
            ]},
          { label: 'Insurance',  key: 'stage6', complete: !!status.insurance_added_date, fullName: 'Insurance', items: [
              { label: 'Insurance Added', done: !!status.insurance_added_date },
            ]},
          { label: 'Go Live',    key: 'stage7', complete: !!status.go_live_date, fullName: 'Go Live & Dispatch Readiness', items: [
              { label: 'Go-Live Date Set',        done: !!status.go_live_date },
            ]},
        ];
        const completedCount = stages.filter(s => s.complete).length;
        const pct = Math.round((completedCount / stages.length) * 100);
        return (
          <div ref={progressBarRef} className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Onboarding Progress</span>
              <span className="text-xs font-bold text-foreground">{completedCount} / {stages.length} stages complete</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: completedCount === stages.length
                    ? 'hsl(var(--status-complete))'
                    : 'hsl(var(--gold-main))',
                }}
              />
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
              <TooltipProvider delayDuration={150}>
              {stages.map((s, i) => (
                <Tooltip key={s.key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => scrollToStage(s.key)}
                      className="flex flex-col items-center gap-1 group focus:outline-none"
                    >
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors group-hover:scale-110 group-hover:shadow-sm ${
                        s.complete
                          ? 'bg-status-complete border-status-complete text-white'
                          : 'bg-background border-border text-muted-foreground group-hover:border-gold group-hover:text-gold'
                      }`}>
                        {s.complete ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] text-center leading-tight transition-colors ${s.complete ? 'text-status-complete font-medium' : 'text-muted-foreground group-hover:text-foreground'}`}>
                        {s.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-left min-w-[160px] max-w-[220px] p-2.5 space-y-2">
                    <p className="font-semibold text-xs">{s.fullName ?? s.label}</p>
                    {s.complete ? (
                      <p className="text-xs" style={{ color: 'hsl(var(--status-complete))' }}>All items complete ✓</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive/80">Still needed</p>
                        <ul className="space-y-1">
                          {s.items.filter(it => !it.done).map(it => (
                            <li key={it.label} className="flex items-start gap-1.5 text-xs">
                              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                              <span className="text-foreground">{it.label}</span>
                            </li>
                          ))}
                        </ul>
                        {s.items.filter(it => it.done).length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-border">
                            <ul className="space-y-1">
                              {s.items.filter(it => it.done).map(it => (
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
                    <p className="text-[10px] text-muted-foreground italic">Click to jump to section</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              </TooltipProvider>
            </div>
          </div>
        );
      })()}</div>}

      {/* Stage Summary Dot Row + Collapse All */}
      {(!isQuickView || onboardingHistoryExpanded) && <div style={isQuickView ? { order: 23 } : undefined}>{(() => {
        const allStageKeys = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7'];
        const allCollapsed = allStageKeys.every(k => collapsedStages.has(k));

        type DotState = 'complete' | 'progress' | 'na' | 'none';
        const stageDots: { key: string; label: string; shortLabel: string; state: DotState; tooltip: string }[] = [
          {
            key: 'stage1', label: 'Background', shortLabel: 'BG',
            state: (status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear')
              ? 'complete'
              : ([status.mvr_status, status.ch_status].some(s => s === 'requested' || s === 'received') ||
                 status.mvr_ch_approval === 'approved' || status.pe_screening_result === 'clear')
              ? 'progress' : 'none',
            tooltip: status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear'
              ? 'Complete' : 'In Progress',
          },
          {
            key: 'stage2', label: 'Documents', shortLabel: 'Docs',
            state: (status.form_2290 === 'received' && status.truck_title === 'received' && status.truck_photos === 'received' && status.truck_inspection === 'received')
              ? 'complete'
              : ([status.form_2290, status.truck_title, status.truck_photos, status.truck_inspection].some(s => s === 'requested' || s === 'received'))
              ? 'progress' : 'none',
            tooltip: (() => {
              const done = [status.form_2290, status.truck_title, status.truck_photos, status.truck_inspection].filter(s => s === 'received').length;
              return done === 4 ? 'Complete' : done > 0 ? `${done}/4 received` : 'Not started';
            })(),
          },
          {
            key: 'stage3', label: 'ICA', shortLabel: 'ICA',
            state: status.ica_status === 'complete' ? 'complete'
              : (status.ica_status === 'in_progress' || status.ica_status === 'sent_for_signature') ? 'progress'
              : 'none',
            tooltip: status.ica_status === 'complete' ? 'Complete'
              : status.ica_status === 'sent_for_signature' ? 'Awaiting Signature'
              : status.ica_status === 'in_progress' ? 'Draft In Progress'
              : 'Not started',
          },
          {
            key: 'stage4', label: 'MO Reg', shortLabel: 'MO',
            state: status.registration_status === 'own_registration' ? 'na'
              : status.mo_reg_received === 'yes' ? 'complete'
              : status.mo_docs_submitted === 'submitted' ? 'progress'
              : 'none',
            tooltip: status.registration_status === 'own_registration' ? 'N/A — O/O Has Own Reg'
              : status.mo_reg_received === 'yes' ? 'Complete'
              : status.mo_docs_submitted === 'submitted' ? 'Docs Submitted'
              : 'Not started',
          },
          {
            key: 'stage5', label: 'Equipment', shortLabel: 'Equip',
            state: (status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes') ? 'complete'
              : ([status.decal_applied, status.eld_installed, status.fuel_card_issued].some(s => s === 'yes')) ? 'progress'
              : 'none',
            tooltip: (() => {
              const done = [status.decal_applied, status.eld_installed, status.fuel_card_issued].filter(s => s === 'yes').length;
              return done === 3 ? 'Complete' : done > 0 ? `${done}/3 done` : 'Not started';
            })(),
          },
          {
            key: 'stage6', label: 'Insurance', shortLabel: 'Ins',
            state: status.insurance_added_date ? 'complete'
              : (status.insurance_policy_type || (docFiles['insurance_cert'] ?? []).length > 0) ? 'progress'
              : 'none',
            tooltip: status.insurance_added_date ? 'Complete'
              : (docFiles['insurance_cert'] ?? []).length > 0 ? 'Cert on File'
              : status.insurance_policy_type ? 'In Progress'
              : 'Not started',
          },
        ];

        const dotClasses: Record<DotState, string> = {
          complete: 'bg-status-complete border-status-complete/40 shadow-sm',
          progress: 'bg-gold border-gold/40',
          na:       'bg-muted-foreground/30 border-muted-foreground/20',
          none:     'bg-muted border-border',
        };

        return (
          <div className="flex items-center justify-between gap-3">
            {/* Dot summary strip */}
            <TooltipProvider delayDuration={100}>
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
                {stageDots.map((dot, i) => (
                  <Tooltip key={dot.key}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => scrollToStage(dot.key)}
                        className="flex flex-col items-center gap-1 group focus:outline-none px-1.5"
                      >
                        <div className={`h-2.5 w-2.5 rounded-full border transition-all group-hover:scale-125 group-hover:shadow-md ${dotClasses[dot.state]}`} />
                        <span className={`text-[9px] font-semibold leading-none transition-colors ${
                          dot.state === 'complete' ? 'text-status-complete' :
                          dot.state === 'progress' ? 'text-gold-muted' :
                          dot.state === 'na' ? 'text-muted-foreground/50' :
                          'text-muted-foreground/60'
                        }`}>{dot.shortLabel}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <span className="font-semibold">{dot.label}</span> · {dot.tooltip}
                      <span className="block text-[10px] text-muted-foreground mt-0.5 italic">Click to jump</span>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
            {/* Collapse All / Expand All */}
            <button
              onClick={() => setCollapsedStages(allCollapsed ? new Set() : new Set(allStageKeys))}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted shrink-0"
            >
              {allCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {allCollapsed ? 'Expand All' : 'Collapse All'}
            </button>
          </div>
        );
      })()}</div>}

      {(!isQuickView || onboardingHistoryExpanded) && <div style={isQuickView ? { order: 24 } : undefined}><div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stage 1 — Background */}
        {(() => {
          const s1Complete = status.mvr_ch_approval === 'approved' && status.pe_screening_result === 'clear';
          const s1Collapsed = collapsedStages.has('stage1');
          return (
            <div ref={el => { stageRefs.current['stage1'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s1Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage1')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${s1Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 1 — Background Check</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s1Complete
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>
                    : (() => {
                        const done = [
                          status.mvr_status === 'requested' || status.mvr_status === 'received',
                          status.ch_status === 'requested' || status.ch_status === 'received',
                          status.mvr_ch_approval === 'approved',
                          status.pe_screening_result === 'clear',
                        ].filter(Boolean).length;
                        return done > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />{done}/4 done</span>
                        ) : null;
                      })()
                  }
                  {s1Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s1Collapsed && (
                <div className="px-5 pb-5 space-y-4">
                  {/* MVR */}
                  <div className="space-y-2">
                    <SelectField label="MVR Status" field="mvr_status" options={mvrOptions} />
                    {(status.mvr_status === 'requested' || status.mvr_status === 'received') && (
                      <StageDatePicker
                        label="MVR Requested Date"
                        value={status.mvr_requested_date ?? null}
                        onChange={v => setStatus(prev => ({ ...prev, mvr_requested_date: v }))}
                      />
                    )}
                    {status.mvr_status === 'received' && (
                      <StageDatePicker
                        label="MVR Received Date"
                        value={status.mvr_received_date ?? null}
                        onChange={v => setStatus(prev => ({ ...prev, mvr_received_date: v }))}
                      />
                    )}
                  </div>
                  {/* Clearinghouse */}
                  <div className="space-y-2">
                    <SelectField label="Clearinghouse (CH) Status" field="ch_status" options={mvrOptions} />
                    {(status.ch_status === 'requested' || status.ch_status === 'received') && (
                      <StageDatePicker
                        label="CH Requested Date"
                        value={status.ch_requested_date ?? null}
                        onChange={v => setStatus(prev => ({ ...prev, ch_requested_date: v }))}
                      />
                    )}
                    {status.ch_status === 'received' && (
                      <StageDatePicker
                        label="CH Received Date"
                        value={status.ch_received_date ?? null}
                        onChange={v => setStatus(prev => ({ ...prev, ch_received_date: v }))}
                      />
                    )}
                  </div>
                  {/* MVR/CH Approval */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MVR/CH Approval</Label>
                    <Select
                      value={(status.mvr_ch_approval as string) || undefined}
                      onValueChange={v => {
                        updateStatus('mvr_ch_approval', v);
                        if (v === 'approved' && status.pe_screening_result === 'clear') {
                          setCollapsedStages(prev => { const next = new Set(prev); next.add('stage1'); return next; });
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {approvalOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* PE Screening */}
                  <div className="space-y-2">
                    <SelectField label="PE Screening" field="pe_screening" options={screeningOptions} />
                    {(status.pe_screening === 'scheduled' || status.pe_screening === 'results_in') && (
                      <StageDatePicker
                        label="PE Scheduled Date"
                        value={status.pe_scheduled_date ?? null}
                        onChange={v => setStatus(prev => ({ ...prev, pe_scheduled_date: v }))}
                      />
                    )}
                    {status.pe_screening === 'results_in' && (
                      <StageDatePicker
                        label="PE Results Date"
                        value={status.pe_results_date ?? null}
                        onChange={v => setStatus(prev => ({ ...prev, pe_results_date: v }))}
                      />
                    )}
                    {/* QPassport Upload — visible when screening is scheduled or results_in */}
                    {(status.pe_screening === 'scheduled' || status.pe_screening === 'results_in') && (
                      <QPassportUploader
                        operatorId={operatorId}
                        currentUrl={status.qpassport_url}
                        onUploaded={url => setStatus(prev => ({ ...prev, qpassport_url: url }))}
                      />
                    )}
                    {/* PE Receipt — view via signed URL in FilePreviewModal */}
                    {docFiles['pe_receipt']?.[0] && (
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PE Receipt (from operator)</Label>
                        <button
                          type="button"
                          onClick={async () => {
                            const raw = docFiles['pe_receipt'][0].file_url ?? '';
                            const storagePath = raw.startsWith('http')
                              ? (() => { const m = raw.indexOf('/operator-documents/'); return m !== -1 ? raw.slice(m + '/operator-documents/'.length).split('?')[0] : raw; })()
                              : raw;
                            const { data } = await supabase.storage.from('operator-documents').createSignedUrl(storagePath, 3600);
                            if (data?.signedUrl) setStage2Preview({ url: data.signedUrl, name: docFiles['pe_receipt'][0].file_name ?? 'PE Receipt', docType: 'pe_receipt' });
                          }}
                          className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                        >
                          <Eye className="h-3 w-3" /> View Receipt
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PE Screening Result</Label>
                    <Select
                      value={(status.pe_screening_result as string) || undefined}
                      onValueChange={v => {
                        updateStatus('pe_screening_result', v);
                        if (v === 'clear' && status.mvr_ch_approval === 'approved') {
                          setCollapsedStages(prev => { const next = new Set(prev); next.add('stage1'); return next; });
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {resultOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* PE Results Document Upload */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PE Results Document</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {status.pe_results_doc_url && (
                        <a href={status.pe_results_doc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
                          <ExternalLink className="h-3 w-3" /> View Document
                        </a>
                      )}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="hidden"
                        id={`pe-results-upload-${operatorId}`}
                        onChange={async e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          e.target.value = '';
                          const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
                          const mime = f.type || '';
                          const allowed = ['application/pdf','image/jpeg','image/png'];
                          const allowedExt = ['pdf','jpg','jpeg','png'];
                          if (!allowed.includes(mime) && !allowedExt.includes(ext)) {
                            toast({ title: 'Invalid file type', description: 'Please upload a PDF, JPG, or PNG.', variant: 'destructive' });
                            return;
                          }
                          if (f.size > 10 * 1024 * 1024) {
                            toast({ title: 'File too large', description: 'Max 10 MB.', variant: 'destructive' });
                            return;
                          }
                          try {
                            const path = `${operatorId}/pe-results/${Date.now()}.${ext || 'pdf'}`;
                            const { error: upErr } = await supabase.storage.from('operator-documents').upload(path, f, { upsert: true });
                            if (upErr) throw upErr;
                            const { data: sd } = await supabase.storage.from('operator-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
                            const fileUrl = sd?.signedUrl ?? '';
                            const { error: updateErr } = await supabase.from('onboarding_status').update({ pe_results_doc_url: fileUrl } as any).eq('operator_id', operatorId);
                            if (updateErr) throw updateErr;
                            setStatus(prev => ({ ...prev, pe_results_doc_url: fileUrl }));
                            toast({ title: 'PE Results uploaded' });
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as Record<string, unknown>).message) : 'Unknown error';
                            toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant={status.pe_results_doc_url ? 'outline' : 'default'}
                        onClick={() => document.getElementById(`pe-results-upload-${operatorId}`)?.click()}
                        className={`text-xs gap-1 h-7 px-2.5 ${!status.pe_results_doc_url ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                      >
                        <Upload className="h-3 w-3" /> {status.pe_results_doc_url ? 'Replace' : 'Upload Results'}
                      </Button>
                    </div>
                  </div>
                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Background Check Notes</Label>
                    <Textarea
                      value={status.bg_check_notes ?? ''}
                      onChange={e => setStatus(prev => ({ ...prev, bg_check_notes: e.target.value || null }))}
                      placeholder="e.g. vendor name, order date, any issues…"
                      className="text-sm min-h-[72px] resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 2 — Documents */}
        {(() => {
          const allDocsComplete =
            status.form_2290 === 'received' &&
            status.truck_title === 'received' &&
            status.truck_photos === 'received' &&
            status.truck_inspection === 'received';
          const s2Collapsed = collapsedStages.has('stage2');
          return (
        <div ref={el => { stageRefs.current['stage2'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${allDocsComplete ? 'border-status-complete' : 'border-border'}`}>
          <button onClick={() => toggleStage('stage2')} className="w-full flex items-center justify-between px-5 py-4 text-left">
            <div className="flex items-center gap-2">
              <FileCheck className={`h-4 w-4 ${allDocsComplete ? 'text-status-complete' : 'text-gold'}`} />
              <h3 className="font-semibold text-foreground text-sm">Stage 2 — Documents</h3>
            </div>
            <div className="flex items-center gap-2">
              {allDocsComplete
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />All Docs Complete</span>
                : (() => {
                    const done = [
                      status.form_2290 === 'received',
                      status.truck_title === 'received',
                      status.truck_photos === 'received',
                      status.truck_inspection === 'received',
                    ].filter(Boolean).length;
                    const requested = [
                      status.form_2290 === 'requested',
                      status.truck_title === 'requested',
                      status.truck_photos === 'requested',
                      status.truck_inspection === 'requested',
                    ].filter(Boolean).length;
                    return (done > 0 || requested > 0) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />{done}/4 received</span>
                    ) : null;
                  })()
              }
              {s2Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {!s2Collapsed && (
          <div className="px-5 pb-5 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Registration Status</Label>
              <Select
                value={(status.registration_status as string) || undefined}
                onValueChange={v => {
                  updateStatus('registration_status', v);
                  if (v === 'own_registration') {
                    setCollapsedStages(prev => { const next = new Set(prev); next.add('stage4'); return next; });
                  }
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {regOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Doc fields with inline Request buttons */}
            {([
              { field: 'form_2290', label: 'Form 2290', showOwnerToggle: true },
              { field: 'truck_title', label: 'Truck Title' },
              { field: 'truck_photos', label: 'Truck Photos' },
              { field: 'truck_inspection', label: 'Truck Inspection' },
            ] as { field: keyof OnboardingStatus; label: string; showOwnerToggle?: boolean }[]).map(({ field, label, showOwnerToggle }) => {
              const current = (status[field] as string) ?? 'not_started';
              const isRequesting = requestingDoc === field;
              const alreadyRequested = current === 'requested';
              const received = current === 'received';
              const files = docFiles[field as string] ?? [];
              const fileCount = files.length;
              const isTruckPhotos = field === 'truck_photos';

              const markReceivedHandler = async () => {
                if (!statusId) return;
                setMarkingReceived(field as string);
                try {
                  const { error: markErr } = await supabase.from('onboarding_status').update({ [field]: 'received' }).eq('id', statusId);
                  if (markErr) throw markErr;
                   const updated = { ...status, [field]: 'received' };
                  setStatus(prev => ({ ...prev, [field]: 'received' }));
                  savedMilestones.current = { ...savedMilestones.current, [field as string]: 'received' };
                  if (
                    updated.form_2290 === 'received' &&
                    updated.truck_title === 'received' &&
                    updated.truck_photos === 'received' &&
                    updated.truck_inspection === 'received'
                  ) {
                    setCollapsedStages(prev => { const next = new Set(prev); next.add('stage2'); return next; });
                  }
                  if (operatorUserId) {
                    await supabase.from('notifications').insert({
                      user_id: operatorUserId,
                      type: 'doc_received',
                      title: `Your ${DOC_LABELS[field as string] ?? label} has been received`,
                      body: `Your ${DOC_LABELS[field as string] ?? label} has been reviewed and received by your onboarding coordinator.`,
                      channel: 'in_app',
                      link: '/operator?tab=documents',
                    });
                  }
                  toast({ title: `✅ ${label} marked received`, description: `${operatorName} has been notified.` });
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                } finally {
                  setMarkingReceived(null);
                }
              };

              return (
                <div key={field as string} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
                    {fileCount > 0 && (
                      isTruckPhotos ? (
                        /* Truck photos → open visual grid */
                        <button
                          onClick={() => setTruckPhotoGridOpen(true)}
                          className="flex items-center gap-1 text-[11px] font-medium text-info hover:text-info/80 transition-colors cursor-pointer leading-none"
                        >
                          <Paperclip className="h-3 w-3" />
                          {fileCount} {fileCount === 1 ? 'photo' : 'photos'} — View Grid
                        </button>
                      ) : (
                        /* Other docs → generic popover */
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 text-[11px] font-medium text-info hover:text-info/80 transition-colors cursor-pointer leading-none">
                              <Paperclip className="h-3 w-3" />
                              {fileCount} {fileCount === 1 ? 'file' : 'files'} uploaded
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="top" align="start" className="w-72 p-0">
                            <div className="p-3 border-b border-border">
                              <p className="text-xs font-semibold text-foreground">{label} — Uploaded Files</p>
                            </div>
                            <ul className="divide-y divide-border max-h-48 overflow-y-auto">
                              {files.map(f => (
                                <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate max-w-[160px]">
                                      {f.file_name ?? 'Unnamed file'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {format(new Date(f.uploaded_at), 'MMM d, yyyy')}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {f.file_url ? (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const raw = f.file_url!;
                                          const path = raw.includes('/operator-documents/')
                                            ? decodeURIComponent(raw.split('/operator-documents/')[1].split('?')[0])
                                            : raw;
                                          const { data } = await supabase.storage.from('operator-documents').createSignedUrl(path, 3600);
                                          if (data?.signedUrl) {
                                            setStage2Preview({ url: data.signedUrl, name: f.file_name ?? 'Document', docType: field as string });
                                          } else {
                                            toast({ title: 'Could not load document preview', variant: 'destructive' });
                                          }
                                        }}
                                        className="flex items-center gap-1 text-[11px] text-gold hover:text-gold-light font-medium"
                                      >
                                        View <ZoomIn className="h-3 w-3" />
                                      </button>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">No URL</span>
                                    )}
                                    <button
                                      type="button"
                                      disabled={deletingDocId === f.id}
                                      onClick={async () => {
                                        if (deletingDocId) return;
                                        setDeletingDocId(f.id);
                                        try {
                                          // Extract storage path from signed URL
                                          const urlObj = new URL(f.file_url ?? '');
                                          const pathMatch = urlObj.pathname.match(/\/object\/sign\/operator-documents\/(.+)/);
                                          if (pathMatch) {
                                            await supabase.storage.from('operator-documents').remove([decodeURIComponent(pathMatch[1])]);
                                          }
                                          const { error } = await supabase.from('operator_documents').delete().eq('id', f.id);
                                          if (error) throw error;
                                          setDocFiles(prev => ({
                                            ...prev,
                                            [field as string]: (prev[field as string] ?? []).filter(d => d.id !== f.id),
                                          }));
                                          toast({ title: 'File deleted', description: `${f.file_name ?? 'File'} removed.` });
                                        } catch (err: unknown) {
                                          const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as Record<string, unknown>).message) : 'Unknown error';
                                          toast({ title: 'Delete failed', description: msg, variant: 'destructive' });
                                        } finally {
                                          setDeletingDocId(null);
                                        }
                                      }}
                                      className="text-destructive/60 hover:text-destructive transition-colors"
                                    >
                                      {deletingDocId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            {!received && (
                              <div className="p-2 border-t border-border">
                                <button
                                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-status-complete bg-status-complete/10 hover:bg-status-complete/20 border border-status-complete/30 rounded-md py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={markingReceived === (field as string)}
                                  onClick={markReceivedHandler}
                                >
                                  {markingReceived === (field as string)
                                    ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                    : <CheckCircle2 className="h-3 w-3" />
                                  }
                                  {markingReceived === (field as string) ? 'Saving…' : 'Mark as Received'}
                                </button>
                              </div>
                            )}
                            {received && (
                              <div className="p-2 border-t border-border flex items-center justify-center gap-1.5 text-[11px] font-semibold text-status-complete">
                                <CheckCircle2 className="h-3 w-3" /> Already marked received
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      )
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <Select value={current} onValueChange={v => updateStatus(field, v)}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {docOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-9 px-2.5 text-xs gap-1 shrink-0 transition-colors ${
                        received
                          ? 'border-status-complete/40 text-status-complete bg-status-complete/5 cursor-default'
                          : alreadyRequested
                          ? 'border-gold/40 text-gold bg-gold/5 cursor-default'
                          : 'border-info/40 text-info hover:bg-info/10'
                      }`}
                      disabled={isRequesting || alreadyRequested || received}
                      onClick={() => handleRequestDoc(field, label)}
                      title={received ? 'Document received' : alreadyRequested ? 'Already requested' : `Request ${label} from operator`}
                    >
                      {isRequesting ? (
                        <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      ) : received ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                      <span>{received ? 'Received' : alreadyRequested ? 'Requested' : 'Request'}</span>
                    </Button>
                  </div>
                  {/* Staff upload for non-photo docs */}
                  {!isTruckPhotos && (
                    <Stage2DocUploader
                      operatorId={operatorId}
                      docType={field as string}
                      label={label}
                      existingFiles={files}
                      onFilesAdded={(newFiles) => {
                        setDocFiles(prev => ({
                          ...prev,
                          [field as string]: [...newFiles, ...(prev[field as string] ?? [])],
                        }));
                      }}
                    />
                  )}
                  {/* Owner-provided 2290 toggle */}
                  {showOwnerToggle && (
                    <div className="flex items-center gap-2 mt-1">
                      <Switch
                        id="form-2290-owner-provided"
                        checked={!!status.form_2290_owner_provided}
                        onCheckedChange={async (checked) => {
                          setStatus(prev => ({ ...prev, form_2290_owner_provided: checked }));
                          if (statusId) {
                            await supabase.from('onboarding_status').update({ form_2290_owner_provided: checked }).eq('id', statusId);
                          }
                        }}
                      />
                      <Label htmlFor="form-2290-owner-provided" className="text-xs text-muted-foreground cursor-pointer">
                        Operator provided own 2290
                      </Label>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Truck Photo Grid Modal */}
            <TruckPhotoGridModal
              open={truckPhotoGridOpen}
              onClose={() => setTruckPhotoGridOpen(false)}
              files={docFiles['truck_photos'] ?? []}
              alreadyReceived={status.truck_photos === 'received'}
              isMarkingReceived={markingReceived === 'truck_photos'}
              onMarkReceived={async () => {
                if (!statusId) return;
                setMarkingReceived('truck_photos');
                try {
                  const { error: photoErr } = await supabase.from('onboarding_status').update({ truck_photos: 'received' }).eq('id', statusId);
                  if (photoErr) throw photoErr;
                  setStatus(prev => ({ ...prev, truck_photos: 'received' }));
                  savedMilestones.current = { ...savedMilestones.current, truck_photos: 'received' };
                  if (operatorUserId) {
                    await supabase.from('notifications').insert({
                      user_id: operatorUserId,
                      type: 'doc_received',
                      title: 'Your Truck Photos have been received',
                      body: 'Your truck photos have been reviewed and received by your onboarding coordinator.',
                      channel: 'in_app',
                      link: '/operator?tab=documents',
                    });
                  }
                  toast({ title: '✅ Truck Photos marked received', description: `${operatorName} has been notified.` });
                  setTruckPhotoGridOpen(false);
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                } finally {
                  setMarkingReceived(null);
                }
              }}
            />

            {/* Documents Notes */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documents Notes</Label>
              <Textarea
                value={status.doc_notes ?? ''}
                onChange={e => setStatus(prev => ({ ...prev, doc_notes: e.target.value || null }))}
                placeholder="e.g. registration type clarification, inspection notes, any follow-up…"
                className="text-sm min-h-[72px] resize-none"
              />
            </div>
          </div>
          )}
        </div>
          );
        })()}

        {/* Stage 3 — ICA */}
        {(() => {
          const s3Complete = status.ica_status === 'complete';
          const s3Collapsed = collapsedStages.has('stage3');
          return (
            <div ref={el => { stageRefs.current['stage3'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s3Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage3')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <FileCheck className={`h-4 w-4 ${s3Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 3 — ICA</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s3Complete
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>
                    : status.ica_status === 'sent_for_signature'
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />Awaiting Signature</span>
                    : status.ica_status === 'in_progress'
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />Draft In Progress</span>
                    : null
                  }
                  {s3Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s3Collapsed && (
                <div className="px-5 pb-5 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ICA Status</Label>
              <Select
                value={(status.ica_status as string) || undefined}
                onValueChange={v => {
                  updateStatus('ica_status', v);
                  if (v === 'complete') {
                    setCollapsedStages(prev => { const next = new Set(prev); next.add('stage3'); return next; });
                  }
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {icaOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {status.pe_screening_result !== 'clear' && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                ℹ️ PE Screening is still pending. You may proceed with the ICA.
              </div>
            )}

            {/* Date fields */}
            {(status.ica_status === 'sent_for_signature' || status.ica_status === 'complete') && (
              <div className="pl-3 border-l-2 border-gold/30 space-y-2">
                <StageDatePicker
                  label="ICA Sent Date"
                  value={status.ica_sent_date}
                  onChange={v => updateStatus('ica_sent_date', v)}
                />
                {status.ica_status === 'complete' && (
                  <StageDatePicker
                    label="ICA Signed Date"
                    value={status.ica_signed_date}
                    onChange={v => updateStatus('ica_signed_date', v)}
                  />
                )}
              </div>
            )}

            {/* In-progress draft banner */}
            {status.ica_status === 'in_progress' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-status-progress/10 border border-status-progress/30">
                <Clock className="h-3.5 w-3.5 text-status-progress shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-status-progress">ICA draft in progress</p>
                  {icaDraftUpdatedAt && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Last saved {formatDistanceToNow(new Date(icaDraftUpdatedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {status.ica_status !== 'complete' && (
              <Button
                variant="outline"
                size="sm"
                className={`w-full text-xs gap-1.5 ${
                  status.ica_status === 'in_progress'
                    ? 'border-status-progress text-status-progress hover:bg-status-progress/10'
                    : 'border-gold text-gold hover:bg-gold/10'
                }`}
                onClick={() => setShowICABuilder(true)}
              >
                {status.ica_status === 'in_progress' ? (
                  <><Clock className="h-3.5 w-3.5" /> Continue ICA Draft</>
                ) : status.ica_status === 'sent_for_signature' ? (
                  <><FilePen className="h-3.5 w-3.5" /> View / Edit ICA</>
                ) : (
                  <><FilePen className="h-3.5 w-3.5" /> Prepare ICA</>
                )}
              </Button>
            )}
            {status.ica_status === 'complete' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-complete/10 border border-status-complete/30">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
                  <span className="text-xs text-status-complete font-medium">ICA Fully Executed</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-border text-foreground hover:bg-secondary text-xs gap-1.5"
                  onClick={() => setShowICAView(true)}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  View Executed ICA
                </Button>
              </div>
            )}
            {status.ica_status === 'sent_for_signature' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-border text-foreground hover:bg-secondary text-xs gap-1.5"
                onClick={() => setShowICAView(true)}
              >
                <FileCheck className="h-3.5 w-3.5" />
                View Sent ICA
              </Button>
            )}

            {/* ICA Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ICA Notes</Label>
              <Textarea
                value={status.ica_notes ?? ''}
                onChange={e => updateStatus('ica_notes', e.target.value || null)}
                placeholder="e.g. negotiated terms, signing issues, follow-up needed…"
                className="text-sm min-h-[72px] resize-none"
              />
            </div>

            {/* Lease Termination — Appendix C */}
            <div className="pt-2 border-t border-border/60 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Lease Termination
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setShowTerminationBuilder(true)}
              >
                <FileSignature className="h-3.5 w-3.5" />
                Generate Lease Termination (Appendix C)
              </Button>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Sign with your saved Carrier Signature, then notify the insurance company.
              </p>
            </div>

            {/* Void ICA — available when a contract has been issued or is in-progress draft */}
            {(status.ica_status === 'in_progress' || status.ica_status === 'sent_for_signature' || status.ica_status === 'complete') && (
              <div className="pt-1 border-t border-border">
                {!showVoidConfirm ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive text-xs gap-1.5"
                    onClick={() => setShowVoidConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {status.ica_status === 'in_progress' ? 'Discard Draft' : 'Void ICA & Re-issue'}
                  </Button>
                ) : (
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/30 space-y-3">
                    <p className="text-xs font-medium text-destructive">
                      {status.ica_status === 'in_progress'
                        ? '⚠ This will delete the in-progress draft and reset status to "Not Issued".'
                        : '⚠ This will permanently delete the current ICA contract and reset the status to "Not Issued". This cannot be undone.'}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 text-xs h-7 gap-1.5"
                        onClick={handleVoidICA}
                        disabled={voidingICA}
                      >
                        <Trash2 className="h-3 w-3" />
                        {voidingICA ? 'Discarding…' : status.ica_status === 'in_progress' ? 'Yes, Discard' : 'Yes, Void ICA'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-7"
                        onClick={() => setShowVoidConfirm(false)}
                        disabled={voidingICA}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 4 — Missouri Registration (always visible) */}
        {(() => {
          const isNa = status.registration_status === 'own_registration';
          const s4Complete = status.mo_reg_received === 'yes';
          const s4Collapsed = collapsedStages.has('stage4');
          return (
            <div ref={el => { stageRefs.current['stage4'] = el; }} className={`border rounded-xl shadow-sm transition-colors ${isNa ? 'bg-muted/40 border-border opacity-60' : s4Complete ? 'bg-white border-status-complete' : 'bg-white border-border'}`}>
              <button onClick={() => toggleStage('stage4')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <FileCheck className={`h-4 w-4 ${isNa ? 'text-muted-foreground' : s4Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className={`font-semibold text-sm ${isNa ? 'text-muted-foreground' : 'text-foreground'}`}>Stage 4 — Missouri Registration</h3>
                </div>
                <div className="flex items-center gap-2">
                  {isNa && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">N/A — O/O Has Own Registration</span>}
                  {!isNa && (s4Complete
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>
                    : status.mo_docs_submitted === 'submitted'
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />Docs Submitted</span>
                    : null
                  )}
                  {s4Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s4Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  {isNa ? (
                    <p className="text-xs text-muted-foreground italic">This operator uses their own registration — Missouri registration is not required.</p>
                  ) : (
                    <>
                      <div className="p-3 rounded-lg bg-status-progress/10 border border-status-progress/30 text-xs text-status-progress">
                        ⚠ Missouri requires Title + Form 2290 + signed ICA submitted together. Partial submissions are not accepted. ICA must be Complete before submitting.
                      </div>
                      <SelectField label="MO Docs Submitted" field="mo_docs_submitted" options={moDocsOptions} />
                      {status.mo_docs_submitted === 'submitted' && (
                        <StageDatePicker
                          label="MO Docs Submitted Date"
                          value={status.mo_docs_submitted_date ?? null}
                          onChange={v => updateStatus('mo_docs_submitted_date', v)}
                        />
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Approval Date</Label>
                        <DateInput value={status.mo_expected_approval_date ?? ''} onChange={v => updateStatus('mo_expected_approval_date', v || null)} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MO Registration Received</Label>
                        <Select value={status.mo_reg_received ?? ''} onValueChange={v => {
                          updateStatus('mo_reg_received', v);
                          if (v === 'yes') {
                            setCollapsedStages(prev => { const next = new Set(prev); next.add('stage4'); return next; });
                          }
                        }}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{moRegOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MO Registration Notes</Label>
                        <Textarea
                          value={status.mo_notes ?? ''}
                          onChange={e => updateStatus('mo_notes', e.target.value || null)}
                          placeholder="e.g. submission date, vendor, tracking number, any issues…"
                          className="text-sm min-h-[80px] resize-none"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 5 — Equipment */}
        {(() => {
          const allEquipmentReady = status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes';
          const exceptionActiveS5 = (status.paper_logbook_approved || status.temp_decal_approved) && !allEquipmentReady;
          const showExceptionBlock = status.decal_method === 'supertransport_shop' || status.eld_method === 'supertransport_shop';
          const s5Collapsed = collapsedStages.has('stage5');
          const borderCls = allEquipmentReady ? 'border-status-complete' : exceptionActiveS5 ? 'border-gold' : 'border-border';
          return (
            <div ref={el => { stageRefs.current['stage5'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${borderCls}`}>
              <button onClick={() => toggleStage('stage5')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Truck className={`h-4 w-4 ${allEquipmentReady ? 'text-status-complete' : exceptionActiveS5 ? 'text-gold' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 5 — Equipment Setup</h3>
                </div>
                <div className="flex items-center gap-2">
                  {allEquipmentReady
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />All Equipment Ready</span>
                    : exceptionActiveS5
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><AlertTriangle className="h-3 w-3" />Exception Active</span>
                    : (() => {
                        const done = [
                          status.decal_applied === 'yes',
                          status.eld_installed === 'yes',
                          status.fuel_card_issued === 'yes',
                        ].filter(Boolean).length;
                        return done > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />{done}/3 done</span>
                        ) : null;
                      })()
                  }
                  {s5Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s5Collapsed && (
                <div className="px-5 pb-5 space-y-4">

                  {/* Assigned Unit Number — placed above Truck Decals */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Unit Number</Label>
                    <Input
                      value={status.unit_number ?? ''}
                      onChange={e => updateStatus('unit_number', e.target.value || null)}
                      placeholder="e.g. 301"
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* Truck Decals section */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Truck Decals</p>
                    <SelectField label="Truck Decals — Install Method" field="decal_method" options={methodOptions} />
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Decal Applied</Label>
                      <Select value={(status.decal_applied as string) || undefined} onValueChange={v => { updateStatus('decal_applied', v); if (v === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' && status.eld_serial_number && status.dash_cam_number && status.bestpass_number && status.fuel_card_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{yesNoOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    {/* Decal photo thumbnails — shown once decal is applied */}
                    {status.decal_applied === 'yes' && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Decal Install Photos</p>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Driver Side */}
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Driver Side</p>
                            {status.decal_photo_ds_url ? (
                              <a href={status.decal_photo_ds_url} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={status.decal_photo_ds_url} alt="Decal — Driver Side" className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                              </a>
                            ) : (
                              <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center">
                                <span className="text-[11px] text-muted-foreground">No photo yet</span>
                              </div>
                            )}
                          </div>
                          {/* Passenger Side */}
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Passenger Side</p>
                            {status.decal_photo_ps_url ? (
                              <a href={status.decal_photo_ps_url} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={status.decal_photo_ps_url} alt="Decal — Passenger Side" className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                              </a>
                            ) : (
                              <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center">
                                <span className="text-[11px] text-muted-foreground">No photo yet</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {(!status.decal_photo_ds_url || !status.decal_photo_ps_url) && (
                          <p className="text-[11px] text-muted-foreground italic">Operator uploads decal photos from their portal after installation.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ELD section */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">ELD</p>

                    {/* ELD Exempt toggle (pre-2000 trucks, FMCSA §395.8(a)(1)(iii)) */}
                    <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={status.eld_exempt ?? false}
                          onChange={e => {
                            const checked = e.target.checked;
                            updateStatus('eld_exempt' as any, checked as any);
                            if (checked && !status.eld_exempt_reason) {
                              updateStatus('eld_exempt_reason' as any, ELD_EXEMPT_DEFAULT_REASON as any);
                            }
                          }}
                          className="rounded border-border h-4 w-4 mt-0.5"
                        />
                        <span className="flex-1">
                          <span className="text-xs font-semibold text-foreground block">ELD Exempt — Pre-2000 truck (paper logs allowed)</span>
                          <span className="text-[11px] text-muted-foreground block mt-0.5">FMCSA §395.8(a)(1)(iii). When on, ELD device + Dash Cam are not required for Stage 5 completion.</span>
                        </span>
                      </label>
                      {!status.eld_exempt && looksPre2000((status as any).truck_year) && (
                        <div className="flex items-start gap-1.5 p-2 rounded bg-gold/10 border border-gold/30">
                          <AlertTriangle className="h-3.5 w-3.5 text-gold shrink-0 mt-0.5" />
                          <p className="text-[11px] text-gold-muted font-medium">This truck appears to be pre-2000 ({(status as any).truck_year}). Consider enabling ELD Exempt.</p>
                        </div>
                      )}
                      {status.eld_exempt && (
                        <div className="space-y-1.5 pt-1">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exemption Reason</Label>
                          <Textarea
                            value={status.eld_exempt_reason ?? ''}
                            onChange={e => updateStatus('eld_exempt_reason' as any, (e.target.value || null) as any)}
                            placeholder="e.g. Pre-2000 truck — paper logs in use under FMCSA §395.8(a)(1)(iii)"
                            className="text-sm min-h-[48px] resize-none"
                          />
                          <div className="flex items-center gap-1.5 p-2 rounded bg-gold/10 border border-gold/30">
                            <span className="text-base">🛡️</span>
                            <p className="text-[11px] text-gold-muted font-medium">ELD Exempt — Paper logs in use. ELD/Dash Cam serial numbers are not required.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {!status.eld_exempt && (
                      <>
                    <SelectField label="ELD Install Method" field="eld_method" options={methodOptions} />
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ELD Installed</Label>
                      <Select value={(status.eld_installed as string) || undefined} onValueChange={v => { updateStatus('eld_installed', v); if (v === 'yes' && status.decal_applied === 'yes' && status.fuel_card_issued === 'yes' && status.eld_serial_number && status.dash_cam_number && status.bestpass_number && status.fuel_card_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{yesNoOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                      </>
                    )}
                  </div>

                  {/* Shop Visit Exceptions — shown when either method is supertransport_shop */}
                  {showExceptionBlock && (
                    <div className="space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-3">
                      <p className="text-[11px] font-semibold text-gold-muted uppercase tracking-wider pb-1 border-b border-gold/30">Shop Visit Exceptions</p>
                      <p className="text-[11px] text-muted-foreground">Grant dispatch exceptions for operators traveling to the SUPERTRANSPORT shop for installation. The operator may run loads while en route.</p>
                      {status.eld_method === 'supertransport_shop' && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={status.paper_logbook_approved ?? false}
                            onChange={e => updateStatus('paper_logbook_approved', e.target.checked as any)}
                            className="rounded border-border h-4 w-4"
                          />
                          <span className="text-xs font-medium text-foreground">Paper Logbook Approved <span className="font-normal text-muted-foreground">(ELD pending shop install)</span></span>
                        </label>
                      )}
                      {status.decal_method === 'supertransport_shop' && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={status.temp_decal_approved ?? false}
                            onChange={e => updateStatus('temp_decal_approved', e.target.checked as any)}
                            className="rounded border-border h-4 w-4"
                          />
                          <span className="text-xs font-medium text-foreground">Temporary Decals Approved <span className="font-normal text-muted-foreground">(permanent decal pending shop visit)</span></span>
                        </label>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exception Notes</Label>
                        <Textarea
                          value={status.exception_notes ?? ''}
                          onChange={e => updateStatus('exception_notes', e.target.value || null)}
                          placeholder="e.g. Coming from Tennessee, ~800 miles. Cleared to run 2 loads before arriving at shop."
                          className="text-sm min-h-[64px] resize-none"
                        />
                      </div>
                      {(status.paper_logbook_approved || status.temp_decal_approved) && (
                        <div className="flex items-center gap-1.5 p-2 rounded bg-gold/10 border border-gold/30">
                          <AlertTriangle className="h-3.5 w-3.5 text-gold shrink-0" />
                          <p className="text-[11px] text-gold-muted font-medium">Exception active — operator is approved with conditions until shop visit is complete.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fuel Card */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Fuel Card</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fuel Card Issued</Label>
                       <Select value={(status.fuel_card_issued as string) || undefined} onValueChange={v => { updateStatus('fuel_card_issued', v); if (v === 'yes' && status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.eld_serial_number && status.dash_cam_number && status.bestpass_number && status.fuel_card_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{yesNoOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fuel Card Number</Label>
                      <Input
                        value={status.fuel_card_number ?? ''}
                        onChange={e => updateStatus('fuel_card_number' as any, e.target.value || null)}
                        onBlur={e => { const v = e.target.value; if (v && status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' && status.eld_serial_number && status.dash_cam_number && status.bestpass_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}
                        placeholder="e.g. 301"
                        maxLength={3}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Device Numbers */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Assigned Device Numbers</p>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ELD Serial Number</Label>
                        <Input
                          value={status.eld_serial_number ?? ''}
                          onChange={e => updateStatus('eld_serial_number' as any, e.target.value || null)}
                          onBlur={e => { const v = e.target.value; if (v && status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' && status.dash_cam_number && status.bestpass_number && status.fuel_card_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}
                          placeholder="e.g. ELD-12345678"
                          maxLength={15}
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dash Camera Number</Label>
                        <Input
                          value={status.dash_cam_number ?? ''}
                          onChange={e => updateStatus('dash_cam_number' as any, e.target.value || null)}
                          onBlur={e => { const v = e.target.value; if (v && status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' && status.eld_serial_number && status.bestpass_number && status.fuel_card_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}
                          placeholder="e.g. CAM-98765432"
                          maxLength={15}
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">BestPass Number</Label>
                        <Input
                          value={status.bestpass_number ?? ''}
                          onChange={e => updateStatus('bestpass_number' as any, e.target.value || null)}
                          onBlur={e => { const v = e.target.value; if (v && status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes' && status.eld_serial_number && status.dash_cam_number && status.fuel_card_number) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage5'); return next; }); } }}
                          placeholder="e.g. BP-00112233"
                          maxLength={15}
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 6 — Insurance */}
        {(() => {
          const s6Complete = !!status.insurance_added_date;
          const s6Collapsed = collapsedStages.has('stage6');
          const addToPolicy = status.insurance_policy_type === 'add_to_supertransport' || !status.insurance_policy_type;
          return (
            <div ref={el => { stageRefs.current['stage6'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s6Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage6')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${s6Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 6 — Insurance</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s6Complete
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>
                    : !addToPolicy
                    ? (() => {
                        const certOnFile = (docFiles['insurance_cert'] ?? []).length > 0;
                        return certOnFile
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><CheckCircle2 className="h-3 w-3" />Cert on File</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><AlertTriangle className="h-3 w-3" />Cert Needed</span>;
                      })()
                    : status.insurance_policy_type === 'add_to_supertransport' && status.insurance_stated_value
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/10 text-gold-muted border border-gold/30"><Clock className="h-3 w-3" />Value on File</span>
                    : null
                  }
                  {s6Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s6Collapsed && (
                <div className="px-5 pb-5 space-y-4">

                  {/* Physical Damage Insurance */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Physical Damage Insurance</p>

                    {/* Policy type selector */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coverage Type</Label>
                      <Select
                        value={status.insurance_policy_type ?? 'add_to_supertransport'}
                        onValueChange={v => updateStatus('insurance_policy_type', v)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add_to_supertransport">Add to SUPERTRANSPORT Policy</SelectItem>
                          <SelectItem value="own_policy">O/O Has Own Policy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Add to SUPERTRANSPORT policy — stated value */}
                    {addToPolicy && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stated Value of Truck (USD)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input
                            type="number"
                            min={0}
                            value={status.insurance_stated_value ?? ''}
                            onChange={e => updateStatus('insurance_stated_value' as any, e.target.value ? Number(e.target.value) : null as any)}
                            placeholder="e.g. 75000"
                            className="h-9 text-sm pl-6"
                          />
                        </div>
                      </div>
                    )}

                    {/* Own policy — show uploaded cert if present, else prompt */}
                    {!addToPolicy && (
                      <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground space-y-2">
                        <p className="font-medium text-foreground">O/O Submitting Own Policy</p>
                        {(docFiles['insurance_cert'] ?? []).length > 0 ? (
                          <div className="space-y-1.5">
                            <p className="text-status-complete font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Certificate uploaded — verify before marking insurance complete.
                            </p>
                            {(docFiles['insurance_cert'] ?? []).map(f => (
                              <div key={f.id} className="flex items-center gap-1.5 flex-wrap">
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate flex-1">{f.file_name ?? 'certificate'}</span>
                                <span className="text-muted-foreground/70">{new Date(f.uploaded_at).toLocaleDateString()}</span>
                                {f.file_url && (
                                  <button
                                    className="text-gold hover:underline flex items-center gap-0.5 shrink-0"
                                    onClick={async () => {
                                      const raw = f.file_url!;
                                      const path = raw.includes('/operator-documents/')
                                        ? decodeURIComponent(raw.split('/operator-documents/')[1].split('?')[0])
                                        : raw;
                                      const { data } = await supabase.storage
                                        .from('operator-documents')
                                        .createSignedUrl(path, 3600);
                                      if (data?.signedUrl) {
                                        setStage2Preview({ url: data.signedUrl, name: f.file_name ?? 'Insurance Certificate', docType: 'insurance_cert' });
                                      }
                                    }}
                                  >
                                    View <Eye className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p>The operator should upload a copy of their Physical Damage policy via the Documents section. Verify the certificate is on file before marking insurance complete.</p>
                        )}
                      </div>
                    )}

                    {/* Additional Insured / Certificate Holder */}
                    {/* ─── ADDITIONAL INSURED ───────────────────────────── */}
                    <div className="rounded-lg border border-border bg-muted/30">
                      <button
                        type="button"
                        onClick={() => setAiExpanded(p => !p)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                      >
                        <span className="flex items-center gap-1.5">
                          {status.insurance_ai_company && (
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Additional Insured on file" />
                          )}
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Additional Insured <span className="normal-case font-normal">(if truck is financed)</span>
                            {status.insurance_ai_company && (
                              <span className="ml-1.5 normal-case font-normal text-foreground/70">— {status.insurance_ai_company}</span>
                            )}
                          </p>
                        </span>
                        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', aiExpanded && 'rotate-180')} />
                      </button>
                      {aiExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Company Name</Label>
                            <Input value={status.insurance_ai_company ?? ''} onChange={e => updateStatus('insurance_ai_company', e.target.value || null)} placeholder="Lender / lienholder name" className="h-9 text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Address</Label>
                            <Input value={status.insurance_ai_address ?? ''} onChange={e => updateStatus('insurance_ai_address', e.target.value || null)} placeholder="Street address" className="h-9 text-sm" />
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            <div className="col-span-3 space-y-1.5">
                              <Label className="text-xs text-muted-foreground">City</Label>
                              <Input value={status.insurance_ai_city ?? ''} onChange={e => updateStatus('insurance_ai_city', e.target.value || null)} placeholder="City" className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">State</Label>
                              <Input value={status.insurance_ai_state ?? ''} onChange={e => updateStatus('insurance_ai_state', e.target.value || null)} placeholder="ST" maxLength={2} className="h-9 text-sm uppercase" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">ZIP</Label>
                              <Input value={status.insurance_ai_zip ?? ''} onChange={e => updateStatus('insurance_ai_zip', e.target.value || null)} placeholder="ZIP" className="h-9 text-sm" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Email <span className="font-normal normal-case">(so insurance co. can send them a copy)</span></Label>
                            <Input type="email" value={status.insurance_ai_email ?? ''} onChange={e => updateStatus('insurance_ai_email', e.target.value || null)} placeholder="lender@example.com" className="h-9 text-sm" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ─── CERTIFICATE HOLDER ───────────────────────────── */}
                    <div className="rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          {(chSameAsAI ? status.insurance_ai_company : status.insurance_ch_company) && (
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Certificate Holder on file" />
                          )}
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Certificate Holder
                            {(chSameAsAI ? status.insurance_ai_company : status.insurance_ch_company) && (
                              <span className="ml-1.5 normal-case font-normal text-foreground/70">— {chSameAsAI ? status.insurance_ai_company : status.insurance_ch_company}</span>
                            )}
                          </p>
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={chSameAsAI}
                              onChange={e => {
                                const checked = e.target.checked;
                                setChSameAsAI(checked);
                                setStatus(prev => ({ ...prev, insurance_ch_same_as_ai: checked }));
                                if (checked) {
                                  updateStatus('insurance_ch_company', status.insurance_ai_company ?? null);
                                  updateStatus('insurance_ch_address', status.insurance_ai_address ?? null);
                                  updateStatus('insurance_ch_city',    status.insurance_ai_city    ?? null);
                                  updateStatus('insurance_ch_state',   status.insurance_ai_state   ?? null);
                                  updateStatus('insurance_ch_zip',     status.insurance_ai_zip     ?? null);
                                  updateStatus('insurance_ch_email',   status.insurance_ai_email   ?? null);
                                }
                              }}
                              className="rounded border-border"
                            />
                            <span className="text-[11px] text-muted-foreground">Same as AI</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setChExpanded(p => !p)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', chExpanded && 'rotate-180')} />
                          </button>
                        </div>
                      </div>
                      {chExpanded && !chSameAsAI && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Company Name</Label>
                            <Input value={status.insurance_ch_company ?? ''} onChange={e => updateStatus('insurance_ch_company', e.target.value || null)} placeholder="Certificate holder name" className="h-9 text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Address</Label>
                            <Input value={status.insurance_ch_address ?? ''} onChange={e => updateStatus('insurance_ch_address', e.target.value || null)} placeholder="Street address" className="h-9 text-sm" />
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            <div className="col-span-3 space-y-1.5">
                              <Label className="text-xs text-muted-foreground">City</Label>
                              <Input value={status.insurance_ch_city ?? ''} onChange={e => updateStatus('insurance_ch_city', e.target.value || null)} placeholder="City" className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">State</Label>
                              <Input value={status.insurance_ch_state ?? ''} onChange={e => updateStatus('insurance_ch_state', e.target.value || null)} placeholder="ST" maxLength={2} className="h-9 text-sm uppercase" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">ZIP</Label>
                              <Input value={status.insurance_ch_zip ?? ''} onChange={e => updateStatus('insurance_ch_zip', e.target.value || null)} placeholder="ZIP" className="h-9 text-sm" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Email <span className="font-normal normal-case">(so insurance co. can send them a copy)</span></Label>
                            <Input type="email" value={status.insurance_ch_email ?? ''} onChange={e => updateStatus('insurance_ch_email', e.target.value || null)} placeholder="cert-holder@example.com" className="h-9 text-sm" />
                          </div>
                        </div>
                      )}
                      {chExpanded && chSameAsAI && (
                        <div className="px-3 pb-3 border-t border-border pt-2">
                          <p className="text-[11px] text-muted-foreground italic">Same as Additional Insured — no separate entry needed.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Send to Insurance Company */}
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Email Insurance Company</p>

                    {/* Recipient email management */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Insurance Company Recipients</Label>
                      <p className="text-[11px] text-muted-foreground">These addresses are saved globally and used for all insurance requests.</p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          value={insuranceEmailInput}
                          onChange={e => setInsuranceEmailInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && insuranceEmailInput.trim()) {
                              e.preventDefault();
                              const email = insuranceEmailInput.trim().toLowerCase();
                              if (!insuranceEmailRecipients.includes(email)) {
                                setInsuranceEmailRecipients(prev => [...prev, email]);
                              }
                              setInsuranceEmailInput('');
                            }
                          }}
                          placeholder="insurance@example.com"
                          className="h-8 text-xs flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs px-3"
                          onClick={() => {
                            const email = insuranceEmailInput.trim().toLowerCase();
                            if (email && !insuranceEmailRecipients.includes(email)) {
                              setInsuranceEmailRecipients(prev => [...prev, email]);
                            }
                            setInsuranceEmailInput('');
                          }}
                        >
                          Add
                        </Button>
                      </div>
                      {insuranceEmailRecipients.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {insuranceEmailRecipients.map(email => (
                            <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-foreground">
                              {email}
                              <button
                                onClick={() => setInsuranceEmailRecipients(prev => prev.filter(e => e !== email))}
                                className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={handleSaveInsuranceEmails}
                        disabled={savingInsuranceEmails}
                      >
                        {savingInsuranceEmails ? <><div className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" /> Saving…</> : <><Check className="h-3.5 w-3.5" /> Save Recipients</>}
                      </Button>
                    </div>

                    {/* Insurance notes */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Insurance Notes</Label>
                      <Textarea
                        value={status.insurance_notes ?? ''}
                        onChange={e => updateStatus('insurance_notes', e.target.value || null)}
                        placeholder="e.g. policy number, agent contact, additional instructions…"
                        className="text-sm min-h-[72px] resize-none"
                      />
                    </div>

                    {/* Send email button */}
                    <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
                      <p className="text-xs font-medium text-foreground">Email Request to Insurer</p>
                      <p className="text-[11px] text-muted-foreground">Sends driver name, DL copy, CMV experience, truck VIN/year/make/model, stated value, and additional insured/certificate holder info to the insurance company.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`w-full text-xs gap-1.5 ${insuranceEmailSent ? 'border-status-complete text-status-complete' : 'border-gold text-gold hover:bg-gold/10'}`}
                        onClick={handleSendInsuranceEmail}
                        disabled={sendingInsuranceEmail || insuranceEmailSent || insuranceEmailRecipients.length === 0}
                      >
                        {sendingInsuranceEmail ? (
                          <><div className="h-3.5 w-3.5 rounded-full border border-current border-t-transparent animate-spin" /> Sending…</>
                        ) : insuranceEmailSent ? (
                          <><CheckCircle2 className="h-3.5 w-3.5" /> Sent!</>
                        ) : (
                          <><Mail className="h-3.5 w-3.5" /> Send to Insurance Company</>
                        )}
                      </Button>
                      {insuranceEmailRecipients.length === 0 && (
                        <p className="text-[11px] text-destructive">Add and save at least one recipient email above before sending.</p>
                      )}
                    </div>
                  </div>

                  {/* Added to insurance date */}
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Confirmation</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Added to Insurance Date</Label>
                      <DateInput
                        value={status.insurance_added_date ?? ''}
                        onChange={v => {
                          updateStatus('insurance_added_date', v || null);
                          if (v) {
                            const goLiveWasEmpty = !status.go_live_date;
                            if (goLiveWasEmpty) {
                              updateStatus('go_live_date', v);
                              toast({ title: 'Go-Live Date set', description: 'Auto-filled from Insurance Date.' });
                            }
                            setCollapsedStages(prev => {
                              const next = new Set(prev);
                              next.add('stage6');
                              if (goLiveWasEmpty || status.go_live_date === v) next.add('stage7');
                              return next;
                            });
                          }
                        }}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  {s6Complete && (
                    <Badge className="status-complete border text-xs w-full justify-center">
                      ✓ FULLY ONBOARDED
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 7 — Go Live & Dispatch Readiness */}
        {(() => {
          const s7Complete = !!status.go_live_date;
          const s7Collapsed = collapsedStages.has('stage7');
          return (
            <div ref={el => { stageRefs.current['stage7'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s7Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage7')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${s7Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 7 — Go Live & Dispatch Readiness</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s7Complete && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Go Live Set</span>
                  )}
                  {s7Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s7Collapsed && (
                <div className="px-5 pb-5 space-y-4">

                  {/* Operator Type & Go-Live Date */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">Go-Live</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Operator Type</Label>
                      <Select value={status.operator_type ?? 'solo'} onValueChange={v => updateStatus('operator_type', v || 'solo')}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solo">Solo Driver</SelectItem>
                          <SelectItem value="team">Team Driver</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <StageDatePicker label="Go-Live Date" value={status.go_live_date ?? null} onChange={v => { updateStatus('go_live_date', v); if (v) { setCollapsedStages(prev => { const next = new Set(prev); next.add('stage7'); return next; }); } }} />
                  </div>

                  {s7Complete && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-status-complete/10 border border-status-complete/30">
                      <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />
                      <span className="text-xs font-semibold text-status-complete">
                        🚛 Go-Live confirmed — {format(new Date(status.go_live_date! + 'T12:00:00'), 'MMMM d, yyyy')}
                        {status.operator_type ? ` · ${status.operator_type === 'solo' ? 'Solo Driver' : 'Team Driver'}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      </div></div>}

      {/* Dispatch Status History */}
      {(status.fully_onboarded || dispatchHistory.length > 0 || currentDispatchStatus) && (<div style={isQuickView ? { order: 12 } : undefined}>{(() => {
        const filteredHistory = historyFilter === 'all'
          ? dispatchHistory
          : dispatchHistory.filter(e => e.dispatch_status === historyFilter);

        // Determine which statuses actually appear in loaded history for chip visibility
        const presentStatuses = new Set(dispatchHistory.map(e => e.dispatch_status));

        return (
          <div className="bg-white border border-border rounded-xl shadow-sm">
            {/* Header */}
            <button onClick={() => toggleStage('dispatch_history')} className="w-full flex items-center justify-between px-5 py-4 text-left">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold" />
                <h3 className="font-semibold text-foreground text-sm">Dispatch Status History</h3>
                {dispatchHistoryTotal > 0 && (
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full border border-border">
                    {dispatchHistoryTotal} {dispatchHistoryTotal === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {currentDispatchStatus && DISPATCH_STATUS_CONFIG[currentDispatchStatus] && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${DISPATCH_STATUS_CONFIG[currentDispatchStatus].badgeClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${DISPATCH_STATUS_CONFIG[currentDispatchStatus].dotClass}`} />
                    Current: {DISPATCH_STATUS_CONFIG[currentDispatchStatus].label}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsedStages.has('dispatch_history') ? '-rotate-90' : ''}`} />
              </div>
            </button>
            {!collapsedStages.has('dispatch_history') && <div className="px-5 pb-5">

            {/* Filter chips — only show when there is history */}
            {dispatchHistory.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => setHistoryFilter('all')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    historyFilter === 'all'
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
                  }`}
                >
                  All
                  <span className="opacity-60 font-normal">{dispatchHistoryTotal}</span>
                </button>
                {Object.entries(DISPATCH_STATUS_CONFIG).map(([key, cfg]) => {
                  if (!presentStatuses.has(key)) return null;
                  const count = dispatchHistory.filter(e => e.dispatch_status === key).length;
                  const active = historyFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setHistoryFilter(active ? 'all' : key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        active
                          ? `${cfg.badgeClass} opacity-100`
                          : 'bg-muted text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                      {cfg.label}
                      <span className={active ? 'opacity-70' : 'opacity-50'} style={{ fontWeight: 400 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">
                  {dispatchHistory.length === 0
                    ? 'No dispatch history recorded yet.'
                    : `No "${DISPATCH_STATUS_CONFIG[historyFilter]?.label ?? historyFilter}" entries in loaded history.`}
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-4">
                  {filteredHistory.map((entry, idx) => {
                    const isAck = entry.status_notes === 'Operator acknowledged truck down alert.';
                    const cfg = DISPATCH_STATUS_CONFIG[entry.dispatch_status] ?? DISPATCH_STATUS_CONFIG['not_dispatched'];
                    const isLatestOverall = historyFilter === 'all' ? idx === 0 : entry.id === dispatchHistory[0]?.id;
                    return (
                      <div key={entry.id} className={`flex gap-4 relative ${isAck ? 'rounded-lg border border-status-complete/25 bg-status-complete/5 px-3 py-2.5 -mx-3' : ''}`}>
                        {/* dot / ack icon */}
                        {isAck ? (
                          <div className="h-3.5 w-3.5 shrink-0 mt-0.5 z-10 flex items-center justify-center">
                            <CheckCheck className="h-3.5 w-3.5 text-status-complete" />
                          </div>
                        ) : (
                          <div className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm shrink-0 mt-0.5 z-10 ${cfg.dotClass}`} />
                        )}
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isAck ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-status-complete/10 text-status-complete border-status-complete/30">
                                <CheckCheck className="h-3 w-3" />
                                Operator Acknowledged
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.badgeClass}`}>
                                {cfg.emoji} {cfg.label}
                              </span>
                            )}
                            {isLatestOverall && !isAck && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">Latest</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {entry.current_load_lane && (
                              <span className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Lane:</span> {entry.current_load_lane}
                              </span>
                            )}
                            {entry.status_notes && !isAck && (
                              <span className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Note:</span> {entry.status_notes}
                              </span>
                            )}
                            {entry.changed_by_name && (
                              <span className={`text-xs ${isAck ? 'text-status-complete/80' : 'text-muted-foreground'}`}>
                                <span className={`font-medium ${isAck ? 'text-status-complete' : 'text-foreground'}`}>By:</span> {entry.changed_by_name}
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] mt-1 ${isAck ? 'text-status-complete/70' : 'text-muted-foreground'}`}>
                            {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                            <span className="ml-1.5 opacity-60">
                              · {new Date(entry.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Load more */}
                {dispatchHistory.length < dispatchHistoryTotal && (
                  <div className="mt-4 pl-[calc(0.875rem+1rem)]">
                    <button
                      onClick={loadMoreHistory}
                      disabled={loadingMoreHistory}
                      className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                    >
                      {loadingMoreHistory ? 'Loading…' : `Load ${Math.min(HISTORY_PAGE_SIZE, dispatchHistoryTotal - dispatchHistory.length)} more`}
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>}
          </div>
        );
      })()}</div>)}


      {/* Stage 8 — Contractor Pay Setup (read-only, uses component-level state) */}
      <div style={isQuickView ? { order: 9 } : undefined}>{(() => {
        const stageKey = 'stage8';
        const isCollapsed = collapsedStages.has(stageKey);
        const ps = paySetupRecord;
        const isComplete = ps?.submitted_at && ps?.terms_accepted;
        return (
          <div ref={el => { stageRefs.current[stageKey] = el; }} className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => toggleStage(stageKey)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${isComplete ? 'bg-status-complete/10' : 'bg-muted'}`}>
                <CreditCard className={`h-4 w-4 ${isComplete ? 'text-status-complete' : 'text-muted-foreground'}`} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Stage 8 — Contractor Pay Setup</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {!paySetupLoaded ? 'Loading…' : isComplete ? `Submitted ${new Date(ps.submitted_at).toLocaleDateString()}` : ps ? 'In progress — not yet submitted' : 'Not started'}
                </p>
              </div>
              {isComplete && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-complete/10 text-status-complete border border-status-complete/25 uppercase tracking-wide">Submitted</span>}
              {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
            {!isCollapsed && (
              <div className="border-t border-border divide-y divide-border/60">

                {/* ── Payroll Reference Documents (always visible) ── */}
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Payroll Reference Documents</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs gap-1.5"
                      disabled={sendingPayrollDocs}
                      onClick={async () => {
                        setSendingPayrollDocs(true);
                        try {
                          const session = (await supabase.auth.getSession()).data.session;
                          const res = await fetch(
                            `https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/send-payroll-docs`,
                            {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session?.access_token ?? ''}`,
                              },
                              body: JSON.stringify({ operator_id: operatorId }),
                            }
                          );
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error ?? 'Failed to send');
                          toast({ title: 'Payroll docs sent ✓', description: `Email sent to ${data.sent_to}` });
                        } catch (err) {
                          toast({ title: 'Failed to send', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
                        } finally {
                          setSendingPayrollDocs(false);
                        }
                      }}
                    >
                      {sendingPayrollDocs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                      Send Payroll Docs
                    </Button>
                  </div>
                  {[
                    { title: 'Payroll Deposit Overview', url: companyDocUrls.overview, subtitle: 'Direct deposit policy & pay structure' },
                    { title: 'Payroll Calendar', url: companyDocUrls.calendar, subtitle: 'Pay schedule & settlement dates' },
                  ].map(doc => (
                    <div key={doc.title} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 bg-primary/10">
                        <BookOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{doc.title}</p>
                        <p className="text-[11px] text-muted-foreground">{doc.subtitle}</p>
                      </div>
                      {doc.url ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-7 px-2.5 text-xs gap-1"
                          onClick={() => setPreviewDoc({ title: doc.title, url: doc.url! })}
                        >
                          <ZoomIn className="h-3 w-3" />
                          View
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">Loading…</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* ── Operator pay setup data (only when a record exists) ── */}
                {!paySetupLoaded ? (
                  <div className="px-5 py-4 text-xs text-muted-foreground">Loading…</div>
                ) : !ps ? (
                  <div className="px-5 py-6 text-center text-muted-foreground text-xs">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Operator has not started pay setup yet.</p>
                  </div>
                ) : (
                  <>
                    {([
                      { label: 'Contractor Type', value: ps.contractor_type === 'business' ? 'Business' : 'Individual' },
                      { label: 'Legal First Name', value: ps.legal_first_name },
                      { label: 'Legal Last Name', value: ps.legal_last_name },
                      ...(ps.contractor_type === 'business' && ps.business_name ? [{ label: 'Business Name', value: ps.business_name }] : []),
                      { label: 'Phone', value: formatPhoneDisplay(ps.phone) },
                      { label: 'Email', value: ps.email },
                      { label: 'Terms Accepted', value: ps.terms_accepted ? `Yes — ${ps.terms_accepted_at ? new Date(ps.terms_accepted_at).toLocaleString() : ''}` : 'No' },
                      { label: 'Submitted', value: ps.submitted_at ? new Date(ps.submitted_at).toLocaleString() : 'Not submitted' },
                    ] as { label: string; value: string }[]).map(row => (
                      <div key={row.label} className="flex items-start gap-3 px-5 py-3">
                        <span className="text-xs text-muted-foreground w-36 shrink-0 pt-0.5">{row.label}</span>
                        <span className="text-sm font-medium text-foreground flex-1">{row.value}</span>
                      </div>
                    ))}

                    {/* ── Doc Acknowledgments ── */}
                    <div className="flex items-start gap-3 px-5 py-3">
                      <span className="text-xs text-muted-foreground w-36 shrink-0 pt-0.5">Doc Acknowledgments</span>
                      <div className="flex flex-col gap-2">
                        {[
                          { label: 'Payroll Deposit Overview', acked: !!ps.deposit_overview_acknowledged, ackedAt: ps.deposit_overview_acknowledged_at ?? null },
                          { label: 'Payroll Calendar', acked: !!ps.payroll_calendar_acknowledged, ackedAt: ps.payroll_calendar_acknowledged_at ?? null },
                        ].map(({ label, acked, ackedAt }) => (
                          <div key={label} className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                                acked
                                  ? 'bg-status-complete/10 text-status-complete border-status-complete/30'
                                  : 'bg-muted text-muted-foreground border-border'
                              }`}
                            >
                              {acked ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
                              {label} — {acked ? 'Acknowledged' : 'Not yet'}
                            </span>
                            {acked && ackedAt && (
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(ackedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}</div>

      {/* Inspection Binder — per-driver docs & uploads */}
      {operatorUserId && (
        <div ref={inspectionBinderRef} className="bg-white border border-border rounded-xl shadow-sm" style={isQuickView ? { order: 7 } : undefined}>
          <button onClick={() => toggleStage('inspection_binder')} className="w-full flex items-center justify-between px-5 py-4 text-left">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-foreground text-sm">Inspection Binder</h3>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsedStages.has('inspection_binder') ? '-rotate-90' : ''}`} />
          </button>
          {!collapsedStages.has('inspection_binder') && (
            <OperatorBinderPanel driverUserId={operatorUserId} operatorName={operatorName} />
          )}
        </div>
      )}

      {/* Driver Document Vault — personal docs (Form 2290, Truck Photos, etc.) */}
      {operatorUserId && (
        <div style={isQuickView ? { order: 8 } : undefined}>
          <DriverVaultCard operatorId={operatorId} operatorName={operatorName} />
        </div>
      )}

      {/* Settlement Forecast — read-only mirror of operator's self-service planning tool */}
      <div className="bg-white border border-border rounded-xl shadow-sm" style={isQuickView ? { order: 9 } : undefined}>
        <button
          onClick={() => toggleStage('settlement_forecast')}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gold" />
            <h3 className="font-semibold text-foreground text-sm">Settlement Forecast</h3>
            <span className="text-[11px] text-muted-foreground">(operator view · read-only)</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsedStages.has('settlement_forecast') ? '-rotate-90' : ''}`} />
        </button>
        {!collapsedStages.has('settlement_forecast') && (
          <div className="px-5 pb-5">
            <SettlementForecast operatorId={operatorId} readOnly />
          </div>
        )}
      </div>


      {/* Internal Notes */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm" style={isQuickView ? { order: 13 } : undefined}>
        <Label className="text-sm font-semibold text-foreground mb-2 block">Internal Notes</Label>
        <p className="text-xs text-muted-foreground mb-3">These notes are visible to staff only and will not be shown to the operator.</p>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add internal notes here…"
          className="min-h-[100px] text-sm"
        />
      </div>

      {/* ── Onboarding History Toggle (Quick View only) ── */}
      {isQuickView && (
        <div style={{ order: 16 }}>
          <button
            onClick={() => setOnboardingHistoryExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-5 py-4 bg-white border border-border rounded-xl shadow-sm hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground text-sm">Onboarding History</h3>
              <span className="text-[11px] text-muted-foreground">(Stages 1–7, Costs, Progress)</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${onboardingHistoryExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}


      {previewDoc && (
        <FilePreviewModal
          url={previewDoc.url}
          name={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
          onEdit={() => {
            const pathPrefix = `${operatorId}/general`;
            setStage2Editing({
              url: previewDoc.url,
              name: previewDoc.title,
              bucket: 'operator-documents',
              path: pathPrefix,
            });
            setPreviewDoc(null);
          }}
        />
      )}

      {/* Stage 2 Doc Preview Modal */}
      {stage2Preview && (
        <FilePreviewModal
          url={stage2Preview.url}
          name={stage2Preview.name}
          onClose={() => setStage2Preview(null)}
          onEdit={stage2Preview.docType !== 'application_doc' ? () => {
            const pathPrefix = `${operatorId}/${stage2Preview.docType}`;
            setStage2Editing({
              url: stage2Preview.url,
              name: stage2Preview.name,
              bucket: 'operator-documents',
              path: pathPrefix,
            });
            setStage2Preview(null);
          } : undefined}
          onSaved={stage2Preview.appField ? async (newUrl: string) => {
            try {
              const field = stage2Preview.appField!;
              const appId = applicationData?.id;
              if (!appId) {
                toast({ title: 'No application record found', variant: 'destructive' });
                return;
              }
              // Extract the object path from the signed URL
              let storagePath = newUrl;
              const marker = '/object/sign/application-documents/';
              const idx = newUrl.indexOf(marker);
              if (idx !== -1) {
                storagePath = decodeURIComponent(newUrl.slice(idx + marker.length).split('?')[0]);
              }
              const { error } = await supabase.from('applications').update({ [field]: storagePath }).eq('id', appId);
              if (error) {
                throw new Error(error.message);
              }
              // Update local state with the raw path
              if (field === 'dl_front_url') setDlFrontUrl(storagePath);
              else if (field === 'dl_rear_url') setDlRearUrl(storagePath);
              else if (field === 'medical_cert_url') setMedCertDocUrl(storagePath);
              toast({ title: 'Document updated', description: 'Edited document saved.' });
              setStage2Preview(null);
            } catch (err: any) {
              console.error('onSaved error:', err);
              toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
            }
          } : undefined}
        />
      )}

      {/* Cost Attachment Preview Modal */}
      {costPreview && (
        <FilePreviewModal
          url={costPreview.url}
          name={costPreview.name}
          onClose={() => setCostPreview(null)}
          onEdit={() => {
            // Derive storage path from the URL — we need the path segment after the bucket
            // Files are stored at: operator-documents/{operatorId}/cost-{slotKey}/{filename}
            const pathPrefix = `${operatorId}/cost-${costPreview.slotKey}`;
            setCostEditing({
              url: costPreview.url,
              name: costPreview.name,
              bucket: 'operator-documents',
              path: pathPrefix,
              slotKey: costPreview.slotKey,
            });
            setCostPreview(null);
          }}
        />
      )}

      {/* Cost Attachment Editor */}
      {costEditing && (
        <EditorErrorBoundary onClose={() => setCostEditing(null)}>
          <Suspense fallback={<div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}>
            <DocumentEditor
              fileUrl={costEditing.url}
              fileName={costEditing.name}
              bucketName={costEditing.bucket}
              filePath={costEditing.path}
              onSave={(newUrl) => {
                setCostEditing(null);
                toast({ title: 'Receipt updated', description: 'Edited receipt saved.' });
              }}
              onClose={() => setCostEditing(null)}
            />
          </Suspense>
        </EditorErrorBoundary>
      )}

      {/* Stage 2 / General Document Editor */}
      {stage2Editing && (
        <EditorErrorBoundary onClose={() => setStage2Editing(null)}>
          <Suspense fallback={<div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}>
            <DocumentEditor
              fileUrl={stage2Editing.url}
              fileName={stage2Editing.name}
              bucketName={stage2Editing.bucket}
              filePath={stage2Editing.path}
              onSave={(newUrl) => {
                setStage2Editing(null);
                toast({ title: 'Document updated', description: 'Edited document saved.' });
              }}
              onClose={() => setStage2Editing(null)}
            />
          </Suspense>
        </EditorErrorBoundary>
      )}

      {showICABuilder && (
        <ICABuilderModal
          operatorId={operatorId}
          operatorName={operatorName}
          operatorEmail={operatorEmail}
          applicationData={applicationData}
          onClose={async () => {
            setShowICABuilder(false);
            // Refresh ICA status + draft timestamp in case Save & Close was used
            const { data: os } = await supabase
              .from('onboarding_status')
              .select('ica_status')
              .eq('operator_id', operatorId)
              .maybeSingle();
            if (os?.ica_status) {
              updateStatus('ica_status', (os as any).ica_status);
              savedMilestones.current.ica_status = (os as any).ica_status;
            }
            // Fetch draft updated_at for banner
            const { data: draft } = await supabase
              .from('ica_contracts' as any)
              .select('updated_at')
              .eq('operator_id', operatorId)
              .eq('status', 'draft')
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            setIcaDraftUpdatedAt((draft as any)?.updated_at ?? null);
          }}
          onSent={() => {
            setShowICABuilder(false);
            updateStatus('ica_status', 'sent_for_signature');
            savedMilestones.current.ica_status = 'sent_for_signature';
            setIcaDraftUpdatedAt(null);
            toast({ title: 'ICA sent', description: `${operatorName} will be notified to review and sign.` });
          }}
        />
      )}

      {/* ICA View Modal */}
      {showICAView && (
        <ICAViewModal
          operatorId={operatorId}
          operatorName={operatorName}
          onClose={() => setShowICAView(false)}
        />
      )}

      {/* Lease Termination Builder */}
      {showTerminationBuilder && (
        <LeaseTerminationBuilderModal
          operatorId={operatorId}
          operatorName={operatorName}
          onClose={() => setShowTerminationBuilder(false)}
          onCreated={(id) => {
            setShowTerminationBuilder(false);
            setOpenTerminationId(id);
          }}
        />
      )}

      {/* Lease Termination Viewer */}
      {openTerminationId && (
        <LeaseTerminationViewModal
          terminationId={openTerminationId}
          operatorName={operatorName}
          onClose={() => setOpenTerminationId(null)}
        />
      )}

      {/* Unsaved changes nav guard */}
      <AlertDialog open={!!navGuard} onOpenChange={(open) => { if (!open) setNavGuard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to <strong>{operatorName}</strong>. If you leave now, your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNavGuard(null)}>Stay & Save</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { navGuard?.action(); setNavGuard(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Without Saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
