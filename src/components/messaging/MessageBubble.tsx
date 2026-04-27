import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CheckCheck, MoreVertical, Reply, Pencil, Trash2, Pin, PinOff, Smile, FileText, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover';
import {
  ChatMessage, MessageReaction, QUICK_EMOJIS, EDIT_WINDOW_MS,
  groupReactions, isImageMime, isPdfMime, formatBytes,
} from './types';
import { cn } from '@/lib/utils';

interface Props {
  message: ChatMessage;
  /** All loaded messages so we can render the quoted reply target */
  allMessages: ChatMessage[];
  reactions: MessageReaction[];
  myUserId: string | null;
  /** Whether the current user is staff (controls pin permission) */
  isStaff: boolean;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage, newBody: string) => Promise<void> | void;
  onDelete: (msg: ChatMessage) => Promise<void> | void;
  onPinToggle: (msg: ChatMessage) => Promise<void> | void;
  onToggleReaction: (msg: ChatMessage, emoji: string) => Promise<void> | void;
  onJumpToMessage: (id: string) => void;
}

export function MessageBubble({
  message, allMessages, reactions, myUserId, isStaff,
  onReply, onEdit, onDelete, onPinToggle, onToggleReaction, onJumpToMessage,
}: Props) {
  const isMe = message.sender_id === myUserId;
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.body);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const grouped = useMemo(() => groupReactions(reactions, myUserId), [reactions, myUserId]);
  const replyTarget = message.reply_to_id
    ? allMessages.find(m => m.id === message.reply_to_id) ?? null
    : null;

  const canEdit =
    isMe &&
    !message.deleted_at &&
    !message.attachment_url &&
    Date.now() - new Date(message.sent_at).getTime() < EDIT_WINDOW_MS;

  const isDeleted = !!message.deleted_at;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        'group flex',
        isMe ? 'justify-end' : 'justify-start',
        message.pinned_at && 'rounded-lg px-1 py-0.5 -mx-1 bg-primary/[0.04]'
      )}
    >
      <div className={cn('max-w-[78%] flex flex-col', isMe ? 'items-end' : 'items-start')}>
        {/* ── Pinned label ─────────────────────────────────────────────── */}
        {message.pinned_at && (
          <div className="flex items-center gap-1 text-[10px] text-primary font-semibold mb-0.5">
            <Pin className="h-2.5 w-2.5 fill-current" />
            <span>Pinned</span>
          </div>
        )}

        {/* ── Bubble + actions ─────────────────────────────────────────── */}
        <div className={cn('relative flex items-end gap-1', isMe ? 'flex-row-reverse' : 'flex-row')}>
          {/* Bubble */}
          <div
            className={cn(
              'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
              isMe
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm',
              isDeleted && 'opacity-60 italic'
            )}
          >
            {/* Reply quote */}
            {replyTarget && !isDeleted && (
              <button
                type="button"
                onClick={() => onJumpToMessage(replyTarget.id)}
                className={cn(
                  'block w-full text-left mb-1.5 pl-2 pr-2 py-1 rounded border-l-2 text-[11px] leading-snug',
                  isMe
                    ? 'border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/85'
                    : 'border-foreground/30 bg-foreground/5 text-foreground/80'
                )}
              >
                <div className="font-semibold mb-0.5 truncate">
                  {replyTarget.sender_id === myUserId ? 'You' : 'Them'}
                </div>
                <div className="line-clamp-2">
                  {replyTarget.deleted_at
                    ? '(deleted)'
                    : replyTarget.body || (replyTarget.attachment_name ?? 'Attachment')}
                </div>
              </button>
            )}

            {/* Edit mode */}
            {editing ? (
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <Input
                  autoFocus
                  value={editDraft}
                  onChange={e => setEditDraft(e.target.value)}
                  className="h-8 text-sm bg-background text-foreground"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void Promise.resolve(onEdit(message, editDraft)).then(() => setEditing(false));
                    }
                    if (e.key === 'Escape') {
                      setEditing(false);
                      setEditDraft(message.body);
                    }
                  }}
                />
                <div className="flex gap-1 justify-end">
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => { setEditing(false); setEditDraft(message.body); }}
                  >Cancel</Button>
                  <Button
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={async () => {
                      await onEdit(message, editDraft);
                      setEditing(false);
                    }}
                  >Save</Button>
                </div>
              </div>
            ) : (
              <>
                {/* Body or "deleted" */}
                {isDeleted ? (
                  <span>This message was deleted</span>
                ) : (
                  <>
                    {/* Attachment */}
                    {message.attachment_url && (
                      <div className={cn('mb-1', !message.body && 'mb-0')}>
                        {isImageMime(message.attachment_mime) ? (
                          <a
                            href={message.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={message.attachment_url}
                              alt={message.attachment_name ?? 'attachment'}
                              className="max-w-[260px] max-h-[260px] rounded-lg object-cover border border-border/30"
                            />
                          </a>
                        ) : isPdfMime(message.attachment_mime) ? (
                          <a
                            href={message.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-2 rounded-lg border min-w-[200px]',
                              isMe
                                ? 'border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20'
                                : 'border-border bg-background hover:bg-muted/50'
                            )}
                          >
                            <FileText className="h-5 w-5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">
                                {message.attachment_name ?? 'Document.pdf'}
                              </div>
                              <div className="text-[10px] opacity-70">
                                {formatBytes(message.attachment_size_bytes)} · PDF
                              </div>
                            </div>
                            <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          </a>
                        ) : null}
                      </div>
                    )}
                    {message.body && <span className="whitespace-pre-wrap break-words">{message.body}</span>}
                  </>
                )}
              </>
            )}
          </div>

          {/* Action menu — visible on hover/focus */}
          {!isDeleted && !editing && (
            <div className={cn(
              'flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
              'self-center'
            )}>
              {/* React button */}
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
                    aria-label="Add reaction"
                  >
                    <Smile className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1.5" side="top" align={isMe ? 'end' : 'start'}>
                  <div className="flex gap-0.5">
                    {QUICK_EMOJIS.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => { onToggleReaction(message, em); setEmojiOpen(false); }}
                        className="h-8 w-8 rounded hover:bg-muted text-base leading-none"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Reply button */}
              <button
                type="button"
                onClick={() => onReply(message)}
                className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
                aria-label="Reply"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>

              {/* More menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
                    aria-label="More"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isMe ? 'end' : 'start'} className="w-44">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => { setEditDraft(message.body); setEditing(true); }}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                    </DropdownMenuItem>
                  )}
                  {isMe && (
                    <DropdownMenuItem onClick={() => onDelete(message)} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                  {isStaff && (
                    <DropdownMenuItem onClick={() => onPinToggle(message)}>
                      {message.pinned_at ? (
                        <><PinOff className="h-3.5 w-3.5 mr-2" /> Unpin</>
                      ) : (
                        <><Pin className="h-3.5 w-3.5 mr-2" /> Pin message</>
                      )}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* ── Reactions strip ──────────────────────────────────────────── */}
        {grouped.length > 0 && !isDeleted && (
          <div className={cn('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
            {grouped.map(({ emoji, count, mine }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggleReaction(message, emoji)}
                className={cn(
                  'h-6 px-1.5 rounded-full border text-[11px] flex items-center gap-0.5 transition-colors',
                  mine
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border bg-background hover:bg-muted'
                )}
              >
                <span>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Timestamp + read receipt ─────────────────────────────────── */}
        <p className={cn(
          'text-[10px] text-muted-foreground mt-1 flex items-center gap-1',
          isMe ? 'justify-end' : 'justify-start'
        )}>
          <span>{format(new Date(message.sent_at), 'h:mm a')}</span>
          {message.edited_at && !isDeleted && <span className="italic">(edited)</span>}
          {isMe && !isDeleted && (
            message.read_at ? (
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
  );
}