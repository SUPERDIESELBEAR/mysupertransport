import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageThread } from './MessageThread';
import type { ChatMessage } from './types';
import { initials } from '@/lib/initials';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageSquare, X, Search, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { playTruckDownChime } from '@/lib/chime';
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications';
import { useNavigate } from 'react-router-dom';
import { onOpenLoadChat } from '@/lib/loadChat';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Operator {
  id: string;
  user_id: string;
  profiles: Profile | null;
}

interface Thread {
  operatorUserId: string;
  operatorId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  oldestUnreadAt: string | null;
}

type RailFilter = 'unread' | 'chats' | 'all';

interface WindowState {
  open: boolean;
  railCollapsed: boolean;
  railFilter: RailFilter;
  x: number;
  y: number;
  width: number;
  height: number;
  selectedUserId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'superdrive_floating_chat';

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 600;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 380;
/** Vertical space reserved at the bottom-right for the Jump-to-bottom pill. */
const JUMP_BUTTON_CLEARANCE = 80;

function getDefaultState(): WindowState {
  return {
    open: false,
    railCollapsed: false,
    railFilter: 'chats',
    x: Math.max(16, window.innerWidth - DEFAULT_WIDTH - 24),
    y: Math.max(16, window.innerHeight - DEFAULT_HEIGHT - JUMP_BUTTON_CLEARANCE),
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    selectedUserId: null,
  };
}

/**
 * Force the whole window box inside the current viewport: shrink first
 * (so a stale oversized size can't push it off-screen), then clamp x/y so
 * the right/bottom edges stay visible with an 8px margin.
 */
function clampToViewport<T extends { x: number; y: number; width: number; height: number }>(s: T): T {
  const margin = 8;
  const maxW = Math.max(320, window.innerWidth - margin * 2);
  const maxH = Math.max(280, window.innerHeight - margin * 2);
  const width = Math.min(Math.max(Math.min(MIN_WIDTH, maxW), s.width), maxW);
  const height = Math.min(Math.max(Math.min(MIN_HEIGHT, maxH), s.height), maxH);
  const x = Math.min(Math.max(margin, s.x), Math.max(margin, window.innerWidth - width - margin));
  const y = Math.min(Math.max(margin, s.y), Math.max(margin, window.innerHeight - height - margin));
  return { ...s, x, y, width, height };
}

function loadState(): WindowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    const def = getDefaultState();
    return clampToViewport({
      open: parsed.open ?? def.open,
      railCollapsed: parsed.railCollapsed ?? def.railCollapsed,
      railFilter: parsed.railFilter ?? def.railFilter,
      x: parsed.x ?? def.x,
      y: parsed.y ?? def.y,
      width: parsed.width ?? def.width,
      height: parsed.height ?? def.height,
      selectedUserId: parsed.selectedUserId ?? null,
    });
  } catch {
    return getDefaultState();
  }
}

