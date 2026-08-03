import { useEffect, useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheck, AlertTriangle, Clock, Mail, Send, Loader2, FileWarning, Eye, FileText,
  ChevronDown, ChevronRight, Beaker, Trash2, Briefcase, Search, Download, Archive,
  ArchiveRestore, CalendarClock, Phone, CheckCircle2, Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchPEIQueue, restoreApplicant, bulkMarkCompleted, runBulk, fetchPEIRequestById } from '@/lib/pei/api';
import type { PEIQueueRow, PEIRequest, PEIRequestStatus, PEIStaffNote } from '@/lib/pei/types';
import { printCombinedPEIHistory } from '@/lib/pei/combinedHistoryPrint';
import { PEIResponseViewer } from './PEIResponseViewer';
import { downloadPEICsv } from '@/lib/pei/exportCsv';
import { PEIStatusBadge } from './StatusBadge';
import { sendPEIEmail } from './sendPEIEmail';
import { GFEModal } from './GFEModal';
import PEITemplateViewer from './PEITemplateViewer';
import { SendTestPEIDialog } from './SendTestPEIDialog';
import { LogSendModal } from './LogSendModal';
import { LogPhoneAttemptModal } from './LogPhoneAttemptModal';
import { ArchiveApplicantDialog } from './ArchiveApplicantDialog';
import { ChangeArchiveCategoryDialog } from './ChangeArchiveCategoryDialog';
import { StaffNotesPopover } from './StaffNotesPopover';
import { BulkArchiveDialog, BulkSendDateDialog } from './PEIBulkDialogs';

interface Props {
  onOpenApplication?: (applicationId: string) => void;
}

const STATUS_ORDER: PEIRequestStatus[] = [
  'pending',
  'sent',
  'follow_up_sent',
  'final_notice_sent',
  'completed',
  'gfe_documented',
];

type SectionKey = 'overdue' | 'pending' | 'in_progress' | 'completed' | 'archived_hired' | 'archived_not_hired';

type FilterKey =
  | 'all'
  | 'pending'
  | 'sent'
  | 'overdue'
  | 'completed'
  | 'gfe'
  | 'archived_hired'
  | 'archived_not_hired';

interface SectionDef {
  key: SectionKey;
  label: string;
  hint: string;
  defaultOpen: boolean;
  stripe: string;
  badge: 'destructive' | 'secondary' | 'default' | 'outline';
  showWhenEmpty?: boolean;
}

const SECTIONS: SectionDef[] = [
  { key: 'overdue', label: 'Overdue', hint: 'Past the 30-day deadline and unresolved', defaultOpen: true, stripe: 'border-l-4 border-l-rose-500', badge: 'destructive' },
  { key: 'pending', label: 'Pending', hint: 'Nothing sent yet', defaultOpen: true, stripe: 'border-l-4 border-l-slate-500', badge: 'secondary' },
  { key: 'in_progress', label: 'In Progress', hint: 'Awaiting a previous employer response', defaultOpen: true, stripe: 'border-l-4 border-l-blue-500', badge: 'secondary' },
  { key: 'completed', label: 'Completed', hint: 'Every employer resolved or GFE documented', defaultOpen: false, stripe: 'border-l-4 border-l-emerald-500', badge: 'secondary' },
  { key: 'archived_hired', label: 'Archive (Hired)', hint: 'Archived applicants who were hired by SUPERTRANSPORT', defaultOpen: false, stripe: 'border-l-4 border-l-amber-400', badge: 'secondary', showWhenEmpty: true },
  { key: 'archived_not_hired', label: 'Archive (Not Hired)', hint: 'Archived applicants who were not hired', defaultOpen: false, stripe: 'border-l-4 border-l-slate-400', badge: 'secondary', showWhenEmpty: true },
];

interface ApplicantGroup {
  applicationId: string;
  fullName: string;
  rows: PEIQueueRow[];
  section: SectionKey;
  archivedAt: string | null;
  archiveReason: string | null;
  archivedByName: string | null;
  archiveCategory: 'hired' | 'not_hired' | null;
}

