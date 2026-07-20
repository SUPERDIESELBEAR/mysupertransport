import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import {
  Bell, BellRing, CheckCircle2, XCircle, AlertTriangle, MessageCircle,
  FileText, Target, Paperclip, Truck, RefreshCcw, CheckCheck, ChevronDown,
  Search, Clock, Archive as ArchiveIcon, Check, ShieldCheck, Megaphone, Banknote,
  ArrowRight, Filter as FilterIcon, X, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { useToast } from '@/hooks/use-toast';
import {
  resolveTier, resolveCategory, TIER_LABELS, CATEGORY_LABELS,
  type NotifTier, type NotifCategory,
} from '@/lib/notifications/taxonomy';
import { rollup } from '@/lib/notifications/rollup';
import {
  markRead, markManyRead, snooze, snoozeMany, archive, archiveMany,
  unarchive, unsnooze,
} from '@/lib/notifications/actions';
import AssignNotificationModal from '@/components/staff/AssignNotificationModal';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  sent_at: string;
  read_at: string | null;
  type: string;
  channel: string;
  entity_type: string | null;
  entity_id: string | null;
  priority: string | null;
  snoozed_until: string | null;
  assigned_to: string | null;
  archived_at: string | null;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  application_approved:   { icon: CheckCircle2, bg: 'bg-green-100',       color: 'text-green-600' },
  application_denied:     { icon: XCircle,      bg: 'bg-red-100',         color: 'text-red-500' },
  truck_down:             { icon: AlertTriangle,bg: 'bg-yellow-100',      color: 'text-yellow-600' },
  new_message:            { icon: MessageCircle,bg: 'bg-blue-100',        color: 'text-blue-500' },
  onboarding_milestone:   { icon: Target,       bg: 'bg-gold/15',         color: 'text-gold' },
  docs_uploaded:          { icon: Paperclip,    bg: 'bg-muted',           color: 'text-muted-foreground' },
  document_uploaded:      { icon: Paperclip,    bg: 'bg-muted',           color: 'text-muted-foreground' },
  new_application:        { icon: FileText,     bg: 'bg-muted',           color: 'text-muted-foreground' },
  dispatch_status_change: { icon: Truck,        bg: 'bg-muted',           color: 'text-muted-foreground' },
  pay_setup_submitted:    { icon: Banknote,     bg: 'bg-gold/15',         color: 'text-gold' },
  compliance_update:      { icon: ShieldCheck,  bg: 'bg-sky-100',         color: 'text-sky-600' },
  release_note:           { icon: Megaphone,    bg: 'bg-purple-100',      color: 'text-purple-600' },
};
const DEFAULT_CFG = { icon: Bell, bg: 'bg-muted', color: 'text-muted-foreground' };

const CTA_LABEL = 'View';
type AttachmentResolver = (userId: string) => Promise<{ url: string; name: string } | null>;
const ATTACHMENT_RESOLVERS: Record<string, AttachmentResolver> = {
  qpassport_uploaded: async (userId) => {
    const { data: op } = await supabase.from('operators').select('id').eq('user_id', userId).maybeSingle();
    if (!op?.id) return null;
    const { data } = await supabase.from('onboarding_status').select('qpassport_url').eq('operator_id', op.id).maybeSingle();
    const url: string | null | undefined = (data as any)?.qpassport_url;
    return url ? { url, name: 'QPassport.pdf' } : null;
  },
};

const PAGE_SIZE = 50;

type StateFilter = 'inbox' | 'unread' | 'snoozed' | 'assigned' | 'archived';

const LS_KEY = 'notif-page-filters-v1';
type PersistedFilters = {
  tiers: NotifTier[];
  categories: NotifCategory[];
  state: StateFilter;
};
const DEFAULT_FILTERS: PersistedFilters = { tiers: [], categories: [], state: 'inbox' };

function loadFilters(): PersistedFilters {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { return DEFAULT_FILTERS; }
}
function saveFilters(f: PersistedFilters) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* noop */ }
}

function dayHeader(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, MMM d');
}

