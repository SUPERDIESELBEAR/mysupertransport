import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, format } from 'date-fns';
import { parseLocalDate, formatDaysHuman } from './InspectionBinderTypes'; 
import { ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, AlertOctagon, Clock, ExternalLink, CalendarIcon, Loader2, Check, MinusCircle, Search, List as ListIcon, LayoutGrid, Download, ArrowUpDown, Bell, Upload, History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useComplianceWindow } from '@/hooks/useComplianceWindow';
import { reminderErrorToast } from '@/lib/reminderError';
import { validateFile, normalizeMobileCaptureFile } from '@/lib/validateFile';
import ComplianceHistoryModal from './ComplianceHistoryModal';

// ── Types ──────────────────────────────────────────────────────────────────
type DocKey = 'IRP Registration (cab card)' | 'Insurance' | 'IFTA License' | 'CDL' | 'Medical Certificate';

type Status = 'expired' | 'critical' | 'warning' | 'valid' | 'missing';

interface DocEntry {
  docKey: DocKey;
  operatorId: string;
  operatorName: string;
  expiresAt: string | null; // ISO date string
  daysUntil: number | null; // null = missing/no expiry
  status: Status;
  /** Only set for fleet-wide (IRP/Insurance/IFTA) rows */
  inspectionDocId?: string;
  /** True when expiry was edited but no new file was uploaded (>24h) */
  isStale?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getStatus(daysUntil: number | null, warningWindowDays: number): Status {
  if (daysUntil === null) return 'missing';
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'critical';
  if (daysUntil <= warningWindowDays) return 'warning';
  return 'valid';
}

const STATUS_CONFIG: Record<Status, { label: string; rowCls: string; badgeCls: string; dotCls: string }> = {
  expired:  { label: 'Expired',      rowCls: 'bg-destructive/[0.04] hover:bg-destructive/[0.07] border-l-2 border-l-destructive', badgeCls: 'bg-destructive/10 text-destructive border-destructive/30', dotCls: 'bg-destructive animate-pulse' },
  critical: { label: 'Critical',     rowCls: 'bg-destructive/[0.03] hover:bg-destructive/[0.06] border-l-2 border-l-destructive/60', badgeCls: 'bg-destructive/10 text-destructive border-destructive/30', dotCls: 'bg-destructive' },
  warning:  { label: 'Expiring Soon',rowCls: 'bg-warning/[0.03] hover:bg-warning/[0.06] border-l-2 border-l-warning/60', badgeCls: 'bg-yellow-50 text-yellow-700 border-yellow-300', dotCls: 'bg-yellow-500' },
  valid:    { label: 'Valid',         rowCls: 'bg-background/60 hover:bg-background/80 border-l-2 border-l-transparent', badgeCls: 'bg-status-complete/10 text-status-complete border-status-complete/30', dotCls: 'bg-status-complete' },
  missing:  { label: 'No Expiry Set', rowCls: 'bg-muted/30 hover:bg-muted/50 border-l-2 border-l-border', badgeCls: 'bg-muted text-muted-foreground border-border', dotCls: 'bg-muted-foreground/40' },
};

// Lucide icon paired with each status so meaning isn't color-only (a11y).
const STATUS_ICON: Record<Status, React.ComponentType<{ className?: string }>> = {
  expired: AlertOctagon,
  critical: AlertTriangle,
  warning: Clock,
  valid: CheckCircle2,
  missing: MinusCircle,
};

const DOC_BADGE: Record<DocKey, string> = {
  'IRP Registration (cab card)': 'bg-sky-50 text-sky-700 border-sky-200',
  'Insurance':         'bg-violet-50 text-violet-700 border-violet-200',
  'IFTA License':      'bg-orange-50 text-orange-700 border-orange-200',
  'CDL':               'bg-blue-50 text-blue-700 border-blue-200',
  'Medical Certificate': 'bg-purple-50 text-purple-700 border-purple-200',
};

const DOC_DISPLAY: Record<DocKey, string> = {
  'IRP Registration (cab card)': 'IRP (cab card)',
  'Insurance':         'Insurance',
  'IFTA License':      'IFTA',
  'CDL':               'CDL',
  'Medical Certificate': 'Med Cert',
};

// ── Component ──────────────────────────────────────────────────────────────
interface Props {
  onOpenOperator?: (operatorId: string) => void;
  onOpenOperatorAtBinder?: (operatorId: string) => void;
  onOpenInspectionBinder?: () => void;
  defaultExpanded?: boolean;
}

type FilterStatus = 'all' | 'expired' | 'critical' | 'warning' | 'valid';
type FilterDoc   = 'all' | DocKey;
type SortMode    = 'urgency' | 'name' | 'doc';

export default function InspectionComplianceSummary({ onOpenOperator, onOpenOperatorAtBinder, onOpenInspectionBinder, defaultExpanded = false }: Props) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { windowDays } = useComplianceWindow();
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Last-updated map: inspection_doc_id -> { by, at }
  const [lastUpdated, setLastUpdated] = useState<Record<string, { by: string; at: string }>>({});
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterDoc, setFilterDoc]     = useState<FilterDoc>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    if (typeof window === 'undefined') return 'cards';
    return (localStorage.getItem('compliance_summary_view') as 'list' | 'cards') || 'cards';
  });
  useEffect(() => {
    try { localStorage.setItem('compliance_summary_view', viewMode); } catch {}
  }, [viewMode]);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window === 'undefined') return 'urgency';
    return (localStorage.getItem('compliance_summary_sort') as SortMode) || 'urgency';
  });
  useEffect(() => {
    try { localStorage.setItem('compliance_summary_sort', sortMode); } catch {}
  }, [sortMode]);
  // Per fleet-row save state: key = inspectionDocId
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved]   = useState<Record<string, boolean>>({});
  // Open popover tracking: key = inspectionDocId
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  // Per-driver inline renew popover key = `${operatorId}|${docKey}`
  const [driverPicker, setDriverPicker] = useState<string | null>(null);
  const [driverSaving, setDriverSaving] = useState<Record<string, boolean>>({});
  const [driverSaved, setDriverSaved] = useState<Record<string, boolean>>({});
  // Remind-driver per-cert state: key = `${operatorId}|${docKey}`
  const [remindSending, setRemindSending] = useState<Record<string, boolean>>({});
  const [remindSent, setRemindSent] = useState<Record<string, boolean>>({});
  // Renewal-upload per-cert state: key = `${operatorId}|${docKey}`
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  // History modal state — either per-cert (#16) or per-driver (#17)
  const [historyTarget, setHistoryTarget] = useState<
    | { mode: 'cert'; inspectionDocId: string; operatorId: string | null; docTypeForReminders: string | null; title: string }
    | { mode: 'driver'; operatorId: string; driverUserId: string | null; title: string }
    | null
  >(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Single server-side query: v_compliance_items unifies fleet + driver certs
    // with days_until already calculated against US Central Time in the database.
    const { data: rows } = await supabase
      .from('v_compliance_items')
      .select('entity_kind, operator_id, operator_name, doc_key, inspection_doc_id, expires_at, days_until, file_path, uploaded_at, expires_updated_at');

    if (!rows) { setLoading(false); return; }

    const STALE_MS = 24 * 60 * 60 * 1000;
    const result: DocEntry[] = rows.map((r: any) => {
      const filePath = r.file_path as string | null | undefined;
      const uploadedAt = r.uploaded_at ? new Date(r.uploaded_at).getTime() : null;
      const expiresUpdatedAt = r.expires_updated_at ? new Date(r.expires_updated_at).getTime() : null;
      // Stale = expiry was set/edited but no supporting file uploaded since
      // (either no file at all, OR file is >24h older than the expiry edit).
      const hasExpiry = !!r.expires_at;
      const isStale = hasExpiry && (
        !filePath ||
        (uploadedAt !== null && expiresUpdatedAt !== null && expiresUpdatedAt - uploadedAt > STALE_MS)
      );
      return {
        docKey: (r.doc_key ?? '') as DocKey,
        operatorId: r.entity_kind === 'fleet' ? '__fleet__' : (r.operator_id ?? ''),
        operatorName: r.operator_name ?? 'Unknown',
        expiresAt: r.expires_at ?? null,
        daysUntil: r.days_until ?? null,
        // Status uses the user's chosen warning window, applied to the
        // server-computed days_until — single source of truth for the date math.
        status: getStatus(r.days_until ?? null, windowDays),
        inspectionDocId: r.inspection_doc_id ?? undefined,
        isStale,
      };
    });

    // Sort: fleet rows first, then group by operator (worst status first), within operator CDL before Med Cert
    const tierOrder: Record<Status, number> = { expired: 0, critical: 1, warning: 2, valid: 3, missing: 4 };

    // Compute worst tier per operator for grouping
    const worstTier: Record<string, number> = {};
    result.forEach(e => {
      if (e.operatorId === '__fleet__') return;
      const t = tierOrder[e.status];
      if (worstTier[e.operatorId] === undefined || t < worstTier[e.operatorId]) {
        worstTier[e.operatorId] = t;
      }
    });

    const docOrder: Record<DocKey, number> = {
      'Insurance': 0, 'IFTA License': 1, 'IRP Registration (cab card)': 2, 'CDL': 3, 'Medical Certificate': 4,
    };

    result.sort((a, b) => {
      const aFleet = a.operatorId === '__fleet__' ? 0 : 1;
      const bFleet = b.operatorId === '__fleet__' ? 0 : 1;
      if (aFleet !== bFleet) return aFleet - bFleet;

      // Both fleet
      if (aFleet === 0) return docOrder[a.docKey] - docOrder[b.docKey];

      // Both per-operator: sort by worst tier, then name, then doc type
      const wA = worstTier[a.operatorId] ?? 4;
      const wB = worstTier[b.operatorId] ?? 4;
      if (wA !== wB) return wA - wB;

      const nameCmp = a.operatorName.localeCompare(b.operatorName);
      if (nameCmp !== 0) return nameCmp;

      return docOrder[a.docKey] - docOrder[b.docKey];
    });

    setEntries(result);

    // ── Fetch most-recent audit_log entry per inspection_doc_id ──────────
    // Trigger writes entity_type='compliance', entity_id=inspection_doc_id.
    const docIds = result.map(e => e.inspectionDocId).filter(Boolean) as string[];
    if (docIds.length > 0) {
      const { data: logs } = await supabase
        .from('audit_log')
        .select('entity_id, actor_name, created_at')
        .eq('entity_type', 'compliance')
        .in('entity_id', docIds)
        .order('created_at', { ascending: false })
        .limit(500);
      if (logs) {
        const map: Record<string, { by: string; at: string }> = {};
        // First occurrence per entity_id wins because the list is desc.
        logs.forEach((l: any) => {
          if (!map[l.entity_id]) {
            map[l.entity_id] = { by: l.actor_name ?? 'A staff member', at: l.created_at };
          }
        });
        setLastUpdated(map);
      } else {
        setLastUpdated({});
      }
    } else {
      setLastUpdated({});
    }

    setLoading(false);
  }, [windowDays]);

  useEffect(() => {
    fetchData();

    // Debounced refetch: coalesce realtime bursts (e.g. multi-row writes) into
    // a single refetch so we don't hammer the DB on busy days.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { void fetchData(); }, 400);
    };

    // Scoped subscriptions: only inspection_documents changes (applications
    // expiry edits now fan out to inspection_documents via DB trigger).
    const perDriverChannel = supabase
      .channel('compliance-summary-per-driver')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_documents', filter: 'scope=eq.per_driver' },
        scheduleRefetch)
      .subscribe();

    const fleetChannel = supabase
      .channel('compliance-summary-fleet')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_documents', filter: 'scope=eq.company_wide' },
        scheduleRefetch)
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(perDriverChannel);
      supabase.removeChannel(fleetChannel);
    };
  }, [fetchData]);

  // ── Inline date save for fleet rows ───────────────────────────────────────
  const handleFleetDateChange = async (inspectionDocId: string, docKey: DocKey, date: Date | undefined) => {
    if (!date || !inspectionDocId) return;
    setOpenPicker(null);
    setSaving(prev => ({ ...prev, [inspectionDocId]: true }));

    const isoDate = format(date, 'yyyy-MM-dd');
    const { error } = await supabase
      .from('inspection_documents')
      .update({ expires_at: isoDate, updated_at: new Date().toISOString() })
      .eq('id', inspectionDocId);

    setSaving(prev => ({ ...prev, [inspectionDocId]: false }));

    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: `Could not update ${DOC_DISPLAY[docKey]} expiry.` });
    } else {
      setSaved(prev => ({ ...prev, [inspectionDocId]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [inspectionDocId]: false })), 2000);

      const daysUntil = differenceInDays(date, new Date());
      const urgency = getStatus(daysUntil, windowDays);
      const toastVariant = urgency === 'expired' || urgency === 'critical' ? 'destructive' : 'default';
      const urgencyLabel = urgency === 'expired' ? 'Expired' : urgency === 'critical' ? 'Critical — expiring soon' : urgency === 'warning' ? `Expiring within ${windowDays} days` : 'On track';
      toast({
        variant: toastVariant,
        title: `${DOC_DISPLAY[docKey]} expiry updated`,
        description: `${format(date, 'MMM d, yyyy')} · ${urgencyLabel}`,
      });

      // Optimistically update local state too (realtime will confirm)
      setEntries(prev => prev.map(e =>
        e.inspectionDocId === inspectionDocId
          ? { ...e, expiresAt: isoDate, daysUntil, status: urgency }
          : e,
      ));

      const updaterName = profile
        ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'A staff member'
        : 'A staff member';

      // Audit log entry is written automatically by the
      // log_inspection_expiry_change trigger on inspection_documents — no
      // client-side insert needed (avoids duplicate rows).
      const { data: mgmtRoles } = await supabase
        .from('user_roles').select('user_id').eq('role', 'management');

      // ── Notify all management users ────────────────────────────────────────
      const notifTitle = `${DOC_DISPLAY[docKey]} expiry updated`;
      const notifBody  = `${updaterName} set the fleet ${DOC_DISPLAY[docKey]} expiry to ${format(date, 'MMM d, yyyy')} · ${urgencyLabel}.`;

      if (mgmtRoles && mgmtRoles.length > 0) {
        const recipients = mgmtRoles
          .map(r => r.user_id)
          .filter(uid => uid !== user?.id);

        if (recipients.length > 0) {
          await supabase.from('notifications').insert(
            recipients.map(uid => ({
              user_id: uid,
              title: notifTitle,
              body: notifBody,
              type: 'compliance_update',
              channel: 'in_app' as const,
              link: '/management?view=pipeline',
            }))
          );
        }
      }
    }
  };

  // ── Inline date save for per-driver certs (CDL / Med Cert) ───────────────
  const handleDriverDateChange = async (operatorId: string, docKey: DocKey, inspectionDocId: string | undefined, date: Date | undefined) => {
    if (!date) return;
    const key = `${operatorId}|${docKey}`;
    setDriverPicker(null);
    setDriverSaving(prev => ({ ...prev, [key]: true }));
    const isoDate = format(date, 'yyyy-MM-dd');

    const docName: string = docKey === 'CDL' ? 'CDL (Front)' : 'Medical Certificate';

    let error: any = null;
    if (inspectionDocId) {
      ({ error } = await supabase
        .from('inspection_documents')
        .update({ expires_at: isoDate, updated_at: new Date().toISOString() })
        .eq('id', inspectionDocId));
    } else {
      // No binder row yet — resolve the driver's auth user_id from operators
      // and insert a fresh per_driver inspection_documents row.
      const opLookup = await supabase.from('operators')
        .select('user_id').eq('id', operatorId).maybeSingle();
      const driverUserId = opLookup.data?.user_id as string | undefined;
      if (!driverUserId) {
        error = new Error('Could not resolve driver user_id');
      } else {
        ({ error } = await supabase
          .from('inspection_documents')
          .insert({
            scope: 'per_driver',
            driver_id: driverUserId,
            name: docName,
            expires_at: isoDate,
          }));
      }
    }

    setDriverSaving(prev => ({ ...prev, [key]: false }));
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: `Could not update ${DOC_DISPLAY[docKey]} expiry.` });
      return;
    }
    setDriverSaved(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setDriverSaved(prev => ({ ...prev, [key]: false })), 2000);

    const daysUntil = differenceInDays(date, new Date());
    const urgency = getStatus(daysUntil, windowDays);
    setEntries(prev => prev.map(e =>
      e.operatorId === operatorId && e.docKey === docKey
        ? { ...e, expiresAt: isoDate, daysUntil, status: urgency }
        : e,
    ));
    toast({ title: `${DOC_DISPLAY[docKey]} expiry updated`, description: format(date, 'MMM d, yyyy') });
  };

  // ── Send a cert reminder to a single driver ──────────────────────────────
  const handleSendReminder = async (operatorId: string, operatorName: string, entry: DocEntry) => {
    if (!entry.expiresAt || entry.daysUntil === null) return;
    const key = `${operatorId}|${entry.docKey}`;
    const docType = entry.docKey === 'CDL' ? 'CDL' : 'Medical Cert';
    setRemindSending(prev => ({ ...prev, [key]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
          days_until: entry.daysUntil,
          expiration_date: entry.expiresAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder');
      setRemindSent(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setRemindSent(prev => ({ ...prev, [key]: false })), 8000);
      if (data.email_error) {
        const { title, description } = reminderErrorToast(new Error(data.email_error));
        toast({ title, description, variant: 'destructive' });
      } else {
        toast({ title: 'Reminder sent', description: `Email sent to ${operatorName}` });
      }
    } catch (err: any) {
      const { title, description } = reminderErrorToast(err);
      toast({ title, description, variant: 'destructive' });
    } finally {
      setRemindSending(prev => ({ ...prev, [key]: false }));
    }
  };

  // ── #6 Inline renewal upload ─────────────────────────────────────────────
  // Opens a hidden file picker, uploads to the inspection-documents storage
  // bucket, then updates (or inserts) the matching inspection_documents row
  // with the new file_path + uploaded_at. Audit trigger on inspection_documents
  // fires automatically. Clears the "Stale" chip immediately.
  const handleUploadRenewal = (entry: DocEntry) => {
    const key = `${entry.operatorId}|${entry.docKey}`;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/jpeg,image/png,image/heic,image/heif';
    input.onchange = async () => {
      const raw = input.files?.[0];
      if (!raw) return;
      const file = normalizeMobileCaptureFile(raw);
      const validation = validateFile(file);
      if (!validation.valid) {
        toast({ variant: 'destructive', title: 'Invalid file', description: validation.error });
        return;
      }

      setUploadingKey(key);
      try {
        const docName: string = entry.docKey === 'CDL'
          ? 'CDL (Front)'
          : entry.docKey === 'Medical Certificate'
          ? 'Medical Certificate'
          : entry.docKey === 'IRP Registration (cab card)'
          ? 'IRP Registration (cab card)'
          : entry.docKey; // fleet docs: Insurance / IFTA License

        // Resolve driver_id (auth user_id) for per-driver rows we may need to insert
        let driverUserId: string | null = null;
        if (entry.operatorId !== '__fleet__' && !entry.inspectionDocId) {
          const opLookup = await supabase.from('operators')
            .select('user_id').eq('id', entry.operatorId).maybeSingle();
          driverUserId = opLookup.data?.user_id ?? null;
          if (!driverUserId) throw new Error('Could not resolve driver user_id');
        }

        const folder = entry.operatorId === '__fleet__'
          ? 'company'
          : `driver/${driverUserId ?? entry.operatorId}`;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const safeSlug = docName.replace(/\s+/g, '-').toLowerCase();
        const path = `${folder}/${safeSlug}/${Date.now()}.${ext}`;

        const { error: storageErr } = await supabase.storage
          .from('inspection-documents')
          .upload(path, file, { upsert: false });
        if (storageErr) throw storageErr;

        const { data: urlData } = await supabase.storage
          .from('inspection-documents')
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        const fileUrl = urlData?.signedUrl ?? null;
        const nowIso = new Date().toISOString();

        let dbErr: any = null;
        if (entry.inspectionDocId) {
          ({ error: dbErr } = await supabase
            .from('inspection_documents')
            .update({
              file_url: fileUrl,
              file_path: path,
              uploaded_at: nowIso,
              uploaded_by: user?.id ?? null,
              updated_at: nowIso,
            })
            .eq('id', entry.inspectionDocId));
        } else {
          ({ error: dbErr } = await supabase
            .from('inspection_documents')
            .insert({
              name: docName,
              scope: entry.operatorId === '__fleet__' ? 'company_wide' : 'per_driver',
              driver_id: driverUserId,
              file_url: fileUrl,
              file_path: path,
              uploaded_by: user?.id ?? null,
            }));
        }
        if (dbErr) throw dbErr;

        // Optimistic: clear stale flag immediately
        setEntries(prev => prev.map(e =>
          e.operatorId === entry.operatorId && e.docKey === entry.docKey
            ? { ...e, isStale: false }
            : e,
        ));
        setUploadedKey(key);
        setTimeout(() => setUploadedKey(curr => curr === key ? null : curr), 2500);
        toast({ title: 'Renewal uploaded', description: `${DOC_DISPLAY[entry.docKey] ?? docName} file replaced.` });
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Upload failed', description: err?.message ?? 'Unknown error' });
      } finally {
        setUploadingKey(curr => curr === key ? null : curr);
      }
    };
    input.click();
  };

  // ── Derived counts ────────────────────────────────────────────────────────
  const counts = {
    expired:  entries.filter(e => e.status === 'expired').length,
    critical: entries.filter(e => e.status === 'critical').length,
    warning:  entries.filter(e => e.status === 'warning').length,
    valid:    entries.filter(e => e.status === 'valid').length,
    missing:  entries.filter(e => e.status === 'missing').length,
  };

  const hasCritical = counts.expired + counts.critical > 0;

  const filtered = entries.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterDoc !== 'all' && e.docKey !== filterDoc) return false;
    return true;
  });

  if (!loading && entries.length === 0) return null;

  const DOC_KEYS: DocKey[] = ['IRP Registration (cab card)', 'Insurance', 'IFTA License', 'CDL', 'Medical Certificate'];

  // ── CSV export ─────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = [
      ['Scope', 'Driver / Fleet', 'Document', 'Expires', 'Days Until', 'Status'],
      ...filtered.map(e => [
        e.operatorId === '__fleet__' ? 'Fleet' : 'Driver',
        e.operatorId === '__fleet__' ? 'Fleet (all drivers)' : e.operatorName,
        DOC_DISPLAY[e.docKey] ?? e.docKey,
        e.expiresAt ? format(parseLocalDate(e.expiresAt), 'yyyy-MM-dd') : '',
        e.daysUntil === null ? '' : String(e.daysUntil),
        STATUS_CONFIG[e.status].label,
      ]),
    ];
    const csv = rows.map(r => r.map(c => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Group per-driver CDL + Med Cert into one entry; fleet rows stay separate ──
  type DriverGroup = {
    kind: 'driver';
    operatorId: string;
    operatorName: string;
    cdl?: DocEntry;
    med?: DocEntry;
    irp?: DocEntry;
    worstStatus: Status;
    worstDays: number | null;
  };
  type FleetGroup = { kind: 'fleet'; entry: DocEntry };
  type Group = DriverGroup | FleetGroup;

  const tierRank: Record<Status, number> = { expired: 0, critical: 1, warning: 2, missing: 3, valid: 4 };
  const q = search.trim().toLowerCase();

  const grouped: Group[] = (() => {
    const fleetGroups: FleetGroup[] = [];
    const byDriver = new Map<string, DriverGroup>();
    filtered.forEach(e => {
      if (e.operatorId === '__fleet__') {
        fleetGroups.push({ kind: 'fleet', entry: e });
        return;
      }
      let g = byDriver.get(e.operatorId);
      if (!g) {
        g = {
          kind: 'driver',
          operatorId: e.operatorId,
          operatorName: e.operatorName,
          worstStatus: 'valid',
          worstDays: null,
        };
        byDriver.set(e.operatorId, g);
      }
      if (e.docKey === 'CDL') g.cdl = e;
      else if (e.docKey === 'Medical Certificate') g.med = e;
      else if (e.docKey === 'IRP Registration (cab card)') g.irp = e;
    });
    byDriver.forEach(g => {
      const certs = [g.cdl, g.med, g.irp].filter(Boolean) as DocEntry[];
      let worst: Status = 'valid';
      let worstDays: number | null = null;
      certs.forEach(c => {
        if (tierRank[c.status] < tierRank[worst]) worst = c.status;
        if (c.daysUntil !== null && (worstDays === null || c.daysUntil < worstDays)) {
          worstDays = c.daysUntil;
        }
      });
      g.worstStatus = worst;
      g.worstDays = worstDays;
    });
    let drivers = Array.from(byDriver.values());
    if (q) drivers = drivers.filter(d => d.operatorName.toLowerCase().includes(q));
    drivers.sort((a, b) => {
      if (sortMode === 'name') return a.operatorName.localeCompare(b.operatorName);
      if (sortMode === 'doc') {
        // Drivers with the soonest CDL expiry first; then Med Cert; then by name
        const aCdl = a.cdl?.daysUntil ?? Number.POSITIVE_INFINITY;
        const bCdl = b.cdl?.daysUntil ?? Number.POSITIVE_INFINITY;
        if (aCdl !== bCdl) return aCdl - bCdl;
        return a.operatorName.localeCompare(b.operatorName);
      }
      // Default: urgency
      const t = tierRank[a.worstStatus] - tierRank[b.worstStatus];
      if (t !== 0) return t;
      return a.operatorName.localeCompare(b.operatorName);
    });
    // When a search is active, hide fleet rows so results stay focused.
    const fleet = q ? [] : fleetGroups;
    return [...fleet, ...drivers];
  })();

  // ── Tiny reusable bits for the new views ─────────────────────────────────
  const CertPill = ({ entry }: { entry: DocEntry }) => {
    const cfg = STATUS_CONFIG[entry.status];
    const label = entry.status === 'expired'
      ? `${formatDaysHuman(Math.abs(entry.daysUntil!))} ago`
      : entry.status === 'missing'
      ? 'No date'
      : entry.daysUntil === 0
      ? 'Today'
      : formatDaysHuman(entry.daysUntil!);
    return (
      <span className={cn('inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold border', cfg.badgeCls)}>
        {label}
      </span>
    );
  };

  const stripeCls = (s: Status) =>
    s === 'expired' || s === 'critical'
      ? 'before:bg-destructive'
      : s === 'warning'
      ? 'before:bg-yellow-500'
      : s === 'missing'
      ? 'before:bg-muted-foreground/40'
      : 'before:bg-status-complete';

  const cardWrapperCls = (s: Status) => cn(
    'relative overflow-hidden rounded-lg border bg-card transition-colors',
    'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1',
    stripeCls(s),
    s === 'expired' || s === 'critical'
      ? 'border-destructive/40 bg-destructive/[0.03]'
      : s === 'warning'
      ? 'border-warning/40 bg-warning/[0.03]'
      : 'border-border',
  );

  const openDriver = (operatorId: string) => {
    if (onOpenOperatorAtBinder) onOpenOperatorAtBinder(operatorId);
    else if (onOpenOperator) onOpenOperator(operatorId);
  };

  // Compact "X ago" formatter for the last-updated line.
  const formatAgo = (iso: string): string => {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  };

  const LastUpdatedLine = ({ entry }: { entry: DocEntry }) => {
    if (!entry.inspectionDocId) return null;
    const meta = lastUpdated[entry.inspectionDocId];
    if (!meta) return null;
    return (
      <div className="text-[10px] text-muted-foreground/70 italic pl-[68px] pb-0.5">
        Updated by {meta.by}, {formatAgo(meta.at)}
      </div>
    );
  };

  // Shared inline date editor + remind-driver button for per-driver certs.
  const DriverDateEditor = ({ entry }: { entry: DocEntry }) => {
    const key = `${entry.operatorId}|${entry.docKey}`;
    const isOpen = driverPicker === key;
    const isSaving = !!driverSaving[key];
    const isSaved = !!driverSaved[key];
    return (
      <Popover open={isOpen} onOpenChange={open => setDriverPicker(open ? key : null)}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 -mx-1 text-xs tabular-nums transition-colors',
              isOpen ? 'bg-muted/60 text-foreground' : 'text-foreground hover:bg-muted/40',
              isSaved && 'text-status-complete',
            )}
            disabled={isSaving}
            aria-label={`Edit ${DOC_DISPLAY[entry.docKey]} expiry for ${entry.operatorName}`}
          >
            {isSaving
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : isSaved
              ? <Check className="h-3 w-3" />
              : <CalendarIcon className="h-3 w-3 opacity-50" />}
            <span>
              {entry.expiresAt
                ? format(parseLocalDate(entry.expiresAt), 'MMM d, yyyy')
                : <span className="italic opacity-60">Set date</span>}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" side="bottom">
          <div className="px-3 pt-3 pb-1 border-b border-border/60">
            <p className="text-xs font-semibold text-foreground">
              {entry.operatorName} · {DOC_DISPLAY[entry.docKey]} expiry
            </p>
            <p className="text-[11px] text-muted-foreground">Past dates disabled. Click a day to save.</p>
          </div>
          <Calendar
            mode="single"
            selected={entry.expiresAt ? parseLocalDate(entry.expiresAt) : undefined}
            onSelect={date => handleDriverDateChange(entry.operatorId, entry.docKey, entry.inspectionDocId, date)}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    );
  };

  // Amber chip shown when expiry was set/edited but no new file is on record.
  const StaleChip = ({ entry }: { entry: DocEntry }) => {
    if (!entry.isStale) return null;
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label="Expiry edited but no new file uploaded"
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-300"
            >
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              Stale
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">
            Expiry date was updated but no renewed file has been uploaded. Upload the new document to clear this flag.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const RemindButton = ({ entry }: { entry: DocEntry }) => {
    if (entry.status !== 'expired' && entry.status !== 'critical') return null;
    if (!entry.expiresAt) return null;
    const key = `${entry.operatorId}|${entry.docKey}`;
    const sending = !!remindSending[key];
    const sent = !!remindSent[key];
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleSendReminder(entry.operatorId, entry.operatorName, entry)}
              disabled={sending || sent}
              aria-label={`Send ${DOC_DISPLAY[entry.docKey]} reminder to ${entry.operatorName}`}
              className={cn(
                'h-6 w-6 rounded flex items-center justify-center shrink-0 transition-colors',
                sent
                  ? 'text-status-complete bg-status-complete/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {sending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : sent
                ? <Check className="h-3.5 w-3.5" />
                : <Bell className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {sent ? 'Reminder sent' : `Email ${entry.operatorName.split(' ')[0]} about ${DOC_DISPLAY[entry.docKey]}`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // #6 Inline renewal upload button — replaces the on-file document and
  // refreshes uploaded_at so the stale chip clears automatically.
  const UploadButton = ({ entry }: { entry: DocEntry }) => {
    const key = `${entry.operatorId}|${entry.docKey}`;
    const isUploading = uploadingKey === key;
    const isUploaded = uploadedKey === key;
    const label = isUploaded ? 'Renewal uploaded' : `Upload renewal for ${DOC_DISPLAY[entry.docKey]}`;
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleUploadRenewal(entry)}
              disabled={isUploading}
              aria-label={label}
              className={cn(
                'h-6 w-6 rounded flex items-center justify-center shrink-0 transition-colors',
                isUploaded
                  ? 'text-status-complete bg-status-complete/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {isUploading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : isUploaded
                ? <Check className="h-3.5 w-3.5" />
                : <Upload className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // #16 — open per-cert audit history
  const openCertHistory = (entry: DocEntry) => {
    if (!entry.inspectionDocId) return;
    const docTypeForReminders =
      entry.docKey === 'CDL' ? 'CDL'
      : entry.docKey === 'Medical Certificate' ? 'Medical Cert'
      : null;
    setHistoryTarget({
      mode: 'cert',
      inspectionDocId: entry.inspectionDocId,
      operatorId: entry.operatorId === '__fleet__' ? null : entry.operatorId,
      docTypeForReminders,
      title: `${entry.operatorId === '__fleet__' ? 'Fleet' : entry.operatorName} — ${DOC_DISPLAY[entry.docKey]} history`,
    });
  };

  const HistoryButton = ({ entry }: { entry: DocEntry }) => {
    if (!entry.inspectionDocId) return null;
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => openCertHistory(entry)}
              aria-label={`View ${DOC_DISPLAY[entry.docKey]} history for ${entry.operatorName}`}
              className="h-6 w-6 rounded flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">View history</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // #17 — open per-driver compliance timeline
  const openDriverTimeline = async (operatorId: string, operatorName: string) => {
    const opLookup = await supabase.from('operators')
      .select('user_id').eq('id', operatorId).maybeSingle();
    setHistoryTarget({
      mode: 'driver',
      operatorId,
      driverUserId: opLookup.data?.user_id ?? null,
      title: `${operatorName} — Compliance timeline`,
    });
  };

  // Row inside a driver card entry for a single cert.
  const CertSubRow = ({ entry }: { entry: DocEntry }) => {
    const cfg = STATUS_CONFIG[entry.status];
    return (
      <div className="py-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dotCls)} aria-hidden="true" />
          <span className={cn('inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0', DOC_BADGE[entry.docKey])}>
            {DOC_DISPLAY[entry.docKey]}
          </span>
          <span className="flex-1 min-w-0 truncate">
            <DriverDateEditor entry={entry} />
          </span>
          <StaleChip entry={entry} /><HistoryButton entry={entry} /><UploadButton entry={entry} /><RemindButton entry={entry} />
          <CertPill entry={entry} />
        </div>
        <LastUpdatedLine entry={entry} />
      </div>
    );
  };

  // List-view variant: aligned columns, no colored doc-badge background.
  // Doc label is bold muted text; tabular-nums keeps dates vertically aligned.
  const ListCertSubRow = ({ entry }: { entry: DocEntry }) => {
    const cfg = STATUS_CONFIG[entry.status];
    return (
      <div className="py-0.5">
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dotCls)} aria-hidden="true" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[60px] shrink-0">
            {DOC_DISPLAY[entry.docKey]}
          </span>
          <span className="w-[140px] shrink-0">
            <DriverDateEditor entry={entry} />
          </span>
          <span className="flex-1" />
          <StaleChip entry={entry} /><HistoryButton entry={entry} /><UploadButton entry={entry} /><RemindButton entry={entry} />
          <CertPill entry={entry} />
        </div>
        <LastUpdatedLine entry={entry} />
      </div>
    );
  };

  return (
    <div className={cn(
      'border rounded-xl shadow-sm overflow-hidden',
      hasCritical ? 'border-warning/40 bg-warning/[0.03]' : 'border-border bg-card',
    )}>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity min-w-0"
        >
          <div className={cn(
            'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
            hasCritical ? 'bg-warning/15' : 'bg-status-complete/10',
          )}>
            <ShieldCheck className={cn('h-4 w-4', hasCritical ? 'text-warning-foreground' : 'text-status-complete')} />
          </div>
          <span className="font-semibold text-sm text-foreground">Compliance Summary</span>
          <span className={cn(
            'inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold leading-none',
            hasCritical ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground',
          )}>
            {entries.length}
          </span>

          {/* Summary chips */}
          <div className="hidden sm:flex items-center gap-1 ml-1 flex-wrap">
            {counts.expired > 0 && (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/30">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                {counts.expired} Expired
              </span>
            )}
            {counts.critical > 0 && (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/30">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {counts.critical} Critical
              </span>
            )}
            {counts.warning > 0 && (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                {counts.warning} Expiring Soon
              </span>
            )}
            {counts.valid > 0 && (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold bg-status-complete/10 text-status-complete border border-status-complete/30">
                <span className="h-1.5 w-1.5 rounded-full bg-status-complete" />
                {counts.valid} Valid
              </span>
            )}
          </div>

          <span className="text-xs text-muted-foreground hidden lg:inline truncate">
            Insurance · IFTA · IRP (cab card) · CDL · Med Cert
          </span>
        </button>

        <button onClick={() => setExpanded(v => !v)} className="shrink-0 hover:opacity-80 transition-opacity">
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-border/60">
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 bg-muted/20 border-b border-border/40">
            {/* Status filters */}
            {(['all', 'expired', 'critical', 'warning', 'valid'] as FilterStatus[]).map(s => {
              const count = s === 'all' ? entries.length : counts[s];
              if (s !== 'all' && count === 0) return null;
              const active = filterStatus === s && filterDoc === 'all';
              return (
                <button
                  key={s}
                  onClick={() => { setFilterStatus(s); setFilterDoc('all'); }}
                  className={cn(
                    'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold border transition-all',
                    active
                      ? s === 'all'
                        ? 'bg-foreground text-background border-foreground'
                        : s === 'valid'
                        ? 'bg-status-complete/20 text-status-complete border-status-complete/40'
                        : s === 'warning'
                        ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                        : 'bg-destructive/15 text-destructive border-destructive/40'
                      : 'bg-background border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                  )}
                >
                  {s === 'all' ? 'All' : s === 'critical' ? 'Critical' : s === 'warning' ? 'Expiring Soon' : s === 'valid' ? 'Valid' : 'Expired'}
                  <span className="text-[9px] font-bold">{count}</span>
                </button>
              );
            })}

            <span className="h-4 w-px bg-border mx-0.5" />

            {/* Doc type filters */}
            {DOC_KEYS.map(dk => {
              const count = entries.filter(e => e.docKey === dk).length;
              if (count === 0) return null;
              const active = filterDoc === dk;
              return (
                <button
                  key={dk}
                  onClick={() => { setFilterDoc(active ? 'all' : dk); setFilterStatus('all'); }}
                  className={cn(
                    'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold border transition-all',
                    active
                      ? DOC_BADGE[dk]
                      : 'bg-background border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                  )}
                >
                  {DOC_DISPLAY[dk]}
                  <span className="text-[9px] font-bold">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search + view toggle */}
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/10 border-b border-border/40">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search driver…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            {/* Sort */}
            <div className="ml-auto inline-flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <select
                aria-label="Sort drivers"
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="h-8 px-1.5 text-[11px] font-semibold bg-background border border-border rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="urgency">Urgency</option>
                <option value="name">Driver A–Z</option>
                <option value="doc">Soonest CDL</option>
              </select>
            </div>
            {/* CSV export */}
            <button
              onClick={exportCsv}
              aria-label="Export visible rows to CSV"
              className="inline-flex items-center gap-1 h-8 px-2 text-[11px] font-semibold bg-background border border-border rounded-md text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <div className="inline-flex rounded-md border border-border bg-background overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'inline-flex items-center gap-1 px-2 h-8 text-[11px] font-semibold transition-colors',
                  viewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={viewMode === 'list'}
              >
                <ListIcon className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={cn(
                  'inline-flex items-center gap-1 px-2 h-8 text-[11px] font-semibold transition-colors border-l border-border',
                  viewMode === 'cards' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={viewMode === 'cards'}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Cards
              </button>
            </div>
          </div>

          {/* Body — grouped per driver */}
          {loading ? (
            <div className="divide-y divide-border/50">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-muted shrink-0" />
                  <span className="flex-1 h-4 bg-muted rounded" />
                  <span className="h-5 w-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="px-4 py-10 text-center">
              {q ? (
                <p className="text-sm text-muted-foreground">No drivers match "{search}".</p>
              ) : filterStatus === 'all' && filterDoc === 'all' && counts.expired === 0 && counts.critical === 0 && counts.warning === 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-status-complete/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-status-complete" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">All compliant</p>
                  <p className="text-xs text-muted-foreground">No expired, critical, or expiring certifications.</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No entries match the current filter.</p>
              )}
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
              {grouped.map((g, i) => {
                if (g.kind === 'fleet') {
                  const entry = g.entry;
                  const docId = entry.inspectionDocId;
                  const isSaving = docId ? !!saving[docId] : false;
                  const isSaved  = docId ? !!saved[docId]  : false;
                  const isPickerOpen = docId ? openPicker === docId : false;
                  const cfg = STATUS_CONFIG[entry.status];
                  return (
                    <div key={`fleet-${i}`} className={cn(cardWrapperCls(entry.status), 'pl-3')}>
                      <div className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', cfg.dotCls)} />
                          <span className="font-semibold text-sm text-foreground truncate">Fleet (all drivers)</span>
                          <span className="ml-auto text-[10px] text-muted-foreground italic">Fleet-wide</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={cn('inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border', DOC_BADGE[entry.docKey])}>
                            {DOC_DISPLAY[entry.docKey]}
                          </span>
                          {docId ? (
                            <Popover open={isPickerOpen} onOpenChange={open => setOpenPicker(open ? docId : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  className={cn('flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 transition-colors',
                                    isPickerOpen ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                                    isSaved && 'text-status-complete')}
                                  disabled={isSaving}
                                >
                                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : isSaved ? <Check className="h-3 w-3" /> : <CalendarIcon className="h-3 w-3 opacity-50" />}
                                  <span>{entry.expiresAt ? format(parseLocalDate(entry.expiresAt), 'MMM d, yyyy') : <span className="italic opacity-50">Set date</span>}</span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start" side="bottom">
                                <div className="px-3 pt-3 pb-1 border-b border-border/60">
                                  <p className="text-xs font-semibold text-foreground">{DOC_DISPLAY[entry.docKey]} Expiry</p>
                                  <p className="text-[11px] text-muted-foreground">Click a date to save</p>
                                </div>
                                <Calendar
                                  mode="single"
                                  selected={entry.expiresAt ? parseLocalDate(entry.expiresAt) : undefined}
                                  onSelect={date => handleFleetDateChange(docId, entry.docKey, date)}
                                  disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                  initialFocus
                                  className={cn('p-3 pointer-events-auto')}
                                />
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Not set</span>
                          )}
                          <span className="ml-auto flex items-center gap-1.5">
                            <StaleChip entry={entry} />
                            <HistoryButton entry={entry} />
                            <UploadButton entry={entry} />
                            <CertPill entry={entry} />
                          </span>
                        </div>
                        {onOpenInspectionBinder && (
                          <button
                            onClick={onOpenInspectionBinder}
                            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-gold hover:underline"
                          >
                            Open Inspection Binder <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                // Driver group
                return (
                  <div key={g.operatorId} className={cn(cardWrapperCls(g.worstStatus), 'pl-3')}>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">{g.operatorName}</span>
                        <span className={cn(
                          'ml-auto inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold border',
                          STATUS_CONFIG[g.worstStatus].badgeCls,
                        )}>
                          {STATUS_CONFIG[g.worstStatus].label}
                        </span>
                      </div>
                      <div className="mt-2 divide-y divide-border/40">
                        {g.cdl && <CertSubRow entry={g.cdl} />}
                        {g.med && <CertSubRow entry={g.med} />}
                        {g.irp && <CertSubRow entry={g.irp} />}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => openDriver(g.operatorId)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Open in Binder <ExternalLink className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => openDriverTimeline(g.operatorId, g.operatorName)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Timeline <History className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // List view (grouped)
            <div className="divide-y divide-border/50">
              {grouped.map((g, i) => {
                if (g.kind === 'fleet') {
                  const entry = g.entry;
                  const cfg = STATUS_CONFIG[entry.status];
                  const docId = entry.inspectionDocId;
                  const isSaving = docId ? !!saving[docId] : false;
                  const isSaved  = docId ? !!saved[docId]  : false;
                  const isPickerOpen = docId ? openPicker === docId : false;
                  return (
                    <div key={`fleet-l-${i}`} className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors', cfg.rowCls)}>
                      <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dotCls)} />
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-sm text-foreground truncate">Fleet (all drivers)</span>
                        <span className={cn('inline-flex items-center text-[11px] px-1.5 py-0.5 rounded font-medium border', DOC_BADGE[entry.docKey])}>
                          {DOC_DISPLAY[entry.docKey]}
                        </span>
                        <span className="text-[10px] text-muted-foreground italic">Fleet-wide</span>
                      </div>
                      <div className="hidden sm:block shrink-0 w-[140px]">
                        {docId ? (
                          <Popover open={isPickerOpen} onOpenChange={open => setOpenPicker(open ? docId : null)}>
                            <PopoverTrigger asChild>
                              <button
                                className={cn('flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 -mx-1.5 transition-colors',
                                  isPickerOpen ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                                  isSaved && 'text-status-complete')}
                                disabled={isSaving}
                              >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : isSaved ? <Check className="h-3 w-3" /> : <CalendarIcon className="h-3 w-3 opacity-50" />}
                                <span>{entry.expiresAt ? format(parseLocalDate(entry.expiresAt), 'MMM d, yyyy') : <span className="italic opacity-50">Set date</span>}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start" side="bottom">
                              <Calendar
                                mode="single"
                                selected={entry.expiresAt ? parseLocalDate(entry.expiresAt) : undefined}
                                onSelect={date => handleFleetDateChange(docId, entry.docKey, date)}
                                  disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                initialFocus
                                className={cn('p-3 pointer-events-auto')}
                              />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not set</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 justify-end">
                        <StaleChip entry={entry} />
                        <HistoryButton entry={entry} />
                        <UploadButton entry={entry} />
                        <CertPill entry={entry} />
                        {onOpenInspectionBinder && (
                          <button
                            onClick={onOpenInspectionBinder}
                            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-gold hover:bg-gold/10 transition-colors"
                            title="Update in Inspection Binder"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                const cfg = STATUS_CONFIG[g.worstStatus];
                const StatusIcon = STATUS_ICON[g.worstStatus];
                const ariaLabel = `${g.operatorName} — ${cfg.label}` +
                  (g.worstDays !== null
                    ? `, ${g.worstDays < 0 ? `expired ${Math.abs(g.worstDays)} days ago` : g.worstDays === 0 ? 'expires today' : `${g.worstDays} days remaining`}`
                    : '');
                return (
                  <div
                    key={g.operatorId}
                    aria-label={ariaLabel}
                    className={cn('flex items-start gap-3 px-4 py-2 transition-colors', cfg.rowCls)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground truncate">{g.operatorName}</span>
                        <span className={cn('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border', cfg.badgeCls)}>
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-1 ml-1 pl-3 border-l border-border/60">
                        {g.cdl && <ListCertSubRow entry={g.cdl} />}
                        {g.med && <ListCertSubRow entry={g.med} />}
                        {g.irp && <ListCertSubRow entry={g.irp} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <TooltipProvider delayDuration={250}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => openDriverTimeline(g.operatorId, g.operatorName)}
                              aria-label={`View ${g.operatorName} compliance timeline`}
                              className="min-h-11 min-w-11 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <History className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Compliance timeline</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <button
                        onClick={() => openDriver(g.operatorId)}
                        aria-label={`Open ${g.operatorName} in Inspection Binder`}
                        className="min-h-11 min-w-11 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer summary */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 bg-muted/10 border-t border-border/40">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
                {counts.valid} valid
              </div>
              {counts.warning > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-yellow-500" />
                  {counts.warning} expiring soon
                </div>
              )}
              {(counts.expired + counts.critical) > 0 && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {counts.expired + counts.critical} need attention
                </div>
              )}
              {counts.missing > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <span>{counts.missing} no date set</span>
                </div>
              )}
              <div className="ml-auto text-[10px] text-muted-foreground/40 italic hidden sm:block">
                Click a fleet date to edit
              </div>
            </div>
          )}
        </div>
      )}

      {historyTarget && (
        historyTarget.mode === 'cert' ? (
          <ComplianceHistoryModal
            open
            onClose={() => setHistoryTarget(null)}
            mode="cert"
            title={historyTarget.title}
            inspectionDocId={historyTarget.inspectionDocId}
            operatorId={historyTarget.operatorId}
            docTypeForReminders={historyTarget.docTypeForReminders}
          />
        ) : (
          <ComplianceHistoryModal
            open
            onClose={() => setHistoryTarget(null)}
            mode="driver"
            title={historyTarget.title}
            operatorId={historyTarget.operatorId}
            driverUserId={historyTarget.driverUserId}
          />
        )
      )}
    </div>
  );
}