function saveState(state: WindowState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore private-mode storage errors
  }
}

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function previewBody(m: { body: string; deleted_at: string | null; attachment_name: string | null } | null): string {
  if (!m) return 'No messages yet';
  if (m.deleted_at) return '(deleted)';
  if (m.body) return m.body;
  if (m.attachment_name) return `📎 ${m.attachment_name}`;
  return 'No messages yet';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FloatingChatWindow() {
  const { user } = useAuth();
  const [state, setState] = useState<WindowState>(() => loadState());
  const [operators, setOperators] = useState<Operator[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [search, setSearch] = useState('');
  /** Load the open conversation is focused on. Not persisted — a load link is
   *  per visit, and the conversation itself is never split by load. */
  const [linkedLoadId, setLinkedLoadId] = useState<string | null>(null);
  const navigate = useNavigate();

  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; initialW: number; initialH: number } | null>(null);

  const { open, railCollapsed, railFilter, x, y, width, height, selectedUserId } = state;
  const { fireNotification } = useDesktopNotifications();
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const selectedRef = useRef(selectedUserId);
  useEffect(() => { selectedRef.current = selectedUserId; }, [selectedUserId]);

  // ── Open on a driver with a load linked (from Load Detail) ────────────────
  useEffect(() => onOpenLoadChat(({ driverUserId, loadId }) => {
    setLinkedLoadId(loadId);
    setState(prev => clampToViewport({ ...prev, open: true, selectedUserId: driverUserId }));
  }), []);

  const openLoadRecord = useCallback((loadId: string) => {
    navigate(`/dispatch/loads/${loadId}`);
  }, [navigate]);

  // Persist state changes
  useEffect(() => { saveState(state); }, [state]);

  // Clamp to viewport on resize
  useEffect(() => {
    const handleResize = () => {
      setState(prev => clampToViewport(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Load operators + profiles ─────────────────────────────────────────────
  const loadOperators = useCallback(async () => {
    const { data: ops } = await supabase.from('operators').select('id, user_id');
    if (!ops || ops.length === 0) { setLoadingThreads(false); return; }

    const userIds = ops.map(o => o.user_id);
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, avatar_url')
      .in('user_id', userIds);

    const merged: Operator[] = ops.map(op => ({
      id: op.id,
      user_id: op.user_id,
      profiles: profs?.find(p => p.user_id === op.user_id) ?? null,
    }));
    setOperators(merged);
  }, []);

  // ── Build threads from messages ────────────────────────────────────────────
  const buildThreads = useCallback(async (ops: Operator[]) => {
    if (!user?.id || ops.length === 0) { setLoadingThreads(false); return; }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, body, sent_at, read_at, deleted_at, attachment_name')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('sent_at', { ascending: false });

    if (!msgs) { setLoadingThreads(false); return; }

    const operatorUserIds = new Set(ops.map(o => o.user_id));
    const grouped: Record<string, typeof msgs> = {};

    msgs.forEach(m => {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!operatorUserIds.has(otherId)) return;
      if (!grouped[otherId]) grouped[otherId] = [];
      grouped[otherId].push(m);
    });

    const built: Thread[] = ops.map(op => {
      const opMsgs = grouped[op.user_id] ?? [];
      const latest = opMsgs[0];
      const unreadInbound = opMsgs.filter(m => m.sender_id === op.user_id && !m.read_at);
      const unread = unreadInbound.length;
      const oldestUnreadAt = unread
        ? unreadInbound.reduce((min, m) => (min && min < m.sent_at ? min : m.sent_at), '' as string) || null
        : null;
      const name = op.profiles
        ? `${op.profiles.first_name ?? ''} ${op.profiles.last_name ?? ''}`.trim() || 'Unknown'
        : 'Unknown';

      return {
        operatorUserId: op.user_id,
        operatorId: op.id,
        name,
        avatarUrl: op.profiles?.avatar_url ?? null,
        lastMessage: previewBody(latest ?? null),
        lastAt: latest?.sent_at ?? '',
        unreadCount: unread,
        oldestUnreadAt,
      };
    });

    // Sort: unanswered first (oldest unanswered at top), then by recency
    built.sort((a, b) => {
      if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1;
      if (a.unreadCount > 0 && b.unreadCount > 0) {
        return new Date(a.oldestUnreadAt!).getTime() - new Date(b.oldestUnreadAt!).getTime();
      }
      if (!a.lastAt && !b.lastAt) return a.name.localeCompare(b.name);
      if (!a.lastAt) return 1;
      if (!b.lastAt) return -1;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    setThreads(built);
    setLoadingThreads(false);
  }, [user?.id]);

  useEffect(() => { loadOperators(); }, [loadOperators]);
  useEffect(() => {
    if (operators.length > 0) buildThreads(operators);
  }, [operators, buildThreads]);

  const threadsRef = useRef<Thread[]>([]);
  useEffect(() => { threadsRef.current = threads; }, [threads]);

  // ── Realtime: bump thread list on inbound messages ──────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`floating-thread-list-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_id === selectedUserId) return; // active thread handles it
        setThreads(prev => prev.map(t =>
          t.operatorUserId === msg.sender_id
            ? { ...t, lastMessage: previewBody(msg), lastAt: msg.sent_at, unreadCount: t.unreadCount + 1 }
            : t
        ));

        // Alert the recipient: chime + toast + (background) desktop notification
        const senderName =
          threadsRef.current.find(t => t.operatorUserId === msg.sender_id)?.name ?? 'New message';
        const preview = previewBody(msg);
        let soundOn = true;
        try { soundOn = localStorage.getItem('superdrive_messages_sound_enabled') !== 'false'; } catch { /* ignore */ }
        if (soundOn) { try { playTruckDownChime(); } catch { /* audio blocked */ } }
        toast(senderName, {
          description: preview,
          action: {
            label: 'Open',
            onClick: () => setState(prev => clampToViewport({
              ...prev, open: true, selectedUserId: msg.sender_id,
            })),
          },
        });
        fireNotification({ title: senderName, body: preview, type: 'new_message' });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, selectedUserId, fireNotification]);

  // ── Update preview when active thread messages change ──────────────────────
  const handleMessagesChanged = useCallback((msgs: ChatMessage[]) => {
    if (!selectedUserId) return;
    const latest = msgs[msgs.length - 1];
    if (!latest) return;
    setThreads(prev => prev.map(t =>
      t.operatorUserId === selectedUserId
        ? { ...t, lastMessage: previewBody(latest), lastAt: latest.sent_at, unreadCount: 0 }
        : t
    ));
  }, [selectedUserId]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-no-drag]')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: x, initialY: y };
    windowRef.current?.setPointerCapture(e.pointerId);
  }, [x, y]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setState(prev => ({
      ...prev,
      x: Math.max(8, Math.min(prev.x + dx, window.innerWidth - 160)),
      y: Math.max(8, Math.min(prev.y + dy, window.innerHeight - 100)),
    }));
    dragRef.current = { ...dragRef.current, startX: e.clientX, startY: e.clientY };
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setState(prev => clampToViewport(prev));
    windowRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  // ── Resize handlers ─────────────────────────────────────────────────────────
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, initialW: width, initialH: height };
    windowRef.current?.setPointerCapture(e.pointerId);
  }, [width, height]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    setState(prev => ({
      ...prev,
      width: Math.max(MIN_WIDTH, Math.min(resizeRef.current!.initialW + dx, window.innerWidth - prev.x - 16)),
      height: Math.max(MIN_HEIGHT, Math.min(resizeRef.current!.initialH + dy, window.innerHeight - prev.y - 16)),
    }));
  }, []);

  const onResizeEnd = useCallback((e: React.PointerEvent) => {
    resizeRef.current = null;
    setState(prev => clampToViewport(prev));
    windowRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const matchesFilter = (t: Thread) => {
    if (railFilter === 'unread') return t.unreadCount > 0;
    if (railFilter === 'chats') return !!t.lastAt;
    return true;
  };
  const filteredThreads = threads.filter(t =>
    matchesFilter(t) && t.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedThread = threads.find(t => t.operatorUserId === selectedUserId);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  // ── Unread count in the browser tab title ─────────────────────────────────
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = totalUnread > 0 ? `(${totalUnread > 9 ? '9+' : totalUnread}) ${original}` : original;
    return () => { document.title = original; };
  }, [totalUnread]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating bubble — hidden on mobile where bottom nav already has Messages */}
      {!open && (
        <button
          onClick={() => setState(prev => clampToViewport({ ...prev, open: true }))}
          className="hidden lg:flex fixed z-50 bottom-24 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
          aria-label="Open chat"
        >
          <MessageSquare className="h-5 w-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          ref={windowRef}
          className="hidden lg:flex fixed z-50 flex-col rounded-xl shadow-2xl border border-border bg-background overflow-hidden"
          style={{ left: x, top: y, width, height }}
          onPointerDown={onDragStart}
          onPointerMove={(e) => { onDragMove(e); onResizeMove(e); }}
          onPointerUp={(e) => { onDragEnd(e); onResizeEnd(e); }}
        >
          {/* Header */}
          <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-border bg-muted/40 select-none cursor-move">
            <div className="flex items-center gap-2 min-w-0">
              {selectedThread ? (
                <div className="h-7 w-7 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                  {selectedThread.avatarUrl ? (
                    <img src={selectedThread.avatarUrl} alt={selectedThread.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-primary text-[10px] font-bold">{initials(selectedThread.name)}</span>
                  )}
                </div>
              ) : (
                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground truncate">
                {selectedThread?.name ?? 'Messages'}
              </span>
              {totalUnread > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5" data-no-drag>
              <button
                onClick={() => setState(prev => ({ ...prev, open: false }))}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0" data-no-drag>
            {/* Contacts rail */}
            <div className={`${railCollapsed ? 'w-14' : 'w-56'} shrink-0 flex flex-col border-r border-border bg-muted/20 transition-[width] duration-150`}>
              <div className={`${railCollapsed ? 'px-1.5' : 'px-2.5'} py-2 border-b border-border flex items-center gap-1.5`}>
                {!railCollapsed && (
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search contacts…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                )}
                <button
                  onClick={() => setState(prev => ({ ...prev, railCollapsed: !prev.railCollapsed }))}
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                  aria-label={railCollapsed ? 'Show contacts' : 'Collapse contacts'}
                  title={railCollapsed ? 'Show contacts' : 'Collapse contacts'}
                >
                  {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>
              {!railCollapsed && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border">
                  {(['unread', 'chats', 'all'] as RailFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setState(prev => ({ ...prev, railFilter: f }))}
                      className={`flex-1 h-6 rounded text-[11px] font-medium capitalize transition-colors ${
                        railFilter === f
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {f === 'unread' && totalUnread > 0 ? `Unread ${totalUnread > 9 ? '9+' : totalUnread}` : f}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {loadingThreads ? (
                  <div className="flex justify-center py-6">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <div className="py-6 text-center px-3">
                    <User className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1.5" />
                    {!railCollapsed && (
                      <p className="text-xs text-muted-foreground">
                        {search
                          ? 'No operators found'
                          : railFilter === 'unread'
                            ? 'No unread messages'
                            : railFilter === 'chats'
                              ? 'No conversations yet — switch to All to start one'
                              : 'No operators yet'}
                      </p>
                    )}
                  </div>
                ) : (
                  filteredThreads.map(t => (
                    <button
                      key={t.operatorUserId}
                      onClick={() => {
                        if (t.operatorUserId !== selectedUserId) setLinkedLoadId(null);
                        setState(prev => ({ ...prev, selectedUserId: t.operatorUserId }));
                      }}
                      title={t.name}
                      className={`w-full text-left ${railCollapsed ? 'px-2 py-2 flex justify-center' : 'px-2.5 py-2'} border-b border-border/50 transition-colors hover:bg-muted/50 ${
                        selectedUserId === t.operatorUserId ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                            {t.avatarUrl ? (
                              <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-primary text-[11px] font-bold">{initials(t.name)}</span>
                            )}
                          </div>
                          {t.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                              {t.unreadCount > 9 ? '9+' : t.unreadCount}
                            </span>
                          )}
                        </div>
                        {!railCollapsed && (
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs truncate ${t.unreadCount > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                              {t.name}
                            </p>
                            <p className={`text-[11px] truncate ${t.unreadCount > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
                              {t.lastMessage}
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Conversation panel */}
            <div className="flex flex-1 flex-col min-w-0">
              {!selectedUserId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Select an operator to chat</p>
                </div>
              ) : (
                <MessageThread
                  key={selectedUserId}
                  myUserId={user?.id ?? null}
                  otherUserId={selectedUserId}
                  otherName={selectedThread?.name ?? 'Operator'}
                  otherSubtitle="Owner-Operator"
                  otherAvatarUrl={selectedThread?.avatarUrl ?? null}
                  isStaff={true}
                  placeholder={`Message ${selectedThread?.name ?? 'operator'}…`}
                  loadId={linkedLoadId}
                  onClearLoadLink={() => setLinkedLoadId(null)}
                  onOpenLoad={openLoadRecord}
                  onMessagesChanged={handleMessagesChanged}
                />
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
            onPointerDown={onResizeStart}
            data-no-drag
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-muted-foreground/40">
              <path d="M10 10 L0 10 L10 0 Z" fill="currentColor" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
}
