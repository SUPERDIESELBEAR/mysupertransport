import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, MessageCircle, FileText, Target,
  Paperclip, Truck, ShieldCheck, Megaphone, Banknote, Clock, Archive as ArchiveIcon,
  Check, ChevronRight, Users, UserPlus,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveTier, resolveCategory, TIER_LABELS, type NotifTier } from '@/lib/notifications/taxonomy';
import { rollup } from '@/lib/notifications/rollup';
import { markRead, markManyRead, snooze, archive } from '@/lib/notifications/actions';
import AssignNotificationModal from '@/components/staff/AssignNotificationModal';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  sent_at: string;
  read_at: string | null;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  priority?: string | null;
  snoozed_until?: string | null;
  assigned_to?: string | null;
  archived_at?: string | null;
}

interface NotificationBellProps {
  variant?: 'light' | 'dark';
  /** Path to navigate when "View all →" is clicked. */
  n?: string;
  /** Legacy alias kept for older callers. */
  notificationsPath?: string;
  clearBadge?: boolean;
  onNavigate?: (path: string) => void;
}

type Tab = 'action' | 'all' | 'mentions';

export default function NotificationBell({
  variant = 'light',
  n,
  notificationsPath,
  clearBadge = false,
  onNavigate,
}: NotificationBellProps) {
  const notifPath = n ?? notificationsPath ?? '/dashboard?view=notifications';
  const { session, activeRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('action');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; mode: 'assign' | 'reassign' } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(nn => !nn.read_at).length;
  const actionable = useMemo(
    () => notifications.filter(nn => resolveTier(nn) === 'action' && !nn.archived_at),
    [notifications],
  );
  const mentions = useMemo(
    () => notifications.filter(nn => nn.assigned_to && nn.assigned_to === session?.user?.id && !nn.archived_at),
    [notifications, session?.user?.id],
  );
  const actionUnread = actionable.filter(nn => !nn.read_at).length;

  const isDark = variant === 'dark';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchNotifications();
    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    if (clearBadge) {
      setNotifications(prev => prev.map(nn => ({ ...nn, read_at: nn.read_at ?? new Date().toISOString() })));
    }
  }, [clearBadge]);

  // Auto-land on the tab that has content
  useEffect(() => {
    if (open) setTab(actionUnread > 0 ? 'action' : 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchNotifications = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, sent_at, read_at, type, entity_type, entity_id, priority, snoozed_until, assigned_to, archived_at')
      .eq('user_id', session.user.id)
      .eq('channel', 'in_app')
      .is('archived_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
      .order('sent_at', { ascending: false })
      .limit(20);
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  };

  const markAllRead = async () => {
    const ids = notifications.filter(nn => !nn.read_at).map(nn => nn.id);
    if (!ids.length) return;
    setNotifications(prev => prev.map(nn => ({ ...nn, read_at: nn.read_at ?? new Date().toISOString() })));
    await markManyRead(ids);
  };

  const doSnooze = async (id: string) => {
    setNotifications(prev => prev.filter(nn => nn.id !== id));
    await snooze(id, 'tomorrow');
  };
  const doArchive = async (id: string) => {
    setNotifications(prev => prev.filter(nn => nn.id !== id));
    await archive(id);
  };
  const doMarkRead = async (id: string) => {
    setNotifications(prev => prev.map(nn => nn.id === id ? { ...nn, read_at: new Date().toISOString() } : nn));
    await markRead(id);
  };

  const typeIconConfig: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
    application_approved:   { icon: CheckCircle2,    bg: 'bg-green-100',  color: 'text-green-600' },
    application_denied:     { icon: XCircle,          bg: 'bg-red-100',    color: 'text-red-500' },
    truck_down:             { icon: AlertTriangle,    bg: 'bg-yellow-100', color: 'text-yellow-500' },
    new_message:            { icon: MessageCircle,    bg: 'bg-blue-100',   color: 'text-blue-500' },
    onboarding_milestone:   { icon: Target,           bg: 'bg-gold/15',    color: 'text-gold' },
    docs_uploaded:          { icon: Paperclip,        bg: 'bg-muted',      color: 'text-muted-foreground' },
    document_uploaded:      { icon: Paperclip,        bg: 'bg-muted',      color: 'text-muted-foreground' },
    new_application:        { icon: FileText,         bg: 'bg-muted',      color: 'text-muted-foreground' },
    dispatch_status_change: { icon: Truck,            bg: 'bg-muted',      color: 'text-muted-foreground' },
    compliance_update:      { icon: ShieldCheck,      bg: 'bg-sky-100',    color: 'text-sky-600' },
    release_note:           { icon: Megaphone,        bg: 'bg-purple-100', color: 'text-purple-600' },
    pay_setup_submitted:    { icon: Banknote,         bg: 'bg-gold/15',    color: 'text-gold' },
  };
  const defaultIconConfig = { icon: Bell, bg: 'bg-muted', color: 'text-muted-foreground' };

  const getTypeIcon = (type: string) => {
    const cfg = typeIconConfig[type] ?? defaultIconConfig;
    const Icon = cfg.icon;
    return (
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} strokeWidth={2.5} />
      </span>
    );
  };

  const navigateToPath = (path: string) => {
    setOpen(false);
    if (onNavigate) onNavigate(path);
    else navigate(path);
  };

  type Portal = 'management' | 'staff' | 'dispatch' | 'operator';
  const detectPortal = (): Portal => {
    switch (activeRole) {
      case 'owner':
      case 'management':      return 'management';
      case 'onboarding_staff': return 'staff';
      case 'dispatcher':      return 'dispatch';
      case 'operator':
      case 'truck_owner':     return 'operator';
      default:                return 'operator';
    }
  };

  const resolveRoute = (nn: Notification): string => {
    const portal = detectPortal();
    let id: string | null = nn.entity_id;
    let et: string | null = nn.entity_type;
    if (!id && nn.link) {
      const opMatch = nn.link.match(/[?&](?:operator|op)=([0-9a-f-]{36})/i);
      if (opMatch) { et = 'operator'; id = opMatch[1]; }
      else {
        const appMatch = nn.link.match(/[?&](?:application|app)=([0-9a-f-]{36})/i);
        if (appMatch) { et = 'application'; id = appMatch[1]; }
      }
    }
    const operatorRoute = (opId: string) => {
      if (portal === 'staff') return `/staff?view=operator-detail&operator=${opId}`;
      if (portal === 'dispatch') return `/dispatch`;
      if (portal === 'operator') return `/operator/status`;
      return `/dashboard?view=operator-detail&op=${opId}`;
    };
    const applicationRoute = (appId: string) => {
      if (portal === 'staff') return `/staff?view=applications&app=${appId}`;
      return `/dashboard?view=applications&app=${appId}`;
    };
    if (et === 'operator' && id) {
      if (portal === 'operator') {
        switch (nn.type) {
          case 'new_message': return '/operator/messages';
          case 'dispatch_status_change': return '/operator/dispatch';
          default: return '/operator/status';
        }
      }
      return operatorRoute(id);
    }
    if (et === 'application' && id) return applicationRoute(id);
    if (et === 'message_thread' && id) {
      if (portal === 'staff') return `/staff?view=messages&thread=${id}`;
      if (portal === 'operator') return `/operator/messages?thread=${id}`;
      return `/dashboard?tab=messages&thread=${id}`;
    }
    if (et === 'release_note') {
      if (portal === 'staff') return `/staff?view=whats-new`;
      return `/dashboard?view=whats-new`;
    }
    if (nn.link) return nn.link;
    return '/dashboard';
  };

  // Style tokens
  const btnClass = isDark
    ? 'relative text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors'
    : 'relative text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted';
  const dropdownClass = isDark
    ? 'absolute right-0 top-full mt-2 w-[22rem] bg-surface-dark border border-surface-dark-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in'
    : 'absolute right-0 top-full mt-2 w-[22rem] bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in';
  const headerClass = isDark
    ? 'flex items-center justify-between px-4 py-3 border-b border-surface-dark-border'
    : 'flex items-center justify-between px-4 py-3 border-b border-border';
  const titleClass = isDark ? 'text-sm font-semibold text-surface-dark-foreground' : 'text-sm font-semibold text-foreground';
  const tabClass = (active: boolean) =>
    `flex-1 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
      active
        ? (isDark ? 'text-gold border-b-2 border-gold' : 'text-gold border-b-2 border-gold')
        : (isDark ? 'text-surface-dark-muted hover:text-surface-dark-foreground border-b-2 border-transparent'
                  : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent')
    }`;
  const emptyClass = isDark ? 'text-sm text-surface-dark-muted' : 'text-sm text-muted-foreground';
  const footerClass = isDark
    ? 'px-4 py-2.5 border-t border-surface-dark-border bg-surface-dark-card'
    : 'px-4 py-2.5 border-t border-border bg-muted/30';

  const rowsForTab: Notification[] =
    tab === 'action' ? actionable
    : tab === 'mentions' ? mentions
    : notifications;

  const feed = useMemo(() => rollup(rowsForTab as any), [rowsForTab]);

  const renderNotif = (nn: Notification, opts?: { compact?: boolean }) => {
    const route = resolveRoute(nn);
    const unread = !nn.read_at;
    const tier = resolveTier(nn);
    const tierDot =
      tier === 'action' ? 'bg-destructive'
      : tier === 'watch' ? 'bg-gold'
      : 'bg-muted-foreground/40';
    return (
      <div
        key={nn.id}
        className={`group relative w-full px-4 py-2.5 border-b last:border-0 transition-colors ${
          isDark ? 'border-surface-dark-border hover:bg-surface-dark-card' : 'border-border hover:bg-muted/40'
        } ${unread ? 'bg-gold/5' : ''}`}
      >
        <button
          type="button"
          onClick={() => { if (unread) doMarkRead(nn.id); navigateToPath(route); }}
          className="w-full text-left"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 relative">
              {getTypeIcon(nn.type)}
              <span className={`absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full ${tierDot}`} aria-hidden />
            </span>
            <div className="flex-1 min-w-0 pr-14">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm line-clamp-2 break-words ${
                  unread ? (isDark ? 'font-semibold text-surface-dark-foreground' : 'font-semibold text-foreground')
                         : (isDark ? 'font-medium text-surface-dark-muted' : 'font-medium text-foreground/80')
                }`}>{nn.title}</p>
                {unread && <span className="h-2 w-2 rounded-full bg-gold shrink-0 mt-1" aria-hidden />}
              </div>
              {nn.body && !opts?.compact && (
                <p className={`text-xs mt-0.5 line-clamp-2 break-words ${
                  isDark ? 'text-surface-dark-muted' : 'text-muted-foreground'
                }`}>{nn.body}</p>
              )}
              <p className={`text-[10px] mt-1 ${
                isDark ? 'text-surface-dark-muted/60' : 'text-muted-foreground/60'
              }`}>
                {formatDistanceToNow(new Date(nn.sent_at), { addSuffix: true })}
                {nn.assigned_to === session?.user?.id && (
                  <span className="ml-2 inline-flex items-center gap-1 text-gold"><Users className="h-3 w-3" /> Assigned to you</span>
                )}
              </p>
            </div>
          </div>
        </button>
        {/* Inline actions (hover reveal) */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {unread && (
            <button
              onClick={(e) => { e.stopPropagation(); doMarkRead(nn.id); }}
              className="p-1 rounded hover:bg-black/10"
              title="Mark read"
              aria-label="Mark read"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); doSnooze(nn.id); }}
            className="p-1 rounded hover:bg-black/10"
            title="Snooze until tomorrow"
            aria-label="Snooze"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); doArchive(nn.id); }}
            className="p-1 rounded hover:bg-black/10"
            title="Archive"
            aria-label="Archive"
          >
            <ArchiveIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setAssignTarget({ id: nn.id, mode: nn.assigned_to === session?.user?.id ? 'reassign' : 'assign' }); }}
            className="p-1 rounded hover:bg-black/10"
            title={nn.assigned_to === session?.user?.id ? 'Re-assign' : 'Assign'}
            aria-label="Assign"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className={btnClass}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={dropdownClass}>
          <div className={headerClass}>
            <div className="flex items-center gap-2">
              <Bell className={`h-4 w-4 ${isDark ? 'text-surface-dark-foreground' : 'text-foreground'}`} />
              <span className={titleClass}>Notifications</span>
              {unreadCount > 0 && (
                <span className="h-5 min-w-5 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-gold hover:text-gold-light font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className={`flex ${isDark ? 'border-b border-surface-dark-border' : 'border-b border-border'}`}>
            <button className={tabClass(tab === 'action')} onClick={() => setTab('action')}>
              Action{actionUnread > 0 && <span className="ml-1 text-destructive">({actionUnread})</span>}
            </button>
            <button className={tabClass(tab === 'all')} onClick={() => setTab('all')}>All</button>
            <button className={tabClass(tab === 'mentions')} onClick={() => setTab('mentions')}>
              Mentions{mentions.length > 0 && <span className="ml-1">({mentions.length})</span>}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              </div>
            ) : feed.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className={`h-8 w-8 mx-auto mb-2 ${isDark ? 'text-surface-dark-muted/30' : 'text-muted-foreground/30'}`} />
                <p className={emptyClass}>
                  {tab === 'action' ? 'Nothing needs your attention right now.'
                    : tab === 'mentions' ? 'No items assigned to you.'
                    : 'No notifications yet'}
                </p>
              </div>
            ) : (
              <TooltipProvider delayDuration={300}>
                {feed.map((item, idx) => {
                  if (item.kind === 'single') return renderNotif(item.notif as Notification);
                  const g = item.group;
                  const label = g.entity_type === 'operator' ? 'driver' : 'applicant';
                  return (
                    <div key={`grp-${g.key}-${idx}`} className={`px-4 py-2 border-b ${isDark ? 'border-surface-dark-border' : 'border-border'} bg-gold/5`}>
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gold mb-1">
                        <ChevronRight className="h-3 w-3" />
                        {g.members.length} updates for one {label}
                      </div>
                      <div className="rounded-lg overflow-hidden border border-border/60">
                        {g.members.slice(0, 3).map(m => renderNotif(m as Notification, { compact: true }))}
                        {g.members.length > 3 && (
                          <button
                            onClick={() => navigateToPath(notifPath)}
                            className="w-full text-center py-1.5 text-[11px] text-gold hover:bg-gold/10"
                          >
                            View all {g.members.length} →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </TooltipProvider>
            )}
          </div>

          <div className={footerClass}>
            <div className="flex items-center justify-between">
              <p className={`text-[10px] ${isDark ? 'text-surface-dark-muted' : 'text-muted-foreground'}`}>
                {feed.length > 0 && `${TIER_LABELS[('action' as NotifTier)]} filter available on page`}
              </p>
              <button
                onClick={() => navigateToPath(notifPath)}
                className="text-xs font-medium text-gold hover:text-gold-light transition-colors"
              >
                View all →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
