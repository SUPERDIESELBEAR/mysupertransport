import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
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
}

export default function NotificationBell({ variant = 'light' }: NotificationBellProps) {
  const { session } = useAuth();
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
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchNotifications())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

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

  const typeIcon: Record<string, string> = {
    onboarding_milestone: '🎯',
    document_uploaded: '📎',
    new_application: '📋',
    application_approved: '✅',
    application_denied: '❌',
    dispatch_status_change: '🚛',
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
                  onClick={() => { if (!n.read_at) markRead(n.id); }}
                  className={itemClass(!n.read_at)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-base mt-0.5 shrink-0">
                      {typeIcon[n.type] ?? '🔔'}
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
          {notifications.length > 0 && (
            <div className={footerClass}>
              <p className={`text-[10px] text-center ${isDark ? 'text-surface-dark-muted' : 'text-muted-foreground'}`}>
                Showing last {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
