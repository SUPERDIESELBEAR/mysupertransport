import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageSquare, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { openLoadChat } from '@/lib/loadChat';
import { toast } from '@/hooks/use-toast';

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

async function fetchLoadMessages(loadId: string): Promise<LoadMessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, sent_at, deleted_at, attachment_name')
    .eq('load_id', loadId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map(r => r.sender_id)));
  const { data: profs } = ids.length
    ? await supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', ids)
    : { data: [] as { user_id: string; first_name: string | null; last_name: string | null }[] };
  const nameOf = new Map(
    (profs ?? []).map(p => [p.user_id, [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown']),
  );
  return rows.map(r => ({ ...r, senderName: nameOf.get(r.sender_id) ?? 'Unknown' }));
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
    if (!driverUserId) {
      toast({
        title: 'No driver assigned',
        description: 'Assign a driver to this load before messaging about it.',
        variant: 'destructive',
      });
      return;
    }
    openLoadChat({ driverUserId, loadId, loadNumber });
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" />
          Messages about this load
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={startChat}>
          <MessageSquare className="h-4 w-4" />
          Message {driverName ? driverName.split(' ')[0] : 'Driver'}
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading messages…</p>
      ) : (messages ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No messages linked to this load yet. Messaging from here keeps the conversation in the
          driver&apos;s inbox and tags it with {loadNumber}.
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
