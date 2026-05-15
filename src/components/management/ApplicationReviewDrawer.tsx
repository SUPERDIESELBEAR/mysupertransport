import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import {
  X, CheckCircle2, XCircle, User, MapPin, CalendarIcon,
  Briefcase, Car, FileText, ShieldAlert, AlertTriangle, Loader2, Printer,
  Eye, EyeOff, Lock, Save, Download, ShieldCheck, Mail, RotateCcw
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { printDocumentById, preloadSignatureDataUrl } from '@/lib/printDocument';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import React, { Suspense } from 'react';
const DocumentEditor = React.lazy(() => import('@/components/shared/DocumentEditor').then(m => ({ default: m.DocumentEditor })));
import { EditorErrorBoundary } from '@/components/shared/EditorErrorBoundary';
import FCRAAuthorizationDoc from '@/components/application/documents/FCRAAuthorizationDoc';
import PreEmploymentAuthorizationsDoc from '@/components/application/documents/PreEmploymentAuthorizationsDoc';
import DOTDrugAlcoholQuestionsDoc from '@/components/application/documents/DOTDrugAlcoholQuestionsDoc';
import CompanyTestingPolicyCertDoc from '@/components/application/documents/CompanyTestingPolicyCertDoc';
import { ApplicationPEITab } from '@/components/pei/ApplicationPEITab';
import { RevertRevisionModal } from '@/components/management/RevertRevisionModal';
import { RevertedBanner } from '@/components/management/RevertedBanner';
import { SuggestCorrectionsModal } from '@/components/management/SuggestCorrectionsModal';
import { CorrectionRequestStatusCard } from '@/components/management/CorrectionRequestStatusCard';

type EditableDocumentKey = 'dl_front_url' | 'dl_rear_url' | 'medical_cert_url';

interface ApplicationReviewDrawerProps {
  app: FullApplication | null;
  onClose: () => void;
  onApprove: (appId: string, notes: string, options?: { skipInvite?: boolean }) => Promise<void>;
  onDeny: (appId: string, notes: string) => Promise<void>;
  onExpiryUpdated?: () => void;
  /** Auto-open and scroll to this expiry field when the drawer mounts */
  focusField?: 'cdl' | 'medcert';
}

export interface FullApplication {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  dob: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_duration: string | null;
  prev_address_street: string | null;
  prev_address_city: string | null;
  prev_address_state: string | null;
  prev_address_zip: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_class: string | null;
  cdl_expiration: string | null;
  cdl_10_years: boolean | null;
  endorsements: string[] | null;
  equipment_operated: string[] | null;
  years_experience: string | null;
  referral_source: string | null;
  employers: Record<string, string>[] | null;
  employment_gaps: boolean | null;
  employment_gaps_explanation: string | null;
  dot_accidents: boolean | null;
  dot_accidents_description: string | null;
  moving_violations: boolean | null;
  moving_violations_description: string | null;
  dot_positive_test_past_2yr: boolean | null;
  dot_return_to_duty_docs: boolean | null;
  sap_process: boolean | null;
  auth_safety_history: boolean | null;
  auth_drug_alcohol: boolean | null;
  auth_previous_employers: boolean | null;
  testing_policy_accepted: boolean | null;
  typed_full_name: string | null;
  signed_date: string | null;
  review_status: string;
  submitted_at: string | null;
  reviewer_notes: string | null;
  dl_front_url: string | null;
  dl_rear_url: string | null;
  medical_cert_url: string | null;
  medical_cert_expiration: string | null;
  signature_image_url: string | null;
  mvr_status?: string;
  ch_status?: string;
  background_verification_notes?: string | null;
  revision_requested_at?: string | null;
  revision_request_message?: string | null;
  revision_count?: number | null;
  pre_revision_status?: string | null;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="text-gold">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-sm">
      <span className="col-span-2 text-muted-foreground">{label}</span>
      <span className="col-span-3 text-foreground font-medium break-words">{value || <span className="text-muted-foreground italic">Not provided</span>}</span>
    </div>
  );
}

