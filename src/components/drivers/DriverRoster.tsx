import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';
import { formatDaysHuman } from '@/components/inspection/InspectionBinderTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Users2, ArrowRight, Phone, RefreshCw, MessageSquare, AlertTriangle, AlertCircle, Clock, FileX, Pencil, Bell, CheckCircle2, XCircle, History, Send, Loader2, Copy, ArrowUpDown, ArrowUp, ArrowDown, Smartphone, Globe, UserX } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DriverRow {
  operator_id: string;
  operator_user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  home_state: string | null;
  unit_number: string | null;
  dispatch_status: 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';
  cdl_expiration: string | null;
  medical_cert_expiration: string | null;
  is_active: boolean;
  pwa_installed_at: string | null;
  last_web_seen_at: string | null;
  excluded_from_dispatch: boolean;
}

interface ReminderEntry {
  sent_at: string;
  doc_type: string;
  sent_by_name: string | null;
  email_sent: boolean;
  email_error: string | null;
}

export type DispatchFilter = 'all' | 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';
export type ComplianceFilter = 'all' | 'expired' | 'critical' | 'warning' | 'never_renewed' | 'not_yet_reminded' | 'web_only' | 'never_signed_in';

export interface ComplianceCounts {
  expired: number;
  critical: number;
  warning: number;
  neverRenewed: number;
  notYetReminded: number;
  webOnly: number;
  neverSignedIn: number;
}

export function isNeverRenewed(cdl: string | null, med: string | null): boolean {
  return cdl === null || med === null;
}

export function getComplianceTier(cdl: string | null, med: string | null): Exclude<ComplianceFilter, 'never_renewed' | 'all'> | 'all' {
  const getDays = (d: string | null) =>
    d ? differenceInDays(startOfDay(parseISO(d)), startOfDay(new Date())) : null;
  const days = [getDays(cdl), getDays(med)].filter((d): d is number => d !== null);
  if (days.length === 0) return 'all';
  const min = Math.min(...days);
  if (min < 0) return 'expired';
  if (min <= 7) return 'critical';
  if (min <= 30) return 'warning';
  return 'all';
}

interface DriverRosterProps {
  onOpenDriver: (operatorId: string) => void;
  onMessageDriver?: (userId: string) => void;
  /** If true, only shows dispatch-relevant columns (for Dispatch Portal) */
  dispatchMode?: boolean;
  /** If true, shows inactive drivers instead of active ones */
  showInactive?: boolean;
  /** Called whenever the selection set changes (operator IDs) */
  onSelectionChange?: (selectedOperatorIds: string[]) => void;
  /** Controlled compliance filter — lifted to parent for header chips */
  complianceFilter?: ComplianceFilter;
  onComplianceFilterChange?: (filter: ComplianceFilter) => void;
  /** Called after each data fetch with fresh fleet-wide counts */
  onComplianceCountsChange?: (counts: ComplianceCounts) => void;
  /** Called when inline "Update" is clicked on a compliance-filtered row */
  onUpdateCompliance?: (operatorId: string, focusField: 'cdl' | 'medcert') => void;
  /** Called after each data fetch with the full driver list (for parent bulk actions) */
  onDriversChange?: (drivers: Array<{
    operator_id: string;
    first_name: string | null;
    last_name: string | null;
    cdl_expiration: string | null;
    medical_cert_expiration: string | null;
  }>) => void;
}

const DISPATCH_STATUS_CONFIG = {
  not_dispatched: { label: 'Not Dispatched', badgeClass: 'status-neutral border' },
  dispatched:     { label: 'Dispatched',     badgeClass: 'status-complete border' },
  home:           { label: 'Home',            badgeClass: 'status-progress border' },
  truck_down:     { label: 'Truck Down',      badgeClass: 'status-action border' },
};

