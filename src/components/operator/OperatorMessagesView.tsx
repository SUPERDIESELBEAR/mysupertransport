import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { Send, MessageSquare, Search, User, Circle, CheckCheck, ArrowLeft } from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface StaffMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  sent_at: string;
  read_at: string | null;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load staff members who have existing message threads with this operator ─
  const loadStaff = useCallback(async () => {
    if (!user?.id) return;

    // Fetch all messages involving this operator
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_id, recipient_id')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

    // Collect unique "other" user IDs from existing threads
    const fromMsgs = msgs
      ? Array.from(new Set(msgs.map(m => m.sender_id === user.id ? m.recipient_id : m.sender_id)))
      : [];

    // If an initialUserId (e.g. dispatcher) was passed in, always include them
    const staffUserIds = initialUserId && !fromMsgs.includes(initialUserId)
      ? [...fromMsgs, initialUserId]
      : fromMsgs;

    if (staffUserIds.length === 0) { setLoadingThreads(false); return; }

    // Fetch their profiles (including avatar_url)
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
      .select('id, thread_id, sender_id, recipient_id, body, sent_at, read_at')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('sent_at', { ascending: false });

    if (!msgs) { setLoadingThreads(false); return; }

    const staffSet = new Set(staff.map(s => s.user_id));
    const grouped: Record<string, Message[]> = {};

    msgs.forEach(m => {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!staffSet.has(otherId)) return;
      if (!grouped[otherId]) grouped[otherId] = [];
      grouped[otherId].push(m as Message);
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
        lastMessage: latest?.body ?? 'No messages yet',
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

    // Auto-select: prefer initialUserId (dispatcher shortcut), then first thread.
    // On mobile (< md breakpoint) skip auto-select so the thread list stays visible.
    if (built.length > 0 && !selectedUserId) {
      const isMobile = window.innerWidth < 768;
      const target = initialUserId && built.find(t => t.staffUserId === initialUserId);
      if (!isMobile || initialUserId) {
        setSelectedUserId(target ? target.staffUserId : built[0].staffUserId);
      }
    }
  }, [user?.id, selectedUserId, initialUserId]);

  // ── Load messages for selected thread ─────────────────────────────────────
  const loadMessages = useCallback(async (otherUserId: string) => {
    if (!user?.id) return;
    setLoadingMessages(true);
    const { data } = await supabase
      .from('messages')
      .select('id, thread_id, sender_id, recipient_id, body, sent_at, read_at')
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`
      )
      .order('sent_at', { ascending: true });

    setMessages((data ?? []) as Message[]);
    setLoadingMessages(false);

    // Mark incoming as read
    const unreadIds = (data ?? [])
      .filter(m => m.sender_id === otherUserId && !m.read_at)
      .map(m => m.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
      setThreads(prev =>
        prev.map(t => t.staffUserId === otherUserId ? { ...t, unreadCount: 0 } : t)
      );
    }
  }, [user?.id]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!user?.id || !selectedUserId || !newMessage.trim()) return;
    setSending(true);
    // Sanitize before storing to prevent XSS
    const body = sanitizeText(newMessage.trim());
    if (!body) { setSending(false); return; }
    setNewMessage('');

    const { data: inserted } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, recipient_id: selectedUserId, body })
      .select()
      .single();

    if (inserted) {
      setMessages(prev => [...prev, inserted as Message]);
      setThreads(prev =>
        prev.map(t =>
          t.staffUserId === selectedUserId
            ? { ...t, lastMessage: body, lastAt: inserted.sent_at }
            : t
        )
      );
    }
    setSending(false);
  };

  // ── Realtime: new messages arriving ───────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`operator-messages-${user.id}`)
      // New incoming messages
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, async (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id === user.id) return;

        if (msg.sender_id !== selectedUserId) {
          setThreads(prev =>
            prev.map(t =>
              t.staffUserId === msg.sender_id
                ? { ...t, lastMessage: msg.body, lastAt: msg.sent_at, unreadCount: t.unreadCount + 1 }
                : t
            )
          );
          return;
        }

        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('id', msg.id);
        setThreads(prev =>
          prev.map(t => t.staffUserId === msg.sender_id ? { ...t, unreadCount: 0 } : t)
        );
      })
      // Read receipts: staff marked one of our messages as read
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as Message;
        if (updated.read_at) {
          setMessages(prev =>
            prev.map(m => m.id === updated.id ? { ...m, read_at: updated.read_at } : m)
          );
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selectedUserId]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => {
    if (staffList.length > 0) buildThreads(staffList);
    else if (!loadingThreads) setLoadingThreads(false);
  }, [staffList, buildThreads]);
  useEffect(() => {
    if (selectedUserId) loadMessages(selectedUserId);
  }, [selectedUserId, loadMessages]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredThreads = threads.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedThread = threads.find(t => t.staffUserId === selectedUserId);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  // ── No messages at all yet ────────────────────────────────────────────────
  const noMessagesYet = !loadingThreads && staffList.length === 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '480px' }}>
      {noMessagesYet ? (
        /* Empty state — no staff has messaged yet */
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
          {/* Mobile: visible only when no thread selected. md+: always visible. */}
          <div className={`${selectedUserId ? 'hidden md:flex' : 'flex'} w-full md:w-64 shrink-0 flex-col border-r border-border bg-muted/20`}>
            {/* Header */}
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

            {/* Thread list */}
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
                    onClick={() => setSelectedUserId(t.staffUserId)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 ${
                      selectedUserId === t.staffUserId ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <span className="text-primary text-xs font-bold">{initials(t.name)}</span>
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
          {/* Mobile: visible only when a thread is selected. md+: always visible. */}
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
              <>
                {/* Thread header — includes back button on mobile */}
                <div className="px-5 py-4 border-b border-border bg-background flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="md:hidden h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0 -ml-1"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">
                      {selectedThread ? initials(selectedThread.name) : '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{selectedThread?.name ?? 'Your Coordinator'}</p>
                    <p className="text-[11px] text-muted-foreground">Onboarding Coordinator</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex justify-center pt-10">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                      <Circle className="h-6 w-6 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground">No messages yet. Send a reply!</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((m, i) => {
                        const isMe = m.sender_id === user?.id;
                        const showDate =
                          i === 0 ||
                          new Date(messages[i - 1].sent_at).toDateString() !== new Date(m.sent_at).toDateString();

                        return (
                          <div key={m.id}>
                            {showDate && (
                              <div className="flex items-center gap-2 my-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-[10px] text-muted-foreground px-2">
                                  {isToday(new Date(m.sent_at))
                                    ? 'Today'
                                    : isYesterday(new Date(m.sent_at))
                                    ? 'Yesterday'
                                    : format(new Date(m.sent_at), 'MMMM d, yyyy')}
                                </span>
                                <div className="flex-1 h-px bg-border" />
                              </div>
                            )}
                            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                              <div className="max-w-[70%]">
                                <div
                                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                    isMe
                                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                                      : 'bg-muted text-foreground rounded-bl-sm'
                                  }`}
                                >
                                  {m.body}
                                </div>
                                <p className={`text-[10px] text-muted-foreground mt-1 flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  {format(new Date(m.sent_at), 'h:mm a')}
                                  {isMe && (
                                    m.read_at ? (
                                      <span className="flex items-center gap-0.5 text-primary/70 font-medium">
                                        <CheckCheck className="h-3 w-3" />
                                        <span>Seen</span>
                                      </span>
                                    ) : (
                                      <CheckCheck className="h-3 w-3 text-muted-foreground/40" />
                                    )
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={bottomRef} />
                    </>
                  )}
                </div>

                {/* Composer */}
                <div className="px-5 py-4 border-t border-border bg-background shrink-0">
                  <form
                    onSubmit={e => { e.preventDefault(); sendMessage(); }}
                    className="flex items-center gap-2"
                  >
                    <Input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder={`Reply to ${selectedThread?.name ?? 'your coordinator'}…`}
                      className="flex-1 h-10 text-sm"
                      disabled={sending}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newMessage.trim() || sending}
                      className="h-10 px-4 gap-2"
                    >
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">Send</span>
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
