import { useState, useEffect, useCallback } from 'react';
import { format, startOfDay, endOfDay, startOfToday, endOfToday, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, XCircle, UserPlus, UserMinus, Shield, FileText,
  Milestone, RefreshCcw, Activity, ChevronDown, Download, CalendarIcon, X
} from 'lucide-react';

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = {
  application_approved: {
    label: 'Application Approved',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-status-complete',
    bg: 'bg-status-complete/10 border-status-complete/20',
  },
  application_denied: {
    label: 'Application Denied',
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/20',
  },
  role_added: {
    label: 'Role Granted',
    icon: <UserPlus className="h-4 w-4" />,
    color: 'text-gold',
    bg: 'bg-gold/10 border-gold/20',
  },
  role_removed: {
    label: 'Role Revoked',
    icon: <UserMinus className="h-4 w-4" />,
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border',
  },
  onboarding_milestone: {
    label: 'Onboarding Milestone',
    icon: <Milestone className="h-4 w-4" />,
    color: 'text-gold',
    bg: 'bg-gold/10 border-gold/20',
  },
  operator_status_updated: {
    label: 'Onboarding Updated',
    icon: <FileText className="h-4 w-4" />,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'application_approved', label: 'Approved' },
  { value: 'application_denied', label: 'Denied' },
  { value: 'role_added', label: 'Roles Granted' },
  { value: 'role_removed', label: 'Roles Revoked' },
  { value: 'operator_status_updated', label: 'Onboarding Updates' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function EntryDetail({ entry }: { entry: AuditEntry }) {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case 'application_approved':
    case 'application_denied':
      return (
        <span className="text-xs text-muted-foreground">
          {meta.applicant_email as string}
          {meta.reviewer_notes ? ` · "${meta.reviewer_notes as string}"` : ''}
        </span>
      );
    case 'role_added':
    case 'role_removed':
      return (
        <span className="text-xs text-muted-foreground">
          {entry.action === 'role_added' ? 'Granted' : 'Revoked'}{' '}
          <span className="font-medium text-foreground">{formatRole(meta.role as string)}</span>
          {' '}role
        </span>
      );
    case 'operator_status_updated':
      return (
        <span className="text-xs text-muted-foreground">
          {(meta.milestones as string[])?.join(', ') ?? 'Status updated'}
        </span>
      );
    default:
      return null;
  }
}

const PAGE_SIZE = 20;

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildDetailText(entry: AuditEntry): string {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case 'application_approved':
    case 'application_denied':
      return [meta.applicant_email, meta.reviewer_notes].filter(Boolean).join(' — ');
    case 'role_added':
    case 'role_removed':
      return `${entry.action === 'role_added' ? 'Granted' : 'Revoked'} ${formatRole(meta.role as string)} role`;
    case 'operator_status_updated':
      return (meta.milestones as string[])?.join(', ') ?? 'Status updated';
    default:
      return '';
  }
}