function isResolved(r: PEIQueueRow) {
  return r.status === 'completed' || r.status === 'gfe_documented';
}

const FILTER_KEYS: FilterKey[] = [
  'all', 'pending', 'sent', 'overdue', 'completed', 'gfe', 'archived_hired', 'archived_not_hired',
];

/** Single source of truth for the filter chips — used by the list AND the chip counts. */
function rowMatchesFilter(r: PEIQueueRow, f: FilterKey): boolean {
  const archived = !!r.pei_archived_at;
  if (f === 'archived_hired') return archived && r.pei_archive_category === 'hired';
  if (f === 'archived_not_hired') return archived && r.pei_archive_category === 'not_hired';
  if (f === 'all') return true;
  // Every status chip is an active-queue view: archived applicants are excluded.
  if (archived) return false;
  if (f === 'overdue') return r.is_overdue;
  if (f === 'pending') return r.status === 'pending';
  if (f === 'sent') return r.status === 'sent' || r.status === 'follow_up_sent' || r.status === 'final_notice_sent';
  if (f === 'completed') return r.status === 'completed';
  if (f === 'gfe') return r.status === 'gfe_documented';
  return true;
}

/** Highest-severity rule: Archived > Overdue > Pending/In Progress > Completed. */
function sectionFor(rows: PEIQueueRow[]): SectionKey {
  const first = rows[0];
  if (first?.pei_archived_at) {
    return first.pei_archive_category === 'hired' ? 'archived_hired' : 'archived_not_hired';
  }
  if (rows.some((r) => r.is_overdue)) return 'overdue';
  if (rows.every(isResolved)) return 'completed';
  if (rows.every((r) => r.status === 'pending' || isResolved(r))) return 'pending';
  return 'in_progress';
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function PEIQueuePanel({ onOpenApplication }: Props) {
  const { isManagement } = useAuth();
  const [rows, setRows] = useState<PEIQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [gfeFor, setGfeFor] = useState<{ id: string; employer: string } | null>(null);
  const [logSendFor, setLogSendFor] = useState<PEIQueueRow | null>(null);
  const [phoneFor, setPhoneFor] = useState<PEIQueueRow | null>(null);
  const [archiveFor, setArchiveFor] = useState<ApplicantGroup | null>(null);
  const [changeCategoryFor, setChangeCategoryFor] = useState<ApplicantGroup | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    new Set(SECTIONS.filter((s) => s.defaultOpen).map((s) => s.key))
  );
  const lastFilterKeyRef = useRef<string>('');
  const [deleteTarget, setDeleteTarget] = useState<PEIQueueRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkCompleteOpen, setBulkCompleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [viewRequest, setViewRequest] = useState<PEIRequest | null>(null);
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null);
  const [printingHistoryFor, setPrintingHistoryFor] = useState<string | null>(null);

  async function openRecord(requestId: string) {
    setLoadingRecordId(requestId);
    try {
      const req = await fetchPEIRequestById(requestId);
      if (!req) {
        toast.error('PEI record not found — it may have been deleted.');
        return;
      }
      setViewRequest(req);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load PEI record');
    } finally {
      setLoadingRecordId(null);
    }
  }

  async function handlePrintHistory(applicationId: string, fullName: string) {
    setPrintingHistoryFor(applicationId);
    try {
      const { recordCount } = await printCombinedPEIHistory(applicationId, fullName);
      toast.success(`Preparing combined PEI history (${recordCount} record${recordCount === 1 ? '' : 's'})`);
    } catch (e: any) {
      const msg = e?.message === 'popup blocked'
        ? 'Allow pop-ups for this site to print the full history.'
        : e?.message ?? 'Failed to build combined history';
      toast.error(msg);
    } finally {
      setPrintingHistoryFor(null);
    }
  }

  async function reload() {
    setLoading(true);
    try {
      setRows(await fetchPEIQueue());
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load PEI queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  const activeRows = useMemo(() => rows.filter((r) => !r.pei_archived_at), [rows]);

  const stats = useMemo(() => {
    const applicants = new Set(activeRows.filter((r) => !isResolved(r)).map((r) => r.application_id)).size;
    const awaiting = activeRows.filter(
      (r) => (r.status === 'sent' || r.status === 'follow_up_sent' || r.status === 'final_notice_sent') && !r.is_overdue
    ).length;
    const overdue = activeRows.filter((r) => r.is_overdue).length;
    const now = new Date();
    const completedThisMonth = activeRows.filter((r) => {
      const d = r.date_response_received ?? r.date_gfe_created;
      if (!d) return false;
      const parsed = new Date(d);
      return parsed.getMonth() === now.getMonth() && parsed.getFullYear() === now.getFullYear();
    }).length;
    const archivedHired = rows.filter((r) => r.pei_archive_category === 'hired').length;
    const archivedNotHired = rows.filter((r) => r.pei_archive_category === 'not_hired').length;
    return { applicants, awaiting, overdue, completedThisMonth, archivedHired, archivedNotHired };
  }, [activeRows, rows]);

  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = [r.applicant_first_name, r.applicant_last_name].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || r.employer_name.toLowerCase().includes(q);
    });
  }, [rows, search]);

  const filteredRows = useMemo(
    () => searchedRows.filter((r) => rowMatchesFilter(r, filter)),
    [searchedRows, filter]
  );

  /** Applicant count per chip, computed with the exact predicate the list uses. */
  const chipCounts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const f of FILTER_KEYS) {
      const ids = new Set<string>();
      for (const r of searchedRows) if (rowMatchesFilter(r, f)) ids.add(r.application_id);
      out[f] = ids.size;
    }
    return out;
  }, [searchedRows]);

  const grouped = useMemo<ApplicantGroup[]>(() => {
    const map = new Map<string, PEIQueueRow[]>();
    for (const row of filteredRows) {
      const list = map.get(row.application_id) ?? [];
      list.push(row);
      map.set(row.application_id, list);
    }
    return Array.from(map.entries())
      .map(([applicationId, groupRows]) => ({
        applicationId,
        rows: groupRows,
        section: sectionFor(groupRows),
        archivedAt: groupRows[0].pei_archived_at,
        archiveReason: groupRows[0].pei_archive_reason,
        archivedByName: groupRows[0].pei_archived_by_name,
        archiveCategory: groupRows[0].pei_archive_category,
        fullName:
          [groupRows[0].applicant_first_name, groupRows[0].applicant_last_name].filter(Boolean).join(' ') || '—',
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [filteredRows]);

  const bySection = useMemo(() => {
    const map = new Map<SectionKey, ApplicantGroup[]>();
    for (const s of SECTIONS) map.set(s.key, []);
    for (const g of grouped) map.get(g.section)!.push(g);
    return map;
  }, [grouped]);

  /** Sections rendered for the active filter. Empty archive placeholders only under All / that archive chip. */
  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((s) => {
        const count = bySection.get(s.key)?.length ?? 0;
        if (count > 0) return true;
        if (!s.showWhenEmpty) return false;
        return filter === 'all' || filter === s.key;
      }),
    [bySection, filter]
  );

  /** Changing the filter or search re-opens every section that has matches. */
  useEffect(() => {
    const key = `${filter}|${search.trim().toLowerCase()}`;
    if (lastFilterKeyRef.current === key) return;
    lastFilterKeyRef.current = key;
    setOpenSections(
      new Set(SECTIONS.filter((s) => (bySection.get(s.key)?.length ?? 0) > 0).map((s) => s.key))
    );
  }, [filter, search, bySection]);

  const selectedGroups = useMemo(
    () => grouped.filter((g) => selected.has(g.applicationId)),
    [grouped, selected]
  );

  const selectedUnresolvedRequestIds = useMemo(
    () => selectedGroups.flatMap((g) => g.rows.filter((r) => !isResolved(r)).map((r) => r.request_id)),
    [selectedGroups]
  );

  const selectedArchivedCount = useMemo(
    () => selectedGroups.filter((g) => g.archivedAt).length,
    [selectedGroups]
  );
  const selectedActiveCount = selectedGroups.length - selectedArchivedCount;

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setSectionSelected(keys: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  async function reloadAndClear() {
    clearSelection();
    await reload();
  }

  async function handleBulkRestore() {
    setBulkBusy(true);
    try {
      const ids = selectedGroups.filter((g) => g.archivedAt).map((g) => g.applicationId);
      const result = await runBulk(ids, (id) => restoreApplicant(id));
      if (result.failed === 0) toast.success(`${result.ok} restored to the active queue`);
      else toast.error(`${result.ok} restored, ${result.failed} failed — ${result.firstError}`);
      await reloadAndClear();
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkComplete() {
    setBulkBusy(true);
    try {
      await bulkMarkCompleted(selectedUnresolvedRequestIds);
      toast.success(
        `${selectedUnresolvedRequestIds.length} ${selectedUnresolvedRequestIds.length === 1 ? 'investigation' : 'investigations'} marked Completed`
      );
      setBulkCompleteOpen(false);
      await reloadAndClear();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to mark completed');
    } finally {
      setBulkBusy(false);
    }
  }

  function expandAll() {
    setOpenSections(new Set(visibleSections.map((s) => s.key)));
    setOpenGroups(new Set(grouped.map((g) => g.applicationId)));
  }

  function collapseAll() {
    setOpenSections(new Set());
    setOpenGroups(new Set());
  }

  async function handleSend(row: PEIQueueRow, kind: 'initial' | 'follow_up' | 'final_notice') {
    setBusy(row.request_id);
    try {
      await sendPEIEmail(row.request_id, kind);
      toast.success(`PEI email sent to ${row.employer_name}`);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? 'Email send failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(group: ApplicantGroup) {
    setRestoring(group.applicationId);
    try {
      await restoreApplicant(group.applicationId);
      toast.success(`${group.fullName} restored to the active queue`);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to restore applicant');
    } finally {
      setRestoring(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('pei_requests').delete().eq('id', deleteTarget.request_id);
      if (error) throw error;
      toast.success(`Deleted PEI request for ${deleteTarget.employer_name}`);
      setDeleteTarget(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete PEI request');
    } finally {
      setDeleting(false);
    }
  }

  function canDelete(r: PEIQueueRow) {
    return isManagement && (r.status === 'pending' || r.status === 'gfe_documented');
  }

  function actionFor(row: PEIQueueRow) {
    if (row.status === 'pending') return { label: 'Send First Attempt', kind: 'initial' as const };
    if (row.status === 'sent') return { label: 'Send Second Attempt', kind: 'follow_up' as const };
    return null;
  }

  function deadlineLabel(r: PEIQueueRow): string {
    if (r.days_remaining == null) return '—';
    if (r.days_remaining < 0 || r.is_overdue) return `Overdue ${Math.abs(r.days_remaining)}d`;
    if (r.days_remaining === 0) return 'Due today';
    return `Due in ${r.days_remaining}d`;
  }

  function groupSummary(groupRows: PEIQueueRow[]) {
    const counts: Record<string, number> = {};
    for (const r of groupRows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return { counts, overdue: groupRows.filter((r) => r.is_overdue).length };
  }

  const allExpanded =
    visibleSections.every((s) => openSections.has(s.key)) &&
    grouped.every((g) => openGroups.has(g.applicationId));
  const allCollapsed = openSections.size === 0 && openGroups.size === 0;

  const FILTERS: Array<{ key: FilterKey; label: string; group: 'active' | 'archive' }> = [
    { key: 'all', label: 'All', group: 'active' },
    { key: 'pending', label: 'Pending', group: 'active' },
    { key: 'sent', label: 'Sent', group: 'active' },
    { key: 'overdue', label: 'Overdue', group: 'active' },
    { key: 'completed', label: 'Completed', group: 'active' },
    { key: 'gfe', label: 'GFE', group: 'active' },
    { key: 'archived_hired', label: 'Archived (Hired)', group: 'archive' },
    { key: 'archived_not_hired', label: 'Archived (Not Hired)', group: 'archive' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-gold" />
              Previous Employment Investigations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">49 CFR §391.23 Compliance Tracking</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => downloadPEICsv(filteredRows)} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)} className="gap-2">
              <Beaker className="h-4 w-4" />
              Send test PEI
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} className="gap-2">
              <FileText className="h-4 w-4" />
              View email templates
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile icon={<Mail className="h-4 w-4" />} label="Active Applicants" value={stats.applicants} />
        <StatTile icon={<Clock className="h-4 w-4" />} label="Awaiting Response" value={stats.awaiting} />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={stats.overdue} tone="destructive" />
        <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed This Month" value={stats.completedThisMonth} />
        <StatTile icon={<Archive className="h-4 w-4" />} label="Archive (Hired)" value={stats.archivedHired} />
        <StatTile icon={<Archive className="h-4 w-4" />} label="Archive (Not Hired)" value={stats.archivedNotHired} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 p-3 border-b bg-muted/20">
          {FILTERS.map((f, i) => {
            const active = filter === f.key;
            const count = chipCounts[f.key] ?? 0;
            const disabled = count === 0 && !active;
            const startsArchiveGroup = f.group === 'archive' && FILTERS[i - 1]?.group !== 'archive';
            return (
              <div key={f.key} className="flex items-center gap-1.5">
                {startsArchiveGroup && <span className="h-4 w-px bg-border mx-1" aria-hidden />}
                <button
                  onClick={() => setFilter(f.key)}
                  disabled={disabled}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-foreground text-background border-foreground'
                      : disabled
                        ? 'bg-background text-muted-foreground/40 border-border/50 cursor-not-allowed'
                        : 'bg-background text-muted-foreground hover:text-foreground border-border'
                  }`}
                >
                  {f.label}
                  {f.key !== 'all' && (
                    <span className={`text-[10px] font-semibold ${active ? '' : 'opacity-70'}`}>{count}</span>
                  )}
                </button>
              </div>
            );
          })}
          <div className="relative ml-2 min-w-[180px] flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search applicant or employer"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={expandAll}
              disabled={allExpanded}
              className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              disabled={allCollapsed}
              className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              Collapse all
            </button>
          </div>
        </div>

        {isManagement && selectedGroups.length > 0 && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 py-2.5 border-b bg-foreground text-background">
            <span className="text-xs font-semibold">
              {selectedGroups.length} selected
              {selectedUnresolvedRequestIds.length > 0 && (
                <span className="font-normal opacity-80">
                  {' '}· {selectedUnresolvedRequestIds.length} unresolved{' '}
                  {selectedUnresolvedRequestIds.length === 1 ? 'investigation' : 'investigations'}
                </span>
              )}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkBusy || selectedUnresolvedRequestIds.length === 0}
                onClick={() => setBulkCompleteOpen(true)}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />Mark Completed
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkBusy || selectedUnresolvedRequestIds.length === 0}
                onClick={() => setBulkSendOpen(true)}
              >
                <CalendarClock className="h-3 w-3 mr-1" />Send date &amp; note
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkBusy || selectedActiveCount === 0}
                onClick={() => setBulkArchiveOpen(true)}
              >
                <Archive className="h-3 w-3 mr-1" />Archive
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkBusy || selectedArchivedCount === 0}
                onClick={handleBulkRestore}
              >
                {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArchiveRestore className="h-3 w-3 mr-1" />}
                Restore
              </Button>
              <button onClick={clearSelection} className="text-xs underline opacity-80 hover:opacity-100 px-1">
                Clear
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
            <p className="font-medium">
              {rows.length === 0 ? 'All Previous Employment Investigations are current.' : 'No requests match this filter.'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {rows.length === 0 ? 'No action needed.' : 'Try a different filter or search.'}
            </p>
            {rows.length > 0 && (filter !== 'all' || search.trim()) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => { setFilter('all'); setSearch(''); }}
              >
                Clear filter
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleSections.map((section) => {
              const groups = bySection.get(section.key) ?? [];
              const isEmpty = groups.length === 0;
              const sectionOpen = openSections.has(section.key);
              const sectionIds = groups.map((g) => g.applicationId);
              const allSelected = sectionIds.length > 0 && sectionIds.every((id) => selected.has(id));
              return (
                <Collapsible key={section.key} open={sectionOpen} onOpenChange={() => toggleSection(section.key)}>
                  <div className={`flex items-center bg-muted/40 ${section.stripe}`}>
                    {isManagement && sectionIds.length > 0 && (
                      <div className="pl-4">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(c) => setSectionSelected(sectionIds, c === true)}
                          aria-label={`Select all in ${section.label}`}
                        />
                      </div>
                    )}
                    <CollapsibleTrigger asChild>
                    <button className="flex-1 flex items-center gap-2 px-4 py-3.5 text-left hover:bg-muted/60 transition-colors">
                      {sectionOpen ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-bold uppercase tracking-wide">{section.label}</span>
                      <Badge
                        variant={section.badge}
                        className="text-[10px]"
                      >
                        {groups.length}
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{section.hint}</span>
                    </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="divide-y divide-border">
                      {isEmpty && section.showWhenEmpty ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                          No archived applicants in this category.
                        </div>
                      ) : (
                        groups.map((group) => {
                        const isOpen = openGroups.has(group.applicationId);
                        const summary = groupSummary(group.rows);
                        return (
                          <Collapsible
                            key={group.applicationId}
                            open={isOpen}
                            onOpenChange={() => toggleGroup(group.applicationId)}
                          >
                            <div className="flex items-center gap-2 pr-3 hover:bg-muted/30 transition-colors">
                              {isManagement && (
                                <div className="pl-4">
                                  <Checkbox
                                    checked={selected.has(group.applicationId)}
                                    onCheckedChange={() => toggleSelected(group.applicationId)}
                                    aria-label={`Select ${group.fullName}`}
                                  />
                                </div>
                              )}
                              <CollapsibleTrigger asChild>
                                <button className="flex-1 flex items-center gap-3 px-3 py-3 text-left min-w-0">
                                  {isOpen ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{group.fullName}</span>
                                      <Badge variant="secondary" className="text-xs">
                                        {group.rows.length} {group.rows.length === 1 ? 'employer' : 'employers'}
                                      </Badge>
                                      {summary.overdue > 0 && (
                                        <Badge variant="destructive" className="text-xs">
                                          {summary.overdue} overdue
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      {STATUS_ORDER.filter((s) => summary.counts[s] > 0).map((s) => (
                                        <span key={s} className="text-[11px] text-muted-foreground">
                                          {summary.counts[s]} {s.replace(/_/g, ' ')}
                                        </span>
                                      ))}
                                    </div>
                                    {group.archivedAt && (
                                      <p className="text-[11px] text-muted-foreground mt-1 italic">
                                        Archived {fmtDate(group.archivedAt)}
                                        {group.archivedByName ? ` by ${group.archivedByName}` : ''}
                                        {group.archiveReason ? ` — ${group.archiveReason}` : ''}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              </CollapsibleTrigger>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); onOpenApplication?.(group.applicationId); }}
                                title="Open the full PEI panel for this applicant"
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Open PEI panel
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={printingHistoryFor === group.applicationId}
                                onClick={(e) => { e.stopPropagation(); handlePrintHistory(group.applicationId, group.fullName); }}
                                title="View, download, or print all employer records stitched into one PDF"
                              >
                                {printingHistoryFor === group.applicationId ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Printer className="h-3 w-3 mr-1" />
                                )}
                                Print full history
                              </Button>
                              {isManagement && (
                                group.archivedAt ? (
                                  <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setChangeCategoryFor(group)}
                                  >
                                    <Archive className="h-3 w-3 mr-1" />
                                    Change type
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={restoring === group.applicationId}
                                    onClick={() => handleRestore(group)}
                                  >
                                    {restoring === group.applicationId ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <ArchiveRestore className="h-3 w-3 mr-1" />
                                    )}
                                    Restore
                                  </Button>
                                  </>
                                ) : (
                                  <Button size="sm" variant="ghost" onClick={() => setArchiveFor(group)}>
                                    <Archive className="h-3 w-3 mr-1" />
                                    Archive
                                  </Button>
                                )
                              )}
                            </div>
                            <CollapsibleContent>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                      <th className="text-left px-4 py-2 pl-12">Previous Employer</th>
                                      <th className="text-left px-4 py-2">Status</th>
                                      <th className="text-left px-4 py-2">Date Sent</th>
                                      <th className="text-left px-4 py-2">Deadline</th>
                                      <th className="text-right px-4 py-2">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {group.rows.map((r) => {
                                      const action = actionFor(r);
                                      const resolved = isResolved(r);
                                      const notes = (Array.isArray(r.staff_notes) ? r.staff_notes : []) as PEIStaffNote[];
                                      return (
                                        <tr key={r.request_id} className="hover:bg-muted/30 align-top">
                                          <td className="px-4 py-3 pl-12">
                                            <div>{r.employer_name}</div>
                                            {(r.employer_city || r.employer_state) && (
                                              <div className="text-xs text-muted-foreground">
                                                {[r.employer_city, r.employer_state].filter(Boolean).join(', ')}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-4 py-3">
                                            <PEIStatusBadge status={r.status} />
                                            {resolved && (
                                              <div className="text-[11px] text-muted-foreground mt-1">
                                                Resolved {fmtDate(r.date_response_received ?? r.date_gfe_created)}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-muted-foreground">
                                            {fmtDate(r.date_sent)}
                                            {r.send_method && (
                                              <div className="text-[11px] italic">manual · {r.send_method.replace('_', ' ')}</div>
                                            )}
                                          </td>
                                          <td className="px-4 py-3">
                                            <span className={r.is_overdue ? 'text-destructive font-semibold' : ''}>
                                              {deadlineLabel(r)}
                                            </span>
                                            {!resolved && r.days_since_sent != null && (
                                              <div className="text-[11px] text-muted-foreground">
                                                Day {Math.min(r.days_since_sent, 30)} of 30
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1.5 flex-wrap">
                                              {action && (
                                                <Button size="sm" disabled={busy === r.request_id} onClick={() => handleSend(r, action.kind)}>
                                                  {busy === r.request_id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                  ) : (
                                                    <Send className="h-3 w-3 mr-1" />
                                                  )}
                                                  {action.label}
                                                </Button>
                                              )}
                                              {!resolved && (
                                                <Button size="sm" variant="ghost" onClick={() => setLogSendFor(r)} title="Record a send made outside the app">
                                                  <CalendarClock className="h-3 w-3 mr-1" />
                                                  {r.date_sent ? 'Edit date' : 'Log send'}
                                                </Button>
                                              )}
                                              {!resolved && (
                                                <Button size="sm" variant="ghost" onClick={() => setPhoneFor(r)} title="Log a phone attempt">
                                                  <Phone className="h-3 w-3 mr-1" />Call
                                                </Button>
                                              )}
                                              <StaffNotesPopover requestId={r.request_id} notes={notes} onSaved={reload} />
                                              {!resolved && (
                                                <Button size="sm" variant="ghost" onClick={() => setGfeFor({ id: r.request_id, employer: r.employer_name })}>
                                                  <FileWarning className="h-3 w-3 mr-1" />GFE
                                                </Button>
                                              )}
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={loadingRecordId === r.request_id}
                                                onClick={() => openRecord(r.request_id)}
                                                title="View this employer's PEI record"
                                              >
                                                {loadingRecordId === r.request_id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                ) : (
                                                  <Eye className="h-3 w-3 mr-1" />
                                                )}
                                                View
                                              </Button>
                                              {canDelete(r) && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                  onClick={() => setDeleteTarget(r)}
                                                  title="Delete this PEI request"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })
                    )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </Card>

      {gfeFor && (
        <GFEModal
          open
          requestId={gfeFor.id}
          employerName={gfeFor.employer}
          onClose={() => setGfeFor(null)}
          onDone={() => { setGfeFor(null); reload(); }}
        />
      )}
      {logSendFor && (
        <LogSendModal
          open
          requestId={logSendFor.request_id}
          employerName={logSendFor.employer_name}
          isFirstSend={!logSendFor.date_sent}
          currentDate={logSendFor.date_sent}
          onClose={() => setLogSendFor(null)}
          onDone={() => { setLogSendFor(null); reload(); }}
        />
      )}
      {phoneFor && (
        <LogPhoneAttemptModal
          open
          requestId={phoneFor.request_id}
          employerName={phoneFor.employer_name}
          onClose={() => setPhoneFor(null)}
          onDone={() => { setPhoneFor(null); reload(); }}
        />
      )}
      {archiveFor && (
        <ArchiveApplicantDialog
          open
          applicationId={archiveFor.applicationId}
          applicantName={archiveFor.fullName}
          requestCount={archiveFor.rows.length}
          onClose={() => setArchiveFor(null)}
          onDone={() => { setArchiveFor(null); reload(); }}
        />
      )}
      {changeCategoryFor && (
        <ChangeArchiveCategoryDialog
          open
          applicationId={changeCategoryFor.applicationId}
          applicantName={changeCategoryFor.fullName}
          current={changeCategoryFor.archiveCategory ?? 'not_hired'}
          onClose={() => setChangeCategoryFor(null)}
          onDone={() => { setChangeCategoryFor(null); reload(); }}
        />
      )}
      <PEITemplateViewer open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <SendTestPEIDialog open={testOpen} onOpenChange={setTestOpen} />

      {bulkArchiveOpen && (
        <BulkArchiveDialog
          open
          applicationIds={selectedGroups.filter((g) => !g.archivedAt).map((g) => g.applicationId)}
          onClose={() => setBulkArchiveOpen(false)}
          onDone={() => { setBulkArchiveOpen(false); reloadAndClear(); }}
        />
      )}
      {bulkSendOpen && (
        <BulkSendDateDialog
          open
          requestIds={selectedUnresolvedRequestIds}
          applicantCount={selectedGroups.length}
          onClose={() => setBulkSendOpen(false)}
          onDone={() => { setBulkSendOpen(false); reloadAndClear(); }}
        />
      )}

      <AlertDialog open={bulkCompleteOpen} onOpenChange={(o) => !o && !bulkBusy && setBulkCompleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {selectedUnresolvedRequestIds.length} investigations Completed?</AlertDialogTitle>
            <AlertDialogDescription>
              This resolves every unresolved investigation for the {selectedGroups.length} selected{' '}
              {selectedGroups.length === 1 ? 'applicant' : 'applicants'} and stops automated follow-ups. Use this only
              when the responses were received outside the app — otherwise document a Good Faith Effort instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleBulkComplete(); }} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Mark Completed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this PEI request?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  This will permanently remove the PEI request for{' '}
                  <span className="font-medium text-foreground">{deleteTarget.employer_name}</span>
                  {' '}from{' '}
                  <span className="font-medium text-foreground">
                    {[deleteTarget.applicant_first_name, deleteTarget.applicant_last_name].filter(Boolean).join(' ') || 'this applicant'}
                  </span>
                  . Use this only for duplicates or mistakes — not for completed investigations.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PEIResponseViewer
        open={!!viewRequest}
        request={viewRequest}
        onClose={() => setViewRequest(null)}
      />
    </div>
  );
}

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: 'warning' | 'destructive' }) {
  const valueClass =
    tone === 'destructive' && value > 0
      ? 'text-destructive'
      : tone === 'warning' && value > 0
      ? 'text-amber-600 dark:text-amber-400'
      : '';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</div>
    </Card>
  );
}