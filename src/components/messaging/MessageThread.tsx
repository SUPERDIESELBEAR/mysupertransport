import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { ArrowLeft, MessageSquare, Pin, X } from 'lucide-react';
import { useMessageThread } from './useMessageThread';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { PinnedMessagesSheet } from './PinnedMessagesSheet';
import { ChatMessage } from './types';
import { LoadContextBanner } from './LoadContextBanner';
import { fetchLoadNumbers } from '@/lib/loadChat';

interface MessageThreadProps {
  myUserId: string | null;
  otherUserId?: string | null;
  /** Group-thread mode: when set, otherUserId is ignored. */
  threadId?: string | null;
  /** True if this thread is a group. Controls header/composer/labels. */
  isGroup?: boolean;
  /** For groups: current participants keyed by user_id → display name */
  participantNames?: Record<string, string>;
  /** Right-side header action (e.g. Manage group) */
  headerAction?: React.ReactNode;
  /** Display name for the other party in the header */
  otherName: string;
  /** Subtitle (e.g. "Owner-Operator" or "Onboarding Coordinator") */
  otherSubtitle?: string;
  /** Avatar URL for the other party (optional) */
  otherAvatarUrl?: string | null;
  /** Whether the current user is staff (controls pin permission) */
  isStaff: boolean;
  /** Mobile back button handler — when null, hides the back button */
  onBack?: () => void;
  /** When set, messages sent from this thread are linked to this load. */
  loadId?: string | null;
  /** Unlink the load from this conversation (hides the context strip). */
  onClearLoadLink?: () => void;
  /** Open a linked load record — staff only; omit for drivers. */
  onOpenLoad?: (loadId: string) => void;
  /** Composer placeholder copy */
  placeholder?: string;
  /** Called when an incoming message arrives — used to update the thread list summary */
  onIncomingMessage?: (msg: ChatMessage) => void;
  /** Called every time messages change so parent can update last-message preview */
  onMessagesChanged?: (msgs: ChatMessage[]) => void;
  /** Called immediately after the user sends a message (for fire-and-forget notifications) */
  onMessageSent?: (msg: ChatMessage) => void;
}

import { initials } from '@/lib/initials';