function expiryPill(dateStr: string | null, label: string) {
  if (!dateStr) return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
            <FileX className="h-3 w-3 shrink-0" />
            {label} · No Date
          </span>
        </TooltipTrigger>
        <TooltipContent>No expiration date on file</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  const days = differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
  const formatted = format(parseISO(dateStr), 'MM/dd/yyyy');
  if (days < 0) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5">
              {label} Expired
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatted}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (days <= 7) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5">
              {label} · {formatDaysHuman(days)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatted}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (days <= 30) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--status-action))] bg-[hsl(var(--status-action))]/10 border border-[hsl(var(--status-action))]/30 rounded px-1.5 py-0.5">
              {label} · {formatDaysHuman(days)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatted}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {label} · {formatDaysHuman(days)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{formatted}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Popover badge: shows send history and a "Send Reminder Now" quick-action button. */
function ReminderHistoryBadge({
  entries,
  operatorId,
  driverName,
  onSent,
}: {
  entries: ReminderEntry[] | undefined;
  operatorId: string;
  driverName: string;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSending(true);
    setSentOk(false);
    setSendErr(null);
    const { error } = await supabase.functions.invoke('send-cert-reminder', {
      body: { operator_id: operatorId },
    });
    setSending(false);
    if (error) {
      setSendErr('Send failed — check connection');
    } else {
      setSentOk(true);
      onSent?.();
      setTimeout(() => { setOpen(false); setSentOk(false); }, 1400);
    }
  };

  if (!entries || entries.length === 0) {
    // No history — show a plain "Never" that still opens the send popover
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="text-xs text-muted-foreground/60 italic hover:text-primary hover:not-italic transition-colors px-1 py-0.5 rounded hover:bg-primary/8"
            onClick={e => e.stopPropagation()}
            title="Send a reminder"
          >
            Never
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="center" className="w-64 p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
          <QuickSendPanel driverName={driverName} sending={sending} sentOk={sentOk} sendErr={sendErr} onSend={handleSend} />
        </PopoverContent>
      </Popover>
    );
  }

  const latest = entries[0];
  const days = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(latest.sent_at)));
  const dateLabel = days === 0 ? 'Today' : days === 1 ? '1d ago' : `${days}d ago`;
  const isRecent = days <= 7;
  const count = entries.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 border transition-colors ${
            isRecent
              ? 'text-primary bg-primary/10 border-primary/25 hover:bg-primary/15'
              : 'text-muted-foreground bg-muted border-border hover:bg-muted/80 hover:text-foreground'
          }`}
          onClick={e => e.stopPropagation()}
          title="View history & send reminder"
        >
          <Bell className="h-2.5 w-2.5 shrink-0" />
          {dateLabel}
          {count > 1 && (
            <span className={`ml-0.5 rounded-full px-1 py-px text-[10px] font-semibold leading-none ${
              isRecent ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/20 text-muted-foreground'
            }`}>
              ×{count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="center" className="w-72 p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* History section */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/50 border-b border-border">
          <History className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Reminder History ({count} sent)
          </span>
        </div>
        <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
          {entries.slice(0, 5).map((r, i) => {
            const entryDays = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(r.sent_at)));
            const entryLabel = entryDays === 0 ? 'Today' : entryDays === 1 ? '1d ago' : `${entryDays}d ago`;
            return (
              <div key={i} className="flex items-start gap-2 px-3 py-1.5">
                <div className="mt-0.5 shrink-0">
                  {r.email_sent
                    ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--status-complete))]" />
                    : <XCircle className="h-3 w-3 text-destructive" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{r.doc_type}</span>
                    <span className="text-[10px] text-muted-foreground">{entryLabel}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {format(parseISO(r.sent_at), 'MMM d, yyyy · h:mm a')}
                  </div>
                  {r.sent_by_name && (
                    <div className="text-[10px] text-muted-foreground/80 truncate">by {r.sent_by_name}</div>
                  )}
                  {!r.email_sent && r.email_error && (
                    <div className="text-[10px] text-destructive truncate" title={r.email_error}>✗ {r.email_error}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {count > 5 && (
          <div className="px-3 py-1 text-[10px] text-muted-foreground bg-muted/30 border-t border-border">
            + {count - 5} more · open driver profile for full history
          </div>
        )}
        {/* Send action */}
        <QuickSendPanel driverName={driverName} sending={sending} sentOk={sentOk} sendErr={sendErr} onSend={handleSend} />
      </PopoverContent>
    </Popover>
  );
}

function QuickSendPanel({
  driverName,
  sending,
  sentOk,
  sendErr,
  onSend,
}: {
  driverName: string;
  sending: boolean;
  sentOk: boolean;
  sendErr: string | null;
  onSend: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="px-3 py-2.5 border-t border-border bg-background">
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
        Send a compliance reminder email to <span className="font-medium text-foreground">{driverName}</span>.
      </p>
      {sendErr && (
        <p className="text-[11px] text-destructive mb-2">{sendErr}</p>
      )}
      <Button
        size="sm"
        className="w-full h-7 text-xs gap-1.5"
        disabled={sending || sentOk}
        onClick={onSend}
      >
        {sending ? (
          <><Loader2 className="h-3 w-3 animate-spin" />Sending…</>
        ) : sentOk ? (
          <><CheckCircle2 className="h-3 w-3" />Sent!</>
        ) : (
          <><Send className="h-3 w-3" />Send Reminder Now</>
        )}
      </Button>
    </div>
  );
}

export default function DriverRoster({
  onOpenDriver,
  onMessageDriver,
  dispatchMode = false,
  showInactive = false,
  onSelectionChange,
  complianceFilter: externalComplianceFilter,
  onComplianceFilterChange,
  onComplianceCountsChange,
  onUpdateCompliance,
  onDriversChange,
}: DriverRosterProps) {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DispatchFilter>('all');
  const [internalComplianceFilter, setInternalComplianceFilter] = useState<ComplianceFilter>('all');
  // Map of operator_id → most recent cert_reminders sent_at (ISO string) — for counts
  const [lastReminderMap, setLastReminderMap] = useState<Record<string, string>>({});
  // Map of operator_id → sorted reminder entries (newest first, up to 5)
  const [reminderHistoryMap, setReminderHistoryMap] = useState<Record<string, ReminderEntry[]>>({});
  const complianceFilter = externalComplianceFilter ?? internalComplianceFilter;
  const setComplianceFilter = (f: ComplianceFilter) => {
    setInternalComplianceFilter(f);
    onComplianceFilterChange?.(f);
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<'unit' | 'driver' | null>('driver');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: 'unit' | 'driver') => {
    if (sortColumn === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortColumn(null); setSortDir('asc'); }
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const fetchDrivers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [{ data: rawData }, { data: reminders }, { data: binderDocs }] = await Promise.all([
      supabase
        .from('operators')
        .select(`
          id,
          user_id,
          unit_number,
          onboarding_status!inner (fully_onboarded, unit_number),
          active_dispatch (dispatch_status),
          applications (first_name, last_name, phone, email, address_state, cdl_expiration, medical_cert_expiration)
        `)
        .eq('onboarding_status.fully_onboarded', true),
      supabase
        .from('cert_reminders')
        .select('operator_id, sent_at, doc_type, sent_by_name, email_sent, email_error')
        .order('sent_at', { ascending: false }),
      supabase
        .from('inspection_documents')
        .select('driver_id, name, expires_at')
        .eq('scope', 'per_driver')
        .in('name', ['CDL (Front)', 'Medical Certificate']),
    ]);

    // Build binder expiry lookup: driver_id (user_id) → { cdl, med }
    const binderDates: Record<string, { cdl?: string; med?: string }> = {};
    (binderDocs ?? []).forEach((doc: any) => {
      if (!doc.driver_id || !doc.expires_at) return;
      if (!binderDates[doc.driver_id]) binderDates[doc.driver_id] = {};
      if (doc.name === 'CDL (Front)') binderDates[doc.driver_id].cdl = doc.expires_at;
      if (doc.name === 'Medical Certificate') binderDates[doc.driver_id].med = doc.expires_at;
    });

    // Fetch is_active and pwa_installed_at separately to avoid deep TS inference issues
    const operatorIds = (rawData as any[] ?? []).map((op: any) => op.id);
    let activeMap: Record<string, { is_active: boolean; pwa_installed_at: string | null; last_web_seen_at: string | null; excluded_from_dispatch: boolean }> = {};
    if (operatorIds.length > 0) {
      const { data: activeData } = await supabase
        .from('operators')
        .select('id, is_active, pwa_installed_at, last_web_seen_at, excluded_from_dispatch')
        .in('id', operatorIds) as any;
      for (const row of (activeData ?? []) as any[]) {
        activeMap[row.id] = {
          is_active: row.is_active ?? true,
          pwa_installed_at: row.pwa_installed_at ?? null,
          last_web_seen_at: row.last_web_seen_at ?? null,
          excluded_from_dispatch: row.excluded_from_dispatch === true,
        };
      }
    }
    const activeSet = new Set(Object.entries(activeMap).filter(([, v]) => v.is_active === !showInactive).map(([k]) => k));

    // Filter to only operators matching is_active state
    const data = (rawData as any[] ?? []).filter((op: any) => activeSet.has(op.id));

    // Build per-operator reminder maps
    const latestMap: Record<string, string> = {};
    const historyMap: Record<string, ReminderEntry[]> = {};

    for (const r of (reminders ?? []) as Array<{
      operator_id: string;
      sent_at: string;
      doc_type: string;
      sent_by_name: string | null;
      email_sent: boolean;
      email_error: string | null;
    }>) {
      if (!latestMap[r.operator_id]) latestMap[r.operator_id] = r.sent_at;
      if (!historyMap[r.operator_id]) historyMap[r.operator_id] = [];
      // Keep all entries (we'll slice to 5 in the render)
      historyMap[r.operator_id].push({
        sent_at: r.sent_at,
        doc_type: r.doc_type,
        sent_by_name: r.sent_by_name,
        email_sent: r.email_sent,
        email_error: r.email_error,
      });
    }

    setLastReminderMap(latestMap);
    setReminderHistoryMap(historyMap);

    if (data) {
      const getOne = (val: any) => (Array.isArray(val) ? val[0] : val) ?? null;

      const userIds = (data as any[]).map((op: any) => op.user_id).filter(Boolean);
      const profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, phone, home_state, avatar_url')
          .in('user_id', userIds);
        (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      const mapped: DriverRow[] = (data as any[]).map(op => {
        const os = getOne(op.onboarding_status);
        const ad = getOne(op.active_dispatch);
        const app = getOne(op.applications);
        const profile = profileMap[op.user_id] ?? {};
        return {
          operator_id: op.id,
          operator_user_id: op.user_id,
          first_name: app?.first_name || profile.first_name || null,
          last_name: app?.last_name || profile.last_name || null,
          phone: profile.phone ?? app?.phone ?? null,
          email: app?.email ?? null,
          home_state: profile.home_state ?? app?.address_state ?? null,
          unit_number: os?.unit_number ?? op.unit_number ?? null,
          dispatch_status: (ad?.dispatch_status ?? 'not_dispatched') as DriverRow['dispatch_status'],
          cdl_expiration: binderDates[op.user_id]?.cdl ?? app?.cdl_expiration ?? null,
          medical_cert_expiration: binderDates[op.user_id]?.med ?? app?.medical_cert_expiration ?? null,
          is_active: activeSet.has(op.id),
          pwa_installed_at: activeMap[op.id]?.pwa_installed_at ?? null,
          last_web_seen_at: activeMap[op.id]?.last_web_seen_at ?? null,
          excluded_from_dispatch: activeMap[op.id]?.excluded_from_dispatch ?? false,
        };
      }).sort((a, b) => {
        const order: Record<DriverRow['dispatch_status'], number> = { truck_down: 0, not_dispatched: 1, home: 2, dispatched: 3 };
        return order[a.dispatch_status] - order[b.dispatch_status];
      });

      setDrivers(mapped);
      onDriversChange?.(mapped.map(d => ({
        operator_id: d.operator_id,
        first_name: d.first_name,
        last_name: d.last_name,
        cdl_expiration: d.cdl_expiration,
        medical_cert_expiration: d.medical_cert_expiration,
      })));
      // Clear selections that no longer exist
      setSelected(prev => {
        const validIds = new Set(mapped.map(d => d.operator_id));
        const next = new Set([...prev].filter(id => validIds.has(id)));
        return next;
      });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDrivers();
    const channel = supabase
      .channel('driver-roster-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_dispatch' }, () => fetchDrivers(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_status' }, () => fetchDrivers(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchDrivers]);

  // Notify parent on selection changes
  useEffect(() => {
    onSelectionChange?.([...selected]);
  }, [selected, onSelectionChange]);

  // Sync internal filter if parent changes external filter
  useEffect(() => {
    if (externalComplianceFilter !== undefined) {
      setInternalComplianceFilter(externalComplianceFilter);
    }
  }, [externalComplianceFilter]);

  // Compliance tier counts (over all drivers, before any filter)
  const complianceCounts = useMemo(() => {
    let expired = 0, critical = 0, warning = 0, neverRenewed = 0, notYetReminded = 0, webOnly = 0, neverSignedIn = 0;
    for (const d of drivers) {
      if (isNeverRenewed(d.cdl_expiration, d.medical_cert_expiration)) neverRenewed++;
      const tier = getComplianceTier(d.cdl_expiration, d.medical_cert_expiration);
      if (tier === 'expired') expired++;
      else if (tier === 'critical') critical++;
      else if (tier === 'warning') warning++;
      if (!lastReminderMap[d.operator_id]) notYetReminded++;
      if (!d.pwa_installed_at && d.last_web_seen_at) webOnly++;
      else if (!d.pwa_installed_at && !d.last_web_seen_at) neverSignedIn++;
    }
    return { expired, critical, warning, neverRenewed, notYetReminded, webOnly, neverSignedIn };
  }, [drivers, lastReminderMap]);

  // Notify parent when counts change (e.g. after data fetch)
  useEffect(() => {
    onComplianceCountsChange?.(complianceCounts);
  }, [complianceCounts, onComplianceCountsChange]);

  const filtered = useMemo(() => {
    const base = drivers.filter(d => {
      const matchesStatus = statusFilter === 'all' || d.dispatch_status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch = !q || `${d.first_name ?? ''} ${d.last_name ?? ''}`.toLowerCase().includes(q) ||
        (d.unit_number ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').includes(q);
      const tier = getComplianceTier(d.cdl_expiration, d.medical_cert_expiration);
      const never = isNeverRenewed(d.cdl_expiration, d.medical_cert_expiration);
      const notYetReminded = !lastReminderMap[d.operator_id];
      const matchesCompliance =
        complianceFilter === 'all' ||
        (complianceFilter === 'expired' && tier === 'expired') ||
        (complianceFilter === 'critical' && (tier === 'expired' || tier === 'critical')) ||
        (complianceFilter === 'warning' && (tier === 'expired' || tier === 'critical' || tier === 'warning')) ||
        (complianceFilter === 'never_renewed' && never) ||
        (complianceFilter === 'not_yet_reminded' && notYetReminded) ||
        (complianceFilter === 'web_only' && !d.pwa_installed_at && !!d.last_web_seen_at) ||
        (complianceFilter === 'never_signed_in' && !d.pwa_installed_at && !d.last_web_seen_at);
      return matchesStatus && matchesSearch && matchesCompliance;
    });

    // When never_renewed filter is active, float never-renewed drivers to the top
    let sorted = base;
    if (complianceFilter === 'never_renewed') {
      sorted = [...base].sort((a, b) => {
        const aNever = isNeverRenewed(a.cdl_expiration, a.medical_cert_expiration) ? 0 : 1;
        const bNever = isNeverRenewed(b.cdl_expiration, b.medical_cert_expiration) ? 0 : 1;
        return aNever - bNever;
      });
    }

    // Apply user-chosen column sort
    if (sortColumn) {
      sorted = [...sorted].sort((a, b) => {
        let cmp = 0;
        if (sortColumn === 'unit') {
          const aNum = a.unit_number ? parseInt(a.unit_number, 10) : null;
          const bNum = b.unit_number ? parseInt(b.unit_number, 10) : null;
          const aVal = !isNaN(aNum as number) ? aNum : null;
          const bVal = !isNaN(bNum as number) ? bNum : null;
          if (aVal === null && bVal === null) cmp = 0;
          else if (aVal === null) cmp = 1;
          else if (bVal === null) cmp = -1;
          else cmp = aVal! - bVal!;
          // Fallback to string comparison for non-numeric unit numbers
          if (cmp === 0 && a.unit_number !== b.unit_number) {
            cmp = (a.unit_number ?? '').localeCompare(b.unit_number ?? '');
          }
        } else {
          const aName = `${a.last_name ?? ''} ${a.first_name ?? ''}`.toLowerCase().trim();
          const bName = `${b.last_name ?? ''} ${b.first_name ?? ''}`.toLowerCase().trim();
          if (!aName && !bName) cmp = 0;
          else if (!aName) cmp = 1;
          else if (!bName) cmp = -1;
          else cmp = aName.localeCompare(bName);
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return sorted;
  }, [drivers, search, statusFilter, complianceFilter, lastReminderMap, sortColumn, sortDir]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(d => selected.has(d.operator_id));
  const someFilteredSelected = filtered.some(d => selected.has(d.operator_id));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(d => next.delete(d.operator_id));
      } else {
        filtered.forEach(d => next.add(d.operator_id));
      }
      return next;
    });
  };

  const toggleOne = (operatorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(operatorId) ? next.delete(operatorId) : next.add(operatorId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, unit, or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as DispatchFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="not_dispatched">Not Dispatched</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="truck_down">Truck Down</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDrivers(true)}
          disabled={refreshing}
          className="gap-1.5 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Compliance filter chips */}
      {!dispatchMode && (complianceCounts.expired + complianceCounts.critical + complianceCounts.warning + complianceCounts.neverRenewed + complianceCounts.notYetReminded + complianceCounts.webOnly + complianceCounts.neverSignedIn) > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setComplianceFilter('all')}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              complianceFilter === 'all'
                ? 'bg-muted border-border text-foreground'
                : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            All Drivers
            <span className="font-semibold">{drivers.length}</span>
          </button>

          {complianceCounts.expired > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'expired' ? 'all' : 'expired')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'expired'
                  ? 'bg-destructive/15 border-destructive/40 text-destructive'
                  : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
              }`}
            >
              <AlertCircle className="h-3 w-3" />
              Expired
              <span className="font-semibold">{complianceCounts.expired}</span>
            </button>
          )}

          {complianceCounts.critical > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'critical' ? 'all' : 'critical')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'critical'
                  ? 'bg-destructive/15 border-destructive/40 text-destructive'
                  : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              Critical ≤ 7d
              <span className="font-semibold">{complianceCounts.critical}</span>
            </button>
          )}

          {complianceCounts.warning > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'warning' ? 'all' : 'warning')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'warning'
                  ? 'bg-[hsl(var(--warning))]/15 border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]'
                  : 'border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]/80 hover:bg-[hsl(var(--warning))]/10 hover:border-[hsl(var(--warning))]/50'
              }`}
            >
              <Clock className="h-3 w-3" />
              Warning ≤ 30d
              <span className="font-semibold">{complianceCounts.warning}</span>
            </button>
          )}

          {complianceCounts.neverRenewed > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'never_renewed' ? 'all' : 'never_renewed')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'never_renewed'
                  ? 'bg-destructive/15 border-destructive/40 text-destructive'
                  : 'border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/50'
              }`}
            >
              <FileX className="h-3 w-3" />
              Never Renewed
              <span className="font-semibold">{complianceCounts.neverRenewed}</span>
            </button>
          )}

          {complianceCounts.notYetReminded > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'not_yet_reminded' ? 'all' : 'not_yet_reminded')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'not_yet_reminded'
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-primary/25 text-primary/70 hover:bg-primary/10 hover:border-primary/40 hover:text-primary'
              }`}
            >
              <Bell className="h-3 w-3" />
              Not Yet Reminded
              <span className="font-semibold">{complianceCounts.notYetReminded}</span>
            </button>
          )}

          {complianceCounts.webOnly > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'web_only' ? 'all' : 'web_only')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'web_only'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                  : 'border-amber-500/30 text-amber-600/80 dark:text-amber-400/80 hover:bg-amber-500/10 hover:border-amber-500/50'
              }`}
              title="Signed in via web but never installed the app"
            >
              <Globe className="h-3 w-3" />
              Web Only
              <span className="font-semibold">{complianceCounts.webOnly}</span>
            </button>
          )}

          {complianceCounts.neverSignedIn > 0 && (
            <button
              onClick={() => setComplianceFilter(complianceFilter === 'never_signed_in' ? 'all' : 'never_signed_in')}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                complianceFilter === 'never_signed_in'
                  ? 'bg-muted border-border text-foreground'
                  : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
              }`}
              title="Operator has never opened the portal"
            >
              <UserX className="h-3 w-3" />
              Never Signed In
              <span className="font-semibold">{complianceCounts.neverSignedIn}</span>
            </button>
          )}
        </div>
      )}

      {/* Summary counts */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users2 className="h-3.5 w-3.5" />
          <strong className="text-foreground">{filtered.length}</strong> driver{filtered.length !== 1 ? 's' : ''}
          {filtered.length !== drivers.length && ` (of ${drivers.length})`}
        </span>
        {selected.size > 0 && (
          <span className="flex items-center gap-1.5 text-primary font-medium">
            · <strong>{selected.size}</strong> selected
          </span>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No active drivers found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {drivers.length === 0
              ? 'Fully onboarded operators will appear here automatically.'
              : complianceFilter === 'never_renewed'
                ? 'No drivers are missing CDL or Med Cert expiry dates.'
                : complianceFilter === 'not_yet_reminded'
                ? 'All drivers have received at least one reminder.'
                : complianceFilter !== 'all'
                ? `No drivers match the "${complianceFilter}" compliance filter.`
              : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {/* Select All checkbox */}
                <TableHead className="w-10 pr-0">
                  <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={allFilteredSelected}
                      data-state={someFilteredSelected && !allFilteredSelected ? 'indeterminate' : undefined}
                      onCheckedChange={toggleAll}
                      aria-label="Select all drivers"
                      className="data-[state=indeterminate]:opacity-60"
                    />
                  </div>
                </TableHead>
                <TableHead className="w-20">
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => toggleSort('unit')}
                  >
                    Unit #
                    {sortColumn === 'unit'
                      ? sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => toggleSort('driver')}
                  >
                    Driver
                    {sortColumn === 'driver'
                      ? sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </TableHead>
                {!dispatchMode && <TableHead className="hidden sm:table-cell">Phone</TableHead>}
                {!dispatchMode && <TableHead className="hidden lg:table-cell">Email</TableHead>}
                {!dispatchMode && <TableHead className="hidden md:table-cell">State</TableHead>}
                <TableHead>Status</TableHead>
                {!dispatchMode && <TableHead className="hidden lg:table-cell">Compliance</TableHead>}
                {/* Last Sent column — visible at xl when a compliance filter is active */}
                {!dispatchMode && complianceFilter !== 'all' && (
                  <TableHead className="hidden xl:table-cell w-32">
                    <span className="flex items-center gap-1">
                      <History className="h-3 w-3 text-muted-foreground" />
                      Last Sent
                    </span>
                  </TableHead>
                )}
                <TableHead className="w-32 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(driver => {
                const name = [driver.first_name, driver.last_name].filter(Boolean).join(' ') || 'Unknown Driver';
                const initials = [driver.first_name?.[0], driver.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
                const statusCfg = DISPATCH_STATUS_CONFIG[driver.dispatch_status];
                const isSelected = selected.has(driver.operator_id);

                // Compliance row highlighting
                const getDaysUntil = (dateStr: string | null) =>
                  dateStr ? differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date())) : null;
                const cdlDays = getDaysUntil(driver.cdl_expiration);
                const medDays = getDaysUntil(driver.medical_cert_expiration);
                const minDays = [cdlDays, medDays]
                  .filter((d): d is number => d !== null)
                  .reduce((a, b) => Math.min(a, b), Infinity);
                const driverNeverRenewed = isNeverRenewed(driver.cdl_expiration, driver.medical_cert_expiration);
                const rowHighlight =
                  minDays <= 7
                    ? 'border-l-4 border-l-destructive bg-destructive/[0.03]'
                    : minDays <= 30
                    ? 'border-l-4 border-l-[hsl(var(--status-action))] bg-[hsl(var(--status-action))]/[0.03]'
                    : driverNeverRenewed && complianceFilter === 'never_renewed'
                    ? 'border-l-4 border-l-destructive bg-destructive/[0.03]'
                    : '';

                // Determine which expiry field to focus when Update is clicked
                const updateFocusField: 'cdl' | 'medcert' = (() => {
                  if (!driver.cdl_expiration) return 'cdl';
                  if (!driver.medical_cert_expiration) return 'medcert';
                  return (cdlDays ?? Infinity) <= (medDays ?? Infinity) ? 'cdl' : 'medcert';
                })();

                const showUpdateLink = complianceFilter !== 'all' && !!onUpdateCompliance && !dispatchMode;
                const reminderHistory = reminderHistoryMap[driver.operator_id];
                // Show reminder badge on compliance-filtered rows (except not_yet_reminded where badge is N/A)
                const showReminderBadge = complianceFilter !== 'all' && !dispatchMode && complianceFilter !== 'not_yet_reminded';
                // Show dedicated Last Sent column at xl breakpoint when filter is active
                const showLastSentCol = !dispatchMode && complianceFilter !== 'all';

                return (
                  <TableRow
                    key={driver.operator_id}
                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${rowHighlight} ${isSelected ? 'bg-primary/[0.04]' : ''}`}
                    onClick={() => onOpenDriver(driver.operator_id)}
                  >
                    {/* Checkbox */}
                    <TableCell className="pr-0" onClick={e => toggleOne(driver.operator_id, e)}>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                          aria-label={`Select ${name}`}
                        />
                      </div>
                    </TableCell>

                    {/* Unit */}
                    <TableCell>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {driver.unit_number ?? <span className="text-muted-foreground text-xs">—</span>}
                      </span>
                    </TableCell>

                    {/* Driver Name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-surface-dark flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-gold">{initials}</span>
                        </div>
                        <span className="font-medium text-sm text-foreground">{name}</span>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger>
                              {driver.pwa_installed_at ? (
                                <Smartphone className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : driver.last_web_seen_at ? (
                                <Globe className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              ) : (
                                <UserX className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {driver.pwa_installed_at
                                ? `App installed ${format(parseISO(driver.pwa_installed_at), 'MMM d, yyyy')}`
                                : driver.last_web_seen_at
                                ? `Web only — last seen ${format(parseISO(driver.last_web_seen_at), 'MMM d, yyyy')}`
                                : 'Never signed in'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {driver.excluded_from_dispatch && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 shrink-0">
                                  Excluded
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Excluded from Dispatch Hub — not counted in daily dispatch tiles</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>

                    {/* Phone */}
                    {!dispatchMode && (
                      <TableCell className="hidden sm:table-cell">
                        {driver.phone
                          ? <a href={`tel:${driver.phone}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1" onClick={e => e.stopPropagation()}><Phone className="h-3 w-3" />{driver.phone}</a>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}

                    {/* Email */}
                    {!dispatchMode && (
                      <TableCell className="hidden lg:table-cell">
                        {driver.email ? (
                          <div className="flex items-center gap-1 max-w-[180px]" onClick={e => e.stopPropagation()}>
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm text-muted-foreground truncate">{driver.email}</span>
                                </TooltipTrigger>
                                <TooltipContent>{driver.email}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <button
                              className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                              title="Copy email"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(driver.email!);
                                toast({ title: 'Email copied', description: driver.email! });
                              }}
                            >
                              <Copy className="h-3 w-3 text-muted-foreground hover:text-primary" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* State */}
                    {!dispatchMode && (
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{driver.home_state ?? '—'}</span>
                      </TableCell>
                    )}

                    {/* Dispatch Status */}
                    <TableCell>
                      <Badge className={`text-xs ${statusCfg.badgeClass}`}>
                        {statusCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Compliance pills (hidden below lg) */}
                    {!dispatchMode && (
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 items-center" onClick={e => e.stopPropagation()}>
                          {expiryPill(driver.cdl_expiration, 'CDL')}
                          {expiryPill(driver.medical_cert_expiration, 'Med Cert')}
                          {/* Show reminder badge inline inside compliance col below xl (where Last Sent col is hidden) */}
                          {showReminderBadge && (
                            <span className="xl:hidden">
                              <ReminderHistoryBadge
                                entries={reminderHistory}
                                operatorId={driver.operator_id}
                                driverName={name}
                                onSent={() => fetchDrivers(true)}
                              />
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}

                    {/* Last Sent dedicated column — visible at xl when compliance filter is active */}
                    {showLastSentCol && (
                      <TableCell className="hidden xl:table-cell" onClick={e => e.stopPropagation()}>
                        <ReminderHistoryBadge
                          entries={reminderHistory}
                          operatorId={driver.operator_id}
                          driverName={name}
                          onSent={() => fetchDrivers(true)}
                        />
                      </TableCell>
                    )}

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {/* On small screens where both compliance + last-sent cols are hidden, show badge inline */}
                        {showReminderBadge && (
                          <span className="lg:hidden">
                            <ReminderHistoryBadge
                              entries={reminderHistory}
                              operatorId={driver.operator_id}
                              driverName={name}
                              onSent={() => fetchDrivers(true)}
                            />
                          </span>
                        )}
                        {showUpdateLink && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary/80 hover:text-primary underline-offset-2 hover:underline transition-colors px-1.5 py-1 rounded hover:bg-primary/8"
                                  onClick={() => onUpdateCompliance!(driver.operator_id, updateFocusField)}
                                >
                                  <Pencil className="h-3 w-3 shrink-0" />
                                  Update
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Update {updateFocusField === 'cdl' ? 'CDL' : 'Med Cert'} expiration
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {onMessageDriver && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Message driver"
                            onClick={() => onMessageDriver(driver.operator_user_id)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="Open driver profile"
                          onClick={() => onOpenDriver(driver.operator_id)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