function YesNoBadge({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic text-sm">—</span>;
  return value
    ? <Badge className="bg-destructive/15 text-destructive border-0 text-xs">YES</Badge>
    : <Badge className="bg-status-complete/15 text-status-complete border-0 text-xs">NO</Badge>;
}

function EmployerBlock({ employer, label }: { employer: Record<string, string> | null; label: string }) {
  if (!employer || !employer.name) return null;
  return (
    <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5 text-sm">
      <p className="font-semibold text-foreground">{label}: <span className="text-gold">{employer.name}</span></p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>📍 {[employer.city, employer.state].filter(Boolean).join(', ') || 'No location'}</span>
        <span>📅 {employer.start_date} → {employer.end_date || '?'}</span>
        <span>💼 {employer.position || '—'}</span>
        <span>🚛 CMV: {employer.cmv_position || '—'}</span>
        {employer.reason_leaving && employer.reason_leaving !== 'Currently Employed' && (
          <span className="col-span-2">↪ Reason: {employer.reason_leaving}</span>
        )}
        {employer.end_date === 'Present' && (
          <span className="col-span-2 text-gold font-medium">✓ Currently employed here</span>
        )}
      </div>
    </div>
  );
}

function EditableDateField({
  label,
  date,
  open,
  saving,
  isDirty,
  onOpenChange,
  onSelect,
  onSave,
}: {
  label: string;
  date: Date | undefined;
  open: boolean;
  saving: boolean;
  isDirty: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (d: Date | undefined) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 text-sm">
      <span className="col-span-2 text-muted-foreground flex items-center gap-1 self-center">
        {label}
        <span className="text-[10px] bg-gold/15 text-gold px-1.5 py-0.5 rounded font-medium">Staff</span>
      </span>
      <div className="col-span-3 flex items-center gap-2">
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 flex-1 justify-start text-left font-normal text-xs',
                !date && 'text-muted-foreground',
                isDirty && 'border-gold/60 bg-gold/5'
              )}
            >
              <CalendarIcon className="mr-1.5 h-3 w-3 shrink-0 opacity-60" />
              {date ? format(date, 'MMM d, yyyy') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[60]" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={onSelect}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          variant="outline"
          onClick={onSave}
          disabled={saving || !isDirty}
          className="h-8 px-2 shrink-0 border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress',
  approved: 'bg-status-complete/15 text-status-complete',
  denied: 'bg-destructive/15 text-destructive',
  revisions_requested: 'bg-status-progress/15 text-status-progress',
};

type DrawerTab = 'overview' | 'documents' | 'pei';

export default function ApplicationReviewDrawer({ app, onClose, onApprove, onDeny, onExpiryUpdated, focusField }: ApplicationReviewDrawerProps) {
  const { roles } = useAuth();
  const isManagement = roles.includes('management');
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [notes, setNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'deny' | 'revise' | null>(null);
  const [revisionMessage, setRevisionMessage] = useState('');
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertBannerKey, setRevertBannerKey] = useState(0);
  const [justReverted, setJustReverted] = useState(false);
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [correctionRefreshKey, setCorrectionRefreshKey] = useState(0);
  const [movingToPending, setMovingToPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssnVisible, setSsnVisible] = useState(false);
  const [ssnValue, setSsnValue] = useState<string | null>(null);
  const [ssnLoading, setSsnLoading] = useState(false);
  const [ssnError, setSsnError] = useState<string | null>(null);
  const [manualSsn, setManualSsn] = useState('');
  const [ssnSaving, setSsnSaving] = useState(false);
  const [ssnEmailSending, setSsnEmailSending] = useState(false);
  const [ssnEmailCooldown, setSsnEmailCooldown] = useState(false);

  // Signed URLs for private bucket files
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // In-app document preview & edit state
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; key: EditableDocumentKey } | null>(null);
  const [editingDoc, setEditingDoc] = useState<{ url: string; name: string; bucket: string; path: string; key: EditableDocumentKey } | null>(null);
  const [editedDocPaths, setEditedDocPaths] = useState<Partial<Record<EditableDocumentKey, string>>>({});

  const extractStoragePath = useCallback((url: string | null, bucket: string): string | null => {
    if (!url) return null;
    // If it's already just a path (no http), return as-is
    if (!url.startsWith('http')) return url;

    const markers = [
      `/object/sign/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/object/public/${bucket}/`,
      `/storage/v1/object/public/${bucket}/`,
    ];

    for (const marker of markers) {
      const idx = url.indexOf(marker);
      if (idx !== -1) {
        return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
      }
    }

    return null;
  }, []);

  const getCurrentDocumentPath = useCallback((key: EditableDocumentKey): string | null => {
    if (editedDocPaths[key]) return editedDocPaths[key] ?? null;

    if (key === 'dl_front_url') return app?.dl_front_url ?? null;
    if (key === 'dl_rear_url') return app?.dl_rear_url ?? null;
    return app?.medical_cert_url ?? null;
  }, [app?.dl_front_url, app?.dl_rear_url, app?.medical_cert_url, editedDocPaths]);

  useEffect(() => {
    setEditedDocPaths({});
  }, [app?.id]);

  useEffect(() => {
    if (!app) return;
    const entries: { key: string; bucket: string; rawUrl: string | null }[] = [
      { key: 'signature_image_url', bucket: 'signatures', rawUrl: app.signature_image_url },
      { key: 'dl_front_url', bucket: 'application-documents', rawUrl: app.dl_front_url },
      { key: 'dl_rear_url', bucket: 'application-documents', rawUrl: app.dl_rear_url },
      { key: 'medical_cert_url', bucket: 'application-documents', rawUrl: app.medical_cert_url },
    ];

    const generateSignedUrls = async () => {
      const result: Record<string, string> = {};
      await Promise.all(
        entries.map(async ({ key, bucket, rawUrl }) => {
          if (!rawUrl) return;
          const path = extractStoragePath(rawUrl, bucket) ?? rawUrl;
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
          if (data?.signedUrl) result[key] = data.signedUrl;
        })
      );
      setSignedUrls(result);
    };

    generateSignedUrls();

    // Pre-load signature as data URL for PDF printing
    preloadSignatureDataUrl(app.signature_image_url, 'signatures').then(setSignatureDataUrl);
  }, [app?.id, app?.signature_image_url, app?.dl_front_url, app?.dl_rear_url, app?.medical_cert_url, extractStoragePath]);

  // Background Verification
  const [bgMvrStatus, setBgMvrStatus] = useState(app?.mvr_status ?? 'not_started');
  const [bgChStatus, setBgChStatus] = useState(app?.ch_status ?? 'not_started');
  const [bgNotes, setBgNotes] = useState(app?.background_verification_notes ?? '');
  const [savingBg, setSavingBg] = useState(false);
  const bgIsDirty = bgMvrStatus !== (app?.mvr_status ?? 'not_started')
    || bgChStatus !== (app?.ch_status ?? 'not_started')
    || bgNotes !== (app?.background_verification_notes ?? '');
  const bgVerificationComplete = bgMvrStatus === 'received' && bgChStatus === 'received';

  const cdlFieldRef = useRef<HTMLDivElement>(null);
  const medCertFieldRef = useRef<HTMLDivElement>(null);

  // CDL expiry
  const [cdlExpDate, setCdlExpDate] = useState<Date | undefined>(
    app?.cdl_expiration ? parseISO(app.cdl_expiration) : undefined
  );
  const [cdlExpOpen, setCdlExpOpen] = useState(false);
  const [savingCdlExp, setSavingCdlExp] = useState(false);
  const originalCdlExp = app?.cdl_expiration ?? null;

  // Med cert expiry
  const [medCertDate, setMedCertDate] = useState<Date | undefined>(
    app?.medical_cert_expiration ? parseISO(app.medical_cert_expiration) : undefined
  );
  const [medCertOpen, setMedCertOpen] = useState(false);
  const [savingMedCert, setSavingMedCert] = useState(false);
  const originalMedCertExp = app?.medical_cert_expiration ?? null;

  // Auto-scroll and open the focused field on mount
  useEffect(() => {
    if (!focusField) return;
    const timer = setTimeout(() => {
      if (focusField === 'cdl') {
        cdlFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setCdlExpOpen(true);
      } else {
        medCertFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setMedCertOpen(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [focusField]);

  if (!app) return null;

  const buildExpiryToast = (label: string, date: Date | null) => {
    if (!date) return { message: `${label} expiration cleared.`, type: 'info' as const };
    const days = differenceInDays(startOfDay(date), startOfDay(new Date()));
    if (days < 0) {
      return { message: `⚠️ ${label} expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago — action required.`, type: 'error' as const };
    }
    if (days <= 30) {
      return { message: `🔴 ${label} expires in ${days} day${days !== 1 ? 's' : ''} — critical.`, type: 'error' as const };
    }
    if (days <= 90) {
      return { message: `🟡 ${label} expires in ${days} days — follow up soon.`, type: 'warning' as const };
    }
    return { message: `✅ ${label} expires in ${days} days — on track.`, type: 'success' as const };
  };

  const saveCdlExpiration = async () => {
    setSavingCdlExp(true);
    try {
      const val = cdlExpDate ? format(cdlExpDate, 'yyyy-MM-dd') : null;
      const { error } = await supabase
        .from('applications')
        .update({ cdl_expiration: val })
        .eq('id', app.id);
      if (error) throw error;
      const { message, type } = buildExpiryToast('CDL', cdlExpDate ?? null);
      if (type === 'error') toast.error(message);
      else if (type === 'warning') toast.warning(message);
      else toast.success(message);
      onExpiryUpdated?.();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save.');
    } finally {
      setSavingCdlExp(false);
    }
  };

  const saveMedCertExpiration = async () => {
    setSavingMedCert(true);
    try {
      const val = medCertDate ? format(medCertDate, 'yyyy-MM-dd') : null;
      const { error } = await supabase
        .from('applications')
        .update({ medical_cert_expiration: val })
        .eq('id', app.id);
      if (error) throw error;
      const { message, type } = buildExpiryToast('Medical cert', medCertDate ?? null);
      if (type === 'error') toast.error(message);
      else if (type === 'warning') toast.warning(message);
      else toast.success(message);
      onExpiryUpdated?.();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save.');
    } finally {
      setSavingMedCert(false);
    }
  };

  const saveBgVerification = async () => {
    if (!app) return;
    setSavingBg(true);
    try {
      const { error } = await supabase
        .from('applications')
        .update({
          mvr_status: bgMvrStatus as any,
          ch_status: bgChStatus as any,
          background_verification_notes: bgNotes || null,
        })
        .eq('id', app.id);
      if (error) throw error;
      toast.success('Background verification saved.');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save.');
    } finally {
      setSavingBg(false);
    }
  };

  const handlePrint = () => {
    const fullName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Application';
    printDocumentById('app-review-print-content', `${fullName} — Application`);
  };

  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;

  const revealSSN = async () => {
    setSsnLoading(true);
    setSsnError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? anonKey;
      const res = await fetch(`${supabaseUrl}/functions/v1/decrypt-ssn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ application_id: app.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Decryption failed');
      // Format SSN as XXX-XX-XXXX
      const raw = data.ssn?.replace(/\D/g, '') ?? '';
      setSsnValue(raw.length === 9 ? `${raw.slice(0,3)}-${raw.slice(3,5)}-${raw.slice(5)}` : data.ssn);
      setSsnVisible(true);
    } catch (err: any) {
      setSsnError(err.message ?? 'Failed to reveal SSN');
    } finally {
      setSsnLoading(false);
    }
  };

  const formatManualSsnInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const saveManualSSN = async () => {
    const digits = manualSsn.replace(/\D/g, '');
    if (digits.length !== 9) {
      toast.error('Please enter a valid 9-digit SSN');
      return;
    }
    setSsnSaving(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? anonKey;

      // Encrypt via edge function
      const res = await fetch(`${supabaseUrl}/functions/v1/encrypt-ssn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ ssn: digits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Encryption failed');

      // Save to applications table
      const { error: updateError } = await supabase
        .from('applications')
        .update({ ssn_encrypted: data.encrypted })
        .eq('id', app.id);
      if (updateError) throw updateError;

      // Audit log
      const profile = session?.user;
      await supabase.from('audit_log').insert({
        actor_id: profile?.id ?? null,
        actor_name: profile?.user_metadata?.first_name
          ? `${profile.user_metadata.first_name} ${profile.user_metadata.last_name ?? ''}`.trim()
          : profile?.email ?? 'Unknown',
        action: 'manual_ssn_entry',
        entity_type: 'application',
        entity_id: app.id,
        entity_label: fullName,
      });

      // Show the SSN as revealed
      setSsnValue(`${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`);
      setSsnVisible(true);
      setSsnError(null);
      setManualSsn('');
      toast.success('SSN saved and encrypted successfully');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save SSN');
    } finally {
      setSsnSaving(false);
    }
  };

  const sendSsnRequestEmail = async () => {
    if (!app) return;
    setSsnEmailSending(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/send-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            type: 'request_ssn',
            applicant_name: [app.first_name, app.last_name].filter(Boolean).join(' ') || 'Applicant',
            applicant_email: app.email,
            application_id: app.id,
          }),
        }
      );
      if (!res.ok) throw new Error('Failed to send email');
      toast.success(`SSN request email sent to ${app.first_name || app.email}`);
      setSsnEmailCooldown(true);
      setTimeout(() => setSsnEmailCooldown(false), 60_000);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send email');
    } finally {
      setSsnEmailSending(false);
    }
  };

  const handleRequestRevisions = async () => {
    if (revisionMessage.trim().length < 10) {
      toast.error('Please describe what the applicant needs to fix (10+ characters).');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'request-application-revisions',
        { body: { applicationId: app.id, message: revisionMessage.trim() } }
      );
      if (error || (data as any)?.error) {
        const code = (data as any)?.error || error?.message || 'unknown';
        throw new Error(typeof code === 'string' ? code : 'Failed to send');
      }
      toast.success(`Revision request emailed to ${app.email}`);
      setConfirmAction(null);
      setRevisionMessage('');
      onClose();
      onExpiryUpdated?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send revision request');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'approve' | 'deny' | 'revise') => {
    if (action === 'revise') {
      await handleRequestRevisions();
      return;
    }
    setLoading(true);
    try {
      if (action === 'approve') {
        const skipInvite = (app.pre_revision_status === 'approved');
        await onApprove(app.id, notes, { skipInvite });
      } else {
        await onDeny(app.id, notes);
      }
      setConfirmAction(null);
      setNotes('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-dark shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white">{fullName}</h2>
              <Badge className={`text-xs ${STATUS_COLORS[app.review_status]}`}>
                {app.review_status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-surface-dark-muted text-xs mt-0.5">
              {app.submitted_at ? `Submitted ${new Date(app.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Draft'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrint}
              title="Print / Save as PDF"
              className="text-surface-dark-muted hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/10"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="text-surface-dark-muted hover:text-white transition-colors p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-surface-dark/5 shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-gold border-b-2 border-gold bg-gold/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'documents'
                ? 'text-gold border-b-2 border-gold bg-gold/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Documents
          </button>
          <button
            onClick={() => setActiveTab('pei')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'pei'
                ? 'text-gold border-b-2 border-gold bg-gold/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            PEI
          </button>
        </div>

        {/* Scrollable content */}
        <div id="app-review-print-content" className="flex-1 overflow-y-auto">

          {activeTab === 'pei' && (
            <ApplicationPEITab applicationId={app.id} />
          )}

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-7">

              {/* Personal Info */}
              <Section title="Personal Information" icon={<User className="h-4 w-4" />}>
                <Field label="Full Name" value={fullName} />
                <Field label="Email" value={app.email} />
                <Field label="Phone" value={app.phone} />
                <Field label="Date of Birth" value={app.dob ? new Date(app.dob + 'T12:00:00').toLocaleDateString() : null} />
                <Field label="How they heard" value={app.referral_source} />
              </Section>

              {/* Address */}
              <Section title="Address" icon={<MapPin className="h-4 w-4" />}>
                <Field label="Current Address" value={[app.address_street, app.address_city, app.address_state, app.address_zip].filter(Boolean).join(', ')} />
                <Field label="Time at Address" value={app.address_duration} />
                {(app.prev_address_street || app.prev_address_city) && (
                  <Field label="Previous Address" value={[app.prev_address_street, app.prev_address_city, app.prev_address_state, app.prev_address_zip].filter(Boolean).join(', ')} />
                )}
              </Section>

              {/* CDL Info */}
              <Section title="CDL Information" icon={<Car className="h-4 w-4" />}>
                <Field label="CDL Number" value={app.cdl_number} />
                <Field label="State" value={app.cdl_state} />
                <Field label="Class" value={app.cdl_class} />
                <div ref={cdlFieldRef} className={focusField === 'cdl' ? 'ring-2 ring-gold/40 rounded-lg p-1 -mx-1 transition-all' : ''}>
                  <EditableDateField
                    label="CDL Expiry"
                    date={cdlExpDate}
                    open={cdlExpOpen}
                    saving={savingCdlExp}
                    isDirty={(cdlExpDate ? format(cdlExpDate, 'yyyy-MM-dd') : null) !== originalCdlExp}
                    onOpenChange={setCdlExpOpen}
                    onSelect={d => { setCdlExpDate(d); setCdlExpOpen(false); }}
                    onSave={saveCdlExpiration}
                  />
                </div>
                <Field label="10-Year CDL History" value={<YesNoBadge value={app.cdl_10_years} />} />
                <Field label="Endorsements" value={app.endorsements?.join(', ')} />
                <Field label="Equipment" value={app.equipment_operated?.join(', ')} />
                <Field label="Years Experience" value={app.years_experience} />
                <div className={`border-t border-border pt-2 mt-1 ${focusField === 'medcert' ? 'ring-2 ring-gold/40 rounded-lg p-1 -mx-1 transition-all' : ''}`} ref={medCertFieldRef}>
                  <EditableDateField
                    label="Med. Cert. Expiry"
                    date={medCertDate}
                    open={medCertOpen}
                    saving={savingMedCert}
                    isDirty={(medCertDate ? format(medCertDate, 'yyyy-MM-dd') : null) !== originalMedCertExp}
                    onOpenChange={setMedCertOpen}
                    onSelect={d => { setMedCertDate(d); setMedCertOpen(false); }}
                    onSave={saveMedCertExpiration}
                  />
                </div>
              </Section>

              {/* Background Verification */}
              {app.review_status === 'pending' && (
                <Section title="Background Verification" icon={<ShieldCheck className="h-4 w-4" />}>
                  <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-2 text-sm">
                      <span className="col-span-2 text-muted-foreground self-center">MVR Status</span>
                      <div className="col-span-3">
                        <Select value={bgMvrStatus} onValueChange={setBgMvrStatus}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_started">Not Started</SelectItem>
                            <SelectItem value="requested">Requested</SelectItem>
                            <SelectItem value="received">Received</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-sm">
                      <span className="col-span-2 text-muted-foreground self-center">Clearinghouse Status</span>
                      <div className="col-span-3">
                        <Select value={bgChStatus} onValueChange={setBgChStatus}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_started">Not Started</SelectItem>
                            <SelectItem value="requested">Requested</SelectItem>
                            <SelectItem value="received">Received</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-sm">
                      <span className="col-span-2 text-muted-foreground self-start mt-2">Notes</span>
                      <div className="col-span-3">
                        <Textarea
                          value={bgNotes}
                          onChange={e => setBgNotes(e.target.value)}
                          placeholder="MVR/Clearinghouse findings..."
                          rows={2}
                          className="text-xs resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={saveBgVerification}
                        disabled={savingBg || !bgIsDirty}
                        className="h-8 px-3 border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-40 gap-1.5"
                      >
                        {savingBg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                    {!bgVerificationComplete && (
                      <p className="text-xs text-status-progress bg-status-progress/10 rounded-lg px-3 py-2">
                        ℹ️ Both MVR and Clearinghouse must be <strong>Received</strong> before this application can be approved.
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* Employment */}
              <Section title="Employment History" icon={<Briefcase className="h-4 w-4" />}>
                {Array.isArray(app.employers) && app.employers.map((emp, i) => (
                  <EmployerBlock
                    key={i}
                    employer={emp as Record<string, string>}
                    label={i === 0 ? 'Current / Last Employer' : `Employer ${i + 1}`}
                  />
                ))}
                <Field label="Employment Gaps" value={<YesNoBadge value={app.employment_gaps} />} />
                {app.employment_gaps_explanation && (
                  <Field label="Gap Explanation" value={app.employment_gaps_explanation} />
                )}
              </Section>

              {/* Driving Record */}
              <Section title="Driving Record & Disclosures" icon={<ShieldAlert className="h-4 w-4" />}>
                <Field label="DOT Accidents (3yr)" value={<YesNoBadge value={app.dot_accidents} />} />
                {app.dot_accidents_description && <Field label="Accident Details" value={app.dot_accidents_description} />}
                <Field label="Moving Violations (3yr)" value={<YesNoBadge value={app.moving_violations} />} />
                {app.moving_violations_description && <Field label="Violation Details" value={app.moving_violations_description} />}
                <Field label="Positive Drug Test (2yr)" value={<YesNoBadge value={app.dot_positive_test_past_2yr} />} />
                {app.dot_return_to_duty_docs && <Field label="Return to Duty Docs" value={<YesNoBadge value={app.dot_return_to_duty_docs} />} />}
                <Field label="SAP Process" value={<YesNoBadge value={app.sap_process} />} />
              </Section>

              {/* Authorizations */}
              <Section title="Authorizations & Signature" icon={<FileText className="h-4 w-4" />}>
                <Field label="Auth: Safety History" value={<YesNoBadge value={app.auth_safety_history} />} />
                <Field label="Auth: Drug/Alcohol" value={<YesNoBadge value={app.auth_drug_alcohol} />} />
                <Field label="Auth: Previous Employers" value={<YesNoBadge value={app.auth_previous_employers} />} />
                <Field label="Testing Policy Accepted" value={<YesNoBadge value={app.testing_policy_accepted} />} />
                <Field label="Signed By" value={app.typed_full_name} />
                <Field label="Signed Date" value={app.signed_date ? new Date(app.signed_date).toLocaleDateString() : null} />
                {(app.signature_image_url || signedUrls.signature_image_url) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Signature</p>
                    <div className="border border-border rounded-lg p-2 bg-secondary/30 inline-block">
                      <img src={signedUrls.signature_image_url || app.signature_image_url!} alt="Applicant signature" className="h-16 w-auto" />
                    </div>
                  </div>
                )}

                {/* SSN Reveal — management only */}
                {isManagement && (
                  <div className="pt-2 border-t border-border mt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Lock className="h-3.5 w-3.5 text-gold" />
                        Social Security Number
                      </div>
                      {!ssnVisible ? (
                        <button
                          onClick={revealSSN}
                          disabled={ssnLoading}
                          className="flex items-center gap-1.5 text-xs text-gold hover:text-gold-light font-medium transition-colors disabled:opacity-50"
                        >
                          {ssnLoading
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Decrypting…</>
                            : <><Eye className="h-3.5 w-3.5" /> Reveal SSN</>
                          }
                        </button>
                      ) : (
                        <button
                          onClick={() => { setSsnVisible(false); setSsnValue(null); }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                        >
                          <EyeOff className="h-3.5 w-3.5" /> Hide
                        </button>
                      )}
                    </div>
                    {ssnError && (
                      <div className="mt-2">
                        <p className="text-xs text-destructive mb-2">{ssnError}</p>
                        <p className="text-xs text-muted-foreground mb-2">You can manually enter the SSN below:</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="XXX-XX-XXXX"
                            value={manualSsn}
                            onChange={(e) => setManualSsn(formatManualSsnInput(e.target.value))}
                            className="flex h-8 w-40 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono tracking-widest ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            maxLength={11}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={saveManualSSN}
                            disabled={ssnSaving || manualSsn.replace(/\D/g, '').length !== 9}
                            className="h-8 text-xs gap-1"
                          >
                            {ssnSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save SSN
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={sendSsnRequestEmail}
                          disabled={ssnEmailSending || ssnEmailCooldown}
                          className="h-8 text-xs gap-1.5 mt-2 text-gold hover:text-gold-light hover:bg-gold/10"
                        >
                          {ssnEmailSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                          {ssnEmailCooldown ? 'Email Sent ✓' : 'Email Applicant to Request SSN'}
                        </Button>
                      </div>
                    )}
                    {ssnVisible && ssnValue && (
                      <div className="mt-2 px-3 py-2 bg-gold/10 border border-gold/30 rounded-lg">
                        <span className="text-sm font-mono font-semibold text-foreground tracking-widest">{ssnValue}</span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">This view is logged to the audit trail.</p>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* Uploaded Documents */}
              {(app.dl_front_url || app.dl_rear_url || app.medical_cert_url) && (
                <Section title="Uploaded Documents" icon={<FileText className="h-4 w-4" />}>
                  <div className="flex flex-wrap gap-2">
                    {app.dl_front_url && (
                      <button
                        onClick={() => setPreviewDoc({ url: signedUrls.dl_front_url || app.dl_front_url!, name: 'DL Front', key: 'dl_front_url' })}
                        className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" /> DL Front
                      </button>
                    )}
                    {app.dl_rear_url && (
                      <button
                        onClick={() => setPreviewDoc({ url: signedUrls.dl_rear_url || app.dl_rear_url!, name: 'DL Rear', key: 'dl_rear_url' })}
                        className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" /> DL Rear
                      </button>
                    )}
                    {app.medical_cert_url && (
                      <button
                        onClick={() => setPreviewDoc({ url: signedUrls.medical_cert_url || app.medical_cert_url!, name: 'Medical Certificate', key: 'medical_cert_url' })}
                        className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" /> Medical Cert
                      </button>
                    )}
                  </div>
                </Section>
              )}

              {/* Existing reviewer notes */}
              {app.reviewer_notes && (
                <div className="bg-status-progress/10 border border-status-progress/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-status-progress mb-1">Previous Reviewer Notes</p>
                  <p className="text-sm text-foreground">{app.reviewer_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {activeTab === 'documents' && (
            <div className="p-6 space-y-3">
              <p className="text-xs text-muted-foreground mb-4">
                Click a document below to open the browser's print dialog — choose <strong>Save as PDF</strong> to download.
              </p>

              {[
                {
                  id: 'doc-fcra-print',
                  title: 'Fair Credit Reporting Act Authorization',
                  description: 'FCRA disclosure and background check authorization',
                  component: <FCRAAuthorizationDoc app={app} signatureDataUrl={signatureDataUrl} />,
                  docTitle: `FCRA Authorization — ${fullName}`,
                },
                {
                  id: 'doc-preauth-print',
                  title: 'PSP Authorization',
                  description: 'FMCSA PSP disclosure, crash & inspection history release',
                  component: <PreEmploymentAuthorizationsDoc app={app} signatureDataUrl={signatureDataUrl} />,
                  docTitle: `PSP Authorization — ${fullName}`,
                },
                {
                  id: 'doc-dot-print',
                  title: 'DOT Drug & Alcohol Pre-Employment Questions',
                  description: '49 CFR § 40.25(j) mandatory disclosure and responses',
                  component: <DOTDrugAlcoholQuestionsDoc app={app} signatureDataUrl={signatureDataUrl} />,
                  docTitle: `DOT Drug & Alcohol Questions — ${fullName}`,
                },
                {
                  id: 'doc-cert-print',
                  title: 'Certificate of Receipt — Company Testing Policy',
                  description: '49 CFR § 382.601 policy receipt and application certification',
                  component: <CompanyTestingPolicyCertDoc app={app} signatureDataUrl={signatureDataUrl} />,
                  docTitle: `Company Testing Policy Certificate — ${fullName}`,
                },
              ].map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-4 p-4 border border-border rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      <FileText className="h-5 w-5 text-gold" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{doc.description}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-gold/40 text-gold hover:bg-gold/10 hover:border-gold gap-1.5"
                    onClick={() => printDocumentById(doc.id, doc.docTitle)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </Button>
                </div>
              ))}

              {/* Hidden print containers — rendered off-screen so they're ready when needed */}
              <div className="fixed left-[-9999px] top-0 pointer-events-none" aria-hidden="true">
                {[
                  { id: 'doc-fcra-print', component: <FCRAAuthorizationDoc app={app} signatureDataUrl={signatureDataUrl} /> },
                  { id: 'doc-preauth-print', component: <PreEmploymentAuthorizationsDoc app={app} signatureDataUrl={signatureDataUrl} /> },
                  { id: 'doc-dot-print', component: <DOTDrugAlcoholQuestionsDoc app={app} signatureDataUrl={signatureDataUrl} /> },
                  { id: 'doc-cert-print', component: <CompanyTestingPolicyCertDoc app={app} signatureDataUrl={signatureDataUrl} /> },
                ].map((doc) => (
                  <div key={doc.id} id={doc.id} style={{ display: 'none' }}>
                    {doc.component}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Persistent "Reverted" confirmation banner (audit-log driven, last 24h) */}
        <RevertedBanner
          applicationId={app.id}
          firstName={app.first_name}
          refreshKey={revertBannerKey}
        />

        {/* Correction-request status (pending / approved / rejected history) */}
        <div className="border-t border-border p-4 shrink-0">
          <CorrectionRequestStatusCard
            key={correctionRefreshKey}
            applicationId={app.id}
            onChanged={() => { setCorrectionRefreshKey((k) => k + 1); onExpiryUpdated?.(); }}
          />
        </div>

        <SuggestCorrectionsModal
          open={correctionsOpen}
          onOpenChange={setCorrectionsOpen}
          application={app as unknown as Record<string, unknown> & { id: string; first_name?: string | null; last_name?: string | null; email: string }}
          onSent={() => { setCorrectionRefreshKey((k) => k + 1); onExpiryUpdated?.(); }}
        />

        {/* Revisions-requested status banner — hidden once a revert just happened in this session */}
        {app.review_status === 'revisions_requested' && !justReverted && (
          <div className="border-t border-border p-4 bg-status-progress/10 shrink-0">
            <div className="flex items-start gap-3">
              <RotateCcw className="h-5 w-5 text-status-progress shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    Revisions requested{app.revision_requested_at ? ` on ${new Date(app.revision_requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRevertOpen(true)}
                    className="text-xs font-medium text-status-progress hover:underline shrink-0"
                  >
                    Undo — sent in error
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Awaiting applicant updates. The applicant received an email with a secure link to reopen and resubmit.
                </p>
                {app.revision_request_message && (
                  <div className="mt-2 p-3 bg-white border border-status-progress/30 rounded-lg text-xs text-foreground whitespace-pre-wrap">
                    {app.revision_request_message}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={movingToPending}
                    onClick={async () => {
                      setMovingToPending(true);
                      try {
                        const { error } = await supabase.rpc('move_revisions_to_pending', { p_application_id: app.id });
                        if (error) throw error;
                        toast.success('Moved to pending. Old revision link disabled.');
                        // Notify the applicant their app was reopened (best-effort, non-blocking).
                        supabase.functions.invoke('notify-application-moved-to-pending', {
                          body: { applicationId: app.id },
                        }).catch(() => { /* swallow — toast already shown */ });
                        onExpiryUpdated?.();
                        setCorrectionsOpen(true);
                      } catch (err: any) {
                        toast.error(err?.message ?? 'Failed to move to pending');
                      } finally {
                        setMovingToPending(false);
                      }
                    }}
                  >
                    {movingToPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : null}
                    Move to pending & suggest corrections
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <RevertRevisionModal
          open={revertOpen}
          onOpenChange={setRevertOpen}
          application={app}
          onSuccess={() => {
            // Drawer stays open so staff can see the new "Reverted" banner.
            setJustReverted(true);
            setRevertBannerKey((k) => k + 1);
            onExpiryUpdated?.();
          }}
        />

        {/* Action Footer — pending (full actions) or approved (revisions only) */}
        {(app.review_status === 'pending' || app.review_status === 'approved') && (
          <div className="border-t border-border p-5 bg-secondary/30 shrink-0 space-y-3">
            {!confirmAction ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    Reviewer Notes <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add internal notes about this application..."
                    rows={2}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmAction('revise')}
                    className="flex-1 min-w-[140px] border-status-progress/40 text-status-progress hover:bg-status-progress/10"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" /> Request Revisions
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCorrectionsOpen(true)}
                    className="flex-1 min-w-[140px] border-gold/40 text-foreground hover:bg-gold/10"
                  >
                    <Mail className="h-4 w-4 mr-2" /> Send Corrections
                  </Button>
                  {app.review_status === 'pending' && (
                  <>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmAction('deny')}
                    className="flex-1 min-w-[140px] border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Deny
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1 min-w-[140px]">
                          <Button
                            onClick={() => setConfirmAction('approve')}
                            disabled={!bgVerificationComplete}
                            className="w-full bg-status-complete text-white hover:bg-status-complete/90 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            {app.pre_revision_status === 'approved' ? 'Re-approve corrections' : 'Approve & Invite'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!bgVerificationComplete && (
                        <TooltipContent>
                          <p>MVR and Clearinghouse must both be "Received" before approving.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  </>
                  )}
                </div>
              </>
            ) : confirmAction === 'revise' ? (
              <div className="space-y-3">
                <div className="rounded-lg p-4 border bg-status-progress/10 border-status-progress/30">
                  <div className="flex items-start gap-3">
                    <RotateCcw className="h-5 w-5 mt-0.5 shrink-0 text-status-progress" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        Send {fullName} back to make corrections?
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        The applicant will receive an email with a secure 7-day link to reopen the application. Their existing answers are preserved.
                        {app.review_status === 'approved' && (
                          <> The driver will keep full access to their onboarding stages while making corrections.</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    Tell the applicant what to fix <span className="text-destructive">*</span>
                    <span className="font-normal text-muted-foreground"> (they will see this message)</span>
                  </label>
                  <textarea
                    value={revisionMessage}
                    onChange={e => setRevisionMessage(e.target.value)}
                    placeholder="Example: Please add all previous employers from the past 3 years (we only see one listed)."
                    rows={4}
                    maxLength={2000}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{revisionMessage.length}/2000</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setConfirmAction(null); setRevisionMessage(''); }} className="flex-1" disabled={loading}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleAction('revise')}
                    disabled={loading || revisionMessage.trim().length < 10}
                    className="flex-1 bg-status-progress text-white hover:bg-status-progress/90"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                    ) : (
                      <>Send to applicant</>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-lg p-4 border ${confirmAction === 'approve' ? 'bg-status-complete/10 border-status-complete/30' : 'bg-destructive/10 border-destructive/30'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${confirmAction === 'approve' ? 'text-status-complete' : 'text-destructive'}`} />
                    <div>
                       <p className="text-sm font-semibold text-foreground">
                        {confirmAction === 'approve'
                          ? (app.pre_revision_status === 'approved'
                              ? `Re-approve corrected application for ${fullName}?`
                              : `Approve application and send invite to ${app.email}?`)
                          : `Deny application for ${fullName}?`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {confirmAction === 'approve'
                          ? (app.pre_revision_status === 'approved'
                              ? 'The application will return to Approved status. No new invite will be sent — the operator already exists and onboarding continues.'
                              : 'This will send a SUPERTRANSPORT account invite email. An Operator record will be created automatically.')
                          : 'This action will mark the application as denied. It cannot be reversed without contacting support.'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setConfirmAction(null)} className="flex-1" disabled={loading}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleAction(confirmAction)}
                    disabled={loading}
                    className={`flex-1 text-white ${confirmAction === 'approve' ? 'bg-status-complete hover:bg-status-complete/90' : 'bg-destructive hover:bg-destructive/90'}`}
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      confirmAction === 'approve'
                        ? (app.pre_revision_status === 'approved' ? 'Confirm Re-approve' : 'Confirm Approve & Invite')
                        : 'Confirm Deny'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* In-app document preview modal */}
      {previewDoc && (
        <FilePreviewModal
          url={previewDoc.url}
          name={previewDoc.name}
          onClose={() => setPreviewDoc(null)}
          onEdit={() => {
            const rawUrl = getCurrentDocumentPath(previewDoc.key);
            const path = extractStoragePath(rawUrl, 'application-documents') ?? rawUrl ?? '';
            setEditingDoc({
              url: previewDoc.url,
              name: previewDoc.name,
              bucket: 'application-documents',
              path,
              key: previewDoc.key,
            });
            setPreviewDoc(null);
          }}
        />
      )}

      {/* In-app document editor */}
      {editingDoc && (
        <EditorErrorBoundary onClose={() => setEditingDoc(null)}>
          <Suspense fallback={null}>
            <DocumentEditor
              fileUrl={editingDoc.url}
              fileName={editingDoc.name}
              bucketName={editingDoc.bucket}
              filePath={editingDoc.path}
              onClose={() => setEditingDoc(null)}
              onSave={async (newUrl) => {
                const path = extractStoragePath(newUrl, editingDoc.bucket) ?? newUrl;
                const { error } = await supabase
                  .from('applications')
                  .update({ [editingDoc.key]: path })
                  .eq('id', app.id);

                if (error) {
                  throw new Error(error.message);
                }

                setEditedDocPaths(prev => ({ ...prev, [editingDoc.key]: path }));

                const { data } = await supabase.storage.from(editingDoc.bucket).createSignedUrl(path, 3600);
                if (data?.signedUrl) {
                  setSignedUrls(prev => ({ ...prev, [editingDoc.key]: data.signedUrl }));
                }

                setEditingDoc(null);
                toast.success('Document updated successfully');
              }}
            />
          </Suspense>
        </EditorErrorBoundary>
      )}
    </div>
  );
}