export function MessageThread({
  myUserId, otherUserId, threadId, isGroup, participantNames, headerAction,
  otherName, otherSubtitle, otherAvatarUrl,
  loadId, onClearLoadLink, onOpenLoad,
  isStaff, onBack, placeholder, onIncomingMessage, onMessagesChanged, onMessageSent,
}: MessageThreadProps) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pinnedSheetOpen, setPinnedSheetOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleIncomingMessage = useCallback((msg: ChatMessage) => {
    onIncomingMessage?.(msg);
  }, [onIncomingMessage]);

  const {
    messages, reactions, loading, otherTyping, firstUnreadId, unreadOnOpen,
    send, editMessage, deleteMessage, togglePin, toggleReaction,
    notifyTyping, notifyStoppedTyping,
  } = useMessageThread({
    myUserId,
    otherUserId: otherUserId ?? null,
    threadId: threadId ?? null,
    loadId: loadId ?? null,
    onIncomingMessage: handleIncomingMessage,
  });

  // Bubble messages up to parent (for thread-list "last message" updates)
  useEffect(() => { onMessagesChanged?.(messages); }, [messages, onMessagesChanged]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, otherTyping]);

  // Reset reply-target when switching threads
  useEffect(() => { setReplyTo(null); }, [otherUserId, threadId]);

  const pinned = useMemo(
    () => messages
      .filter(m => m.pinned_at && !m.deleted_at)
      .sort((a, b) => new Date(b.pinned_at ?? 0).getTime() - new Date(a.pinned_at ?? 0).getTime()),
    [messages],
  );
  const latestPin = pinned[0];
  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, typeof reactions>();
    for (const r of reactions) {
      const arr = map.get(r.message_id) ?? [];
      arr.push(r);
      map.set(r.message_id, arr);
    }
    return map;
  }, [reactions]);

  // Load numbers for every load-linked message in view, so each bubble can
  // show which load it belongs to.
  const [loadNumbers, setLoadNumbers] = useState<Map<string, string>>(new Map());
  const linkedIds = useMemo(
    () => Array.from(new Set(messages.map(m => m.load_id).filter(Boolean) as string[])).sort().join(','),
    [messages],
  );
  useEffect(() => {
    if (!linkedIds) { setLoadNumbers(new Map()); return; }
    let cancelled = false;
    void fetchLoadNumbers(linkedIds.split(',')).then(map => { if (!cancelled) setLoadNumbers(map); });
    return () => { cancelled = true; };
  }, [linkedIds]);

  const jumpToMessage = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all');
    setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 1600);
  }, []);

  const handleSend = useCallback(async (body: string, file: File | null) => {
    const inserted = await send(body, { replyToId: replyTo?.id ?? null, file });
    if (inserted) {
      setReplyTo(null);
      onMessageSent?.(inserted);
    }
  }, [send, replyTo, onMessageSent]);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-background flex items-center gap-3 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0 -ml-1"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          {otherAvatarUrl ? (
            <img src={otherAvatarUrl} alt={otherName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-primary text-xs font-bold">{initials(otherName)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{otherName}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {otherTyping ? <span className="text-primary italic">typing…</span> : (otherSubtitle ?? '')}
          </p>
        </div>
        {unreadOnOpen > 0 && (
          <button
            type="button"
            onClick={() => unreadDividerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="shrink-0 h-6 px-2 rounded-full bg-primary/10 border border-primary/30 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            {unreadOnOpen} new
          </button>
        )}
        {headerAction}
      </div>

      {/* Pinned banner */}
      {pinned.length > 0 && latestPin && (
        <div className="px-5 py-2 border-b border-border bg-primary/5 shrink-0">
          <div className="flex items-center gap-2">
            <Pin className="h-3 w-3 text-primary fill-primary shrink-0" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
              {pinned.length} Pinned
            </span>
            <button
              type="button"
              onClick={() => setPinnedSheetOpen(true)}
              className="ml-auto text-[10px] font-semibold text-primary hover:underline uppercase tracking-wide"
            >
              View all
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => jumpToMessage(latestPin.id)}
              className="text-[11px] text-foreground/80 truncate flex-1 text-left hover:text-foreground"
            >
              {latestPin.body?.trim() || (latestPin.attachment_name ?? 'Attachment')}
            </button>
            {isStaff && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); void togglePin(latestPin); }}
                className="opacity-50 hover:opacity-100 shrink-0"
                aria-label="Unpin most recent"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <PinnedMessagesSheet
        open={pinnedSheetOpen}
        onOpenChange={setPinnedSheetOpen}
        pinned={pinned}
        myUserId={myUserId}
        isStaff={isStaff}
        onJumpToMessage={jumpToMessage}
        onUnpin={togglePin}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <MessageSquare className="h-6 w-6 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No messages yet. Send the first one!</p>
          </div>
        ) : (
          <>
            {messages.map((m, i) => {
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
                  {firstUnreadId === m.id && (
                    <div ref={unreadDividerRef} className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-primary/40" />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-primary px-2">
                        New messages
                      </span>
                      <div className="flex-1 h-px bg-primary/40" />
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    allMessages={messages}
                    reactions={reactionsByMsg.get(m.id) ?? []}
                    myUserId={myUserId}
                    isStaff={isStaff}
                    showSenderName={!!isGroup}
                    loadNumber={m.load_id ? loadNumbers.get(m.load_id) : undefined}
                    onOpenLoad={onOpenLoad}
                    senderName={participantNames?.[m.sender_id]}
                    onReply={setReplyTo}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onPinToggle={togglePin}
                    onToggleReaction={toggleReaction}
                    onJumpToMessage={jumpToMessage}
                  />
                </div>
              );
            })}
            {/* Typing indicator */}
            {otherTyping && (
              <div className="flex justify-start">
                <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {loadId && (
        <LoadContextBanner loadId={loadId} onClear={onClearLoadLink} onOpenLoad={onOpenLoad} />
      )}

      <MessageComposer
        placeholder={placeholder ?? `Message ${otherName}…`}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        onTyping={notifyTyping}
        onStoppedTyping={notifyStoppedTyping}
        myUserId={myUserId}
      />
    </div>
  );
}
