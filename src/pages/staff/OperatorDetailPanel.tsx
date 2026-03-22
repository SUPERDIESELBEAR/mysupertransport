import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { sanitizeText } from '@/lib/sanitize';
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
import { ArrowLeft, Save, FileCheck, Truck, Shield, CheckCircle2, AlertTriangle, Clock, FilePen, Trash2, Bell, Paperclip, ExternalLink, ChevronDown, ChevronUp, Copy, Check, MessageSquare, CheckCheck, RotateCcw, Send, History, RefreshCw, Mail, CalendarClock, CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import ICABuilderModal from '@/components/ica/ICABuilderModal';
import ICAViewModal from '@/components/ica/ICAViewModal';
import OperatorBinderPanel from '@/components/inspection/OperatorBinderPanel';
import { formatDistanceToNow, format, differenceInDays, parseISO, startOfDay } from 'date-fns';

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
  mo_expected_approval_date: string | null;
  mo_reg_received: string;
  decal_method: string | null;
  decal_applied: string;
  eld_method: string | null;
  eld_installed: string;
  fuel_card_issued: string;
  insurance_added_date: string | null;
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

export default function OperatorDetailPanel({ operatorId, onBack, onMessageOperator, onUnsavedChangesChange, onOpenAppReview, expiryOverride, scrollToInspectionBinder, scrollToStageKey }: OperatorDetailPanelProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidingICA, setVoidingICA] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorUserId, setOperatorUserId] = useState<string | null>(null);
  const [showICABuilder, setShowICABuilder] = useState(false);
  const [showICAView, setShowICAView] = useState(false);
  const [applicationData, setApplicationData] = useState<any>(null);
  const [icaDraftUpdatedAt, setIcaDraftUpdatedAt] = useState<string | null>(null);
  const [cdlExpiration, setCdlExpiration] = useState<string | null>(null);
  const [medCertExpiration, setMedCertExpiration] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
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
  const [copiedEmail, setCopiedEmail] = useState(false);

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
  // Last renewal per doc type: key = 'CDL' | 'Medical Cert' → ISO timestamp
  const [lastRenewed, setLastRenewed] = useState<Record<string, string>>({});
  // Last renewed by name per doc type
  const [lastRenewedBy, setLastRenewedBy] = useState<Record<string, string>>({});

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
  }>({
    ica_status: '', mvr_ch_approval: '', pe_screening_result: '', insurance_added_date: null,
    form_2290: '', truck_title: '', truck_photos: '', truck_inspection: '',
    decal_applied: '', eld_installed: '', fuel_card_issued: '', mo_reg_received: '',
  });

  useEffect(() => {
    fetchOperatorDetail();
    fetchDispatchHistory();
    fetchCertHistory();
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
      if (auditErr) console.error('[audit] cert_renewed:', auditErr);
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
        .select(`id, user_id, notes, onboarding_status (*), applications (email, first_name, last_name, phone, address_street, address_city, address_state, address_zip, cdl_expiration, medical_cert_expiration)`)
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
      // Fetch profile separately to avoid FK hint issues
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', (op as any).user_id)
        .maybeSingle();

      setOperatorName(
        profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unknown Operator' : 'Unknown Operator'
      );
      setOperatorUserId((op as any).user_id ?? null);
      const app = (op as any).applications;
      setOperatorEmail(app?.email ?? '');
      setApplicationData(app ?? null);
      setCdlExpiration(app?.cdl_expiration ?? null);
      setMedCertExpiration(app?.medical_cert_expiration ?? null);
      setNotes((op as any).notes ?? '');
      const os = (op as any).onboarding_status ?? null;
      if (os) {
        setStatus(os);
        setStatusId(os.id);
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
        };
        // Auto-collapse stages that are already complete on load
        const autoCollapse = new Set<string>();
        if (os.mvr_ch_approval === 'approved') autoCollapse.add('stage1');
        if (os.form_2290 === 'received' && os.truck_title === 'received' && os.truck_photos === 'received' && os.truck_inspection === 'received') autoCollapse.add('stage2');
        if (os.ica_status === 'complete') autoCollapse.add('stage3');
        if (os.mo_reg_received === 'yes') autoCollapse.add('stage4');
        if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') autoCollapse.add('stage5');
        if (os.insurance_added_date) autoCollapse.add('stage6');
        if (autoCollapse.size > 0) setCollapsedStages(autoCollapse);
      }
    }
    setLoading(false);
  };

  // Map doc field keys to human-readable labels
  const DOC_LABELS: Record<string, string> = {
    form_2290: 'Form 2290',
    truck_title: 'Truck Title',
    truck_photos: 'Truck Photos',
    truck_inspection: 'Truck Inspection Report',
  };

  const handleSave = async () => {
    setSaving(true);

    // ── Detect milestone transitions before saving ──────────────────────
    const prev = savedMilestones.current;
    const isNewlyFullyOnboarded =
      !prev.insurance_added_date && !!status.insurance_added_date;

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
    const equipmentReady =
      status.decal_applied === 'yes' &&
      status.eld_installed === 'yes' &&
      status.fuel_card_issued === 'yes';
    const wasEquipmentReady =
      prev.decal_applied === 'yes' &&
      prev.eld_installed === 'yes' &&
      prev.fuel_card_issued === 'yes';

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

    if (statusId) {
      // fully_onboarded is a DB-generated column (insurance_added_date IS NOT NULL) — never write it
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, fully_onboarded: _fo, ...updateData } = status as any;
      await supabase
        .from('onboarding_status')
        .update(updateData)
        .eq('id', statusId);

      // Reflect generated value in local state immediately so header badge updates
      if (isNewlyFullyOnboarded) {
        setStatus(prev => ({ ...prev, fully_onboarded: true }));
      }
    }

    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
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
            console.error('Milestone notification error:', notifErr);
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
        }).then(({ error }) => { if (error) console.error('[audit] operator_status_updated:', error); });
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
        }).then(({ error }) => { if (error) console.error('[audit] onboarding_completed:', error); });
      }
    }

    savedSnapshot.current = { status, notes };
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

  const updateStatus = (field: keyof OnboardingStatus, value: string | null) => {
    setStatus(prev => ({ ...prev, [field]: value }));
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
  const methodOptions = [{ value: 'ar_shop_install', label: 'AR Shop Install' }, { value: 'ups_self_install', label: 'UPS Self-Install' }];
  const yesNoOptions = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];

  const isAlert = status.mvr_ch_approval === 'denied' || status.pe_screening_result === 'non_clear';

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
    <div className="space-y-6 animate-fade-in max-w-4xl w-full">

      {/* Sticky mini progress bar — shown when main bar scrolls out of view */}
      {(() => {
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
          { label: 'Equipment',  key: 'stage5', complete: status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes', fullName: 'Equipment', items: [
              { label: 'Decal Applied',    done: status.decal_applied === 'yes' },
              { label: 'ELD Installed',    done: status.eld_installed === 'yes' },
              { label: 'Fuel Card Issued', done: status.fuel_card_issued === 'yes' },
            ]},
          { label: 'Insurance',  key: 'stage6', complete: !!status.insurance_added_date, fullName: 'Insurance', items: [
              { label: 'Insurance Added', done: !!status.insurance_added_date },
            ]},
        ];
        const completedCount = stages.filter(s => s.complete).length;
        const pct = Math.round((completedCount / stages.length) * 100);
        return (
          <div
            className={`sticky top-0 z-30 -mx-6 px-6 transition-all duration-300 ${
              showStickyBar ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
            }`}
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
                <div className="flex flex-wrap items-center gap-1 shrink-0">
                    {stages.map((s, i) => (
                      <Tooltip key={s.key}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => scrollToStage(s.key)}
                            className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all hover:scale-110 ${
                              s.complete
                                ? 'bg-status-complete border-status-complete text-white'
                                : 'bg-background border-border text-muted-foreground hover:border-gold hover:text-gold'
                            }`}
                          >
                            {s.complete ? '✓' : i + 1}
                          </button>
                        </TooltipTrigger>
                         <TooltipContent side="bottom" className="text-left min-w-[160px] max-w-[220px] p-2.5 space-y-2">
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
                  </div>
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
                        className="ml-1 h-6 px-2 rounded flex items-center gap-1 border border-gold/60 bg-gold/10 text-gold hover:bg-gold/20 transition-all disabled:opacity-50 text-[10px] font-semibold"
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
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => guardedNavigate(onBack)} className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Pipeline</span>
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

      {/* Status overview */}
      <div className="flex flex-wrap gap-2">
        {isAlert && <Badge className="status-action border text-xs">⚠ Alert — Review Required</Badge>}
        {status.fully_onboarded && <Badge className="status-complete border text-xs">✓ Fully Onboarded</Badge>}
        {status.ica_status === 'complete' && <Badge className="status-complete border text-xs">ICA Signed</Badge>}
        {status.pe_screening_result === 'clear' && <Badge className="status-complete border text-xs">PE Clear</Badge>}
      </div>

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

      {/* Compliance expiry row */}
      {(cdlExpiration || medCertExpiration) && (() => {
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
      })()}

      {/* ── Cert Expiry History Timeline ─────────────────────── */}
      {(cdlExpiration || medCertExpiration) && (
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
      )}


      {(() => {
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
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
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
      })()}

      {/* Collapse All / Expand All */}
      {(() => {
        const allStageKeys = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'];
        const allCollapsed = allStageKeys.every(k => collapsedStages.has(k));
        return (
          <div className="flex justify-end">
            <button
              onClick={() => setCollapsedStages(allCollapsed ? new Set() : new Set(allStageKeys))}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              {allCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {allCollapsed ? 'Expand All' : 'Collapse All'}
            </button>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  {s1Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>}
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
                  <SelectField label="MVR/CH Approval" field="mvr_ch_approval" options={approvalOptions} />
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
                  </div>
                  <SelectField label="PE Screening Result" field="pe_screening_result" options={resultOptions} />
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
              {allDocsComplete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />All Docs Complete</span>}
              {s2Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {!s2Collapsed && (
          <div className="px-5 pb-5 space-y-3">
            <SelectField label="Registration Status" field="registration_status" options={regOptions} />
            {/* Doc fields with inline Request buttons */}
            {([
              { field: 'form_2290', label: 'Form 2290' },
              { field: 'truck_title', label: 'Truck Title' },
              { field: 'truck_photos', label: 'Truck Photos' },
              { field: 'truck_inspection', label: 'Truck Inspection' },
            ] as { field: keyof OnboardingStatus; label: string }[]).map(({ field, label }) => {
              const current = (status[field] as string) ?? 'not_started';
              const isRequesting = requestingDoc === field;
              const alreadyRequested = current === 'requested';
              const received = current === 'received';
              const files = docFiles[field as string] ?? [];
              const fileCount = files.length;
              return (
                <div key={field as string} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
                    {fileCount > 0 && (
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
                                {f.file_url ? (
                                  <a
                                    href={f.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] text-gold hover:text-gold-light font-medium shrink-0"
                                  >
                                    View <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground shrink-0">No URL</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {/* Mark as Received shortcut */}
                          {!received && (
                            <div className="p-2 border-t border-border">
                              <button
                                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-status-complete bg-status-complete/10 hover:bg-status-complete/20 border border-status-complete/30 rounded-md py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={markingReceived === (field as string)}
                                onClick={async () => {
                                  if (!statusId) return;
                                  setMarkingReceived(field as string);
                                  try {
                                    await supabase.from('onboarding_status').update({ [field]: 'received' }).eq('id', statusId);
                                    // Update local state & snapshot
                                    setStatus(prev => ({ ...prev, [field]: 'received' }));
                                    savedMilestones.current = { ...savedMilestones.current, [field as string]: 'received' };
                                    // Notify operator
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
                                }}
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
                </div>
              );
            })}
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
                  {s3Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>}
                  {s3Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s3Collapsed && (
                <div className="px-5 pb-5 space-y-3">
            <SelectField label="ICA Status" field="ica_status" options={icaOptions} />
            {status.pe_screening_result !== 'clear' && (
              <div className="p-3 rounded-lg bg-status-action/10 border border-status-action/30 text-xs text-status-action">
                PE Screening must be Clear before sending ICA. You can still prepare a draft.
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

        {/* Stage 4 — Missouri Registration (conditional) */}
        {status.registration_status === 'needs_mo_reg' && (() => {
          const s4Complete = status.mo_reg_received === 'yes';
          const s4Collapsed = collapsedStages.has('stage4');
          return (
            <div ref={el => { stageRefs.current['stage4'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s4Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage4')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <FileCheck className={`h-4 w-4 ${s4Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 4 — Missouri Registration</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s4Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Complete</span>}
                  {s4Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s4Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="p-3 rounded-lg bg-status-progress/10 border border-status-progress/30 text-xs text-status-progress">
                    ⚠ Missouri requires Title + Form 2290 + signed ICA submitted together. Partial submissions are not accepted. ICA must be Complete before submitting.
                  </div>
                  <SelectField label="MO Docs Submitted" field="mo_docs_submitted" options={moDocsOptions} />
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Approval Date</Label>
                    <Input type="date" value={status.mo_expected_approval_date ?? ''} onChange={e => updateStatus('mo_expected_approval_date', e.target.value || null)} className="h-9 text-sm" />
                  </div>
                  <SelectField label="MO Registration Received" field="mo_reg_received" options={moRegOptions} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 5 — Equipment */}
        {(() => {
          const allEquipmentReady = status.decal_applied === 'yes' && status.eld_installed === 'yes' && status.fuel_card_issued === 'yes';
          const s5Collapsed = collapsedStages.has('stage5');
          return (
            <div ref={el => { stageRefs.current['stage5'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${allEquipmentReady ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage5')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Truck className={`h-4 w-4 ${allEquipmentReady ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 5 — Equipment Setup</h3>
                </div>
                <div className="flex items-center gap-2">
                  {allEquipmentReady && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />All Equipment Ready</span>}
                  {s5Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s5Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  <SelectField label="Decal Method" field="decal_method" options={methodOptions} />
                  <SelectField label="Decal Applied" field="decal_applied" options={yesNoOptions} />
                  <SelectField label="ELD Method" field="eld_method" options={methodOptions} />
                  <SelectField label="ELD Installed" field="eld_installed" options={yesNoOptions} />
                  <SelectField label="Fuel Card Issued" field="fuel_card_issued" options={yesNoOptions} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 6 — Insurance */}
        {(() => {
          const s6Complete = !!status.insurance_added_date;
          const s6Collapsed = collapsedStages.has('stage6');
          return (
            <div ref={el => { stageRefs.current['stage6'] = el; }} className={`bg-white border rounded-xl shadow-sm transition-colors ${s6Complete ? 'border-status-complete' : 'border-border'}`}>
              <button onClick={() => toggleStage('stage6')} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${s6Complete ? 'text-status-complete' : 'text-gold'}`} />
                  <h3 className="font-semibold text-foreground text-sm">Stage 6 — Insurance</h3>
                </div>
                <div className="flex items-center gap-2">
                  {s6Complete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30"><CheckCircle2 className="h-3 w-3" />Fully Onboarded</span>}
                  {s6Collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {!s6Collapsed && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Added to Insurance Date</Label>
                    <Input
                      type="date"
                      value={status.insurance_added_date ?? ''}
                      onChange={e => updateStatus('insurance_added_date', e.target.value || null)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Unit Number</Label>
                    <Input
                      value={status.unit_number ?? ''}
                      onChange={e => updateStatus('unit_number', e.target.value || null)}
                      placeholder="e.g. ST-042"
                      className="h-9 text-sm"
                    />
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
      </div>

      {/* Dispatch Status History */}
      {(status.fully_onboarded || dispatchHistory.length > 0 || currentDispatchStatus) && (() => {
        const filteredHistory = historyFilter === 'all'
          ? dispatchHistory
          : dispatchHistory.filter(e => e.dispatch_status === historyFilter);

        // Determine which statuses actually appear in loaded history for chip visibility
        const presentStatuses = new Set(dispatchHistory.map(e => e.dispatch_status));

        return (
          <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold" />
                <h3 className="font-semibold text-foreground text-sm">Dispatch Status History</h3>
                {dispatchHistoryTotal > 0 && (
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full border border-border">
                    {dispatchHistoryTotal} {dispatchHistoryTotal === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>
              {currentDispatchStatus && DISPATCH_STATUS_CONFIG[currentDispatchStatus] && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${DISPATCH_STATUS_CONFIG[currentDispatchStatus].badgeClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${DISPATCH_STATUS_CONFIG[currentDispatchStatus].dotClass}`} />
                  Current: {DISPATCH_STATUS_CONFIG[currentDispatchStatus].label}
                </span>
              )}
            </div>

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
          </div>
        );
      })()}


      {/* Inspection Binder — per-driver docs & uploads */}
      {operatorUserId && (
        <div ref={inspectionBinderRef}>
          <OperatorBinderPanel driverUserId={operatorUserId} operatorName={operatorName} />
        </div>
      )}

      {/* Internal Notes */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <Label className="text-sm font-semibold text-foreground mb-2 block">Internal Notes</Label>
        <p className="text-xs text-muted-foreground mb-3">These notes are visible to staff only and will not be shown to the operator.</p>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add internal notes here…"
          className="min-h-[100px] text-sm"
        />
      </div>

      {/* ICA Builder Modal */}
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
