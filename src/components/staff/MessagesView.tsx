import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageSquare, Search, User, MailOpen, Mail } from 'lucide-react';
import { MessageThread } from '@/components/messaging/MessageThread';
import type { ChatMessage } from '@/components/messaging/types';
import StaffAvailabilityCard from './StaffAvailabilityCard';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Settings2, Users, Plus } from 'lucide-react';
import { NewGroupModal } from '@/components/messaging/NewGroupModal';
import { NewDirectMessageModal, loadDMCandidates, type DMCandidate } from '@/components/messaging/NewDirectMessageModal';
import { ManageGroupModal } from '@/components/messaging/ManageGroupModal';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Thread {
  userId: string;
  name: string;
  subtitle: string;
  kind: 'staff' | 'driver';
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

const DEFAULT_VIEW_KEY = 'superdrive_messages_default_view';
type RailFilter = 'all' | 'unread';

// ─── Main Component ───────────────────────────────────────────────────────────

interface MessagesViewProps {
  initialUserId?: string | null;
}

export default function MessagesView({ initialUserId }: MessagesViewProps = {}) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<DMCandidate[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [groupThreads, setGroupThreads] = useState<GroupThreadRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<Record<string, { name: string; id: string }[]>>({});
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [search, setSearch] = useState('');
  const [contactTab, setContactTab] = useState<'drivers' | 'staff'>('drivers');
  const [railFilter, setRailFilter] = useState<RailFilter>(() => {
    try { return localStorage.getItem(DEFAULT_VIEW_KEY) === 'unread' ? 'unread' : 'all'; } catch { return 'all'; }
  });

  // ── Load messageable contacts (staff + drivers) ───────────────────────────
  const loadContacts = useCallback(async () => {
    const list = await loadDMCandidates(true, user?.id ?? null);
    setContacts(list);
    if (list.length === 0) setLoadingThreads(false);
  }, [user?.id]);

  // ── Load group threads I'm a participant of ─────────────────────────
  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.rpc('list_my_group_threads');
    setGroupThreads((data ?? []) as GroupThreadRow[]);
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
  const buildThreads = useCallback(async (people: DMCandidate[]) => {
    if (!user?.id || people.length === 0) { setLoadingThreads(false); return; }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, body, sent_at, read_at, deleted_at, attachment_name')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('sent_at', { ascending: false });

    if (!msgs) { setLoadingThreads(false); return; }

    const known = new Set(people.map(p => p.user_id));
    const grouped: Record<string, typeof msgs> = {};

    msgs.forEach(m => {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!known.has(otherId)) return;
      if (!grouped[otherId]) grouped[otherId] = [];
      grouped[otherId].push(m);
    });

    const built: Thread[] = people.map(p => {
      const opMsgs = grouped[p.user_id] ?? [];
      const latest = opMsgs[0];
      const unreadInbound = opMsgs.filter(m => m.sender_id === p.user_id && !m.read_at);
      const unread = unreadInbound.length;
      const oldestUnreadAt = unread
        ? unreadInbound.reduce((min, m) => (min && min < m.sent_at ? min : m.sent_at), '' as string) || null
        : null;

      return {
        userId: p.user_id,
        name: p.name,
        subtitle: p.subtitle,
        kind: p.kind,
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
  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (contacts.length > 0) buildThreads(contacts);
  }, [contacts, buildThreads]);

  // Keep the tab in sync with whichever conversation is open
  useEffect(() => {
    if (!selectedUserId) return;
    const t = threads.find(x => x.userId === selectedUserId);
    if (t) setContactTab(t.kind === 'staff' ? 'staff' : 'drivers');
  }, [selectedUserId, threads]);

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
          t.userId === msg.sender_id
            ? { ...t, lastMessage: previewBody(msg), lastAt: msg.sent_at, unreadCount: t.unreadCount + 1 }
            : t
        ));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, selectedUserId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const tabThreads = threads.filter(t => (contactTab === 'staff' ? t.kind === 'staff' : t.kind === 'driver'));
  const filteredThreads = tabThreads.filter(t =>
    t.name.toLowerCase().includes(q) && (railFilter === 'all' || t.unreadCount > 0)
  );
  const filteredGroups = groupThreads.filter(g =>
    (g.title ?? '').toLowerCase().includes(q) && (railFilter === 'all' || (g.unread_count ?? 0) > 0)
  );
  const selectedThread = threads.find(t => t.userId === selectedUserId);
  const selectedGroup = groupThreads.find(g => g.thread_id === selectedGroupId);
  const driverUnread = threads.filter(t => t.kind === 'driver').reduce((s, t) => s + t.unreadCount, 0);
  const staffUnread = threads.filter(t => t.kind === 'staff').reduce((s, t) => s + t.unreadCount, 0);
  const groupUnread = groupThreads.reduce((s, g) => s + (g.unread_count ?? 0), 0);
  const totalUnread = driverUnread + staffUnread + groupUnread;

  const selectDM = (uid: string) => { setSelectedGroupId(null); setSelectedUserId(uid); };
  const selectGroup = (tid: string) => { setSelectedUserId(null); setSelectedGroupId(tid); };
  const backToList = () => { setSelectedUserId(null); setSelectedGroupId(null); };

  const changeFilter = (f: RailFilter) => {
    setRailFilter(f);
    try { localStorage.setItem(DEFAULT_VIEW_KEY, f); } catch { /* ignore */ }
  };

  // ── Mark a DM thread read / unread ────────────────────────────────────────
  const markThread = useCallback(async (otherUserId: string, read: boolean) => {
    if (!user?.id) return;
    if (read) {
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', otherUserId)
        .eq('recipient_id', user.id)
        .is('read_at', null);
      if (error) { toast.error('Could not mark as read'); return; }
    } else {
      // Flag just the most recent inbound message so the thread shows as unread
      const { data: latest } = await supabase
        .from('messages')
        .select('id')
        .eq('sender_id', otherUserId)
        .eq('recipient_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) { toast.error('No received messages to flag'); return; }
      const { error } = await supabase.from('messages').update({ read_at: null }).eq('id', latest.id);
      if (error) { toast.error('Could not mark as unread'); return; }
    }
    setThreads(prev => prev.map(t => (t.userId === otherUserId ? { ...t, unreadCount: read ? 0 : Math.max(1, t.unreadCount) } : t)));
    toast.success(read ? 'Marked as read' : 'Marked as unread');
  }, [user?.id]);

  // ── Update thread's last-message preview as messages flow in
  const handleMessagesChanged = useCallback((msgs: ChatMessage[]) => {
    if (!selectedUserId) return;
    const latest = msgs[msgs.length - 1];
    if (!latest) return;
    setThreads(prev => prev.map(t =>
      t.userId === selectedUserId
        ? { ...t, lastMessage: previewBody(latest), lastAt: latest.sent_at, unreadCount: 0 }
        : t
    ));
  }, [selectedUserId]);

  // Notification delivery (in-app + throttled email) is handled by the
  // `notify-new-message` edge function invoked inside `useMessageThread.sendMessage`.

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" title="New conversation">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setNewDmOpen(true)}>
                  <MessageSquare className="h-4 w-4 mr-2" /> New message
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewGroupOpen(true)}>
                  <Users className="h-4 w-4 mr-2" /> New group chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Message settings">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-[420px] overflow-y-auto p-0">
                <SheetHeader className="px-5 pt-5 pb-2">
                  <SheetTitle>Message settings</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-6">
                  <StaffAvailabilityCard />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Read/unread filter */}
          <div className="flex items-center gap-1 mt-2">
            {(['all', 'unread'] as RailFilter[]).map(f => (
              <button
                key={f}
                onClick={() => changeFilter(f)}
                className={`flex-1 h-6 rounded text-[11px] font-medium capitalize transition-colors ${
                  railFilter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {f === 'unread' && totalUnread > 0 ? `Unread ${totalUnread}` : f}
              </button>
            ))}
          </div>

          {/* Drivers / Staff tabs */}
          <div className="flex items-center gap-1 mt-2 p-0.5 rounded-md bg-muted/60">
            {([['drivers', 'Drivers', driverUnread], ['staff', 'Staff', staffUnread]] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setContactTab(key)}
                className={`flex-1 h-7 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  contactTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            ))}
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
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                {contactTab === 'staff' ? 'Staff' : 'Direct'}
              </div>
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
                {search
                  ? 'No conversations found'
                  : railFilter === 'unread'
                    ? 'No unread messages'
                    : contactTab === 'staff' ? 'No staff members yet' : 'No operators yet'}
              </p>
            </div>
          ) : (
            filteredThreads.map(t => (
              <div
                key={t.userId}
                className={`group relative w-full border-b border-border/50 transition-colors hover:bg-muted/50 ${
                  selectedUserId === t.userId ? 'bg-primary/8 border-l-2 border-l-primary' : t.unreadCount > 0 ? 'border-l-2 border-l-primary/60' : ''
                }`}
              >
                <button onClick={() => selectDM(t.userId)} className="w-full text-left px-4 py-3">
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
                          <span className="text-[10px] text-muted-foreground shrink-0 group-hover:opacity-0 transition-opacity">
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
                {t.lastAt && (
                  <button
                    onClick={() => void markThread(t.userId, t.unreadCount === 0)}
                    title={t.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}
                    className="absolute top-2.5 right-2 h-6 w-6 rounded hidden group-hover:flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {t.unreadCount > 0 ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
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
              <p className="text-xs text-muted-foreground mt-1">Choose a driver or staff member from the list to start messaging</p>
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
            otherName={selectedThread?.name ?? 'Contact'}
            otherSubtitle={selectedThread?.subtitle ?? 'Owner-Operator'}
            isStaff={true}
            onBack={backToList}
            placeholder={`Message ${selectedThread?.name ?? 'contact'}…`}
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

      <NewDirectMessageModal
        open={newDmOpen}
        onOpenChange={setNewDmOpen}
        callerIsStaff={true}
        myUserId={user?.id ?? null}
        onSelect={(c) => { setContactTab(c.kind === 'staff' ? 'staff' : 'drivers'); selectDM(c.user_id); }}
      />
    </div>
  );
}
