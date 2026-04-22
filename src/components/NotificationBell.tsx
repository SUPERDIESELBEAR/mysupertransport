import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, XCircle, AlertTriangle, MessageCircle, FileText, Target, Paperclip, Truck, ShieldCheck, Megaphone, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  sent_at: string;
  read_at: string | null;
  type: string;
}

interface NotificationBellProps {
  /** 'light' (default) = white dropdown on light header; 'dark' = styled for dark header */
  variant?: 'light' | 'dark';
  /** Path to navigate when "View all →" is clicked. Defaults to /dashboard?view=notifications */
  notificationsPath?: string;
  /** When true, clears the bell's unread badge (e.g. when the notifications history page is open) */
  clearBadge?: boolean;
}

export default function NotificationBell({ variant = 'light', notificationsPath = '/dashboard?view=notifications', clearBadge = false }: NotificationBellProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read_at).length;

  const isDark = variant === 'dark';

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch on mount and subscribe to realtime
  useEffect(() => {
    if (!session?.user?.id) return;
    fetchNotifications();

    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchNotifications())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  // Clear bell badge when parent signals that notifications page is open
  useEffect(() => {
    if (clearBadge) {
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    }
  }, [clearBadge]);

  const fetchNotifications = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, sent_at, read_at, type')
      .eq('user_id', session.user.id)
      .eq('channel', 'in_app')
      .order('sent_at', { ascending: false })
      .limit(10);
    setNotifications(data ?? []);
    setLoading(false);
  };

  const markRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (!unreadIds.length) return;
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
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

  // Style tokens by variant
  const btnClass = isDark
    ? 'relative text-surface-dark-muted hover:text-surface-dark-foreground p-2 rounded-lg hover:bg-surface-dark-card transition-colors'
    : 'relative text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted';

  const dropdownClass = isDark
    ? 'absolute right-0 top-full mt-2 w-80 bg-surface-dark border border-surface-dark-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in'
    : 'absolute right-0 top-full mt-2 w-80 bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in';

  const headerClass = isDark
    ? 'flex items-center justify-between px-4 py-3 border-b border-surface-dark-border'
    : 'flex items-center justify-between px-4 py-3 border-b border-border';

  const titleClass = isDark ? 'text-sm font-semibold text-surface-dark-foreground' : 'text-sm font-semibold text-foreground';

  const itemClass = (unread: boolean) => isDark
    ? `w-full text-left px-4 py-3 border-b border-surface-dark-border last:border-0 transition-colors hover:bg-surface-dark-card ${unread ? 'bg-gold/5' : ''}`
    : `w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors hover:bg-muted/40 ${unread ? 'bg-gold/5' : ''}`;

  const itemTitleClass = (unread: boolean) => isDark
    ? `text-sm truncate ${unread ? 'font-semibold text-surface-dark-foreground' : 'font-medium text-surface-dark-muted'}`
    : `text-sm truncate ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`;

  const bodyClass = isDark ? 'text-xs text-surface-dark-muted mt-0.5 line-clamp-2' : 'text-xs text-muted-foreground mt-0.5 line-clamp-2';
  const timeClass = isDark ? 'text-[10px] text-surface-dark-muted/60 mt-1' : 'text-[10px] text-muted-foreground/60 mt-1';
  const emptyClass = isDark ? 'text-sm text-surface-dark-muted' : 'text-sm text-muted-foreground';
  const footerClass = isDark
    ? 'px-4 py-2.5 border-t border-surface-dark-border bg-surface-dark-card'
    : 'px-4 py-2.5 border-t border-border bg-muted/30';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button onClick={() => setOpen(prev => !prev)} className={btnClass}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={dropdownClass}>
          {/* Header */}
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

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className={`h-8 w-8 mx-auto mb-2 ${isDark ? 'text-surface-dark-muted/30' : 'text-muted-foreground/30'}`} />
                <p className={emptyClass}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead(n.id);
                    if (n.link) {
                      setOpen(false);
                      navigate(n.link);
                    }
                  }}
                  className={itemClass(!n.read_at)}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0">
                      {getTypeIcon(n.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={itemTitleClass(!n.read_at)}>{n.title}</p>
                        {!n.read_at && (
                          <span className="h-2 w-2 rounded-full bg-gold shrink-0" />
                        )}
                      </div>
                      {n.body && (
                        <p className={bodyClass}>{n.body}</p>
                      )}
                      <p className={timeClass}>
                        {formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className={footerClass}>
            <div className="flex items-center justify-between">
              {notifications.length > 0 ? (
                <p className={`text-[10px] ${isDark ? 'text-surface-dark-muted' : 'text-muted-foreground'}`}>
                  Showing last {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </p>
              ) : (
                <span />
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  navigate(notificationsPath);
                }}
                className={`text-xs font-medium transition-colors ${isDark ? 'text-gold hover:text-gold-light' : 'text-gold hover:text-gold-light'}`}
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
