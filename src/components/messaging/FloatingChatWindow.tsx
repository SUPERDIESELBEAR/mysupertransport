import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageThread } from './MessageThread';
import type { ChatMessage } from './types';
import { initials } from '@/lib/initials';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageSquare, X, Search, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';

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

interface WindowState {
  open: boolean;
  railCollapsed: boolean;
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
    x: Math.max(16, window.innerWidth - DEFAULT_WIDTH - 24),
    y: Math.max(16, window.innerHeight - DEFAULT_HEIGHT - JUMP_BUTTON_CLEARANCE),
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    selectedUserId: null,
  };
}

function loadState(): WindowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    const def = getDefaultState();
    return {
      open: parsed.open ?? def.open,
      railCollapsed: parsed.railCollapsed ?? def.railCollapsed,
      x: Math.max(8, Math.min(parsed.x ?? def.x, window.innerWidth - 200)),
      y: Math.max(8, Math.min(parsed.y ?? def.y, window.innerHeight - 120)),
      width: Math.max(MIN_WIDTH, Math.min(parsed.width ?? def.width, window.innerWidth - 32)),
      height: Math.max(MIN_HEIGHT, Math.min(parsed.height ?? def.height, window.innerHeight - 32)),
      selectedUserId: parsed.selectedUserId ?? null,
    };
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

  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; initialW: number; initialH: number } | null>(null);

  const { open, minimized, x, y, width, height, selectedUserId } = state;

  // Persist state changes
  useEffect(() => { saveState(state); }, [state]);

  // Clamp to viewport on resize
  useEffect(() => {
    const handleResize = () => {
      setState(prev => ({
        ...prev,
        x: Math.max(8, Math.min(prev.x, window.innerWidth - 200)),
        y: Math.max(8, Math.min(prev.y, window.innerHeight - 120)),
        width: Math.max(280, Math.min(prev.width, window.innerWidth - 32)),
        height: Math.max(320, Math.min(prev.height, window.innerHeight - 32)),
      }));
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
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, selectedUserId]);

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
    if (minimized) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-no-drag]')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: x, initialY: y };
    windowRef.current?.setPointerCapture(e.pointerId);
  }, [minimized, x, y]);

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
      width: Math.max(280, Math.min(resizeRef.current!.initialW + dx, window.innerWidth - prev.x - 16)),
      height: Math.max(320, Math.min(resizeRef.current!.initialH + dy, window.innerHeight - prev.y - 16)),
    }));
  }, []);

  const onResizeEnd = useCallback((e: React.PointerEvent) => {
    resizeRef.current = null;
    windowRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredThreads = threads.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedThread = threads.find(t => t.operatorUserId === selectedUserId);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating bubble — hidden on mobile where bottom nav already has Messages */}
      {!open && (
        <button
          onClick={() => setState(prev => ({ ...prev, open: true, minimized: false }))}
          className="hidden lg:flex fixed z-50 bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
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
          className={`hidden lg:flex fixed z-50 flex-col rounded-xl shadow-2xl border border-border bg-background overflow-hidden ${minimized ? 'cursor-default' : ''}`}
          style={{ left: x, top: y, width: minimized ? 280 : width, height: minimized ? 48 : height }}
          onPointerDown={onDragStart}
          onPointerMove={(e) => { onDragMove(e); onResizeMove(e); }}
          onPointerUp={(e) => { onDragEnd(e); onResizeEnd(e); }}
        >
          {/* Header */}
          <div
            className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-border bg-muted/40 select-none"
            data-no-drag={minimized ? undefined : true}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate">
                {minimized ? 'Messages' : (selectedThread?.name ?? 'Messages')}
              </span>
              {!minimized && totalUnread > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5" data-no-drag>
              <button
                onClick={() => setState(prev => ({ ...prev, minimized: !prev.minimized }))}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                aria-label={minimized ? 'Expand' : 'Minimize'}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, open: false, minimized: false }))}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          {!minimized && (
            <div className="flex flex-1 min-h-0">
              {/* Thread list */}
              <div className={`${selectedUserId ? 'hidden md:flex' : 'flex'} w-full md:w-44 shrink-0 flex-col border-r border-border bg-muted/20`}>
                <div className="px-3 py-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Search…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-6 h-7 text-[11px]"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loadingThreads ? (
                    <div className="flex justify-center py-6">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : filteredThreads.length === 0 ? (
                    <div className="py-6 text-center px-3">
                      <User className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1.5" />
                      <p className="text-[11px] text-muted-foreground">
                        {search ? 'No operators found' : 'No messages yet'}
                      </p>
                    </div>
                  ) : (
                    filteredThreads.map(t => (
                      <button
                        key={t.operatorUserId}
                        onClick={() => setState(prev => ({ ...prev, selectedUserId: t.operatorUserId }))}
                        className={`w-full text-left px-3 py-2 border-b border-border/50 transition-colors hover:bg-muted/50 ${
                          selectedUserId === t.operatorUserId ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                              {t.avatarUrl ? (
                                <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-primary text-[10px] font-bold">{initials(t.name)}</span>
                              )}
                            </div>
                            {t.unreadCount > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-destructive text-white text-[8px] font-bold flex items-center justify-center">
                                {t.unreadCount > 9 ? '9+' : t.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] truncate ${t.unreadCount > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                              {t.name}
                            </p>
                            <p className={`text-[10px] truncate ${t.unreadCount > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
                              {t.lastMessage}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Thread panel */}
              <div className={`${selectedUserId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
                {!selectedUserId ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2">
                    <MessageSquare className="h-5 w-5 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Select an operator to chat</p>
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
                    onBack={() => setState(prev => ({ ...prev, selectedUserId: null }))}
                    placeholder={`Message ${selectedThread?.name ?? 'operator'}…`}
                    onMessagesChanged={handleMessagesChanged}
                  />
                )}
              </div>
            </div>
          )}

          {/* Resize handle */}
          {!minimized && (
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
              onPointerDown={onResizeStart}
              data-no-drag
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-muted-foreground/40">
                <path d="M10 10 L0 10 L10 0 Z" fill="currentColor" />
              </svg>
            </div>
          )}
        </div>
      )}
    </>
  );
}
