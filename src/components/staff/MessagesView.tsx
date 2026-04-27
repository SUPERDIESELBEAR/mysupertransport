import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageSquare, Search, User } from 'lucide-react';
import { MessageThread } from '@/components/messaging/MessageThread';
import type { ChatMessage } from '@/components/messaging/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Operator {
  id: string;
  user_id: string;
  profiles: Profile | null;
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
  operatorUserId: string;
  operatorId: string;
  name: string;
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

interface MessagesViewProps {
  initialUserId?: string | null;
}

export default function MessagesView({ initialUserId }: MessagesViewProps = {}) {
  const { user } = useAuth();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load operators with profile names ─────────────────────────────────────
  const loadOperators = useCallback(async () => {
    // Step 1: fetch operators
    const { data: ops } = await supabase.from('operators').select('id, user_id');
    if (!ops || ops.length === 0) { setLoadingThreads(false); return; }

    // Step 2: fetch profiles for those user_ids
    const userIds = ops.map(o => o.user_id);
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds);

    // Merge
    const merged: Operator[] = ops.map(op => ({
      id: op.id,
      user_id: op.user_id,
      profiles: profs?.find(p => p.user_id === op.user_id) ?? null,
    }));
    setOperators(merged);
  }, []);

  // ── Build thread list from messages ───────────────────────────────────────
  const buildThreads = useCallback(async (ops: Operator[]) => {
    if (!user?.id || ops.length === 0) { setLoadingThreads(false); return; }

    // Fetch all messages where I'm sender or recipient
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, thread_id, sender_id, recipient_id, body, sent_at, read_at')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('sent_at', { ascending: false });

    if (!msgs) { setLoadingThreads(false); return; }

    // Group by the "other" user (operator user_id)
    const operatorUserIds = new Set(ops.map(o => o.user_id));
    const grouped: Record<string, Message[]> = {};

    msgs.forEach(m => {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!operatorUserIds.has(otherId)) return; // only show operator threads
      if (!grouped[otherId]) grouped[otherId] = [];
      grouped[otherId].push(m as Message);
    });

    // Build thread summaries — include all operators even without messages
    const built: Thread[] = ops.map(op => {
      const opMsgs = grouped[op.user_id] ?? [];
      const latest = opMsgs[0];
      const unread = opMsgs.filter(m => m.sender_id === op.user_id && !m.read_at).length;
      const name = op.profiles
        ? `${op.profiles.first_name ?? ''} ${op.profiles.last_name ?? ''}`.trim() || 'Unknown'
        : 'Unknown';

      return {
        operatorUserId: op.user_id,
        operatorId: op.id,
        name,
        lastMessage: latest?.body ?? 'No messages yet',
        lastAt: latest?.sent_at ?? op ? '' : '',
        unreadCount: unread,
      };
    });

    // Sort: unread first, then by latest message
    built.sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      if (!a.lastAt && !b.lastAt) return a.name.localeCompare(b.name);
      if (!a.lastAt) return 1;
      if (!b.lastAt) return -1;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    setThreads(built);
    setLoadingThreads(false);
  }, [user?.id]);

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

    // Mark incoming unread as read
    const unreadIds = (data ?? [])
      .filter(m => m.sender_id === otherUserId && !m.read_at)
      .map(m => m.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
      // Update thread counts locally
      setThreads(prev =>
        prev.map(t => t.operatorUserId === otherUserId ? { ...t, unreadCount: 0 } : t)
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
      .insert({
        sender_id: user.id,
        recipient_id: selectedUserId,
        body,
      })
      .select()
      .single();

    if (inserted) {
      setMessages(prev => [...prev, inserted as Message]);
      setThreads(prev =>
        prev.map(t =>
          t.operatorUserId === selectedUserId
            ? { ...t, lastMessage: body, lastAt: inserted.sent_at }
            : t
        )
      );

      // Fire in-app + email notification to operator (non-blocking)
      const senderProfile = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .single();
      const senderName = senderProfile.data
        ? `${senderProfile.data.first_name ?? ''} ${senderProfile.data.last_name ?? ''}`.trim() || 'Your coordinator'
        : 'Your coordinator';

      supabase.functions.invoke('send-notification', {
        body: {
          type: 'new_message',
          recipient_user_id: selectedUserId,
          sender_name: senderName,
          message_preview: body,
        },
      }).catch(err => console.warn('Message notification failed:', err));
    }
    setSending(false);
  };

  // ── Realtime subscription for open thread ─────────────────────────────────
  useEffect(() => {
    if (!user?.id || !selectedUserId) return;

    const channel = supabase
      .channel(`thread-${selectedUserId}`)
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
              t.operatorUserId === msg.sender_id
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
      })
      // Read receipts: operator marked one of our messages as read
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

  // ── Scroll to bottom when messages change ─────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Sync initialUserId prop → select that thread immediately ─────────────
  useEffect(() => {
    if (initialUserId) setSelectedUserId(initialUserId);
  }, [initialUserId]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  useEffect(() => {
    if (operators.length > 0) buildThreads(operators);
  }, [operators, buildThreads]);

  useEffect(() => {
    if (selectedUserId) loadMessages(selectedUserId);
  }, [selectedUserId, loadMessages]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredThreads = threads.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedThread = threads.find(t => t.operatorUserId === selectedUserId);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-0 rounded-xl border border-border overflow-hidden bg-background" style={{ minHeight: 0 }}>

      {/* ── Thread list sidebar ────────────────────────────────────────────── */}
      {/* On mobile: hide when a conversation is selected; always show on md+ */}
      <div className={`${selectedUserId ? 'hidden md:flex' : 'flex'} w-full md:w-72 shrink-0 flex-col border-r border-border bg-muted/20`}>
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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search operators…"
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
              <p className="text-xs text-muted-foreground">
                {search ? 'No operators found' : 'No operators yet'}
              </p>
            </div>
          ) : (
            filteredThreads.map(t => (
              <button
                key={t.operatorUserId}
                onClick={() => setSelectedUserId(t.operatorUserId)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 ${
                  selectedUserId === t.operatorUserId ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
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
                  {/* Text */}
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

      {/* ── Message thread panel ───────────────────────────────────────────── */}
      {/* On mobile: only visible when a thread is selected */}
      <div className={`${selectedUserId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {!selectedUserId ? (
          /* Empty state — only shown on md+ when nothing selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-medium text-foreground/80 text-sm">No conversation selected</p>
              <p className="text-xs text-muted-foreground mt-1">Choose an operator from the list to start messaging</p>
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
                <p className="font-semibold text-sm text-foreground">{selectedThread?.name ?? 'Operator'}</p>
                <p className="text-[11px] text-muted-foreground">Owner-Operator</p>
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
                  <p className="text-xs text-muted-foreground">
                    No messages yet. Send the first one!
                  </p>
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
                          <div className={`max-w-[70%] group`}>
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
                  placeholder={`Message ${selectedThread?.name ?? 'operator'}…`}
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
  );
}
