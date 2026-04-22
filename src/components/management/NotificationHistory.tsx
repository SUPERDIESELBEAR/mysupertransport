import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, MessageCircle,
  FileText, Target, Paperclip, Truck, RefreshCcw, CheckCheck, Filter, ArrowRight, Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  sent_at: string;
  read_at: string | null;
  type: string;
  channel: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; color: string; label: string }> = {
  application_approved:   { icon: CheckCircle2, bg: 'bg-green-100',       color: 'text-green-600',         label: 'Application Approved' },
  application_denied:     { icon: XCircle,      bg: 'bg-red-100',         color: 'text-red-500',           label: 'Application Denied' },
  truck_down:             { icon: AlertTriangle,bg: 'bg-yellow-100',      color: 'text-yellow-600',        label: 'Truck Down' },
  new_message:            { icon: MessageCircle,bg: 'bg-blue-100',        color: 'text-blue-500',          label: 'New Message' },
  onboarding_milestone:   { icon: Target,       bg: 'bg-gold/15',         color: 'text-gold',              label: 'Onboarding Milestone' },
  docs_uploaded:          { icon: Paperclip,    bg: 'bg-muted',           color: 'text-muted-foreground',  label: 'Docs Uploaded' },
  document_uploaded:      { icon: Paperclip,    bg: 'bg-muted',           color: 'text-muted-foreground',  label: 'Document Uploaded' },
  new_application:        { icon: FileText,     bg: 'bg-muted',           color: 'text-muted-foreground',  label: 'New Application' },
  dispatch_status_change: { icon: Truck,        bg: 'bg-muted',           color: 'text-muted-foreground',  label: 'Dispatch Status' },
  pay_setup_submitted:    { icon: Banknote,     bg: 'bg-gold/15',         color: 'text-gold',              label: 'Pay Setup Submitted' },
};
const DEFAULT_CONFIG = { icon: Bell, bg: 'bg-muted', color: 'text-muted-foreground', label: 'Notification' };

const PAGE_SIZE = 25;

type ReadFilter = 'all' | 'unread' | 'read';

export default function NotificationHistory() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async (pageIndex: number, filter: ReadFilter, append = false) => {
    if (!session?.user?.id) return;
    if (append) setLoadingMore(true);
    else setLoading(true);

    let query = supabase
      .from('notifications')
      .select('id, title, body, link, sent_at, read_at, type, channel', { count: 'exact' })
      .eq('user_id', session.user.id)
      .order('sent_at', { ascending: false })
      .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

    if (filter === 'unread') query = query.is('read_at', null);
    if (filter === 'read') query = query.not('read_at', 'is', null);

    const { data, count } = await query;
    setTotal(count ?? 0);
    setNotifications(prev => append ? [...prev, ...(data ?? [])] : (data ?? []));
    if (append) setLoadingMore(false);
    else setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    setPage(0);
    fetchNotifications(0, readFilter);
  }, [readFilter, fetchNotifications]);

  // Realtime updates
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('notif-history')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchNotifications(0, readFilter))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, readFilter, fetchNotifications]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    setMarkingAll(true);
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('read_at', null);
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setMarkingAll(false);
  };

  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    await fetchNotifications(next, readFilter, true);
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;
  const hasMore = notifications.length < total;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notification History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All notifications sent to your account — {total} total
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={markingAll}
              className="gap-1.5 text-xs"
            >
              {markingAll
                ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                : <CheckCheck className="h-3.5 w-3.5" />
              }
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNotifications(0, readFilter)}
            className="gap-1.5 text-xs"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex rounded-lg border border-border bg-white overflow-hidden text-sm">
          {(['all', 'unread', 'read'] as ReadFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setReadFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-r border-border last:border-0 ${
                readFilter === f ? 'bg-surface-dark text-white' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {f}
              {f === 'unread' && unreadCount > 0 && (
                <span className="ml-1.5 bg-destructive text-white text-[10px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
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
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-foreground">No notifications</p>
            <p className="text-sm text-muted-foreground mt-1">
              {readFilter !== 'all' ? `No ${readFilter} notifications.` : 'You have no notifications yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-12 px-5 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
              <span className="col-span-5">Notification</span>
              <span className="col-span-2">Type</span>
              <span className="col-span-3">Sent</span>
              <span className="col-span-2 text-right">Status</span>
            </div>

            <div className="divide-y divide-border">
              {notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
                const Icon = cfg.icon;
                const isUnread = !n.read_at;

                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (isUnread) markRead(n.id);
                      if (n.link) navigate(n.link);
                    }}
                    className={`grid grid-cols-12 items-start gap-2 px-5 py-4 transition-colors group ${
                      n.link ? 'cursor-pointer hover:bg-secondary/40' : 'cursor-default hover:bg-secondary/10'
                    } ${isUnread ? 'bg-gold/5' : ''}`}
                  >
                    {/* Notification col */}
                    <div className="col-span-5 flex items-start gap-3 min-w-0">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bg} mt-0.5`}>
                        <Icon className={`h-4 w-4 ${cfg.color}`} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className={`text-sm leading-snug truncate ${isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
                            {n.title}
                          </p>
                          {n.link && (
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-gold/70" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                      </div>
                    </div>

                    {/* Type col */}
                    <div className="col-span-2">
                      <Badge variant="outline" className="text-[10px] font-medium capitalize whitespace-nowrap">
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* Sent col */}
                    <div className="col-span-3">
                      <p className="text-xs text-foreground">
                        {format(new Date(n.sent_at), 'MMM d, yyyy')}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(n.sent_at), 'h:mm a')} · {formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Status col */}
                    <div className="col-span-2 flex justify-end items-start pt-0.5">
                      {isUnread ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gold bg-gold/10 border border-gold/30 px-2 py-0.5 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                          Unread
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-status-complete" />
                          Read
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more / footer */}
            <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {notifications.length} of {total} notification{total !== 1 ? 's' : ''}
              </p>
              {hasMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs gap-1.5"
                >
                  {loadingMore
                    ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                    : null
                  }
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