export default function NotificationHistory() {
  const { session } = useAuth();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PersistedFilters>(() => loadFilters());
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ ids: string[]; mode: 'assign' | 'reassign' } | null>(null);

  useEffect(() => { saveFilters(filters); }, [filters]);

  const fetchNotifications = useCallback(async (pageIndex: number, s: StateFilter, q: string, append = false) => {
    if (!session?.user?.id) return;
    if (append) setLoadingMore(true); else setLoading(true);

    const nowIso = new Date().toISOString();
    let query = supabase
      .from('notifications')
      .select('id, title, body, link, sent_at, read_at, type, channel, entity_type, entity_id, priority, snoozed_until, assigned_to, archived_at', { count: 'exact' })
      .eq('user_id', session.user.id)
      .order('sent_at', { ascending: false })
      .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

    if (s === 'archived') {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
      if (s === 'unread') query = query.is('read_at', null);
      if (s === 'snoozed') query = query.not('snoozed_until', 'is', null).gt('snoozed_until', nowIso);
      if (s === 'assigned') query = query.eq('assigned_to', session.user.id);
      if (s === 'inbox') query = query.or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
    }

    if (q.trim()) {
      const like = `%${q.trim()}%`;
      query = query.or(`title.ilike.${like},body.ilike.${like}`);
    }

    const { data, count } = await query;
    setTotal(count ?? 0);
    setNotifications(prev => append ? [...prev, ...((data ?? []) as Notification[])] : ((data ?? []) as Notification[]));
    if (append) setLoadingMore(false); else setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    fetchNotifications(0, filters.state, search);
  }, [filters.state, search, fetchNotifications]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('notif-history')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchNotifications(0, filters.state, search))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, filters.state, search, fetchNotifications]);

  // Client-side filter by tier + category (after server fetch)
  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (filters.tiers.length && !filters.tiers.includes(resolveTier(n))) return false;
      if (filters.categories.length && !filters.categories.includes(resolveCategory(n))) return false;
      return true;
    });
  }, [notifications, filters.tiers, filters.categories]);

  // Group by day, then rollup per driver within day
  const dayBuckets = useMemo(() => {
    const buckets = new Map<string, Notification[]>();
    for (const n of filtered) {
      const key = dayHeader(n.sent_at);
      const arr = buckets.get(key) ?? [];
      arr.push(n);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries()).map(([label, rows]) => ({
      label,
      feed: rollup(rows as any),
    }));
  }, [filtered]);

  const unreadCount = notifications.filter(n => !n.read_at && !n.archived_at).length;
  const inboxUnread = useMemo(() =>
    notifications.filter(n => !n.read_at && !n.archived_at && !(n.snoozed_until && new Date(n.snoozed_until) > new Date())).length,
    [notifications]);
  const snoozedCount = useMemo(() =>
    notifications.filter(n => n.snoozed_until && new Date(n.snoozed_until) > new Date() && !n.archived_at).length,
    [notifications]);
  const assignedCount = useMemo(() =>
    notifications.filter(n => n.assigned_to === session?.user?.id && !n.archived_at).length,
    [notifications, session?.user?.id]);

  const hasMore = notifications.length < total;

  const doMarkAllRead = async () => {
    if (!session?.user?.id) return;
    setMarkingAll(true);
    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id).is('read_at', null);
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setMarkingAll(false);
  };

  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    await fetchNotifications(next, filters.state, search, true);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id); else nx.add(id);
      return nx;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const bulkMarkRead = async () => {
    const ids = Array.from(selected);
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n));
    await markManyRead(ids);
    clearSelection();
    toast({ title: `${ids.length} marked read` });
  };
  const bulkSnooze = async () => {
    const ids = Array.from(selected);
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    await snoozeMany(ids, 'tomorrow');
    clearSelection();
    toast({ title: `${ids.length} snoozed until tomorrow 8 am` });
  };
  const bulkArchive = async () => {
    const ids = Array.from(selected);
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    await archiveMany(ids);
    clearSelection();
    toast({ title: `${ids.length} archived` });
  };
  const bulkAssign = () => {
    setAssignTarget({ ids: Array.from(selected), mode: 'assign' });
  };

  const rowMarkRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    await markRead(id);
  };
  const rowSnooze = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await snooze(id, 'tomorrow');
  };
  const rowArchive = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await archive(id);
  };
  const rowUnarchive = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await unarchive(id);
  };
  const rowUnsnooze = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await unsnooze(id);
  };

  const handleView = async (n: Notification) => {
    const resolver = ATTACHMENT_RESOLVERS[n.type];
    if (!resolver || !session?.user?.id) return;
    const file = await resolver(session.user.id);
    if (file) { setPreviewFile(file); return; }
    toast({ title: 'File not available', description: 'This attachment is no longer available.', variant: 'destructive' });
  };

  const toggleTier = (t: NotifTier) => setFilters(f => ({
    ...f, tiers: f.tiers.includes(t) ? f.tiers.filter(x => x !== t) : [...f.tiers, t],
  }));
  const toggleCategory = (c: NotifCategory) => setFilters(f => ({
    ...f, categories: f.categories.includes(c) ? f.categories.filter(x => x !== c) : [...f.categories, c],
  }));
  const clearAllFilters = () => setFilters({ tiers: [], categories: [], state: 'inbox' });

  // ---------- Rendering ----------

  const renderRow = (n: Notification, opts?: { grouped?: boolean }) => {
    const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CFG;
    const Icon = cfg.icon;
    const isUnread = !n.read_at;
    const isSelected = selected.has(n.id);
    const isExpanded = expandedId === n.id;
    const hasAttachment = !!ATTACHMENT_RESOLVERS[n.type];
    const tier = resolveTier(n);
    const category = resolveCategory(n);
    const tierDot = tier === 'action' ? 'bg-destructive' : tier === 'watch' ? 'bg-gold' : 'bg-muted-foreground/40';

    return (
      <div
        key={n.id}
        className={`group px-4 sm:px-5 py-3 transition-colors ${isUnread ? 'bg-gold/5' : ''} ${isSelected ? 'bg-gold/10' : 'hover:bg-secondary/40'}`}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(n.id)}
            aria-label="Select notification"
            className="mt-2 h-4 w-4 accent-gold shrink-0"
          />
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bg} mt-0.5 relative`}>
            <Icon className={`h-4 w-4 ${cfg.color}`} strokeWidth={2} />
            <span className={`absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full ${tierDot}`} aria-hidden />
          </span>
          <button
            type="button"
            onClick={() => setExpandedId(prev => prev === n.id ? null : n.id)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <p className={`text-sm leading-snug ${isExpanded ? '' : 'truncate'} ${isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
                {n.title}
              </p>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/40 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
            {n.body && (
              <p className={`text-xs text-muted-foreground mt-0.5 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>{n.body}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <Badge variant="outline" className="text-[10px] font-medium capitalize whitespace-nowrap">
                {CATEGORY_LABELS[category]}
              </Badge>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {format(new Date(n.sent_at), 'MMM d, h:mm a')} · {formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })}
              </span>
              {n.assigned_to === session?.user?.id && (
                <Badge variant="outline" className="text-[10px] border-gold text-gold">Assigned to you</Badge>
              )}
              {n.snoozed_until && new Date(n.snoozed_until) > new Date() && (
                <Badge variant="outline" className="text-[10px] border-sky-400 text-sky-600">
                  Snoozed · {format(new Date(n.snoozed_until), 'MMM d h:mm a')}
                </Badge>
              )}
              {isUnread && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gold bg-gold/10 border border-gold/30 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" /> Unread
                </span>
              )}
            </div>
            {isExpanded && hasAttachment && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleView(n); }}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-gold text-surface-dark hover:bg-gold-light transition-colors px-3 py-1.5 rounded-lg"
              >
                {CTA_LABEL}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </button>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-1">
            {isUnread && (
              <button onClick={() => rowMarkRead(n.id)} className="p-1.5 rounded hover:bg-black/10" title="Mark read"><Check className="h-3.5 w-3.5" /></button>
            )}
            {filters.state === 'snoozed' ? (
              <button onClick={() => rowUnsnooze(n.id)} className="p-1.5 rounded hover:bg-black/10" title="Unsnooze"><Clock className="h-3.5 w-3.5" /></button>
            ) : (
              <button onClick={() => rowSnooze(n.id)} className="p-1.5 rounded hover:bg-black/10" title="Snooze until tomorrow 8 am"><Clock className="h-3.5 w-3.5" /></button>
            )}
            {filters.state === 'archived' ? (
              <button onClick={() => rowUnarchive(n.id)} className="p-1.5 rounded hover:bg-black/10" title="Unarchive"><ArchiveIcon className="h-3.5 w-3.5" /></button>
            ) : (
              <button onClick={() => rowArchive(n.id)} className="p-1.5 rounded hover:bg-black/10" title="Archive"><ArchiveIcon className="h-3.5 w-3.5" /></button>
            )}
            <button
              onClick={() => setAssignTarget({ ids: [n.id], mode: n.assigned_to === session?.user?.id ? 'reassign' : 'assign' })}
              className="p-1.5 rounded hover:bg-black/10"
              title={n.assigned_to === session?.user?.id ? 'Re-assign to teammate' : 'Assign to teammate'}
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const activeFilterCount = filters.tiers.length + filters.categories.length;

  // ---------- Layout ----------

  const filterRail = (
    <div className="space-y-4">
      {/* State */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Queue</p>
        <div className="flex flex-col gap-1">
          {([
            ['inbox', 'Inbox', inboxUnread],
            ['unread', 'Unread', unreadCount],
            ['snoozed', 'Snoozed', snoozedCount],
            ['assigned', 'Assigned to me', assignedCount],
            ['archived', 'Archived', null],
          ] as Array<[StateFilter, string, number | null]>).map(([k, label, badge]) => (
            <button
              key={k}
              onClick={() => setFilters(f => ({ ...f, state: k }))}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filters.state === k ? 'bg-gold text-surface-dark font-semibold' : 'text-foreground/80 hover:bg-secondary/60'
              }`}
            >
              <span>{label}</span>
              {badge !== null && badge > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  filters.state === k ? 'bg-surface-dark text-gold' : 'bg-muted text-muted-foreground'
                }`}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Priority</p>
        <div className="flex flex-wrap gap-1.5">
          {(['action','watch','fyi'] as NotifTier[]).map(t => {
            const active = filters.tiers.includes(t);
            const color = t === 'action' ? 'bg-destructive' : t === 'watch' ? 'bg-gold' : 'bg-muted-foreground/50';
            return (
              <button
                key={t}
                onClick={() => toggleTier(t)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground/80 border-border hover:bg-secondary/50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                {TIER_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_LABELS) as NotifCategory[]).map(c => {
            const active = filters.categories.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground/80 border-border hover:bg-secondary/50'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <button
          onClick={clearAllFilters}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BellRing className="h-6 w-6 text-gold shrink-0" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} in this view · {inboxUnread} unread in inbox
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={doMarkAllRead} disabled={markingAll} className="gap-1.5 text-xs">
              {markingAll
                ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                : <CheckCheck className="h-3.5 w-3.5" />}
              Mark all read
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchNotifications(0, filters.state, search)} className="gap-1.5 text-xs">
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Analytics chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ['Action needed', filtered.filter(n => resolveTier(n) === 'action' && !n.read_at).length, 'text-destructive'],
          ['Unread today', filtered.filter(n => !n.read_at && isToday(new Date(n.sent_at))).length, 'text-gold'],
          ['Snoozed', snoozedCount, 'text-sky-600'],
          ['Assigned to me', assignedCount, 'text-foreground'],
        ] as Array<[string, number, string]>).map(([label, val, color]) => (
          <div key={label} className="bg-white border border-border rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* Search + mobile filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or body…"
            className="pl-9 h-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden gap-1.5 text-xs"
          onClick={() => setMobileFilterOpen(v => !v)}
        >
          <FilterIcon className="h-3.5 w-3.5" />
          Filters{activeFilterCount > 0 && <span className="ml-1 text-gold">({activeFilterCount})</span>}
        </Button>
      </div>

      {mobileFilterOpen && (
        <div className="lg:hidden bg-white border border-border rounded-xl p-4">
          {filterRail}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        {/* Rail */}
        <aside className="hidden lg:block bg-white border border-border rounded-xl p-4 h-fit sticky top-4">
          {filterRail}
        </aside>

        {/* Feed */}
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Bulk bar */}
          {selected.size > 0 && (
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 bg-surface-dark text-white">
              <span className="text-xs font-medium">{selected.size} selected</span>
              <div className="flex items-center gap-1">
                <button onClick={bulkMarkRead} className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Mark read</button>
                <button onClick={bulkSnooze} className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Snooze</button>
                <button onClick={bulkArchive} className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><ArchiveIcon className="h-3 w-3" /> Archive</button>
                <button onClick={bulkAssign} className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><UserPlus className="h-3 w-3" /> Assign</button>
                <button onClick={clearSelection} className="text-xs px-2 py-1 rounded hover:bg-white/10"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-4">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-72" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : dayBuckets.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-medium text-foreground">Nothing here</p>
              <p className="text-sm text-muted-foreground mt-1">Try clearing filters or switching to a different queue.</p>
            </div>
          ) : (
            <div>
              {dayBuckets.map(bucket => (
                <div key={bucket.label}>
                  <div className="px-5 py-2 bg-secondary/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-y border-border">
                    {bucket.label}
                  </div>
                  <div className="divide-y divide-border">
                    {bucket.feed.map((item, idx) => {
                      if (item.kind === 'single') return renderRow(item.notif as Notification);
                      const g = item.group;
                      const label = g.entity_type === 'operator' ? 'driver' : 'applicant';
                      return (
                        <div key={`grp-${g.key}-${idx}`} className="bg-gold/5">
                          <div className="px-5 py-1.5 text-[11px] font-semibold text-gold uppercase tracking-wide">
                            {g.members.length} updates for one {label}
                          </div>
                          <div className="divide-y divide-border">
                            {g.members.map(m => renderRow(m as Notification, { grouped: true }))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {filtered.length} of {total}
                </p>
                {hasMore && (
                  <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore} className="text-xs gap-1.5">
                    {loadingMore
                      ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                      : null}
                    Load more
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {previewFile && (
        <FilePreviewModal
          url={previewFile.url}
          name={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}

      <AssignNotificationModal
        open={!!assignTarget}
        mode={assignTarget?.mode ?? 'assign'}
        notificationIds={assignTarget?.ids ?? []}
        onClose={() => setAssignTarget(null)}
        onDone={() => { clearSelection(); void fetchNotifications(0, filters.state, search); }}
      />
    </div>
  );
}
