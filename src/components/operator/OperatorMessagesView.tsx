import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageSquare, Search, User } from 'lucide-react';
import { MessageThread } from '@/components/messaging/MessageThread';
import type { ChatMessage } from '@/components/messaging/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Thread {
  staffUserId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function previewBody(m: { body: string; deleted_at: string | null; attachment_name: string | null } | null): string {
  if (!m) return 'No messages yet';
  if (m.deleted_at) return '(deleted)';
  if (m.body) return m.body;
  if (m.attachment_name) return `📎 ${m.attachment_name}`;
  return 'No messages yet';
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OperatorMessagesViewProps {
  initialUserId?: string;
  onThreadSelected?: () => void;
}

export default function OperatorMessagesView({ initialUserId, onThreadSelected }: OperatorMessagesViewProps = {}) {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [search, setSearch] = useState('');

  // ── Load staff who have existing threads with this operator ──────────────
  const loadStaff = useCallback(async () => {
    if (!user?.id) return;

    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_id, recipient_id')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

    const fromMsgs = msgs
      ? Array.from(new Set(msgs.map(m => m.sender_id === user.id ? m.recipient_id : m.sender_id)))
      : [];

    const staffUserIds = initialUserId && !fromMsgs.includes(initialUserId)
      ? [...fromMsgs, initialUserId]
      : fromMsgs;

    if (staffUserIds.length === 0) { setLoadingThreads(false); return; }

    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, avatar_url')
      .in('user_id', staffUserIds);

    setStaffList(
      staffUserIds.map(uid => {
        const p = profs?.find(x => x.user_id === uid);
        return { user_id: uid, first_name: p?.first_name ?? null, last_name: p?.last_name ?? null, avatar_url: p?.avatar_url ?? null };
      })
    );
  }, [user?.id, initialUserId]);

  // ── Build thread summaries ─────────────────────────────────────────────────
  const buildThreads = useCallback(async (staff: StaffMember[]) => {
    if (!user?.id || staff.length === 0) { setLoadingThreads(false); return; }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, body, sent_at, read_at, deleted_at, attachment_name')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('sent_at', { ascending: false });

    if (!msgs) { setLoadingThreads(false); return; }

    const staffSet = new Set(staff.map(s => s.user_id));
    const grouped: Record<string, typeof msgs> = {};

    msgs.forEach(m => {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!staffSet.has(otherId)) return;
      if (!grouped[otherId]) grouped[otherId] = [];
      grouped[otherId].push(m);
    });

    const built: Thread[] = staff.map(s => {
      const sMsgs = grouped[s.user_id] ?? [];
      const latest = sMsgs[0];
      const unread = sMsgs.filter(m => m.sender_id === s.user_id && !m.read_at).length;
      const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Staff Member';

      return {
        staffUserId: s.user_id,
        name,
        avatarUrl: s.avatar_url ?? null,
        lastMessage: previewBody(latest ?? null),
        lastAt: latest?.sent_at ?? '',
        unreadCount: unread,
      };
    });

    built.sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      if (!a.lastAt && !b.lastAt) return a.name.localeCompare(b.name);
      if (!a.lastAt) return 1;
      if (!b.lastAt) return -1;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    setThreads(built);
    setLoadingThreads(false);

    // Auto-select: prefer initialUserId, then first thread (only on desktop)
    if (built.length > 0 && !selectedUserId) {
      const isMobile = window.innerWidth < 768;
      const target = initialUserId && built.find(t => t.staffUserId === initialUserId);
      if (!isMobile || initialUserId) {
        setSelectedUserId(target ? target.staffUserId : built[0].staffUserId);
      }
    }
  }, [user?.id, selectedUserId, initialUserId]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => {
    if (staffList.length > 0) buildThreads(staffList);
    else if (!loadingThreads) setLoadingThreads(false);
  }, [staffList, buildThreads]);

  // ── Realtime: bump thread list for inbound messages in non-active threads
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`operator-thread-list-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_id === selectedUserId) return;
        setThreads(prev => prev.map(t =>
          t.staffUserId === msg.sender_id
            ? { ...t, lastMessage: previewBody(msg), lastAt: msg.sent_at, unreadCount: t.unreadCount + 1 }
            : t
        ));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, selectedUserId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredThreads = threads.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedThread = threads.find(t => t.staffUserId === selectedUserId);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);
  const noMessagesYet = !loadingThreads && staffList.length === 0;

  const handleMessagesChanged = useCallback((msgs: ChatMessage[]) => {
    if (!selectedUserId) return;
    const latest = msgs[msgs.length - 1];
    if (!latest) return;
    setThreads(prev => prev.map(t =>
      t.staffUserId === selectedUserId
        ? { ...t, lastMessage: previewBody(latest), lastAt: latest.sent_at, unreadCount: 0 }
        : t
    ));
  }, [selectedUserId]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '480px' }}>
      {noMessagesYet ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <MessageSquare className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-base">No messages yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Your onboarding coordinator will reach out here soon. You'll be notified when you have new messages.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* ── Thread list sidebar ─────────────────────────────────────────── */}
          <div className={`${selectedUserId ? 'hidden md:flex' : 'flex'} w-full md:w-64 shrink-0 flex-col border-r border-border bg-muted/20`}>
            <div className="px-4 py-4 border-b border-border">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-foreground" />
                <h2 className="font-semibold text-sm text-foreground">Messages</h2>
                {totalUnread > 0 && (
                  <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingThreads ? (
                <div className="flex justify-center py-10">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <User className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No conversations found</p>
                </div>
              ) : (
                filteredThreads.map(t => (
                  <button
                    key={t.staffUserId}
                    onClick={() => { setSelectedUserId(t.staffUserId); onThreadSelected?.(); }}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 ${
                      selectedUserId === t.staffUserId ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                          {t.avatarUrl ? (
                            <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-primary text-xs font-bold">{initials(t.name)}</span>
                          )}
                        </div>
                        {t.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                            {t.unreadCount > 9 ? '9+' : t.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs truncate ${t.unreadCount > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                            {t.name}
                          </p>
                          {t.lastAt && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatMessageTime(t.lastAt)}
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] truncate mt-0.5 ${t.unreadCount > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
                          {t.lastMessage}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Message thread panel ────────────────────────────────────────── */}
          <div className={`${selectedUserId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
            {!selectedUserId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="font-medium text-foreground/80 text-sm">No conversation selected</p>
                  <p className="text-xs text-muted-foreground mt-1">Choose a conversation from the list</p>
                </div>
              </div>
            ) : (
              <MessageThread
                key={selectedUserId}
                myUserId={user?.id ?? null}
                otherUserId={selectedUserId}
                otherName={selectedThread?.name ?? 'Your Coordinator'}
                otherSubtitle="Onboarding Coordinator"
                otherAvatarUrl={selectedThread?.avatarUrl ?? null}
                isStaff={false}
                onBack={() => setSelectedUserId(null)}
                placeholder={`Reply to ${selectedThread?.name ?? 'your coordinator'}…`}
                onMessagesChanged={handleMessagesChanged}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
