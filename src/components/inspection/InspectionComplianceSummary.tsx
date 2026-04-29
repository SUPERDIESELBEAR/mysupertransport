import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, format } from 'date-fns';
import { parseLocalDate, formatDaysHuman } from './InspectionBinderTypes'; 
import { ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock, ExternalLink, CalendarIcon, Loader2, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useComplianceWindow } from '@/hooks/useComplianceWindow';
import { ComplianceWindowPicker } from '@/components/shared/ComplianceWindowPicker';

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

// Map inspection_documents.name → our DocKey
const INSPECTION_NAMES: Record<string, DocKey> = {
  'IRP Registration (cab card)': 'IRP Registration (cab card)',
  'Insurance':        'Insurance',
  'IFTA License':     'IFTA License',
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

export default function InspectionComplianceSummary({ onOpenOperator, onOpenOperatorAtBinder, onOpenInspectionBinder, defaultExpanded = false }: Props) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterDoc, setFilterDoc]     = useState<FilterDoc>('all');
  // Per fleet-row save state: key = inspectionDocId
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved]   = useState<Record<string, boolean>>({});
  // Open popover tracking: key = inspectionDocId
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date();

    // 1. Fetch all operators with their names (from applications)
    const { data: ops } = await supabase
      .from('operators')
      .select(`id, user_id, application_id, applications(first_name, last_name, cdl_expiration, medical_cert_expiration)`)
      .not('application_id', 'is', null)
      .eq('is_active', true);

    // 2. Fetch company-wide inspection docs (Insurance, IFTA — IRP is now per-driver)
    const [{ data: inspDocs }, { data: binderDocs }] = await Promise.all([
      supabase
        .from('inspection_documents')
        .select('id, name, expires_at')
        .eq('scope', 'company_wide')
        .in('name', ['Insurance', 'IFTA License']),
      supabase
        .from('inspection_documents')
        .select('driver_id, name, expires_at')
        .eq('scope', 'per_driver')
        .in('name', ['CDL (Front)', 'Medical Certificate']),
    ]);

    if (!ops) { setLoading(false); return; }

    // Build binder expiry lookup: driver_id (user_id) → { cdl, med }
    const binderDates: Record<string, { cdl?: string; med?: string }> = {};
    (binderDocs ?? []).forEach((doc: any) => {
      if (!doc.driver_id || !doc.expires_at) return;
      if (!binderDates[doc.driver_id]) binderDates[doc.driver_id] = {};
      if (doc.name === 'CDL (Front)') binderDates[doc.driver_id].cdl = doc.expires_at;
      if (doc.name === 'Medical Certificate') binderDates[doc.driver_id].med = doc.expires_at;
    });

    const result: DocEntry[] = [];

    // Build operator name lookup
    const opNames: Record<string, string> = {};
    (ops as any[]).forEach(op => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      opNames[op.id] = app
        ? `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Unknown'
        : 'Unknown';
    });

    // ── Company-wide docs (Insurance, IFTA) ───────────────────────────────
    const companyDocMap: Partial<Record<DocKey, { id: string; expiresAt: string | null; daysUntil: number | null }>> = {};
    (inspDocs ?? []).forEach((doc: any) => {
      const key = INSPECTION_NAMES[doc.name];
      if (!key) return;
      const daysUntil = doc.expires_at
        ? differenceInDays(parseLocalDate(doc.expires_at), today)
        : null;
      companyDocMap[key] = { id: doc.id, expiresAt: doc.expires_at, daysUntil };
    });

    // For each company-wide doc, emit one row labelled "Fleet"
    (['Insurance', 'IFTA License'] as DocKey[]).forEach(docKey => {
      const info = companyDocMap[docKey];
      result.push({
        docKey,
        operatorId: '__fleet__',
        operatorName: 'Fleet (all drivers)',
        expiresAt: info?.expiresAt ?? null,
        daysUntil: info?.daysUntil ?? null,
        status: getStatus(info?.daysUntil ?? null),
        inspectionDocId: info?.id,
      });
    });

    // ── Per-operator: CDL & Medical Cert ──────────────────────────────────
    (ops as any[]).forEach(op => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const name = opNames[op.id];

      const cdlDate = binderDates[op.user_id]?.cdl ?? app.cdl_expiration ?? null;
      const medDate = binderDates[op.user_id]?.med ?? app.medical_cert_expiration ?? null;
      const cdlDays = cdlDate ? differenceInDays(parseLocalDate(cdlDate), today) : null;
      const medDays = medDate ? differenceInDays(parseLocalDate(medDate), today) : null;

      result.push({
        docKey: 'CDL',
        operatorId: op.id,
        operatorName: name,
        expiresAt: cdlDate,
        daysUntil: cdlDays,
        status: getStatus(cdlDays),
      });
      result.push({
        docKey: 'Medical Certificate',
        operatorId: op.id,
        operatorName: name,
        expiresAt: medDate,
        daysUntil: medDays,
        status: getStatus(medDays),
      });
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
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Realtime: re-fetch when inspection_documents changes (IRP, Insurance, IFTA expiry updates)
    const inspChannel = supabase
      .channel('compliance-summary-inspection')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspection_documents' }, () => {
        fetchData();
      })
      .subscribe();

    // Realtime: re-fetch when applications changes (CDL / Medical Cert expiry updates)
    const appChannel = supabase
      .channel('compliance-summary-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(inspChannel);
      supabase.removeChannel(appChannel);
    };
  }, [fetchData]);

  // ── Inline date save for fleet rows ───────────────────────────────────────
  const handleFleetDateChange = async (inspectionDocId: string, docKey: DocKey, date: Date | undefined) => {
    if (!date || !inspectionDocId) return;
    setOpenPicker(null);
    setSaving(prev => ({ ...prev, [inspectionDocId]: true }));

    // Capture old expiry before the update for the audit trail
    const oldEntry = entries.find(e => e.inspectionDocId === inspectionDocId);
    const oldDate = oldEntry?.expiresAt ?? null;

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
      const urgency = getStatus(daysUntil);
      const toastVariant = urgency === 'expired' || urgency === 'critical' ? 'destructive' : 'default';
      const urgencyLabel = urgency === 'expired' ? 'Expired' : urgency === 'critical' ? 'Critical — expiring soon' : urgency === 'warning' ? 'Expiring within 90 days' : 'On track';
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

      // ── Fan-out: notifications + audit log in parallel ─────────────────────
      const [{ data: mgmtRoles }] = await Promise.all([
        supabase.from('user_roles').select('user_id').eq('role', 'management'),
        // Audit log entry
        supabase.from('audit_log').insert({
          actor_id: user?.id ?? null,
          actor_name: updaterName,
          entity_type: 'compliance',
          entity_id: inspectionDocId,
          entity_label: `Fleet ${DOC_DISPLAY[docKey]}`,
          action: 'expiry_updated',
          metadata: {
            document_type: docKey,
            old_expiry: oldDate,
            new_expiry: isoDate,
            urgency,
          },
        }),
      ]);

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

          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10">
            <span className="h-2 w-2 shrink-0" />
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Operator / Document</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden sm:block shrink-0 w-[118px]">Expires</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 shrink-0 w-[116px] text-right">Status</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-muted shrink-0" />
                  <span className="flex-1 h-4 bg-muted rounded" />
                  <span className="h-4 w-20 bg-muted rounded hidden sm:block" />
                  <span className="h-5 w-20 bg-muted rounded" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No entries match the current filter.
              </div>
            ) : (
              filtered.map((entry, i) => {
                const cfg = STATUS_CONFIG[entry.status];
                const isFleet = entry.operatorId === '__fleet__';
                const docId = entry.inspectionDocId;
                const isSaving = docId ? !!saving[docId] : false;
                const isSaved  = docId ? !!saved[docId]  : false;
                const isPickerOpen = docId ? openPicker === docId : false;

                return (
                  <div
                    key={`${entry.operatorId}-${entry.docKey}-${i}`}
                    className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors', cfg.rowCls)}
                  >
                    {/* Dot */}
                    <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dotCls)} />

                    {/* Name + doc badge */}
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-sm text-foreground truncate">
                        {entry.operatorName}
                      </span>
                      <span className={cn(
                        'inline-flex items-center text-[11px] px-1.5 py-0.5 rounded font-medium border',
                        DOC_BADGE[entry.docKey],
                      )}>
                        {DOC_DISPLAY[entry.docKey]}
                      </span>
                      {isFleet && (
                        <span className="text-[10px] text-muted-foreground italic">Fleet-wide</span>
                      )}
                    </div>

                    {/* Expiry date — clickable date picker for fleet rows */}
                    <div className="hidden sm:block shrink-0 w-[118px]">
                      {isFleet && docId ? (
                        <Popover open={isPickerOpen} onOpenChange={open => setOpenPicker(open ? docId : null)}>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                'flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 -mx-1.5 transition-colors group',
                                isPickerOpen
                                  ? 'bg-muted/60 text-foreground'
                                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                                isSaved && 'text-status-complete',
                              )}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                              ) : isSaved ? (
                                <Check className="h-3 w-3 text-status-complete shrink-0" />
                              ) : (
                                <CalendarIcon className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                              )}
                              <span className={cn(isSaved && 'text-status-complete font-medium')}>
                                {entry.expiresAt
                                  ? format(parseLocalDate(entry.expiresAt), 'MMM d, yyyy')
                                  : <span className="italic opacity-50">Set date</span>
                                }
                              </span>
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
                              initialFocus
                              className={cn('p-3 pointer-events-auto')}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {entry.expiresAt
                            ? format(parseLocalDate(entry.expiresAt), 'MMM d, yyyy')
                            : <span className="italic text-muted-foreground/50">Not set</span>
                          }
                        </span>
                      )}
                    </div>

                    {/* Status badge + open operator link */}
                    <div className="flex items-center gap-1.5 shrink-0 w-[116px] justify-end">
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              'inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold border cursor-default',
                              cfg.badgeCls,
                            )}>
                              {entry.status === 'expired'
                                ? `${formatDaysHuman(Math.abs(entry.daysUntil!))} ago`
                                : entry.status === 'missing'
                                ? 'No date'
                                : entry.daysUntil === 0
                                ? 'Today'
                                : formatDaysHuman(entry.daysUntil!)
                              }
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {entry.status === 'expired'
                              ? `Expired ${formatDaysHuman(Math.abs(entry.daysUntil!))} ago`
                              : entry.status === 'missing'
                              ? 'No expiry date set'
                              : entry.daysUntil === 0
                              ? 'Expires today'
                              : `${formatDaysHuman(entry.daysUntil!)} until expiry`}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {isFleet && onOpenInspectionBinder && (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={onOpenInspectionBinder}
                                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-gold hover:bg-gold/10 transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Update in Inspection Binder</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {!isFleet && onOpenOperatorAtBinder && (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onOpenOperatorAtBinder(entry.operatorId)}
                                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Open in Inspection Binder</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {!isFleet && !onOpenOperatorAtBinder && onOpenOperator && (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onOpenOperator(entry.operatorId)}
                                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Open operator detail</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

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
    </div>
  );
}
