import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageSquare, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { openLoadChat } from '@/lib/loadChat';

interface Props {
  loadId: string;
  /** auth user id of the assigned driver — null when the load is unassigned. */
  driverUserId: string | null;
  driverName: string | null;
  loadNumber: string;
}

interface LoadMessageRow {
  id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  deleted_at: string | null;
  attachment_name: string | null;
  senderName: string;
}

interface LoadLinkedMessageRpcRow {
  id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  deleted_at: string | null;
  attachment_name: string | null;
  sender_name: string;
}

async function fetchLoadMessages(loadId: string): Promise<LoadMessageRow[]> {
  const { data, error } = await supabase.rpc('get_load_linked_messages', { p_load_id: loadId });
  if (error) throw error;
  return ((data ?? []) as LoadLinkedMessageRpcRow[]).map(r => ({
    id: r.id,
    sender_id: r.sender_id,
    body: r.body,
    sent_at: r.sent_at,
    deleted_at: r.deleted_at,
    attachment_name: r.attachment_name,
    senderName: r.sender_name || 'Unknown',
  }));
}

/**
 * Messages tied to this load. They live in the driver's normal conversation —
 * this card is a view onto the load-linked subset, not a separate thread.
 */
export default function LoadMessagesCard({ loadId, driverUserId, driverName, loadNumber }: Props) {
  const { data: messages, isLoading } = useQuery({
    queryKey: ['load-messages', loadId],
    queryFn: () => fetchLoadMessages(loadId),
  });

  const startChat = () => {
    if (!driverUserId) return;
    openLoadChat({ driverUserId, loadId, loadNumber });
  };

  const hasDriver = !!driverUserId;
  const messageCount = messages?.length ?? 0;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" />
          Messages about this load
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={startChat}
          disabled={!hasDriver}
        >
          <MessageSquare className="h-4 w-4" />
          {hasDriver ? `Message ${driverName ? driverName.split(' ')[0] : 'Driver'}` : 'Message Driver'}
        </Button>
      </div>

      {!hasDriver ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No driver assigned to this load yet. Messages already linked to this load stay visible here.
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading messages…</p>
      ) : messageCount === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {hasDriver
            ? `No messages linked to this load yet. Messaging from here keeps the conversation in the driver's inbox and tags it with ${loadNumber}.`
            : 'No messages linked to this load yet.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {(messages ?? []).map(m => (
            <li key={m.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">{m.senderName}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {format(new Date(m.sent_at), 'MMM d, h:mm a')}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/85">
                {m.deleted_at ? <span className="italic text-muted-foreground">Message deleted</span> : m.body}
              </p>
              {m.attachment_name && !m.deleted_at && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  {m.attachment_name}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
