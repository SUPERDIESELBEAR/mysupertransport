import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Pin, PinOff, Paperclip } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { ChatMessage } from './types';

interface PinnedMessagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pinned: ChatMessage[];
  myUserId: string | null;
  isStaff: boolean;
  onJumpToMessage: (id: string) => void;
  onUnpin: (msg: ChatMessage) => Promise<void> | void;
}

export function PinnedMessagesSheet({
  open, onOpenChange, pinned, myUserId, isStaff, onJumpToMessage, onUnpin,
}: PinnedMessagesSheetProps) {
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // Resolve sender display names for any IDs we don't already know
  useEffect(() => {
    if (!open || pinned.length === 0) return;
    const senderIds = Array.from(new Set(pinned.map(p => p.sender_id))).filter(id => !nameMap[id]);
    if (senderIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', senderIds);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      for (const row of data as { user_id: string; first_name: string | null; last_name: string | null }[]) {
        const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
        next[row.user_id] = full || 'Teammate';
      }
      setNameMap(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [open, pinned, nameMap]);

  // Newest pinned first
  const sorted = [...pinned].sort(
    (a, b) => new Date(b.pinned_at ?? 0).getTime() - new Date(a.pinned_at ?? 0).getTime()
  );

  const handleJump = (id: string) => {
    onOpenChange(false);
    // Wait for the sheet's exit animation so the bubble is in the DOM viewport
    setTimeout(() => onJumpToMessage(id), 220);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Pin className="h-4 w-4 text-primary fill-primary" />
            Pinned messages
            <span className="ml-1 text-xs font-normal text-muted-foreground">({sorted.length})</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {sorted.map(p => {
            const senderName = p.sender_id === myUserId
              ? 'You'
              : (nameMap[p.sender_id] ?? '…');
            const hasAttachment = !!p.attachment_url;
            const previewText = p.body?.trim() || (hasAttachment ? (p.attachment_name ?? 'Attachment') : '');

            return (
              <div
                key={p.id}
                className="border-b border-border px-5 py-3 hover:bg-muted/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => handleJump(p.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-xs font-semibold text-foreground truncate">{senderName}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(p.sent_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    {hasAttachment && (
                      <Paperclip className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <p className="text-sm text-foreground/85 line-clamp-2 break-words flex-1">
                      {previewText}
                    </p>
                  </div>
                  {p.pinned_at && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Pinned {format(new Date(p.pinned_at), 'MMM d, h:mm a')}
                    </p>
                  )}
                </button>

                {isStaff && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void onUnpin(p)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <PinOff className="h-3 w-3" />
                      Unpin
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}