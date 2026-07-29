import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageSquare, Search, User } from 'lucide-react';
import { MessageThread } from '@/components/messaging/MessageThread';
import type { ChatMessage } from '@/components/messaging/types';
import StaffAvailabilityCard from './StaffAvailabilityCard';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Settings2, Users, Plus } from 'lucide-react';
import { NewGroupModal } from '@/components/messaging/NewGroupModal';
import { ManageGroupModal } from '@/components/messaging/ManageGroupModal';

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

interface Thread {
  operatorUserId: string;
  operatorId: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  oldestUnreadAt: string | null;
}

interface GroupThreadRow {
  thread_id: string;
  title: string;
  created_by: string | null;
  last_message_at: string | null;
  last_message: string | null;
  last_message_sender_id: string | null;
  my_role_in_thread: string;
  participant_count: number;
  unread_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

import { initials } from '@/lib/initials';

function previewBody(m: { body: string; deleted_at: string | null; attachment_name: string | null } | null): string {
  if (!m) return 'No messages yet';
  if (m.deleted_at) return '(deleted)';
  if (m.body) return m.body;
  if (m.attachment_name) return `📎 ${m.attachment_name}`;
  return 'No messages yet';
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface MessagesViewProps {
  initialUserId?: string | null;
}

export default function MessagesView({ initialUserId }: MessagesViewProps = {}) {
  const { user } = useAuth();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [groupThreads, setGroupThreads] = useState<GroupThreadRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<Record<string, { name: string; id: string }[]>>({});
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [search, setSearch] = useState('');

  // ── Load operators with profile names ─────────────────────────────────────
  const loadOperators = useCallback(async () => {
    const { data: ops } = await supabase.from('operators').select('id, user_id');
    if (!ops || ops.length === 0) { setLoadingThreads(false); return; }

    const userIds = ops.map(o => o.user_id);
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds);

    const merged: Operator[] = ops.map(op => ({
      id: op.id,
      user_id: op.user_id,
      profiles: profs?.find(p => p.user_id === op.user_id) ?? null,
    }));
    setOperators(merged);
  }, []);

  // ── Load group threads I'm a participant of ─────────────────────────
  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.rpc('list_my_group_threads');
    setGroupThreads((data ?? []) as GroupThreadRow[]);
    // fetch participants for each (for header display)
    const map: Record<string, { name: string; id: string }[]> = {};
    for (const g of (data ?? []) as GroupThreadRow[]) {
      const { data: parts } = await supabase.rpc('get_thread_participants', { _thread_id: g.thread_id });
      map[g.thread_id] = (parts ?? []).map((p: { user_id: string; first_name: string | null; last_name: string | null }) => ({
        id: p.user_id,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'User',
      }));
    }
    setGroupParticipants(map);
  }, [user?.id]);

  // ── Build thread list from messages ───────────────────────────────────────
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
      // Oldest unanswered inbound = earliest sent_at among unread inbound
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
        lastMessage: previewBody(latest ?? null),
        lastAt: latest?.sent_at ?? '',
        unreadCount: unread,
        oldestUnreadAt,
      };
    });

    // Sort: unanswered threads first, oldest unanswered at top;
    // then answered threads by most-recent activity.
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

  // ── Sync initialUserId prop → select that thread immediately ─────────────
  useEffect(() => {
    if (initialUserId) setSelectedUserId(initialUserId);
  }, [initialUserId]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { loadOperators(); }, [loadOperators]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (operators.length > 0) buildThreads(operators);
  }, [operators, buildThreads]);

  // ── Realtime: bump thread list when a new inbound message arrives in
  //    a thread that's NOT currently open
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`staff-thread-list-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_id === selectedUserId) return; // open thread updates itself
        setThreads(prev => prev.map(t =>
          t.operatorUserId === msg.sender_id
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
  const filteredGroups = groupThreads.filter(g =>
    (g.title ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const selectedThread = threads.find(t => t.operatorUserId === selectedUserId);
  const selectedGroup = groupThreads.find(g => g.thread_id === selectedGroupId);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0)
    + groupThreads.reduce((s, g) => s + (g.unread_count ?? 0), 0);

  const selectDM = (uid: string) => { setSelectedGroupId(null); setSelectedUserId(uid); };
  const selectGroup = (tid: string) => { setSelectedUserId(null); setSelectedGroupId(tid); };
  const backToList = () => { setSelectedUserId(null); setSelectedGroupId(null); };

  // ── Update thread's last-message preview as messages flow in
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

  // Notification delivery (in-app + throttled email) is handled by the
  // `notify-new-message` edge function invoked inside `useMessageThread.sendMessage`.
  // Do NOT invoke `send-notification` here — that produced a second duplicate
  // in-app notification and email per DM.

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-0 rounded-xl border border-border overflow-hidden bg-background" style={{ minHeight: 0 }}>

      {/* ── Thread list sidebar ────────────────────────────────────────────── */}
      <div className={`${(selectedUserId || selectedGroupId) ? 'hidden md:flex' : 'flex'} w-full md:w-72 shrink-0 flex-col border-r border-border bg-muted/20`}>
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Messages</h2>
            {totalUnread > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                {totalUnread}
              </span>
            )}
            <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" title="New group" onClick={() => setNewGroupOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Availability">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <StaffAvailabilityCard />
              </PopoverContent>
            </Popover>
          </div>
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

        <div className="flex-1 overflow-y-auto">
          {filteredGroups.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Groups</div>
              {filteredGroups.map(g => (
                <button
                  key={g.thread_id}
                  onClick={() => selectGroup(g.thread_id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 ${selectedGroupId === g.thread_id ? 'bg-primary/8 border-l-2 border-l-primary' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      {g.unread_count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                          {g.unread_count > 9 ? '9+' : g.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs truncate ${g.unread_count > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>{g.title}</p>
                        {g.last_message_at && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatMessageTime(g.last_message_at)}</span>
                        )}
                      </div>
                      <p className="text-[11px] truncate mt-0.5 text-muted-foreground">
                        {g.participant_count} members · {g.last_message ?? 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Direct</div>
            </>
          )}
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
                onClick={() => selectDM(t.operatorUserId)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 ${
                  selectedUserId === t.operatorUserId ? 'bg-primary/8 border-l-2 border-l-primary' : ''
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

      {/* ── Message thread panel ───────────────────────────────────────────── */}
      <div className={`${(selectedUserId || selectedGroupId) ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {!selectedUserId && !selectedGroupId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-medium text-foreground/80 text-sm">No conversation selected</p>
              <p className="text-xs text-muted-foreground mt-1">Choose an operator from the list to start messaging</p>
            </div>
          </div>
        ) : selectedGroupId && selectedGroup ? (
          <>
            <MessageThread
              key={`group-${selectedGroupId}`}
              myUserId={user?.id ?? null}
              threadId={selectedGroupId}
              isGroup
              otherName={selectedGroup.title}
              otherSubtitle={`${selectedGroup.participant_count} members`}
              participantNames={Object.fromEntries((groupParticipants[selectedGroupId] ?? []).map(p => [p.id, p.name]))}
              isStaff={true}
              onBack={backToList}
              placeholder={`Message ${selectedGroup.title}…`}
              headerAction={
                <Button variant="ghost" size="icon" onClick={() => setManageGroupOpen(true)} title="Manage group">
                  <Settings2 className="h-4 w-4" />
                </Button>
              }
            />
            {manageGroupOpen && (
              <ManageGroupModal
                open={manageGroupOpen}
                onOpenChange={setManageGroupOpen}
                threadId={selectedGroupId}
                currentTitle={selectedGroup.title}
                createdBy={selectedGroup.created_by}
                myUserId={user?.id ?? ''}
                callerIsStaff={true}
                onChanged={loadGroups}
                onLeft={() => { setSelectedGroupId(null); void loadGroups(); }}
              />
            )}
          </>
        ) : (
          <MessageThread
            key={selectedUserId}
            myUserId={user?.id ?? null}
            otherUserId={selectedUserId}
            otherName={selectedThread?.name ?? 'Operator'}
            otherSubtitle="Owner-Operator"
            isStaff={true}
            onBack={backToList}
            placeholder={`Message ${selectedThread?.name ?? 'operator'}…`}
            onMessagesChanged={handleMessagesChanged}
          />
        )}
      </div>

      {newGroupOpen && (
        <NewGroupModal
          open={newGroupOpen}
          onOpenChange={setNewGroupOpen}
          callerIsStaff={true}
          onCreated={(tid) => { void loadGroups().then(() => selectGroup(tid)); }}
        />
      )}
    </div>
  );
}