function exportToCsv(rows: AuditEntry[], currentFilter: string, dateFrom?: Date, dateTo?: Date) {
  const headers = ['Timestamp', 'Action', 'Actor', 'Subject', 'Detail', 'Entity Type', 'Entity ID'];
  const lines = [
    headers.join(','),
    ...rows.map(e => [
      new Date(e.created_at).toISOString(),
      ACTION_CONFIG[e.action]?.label ?? e.action,
      e.actor_name ?? '',
      e.entity_label ?? '',
      buildDetailText(e),
      e.entity_type,
      e.entity_id ?? '',
    ].map(csvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filterLabel = currentFilter === 'all' ? 'all' : currentFilter;
  const fromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '';
  const toStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : '';
  const datePart = fromStr && toStr ? `_${fromStr}_to_${toStr}` : fromStr ? `_from_${fromStr}` : toStr ? `_to_${toStr}` : '';
  a.href = url;
  a.download = `audit-log-${filterLabel}${datePart}_exported-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Date picker button ────────────────────────────────────────────────────────

function DatePickerButton({
  label,
  date,
  onSelect,
  onClear,
  disabled,
}: {
  label: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  onClear: () => void;
  disabled?: (d: Date) => boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            date
              ? 'bg-surface-dark text-white border-surface-dark'
              : 'bg-white text-muted-foreground border-border hover:border-gold/50 hover:text-foreground'
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          {date ? format(date, 'MMM d, yyyy') : label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          disabled={disabled}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
        {date && (
          <div className="px-3 pb-3">
            <button
              onClick={onClear}
              className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1.5 rounded border border-border hover:border-foreground/30 transition-colors"
            >
              <X className="h-3 w-3" /> Clear date
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const fetchLog = useCallback(async (
    pageNum = 0,
    currentFilter = filter,
    from = dateFrom,
    to = dateTo,
  ) => {
    setLoading(true);
    let query = supabase
      .from('audit_log' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE);

    if (currentFilter !== 'all') query = query.eq('action', currentFilter);
    if (from) query = query.gte('created_at', startOfDay(from).toISOString());
    if (to)   query = query.lte('created_at', endOfDay(to).toISOString());

    const { data, error } = await query;
    if (!error && data) {
      const typed = data as unknown as AuditEntry[];
      setEntries(prev => pageNum === 0 ? typed : [...prev, ...typed]);
      setHasMore(typed.length === PAGE_SIZE + 1);
      if (typed.length === PAGE_SIZE + 1) {
        setEntries(prev => prev.slice(0, -1));
      }
    }
    setLoading(false);
  }, [filter, dateFrom, dateTo]);

  useEffect(() => {
    setPage(0);
    setEntries([]);
    fetchLog(0, filter, dateFrom, dateTo);
  }, [filter, dateFrom, dateTo]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchLog(next, filter, dateFrom, dateTo);
  };

  const handleExport = async () => {
    setExporting(true);
    let query = supabase
      .from('audit_log' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (filter !== 'all') query = query.eq('action', filter);
    if (dateFrom) query = query.gte('created_at', startOfDay(dateFrom).toISOString());
    if (dateTo)   query = query.lte('created_at', endOfDay(dateTo).toISOString());

    const { data } = await query;
    if (data && data.length > 0) {
      exportToCsv(data as unknown as AuditEntry[], filter, dateFrom, dateTo);
    }
    setExporting(false);
  };

  const hasDateFilter = !!dateFrom || !!dateTo;
  const clearDates = () => { setDateFrom(undefined); setDateTo(undefined); };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Audit trail of all significant actions across the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || loading || entries.length === 0}
            className="gap-1.5"
          >
            <Download className={`h-3.5 w-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPage(0); setEntries([]); fetchLog(0, filter, dateFrom, dateTo); }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === opt.value
                ? 'bg-surface-dark text-white border-surface-dark'
                : 'bg-white text-muted-foreground border-border hover:border-gold/50 hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* Date range pickers */}
        <DatePickerButton
          label="From date"
          date={dateFrom}
          onSelect={setDateFrom}
          onClear={() => setDateFrom(undefined)}
          disabled={dateTo ? (d) => d > dateTo : undefined}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <DatePickerButton
          label="To date"
          date={dateTo}
          onSelect={setDateTo}
          onClear={() => setDateTo(undefined)}
          disabled={dateFrom ? (d) => d < dateFrom : undefined}
        />

        {hasDateFilter && (
          <button
            onClick={clearDates}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
          >
            <X className="h-3 w-3" /> Clear dates
          </button>
        )}
      </div>

      {/* Active date range summary */}
      {hasDateFilter && (
        <p className="text-xs text-muted-foreground -mt-2">
          Showing entries
          {dateFrom ? ` from ${format(dateFrom, 'MMM d, yyyy')}` : ''}
          {dateTo   ? ` to ${format(dateTo, 'MMM d, yyyy')}` : ''}
        </p>
      )}

      {/* Timeline */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCcw className="h-6 w-6 animate-spin opacity-40" />
            <p className="text-sm">Loading activity…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Activity className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No activity found</p>
            <p className="text-xs">
              {hasDateFilter ? 'Try adjusting the date range or clearing the filter.' : 'Actions like approvals, role changes, and milestones will appear here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry, idx) => {
              const cfg = ACTION_CONFIG[entry.action] ?? {
                label: entry.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                icon: <Shield className="h-4 w-4" />,
                color: 'text-muted-foreground',
                bg: 'bg-muted border-border',
              };

              return (
                <div key={entry.id} className="flex gap-4 px-5 py-4 hover:bg-secondary/20 transition-colors">
                  {/* Icon + spine */}
                  <div className="flex flex-col items-center shrink-0 pt-0.5">
                    <div className={`h-8 w-8 rounded-full border flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    {idx < entries.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-2 min-h-3" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        {entry.entity_label && (
                          <p className="text-sm font-medium text-foreground mt-0.5">{entry.entity_label}</p>
                        )}
                        <EntryDetail entry={entry} />
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {entry.actor_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        by <span className="font-medium text-foreground">{entry.actor_name}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="px-5 py-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
