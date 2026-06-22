import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Megaphone, ShieldCheck, CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface BroadcastItem {
  recipient_id: string;
  broadcast_id: string;
  subject: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
  requires_acknowledgment: boolean;
  read_at: string | null;
  acknowledged_at: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, yyyy · h:mm a');
}

interface Props {
  /** Optional broadcast id to deep-link straight into the detail view. */
  initialBroadcastId?: string;
}

export default function OperatorAnnouncementsView({ initialBroadcastId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<BroadcastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialBroadcastId ?? null);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: recipients } = await supabase
      .from('operator_broadcast_recipients')
      .select('id, broadcast_id, read_at, acknowledged_at, operator_broadcasts(subject, body, cta_label, cta_url, created_at, requires_acknowledgment, status)')
      .order('created_at', { ascending: false })
      .limit(200);

    const rows = (recipients ?? [])
      .map((r: any) => ({
        recipient_id: r.id,
        broadcast_id: r.broadcast_id,
        subject: r.operator_broadcasts?.subject ?? '(no subject)',
        body: r.operator_broadcasts?.body ?? '',
        cta_label: r.operator_broadcasts?.cta_label ?? null,
        cta_url: r.operator_broadcasts?.cta_url ?? null,
        created_at: r.operator_broadcasts?.created_at ?? null,
        requires_acknowledgment: r.operator_broadcasts?.requires_acknowledgment === true,
        read_at: r.read_at,
        acknowledged_at: r.acknowledged_at,
        status: r.operator_broadcasts?.status,
      }))
      .filter((r: any) => r.created_at && !['draft', 'scheduled'].includes(r.status))
      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at));

    setItems(rows);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Mark as read when opening detail view (no-ack mode)
  useEffect(() => {
    if (!selectedId) return;
    const item = items.find((i) => i.broadcast_id === selectedId);
    if (!item || item.read_at) return;
    (async () => {
      try {
        await supabase.functions.invoke('broadcast-acknowledge', {
          body: { broadcastId: selectedId, action: 'read' },
        });
        setItems((prev) => prev.map((i) =>
          i.broadcast_id === selectedId ? { ...i, read_at: new Date().toISOString() } : i
        ));
      } catch (e) {
        // Silent: read tracking is best-effort
        console.warn('mark read failed', e);
      }
    })();
  }, [selectedId, items]);

  const selected = useMemo(
    () => items.find((i) => i.broadcast_id === selectedId) ?? null,
    [items, selectedId]
  );

  const handleAcknowledge = async () => {
    if (!selected) return;
    setAcking(true);
    try {
      const { error } = await supabase.functions.invoke('broadcast-acknowledge', {
        body: { broadcastId: selected.broadcast_id, action: 'acknowledge' },
      });
      if (error) throw error;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) =>
        i.broadcast_id === selected.broadcast_id
          ? { ...i, acknowledged_at: now, read_at: i.read_at ?? now }
          : i
      ));
      toast({ title: 'Acknowledged', description: 'Thanks — management has been notified.' });
    } catch (e: any) {
      toast({ title: 'Could not acknowledge', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setAcking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading announcements…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 gap-3">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <Megaphone className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <div>
          <p className="font-semibold text-foreground">No announcements yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Broadcasts from SUPERTRANSPORT Management will appear here.
          </p>
        </div>
      </div>
    );
  }

  if (selected) {
    const safeBody = escapeHtml(selected.body).replace(/\n/g, '<br/>');
    const cta = selected.cta_label && selected.cta_url
      ? `<div style="text-align:center;margin:20px 0 4px;"><a href="${escapeHtml(selected.cta_url)}" style="background:#C9A84C;color:#0f1117;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">${escapeHtml(selected.cta_label)}</a></div>`
      : '';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {selected.acknowledged_at ? (
              <Badge className="bg-green-600 text-white gap-1">
                <CheckCircle2 className="h-3 w-3" /> Acknowledged
              </Badge>
            ) : selected.requires_acknowledgment ? (
              <Badge className="bg-gold text-black gap-1">
                <ShieldCheck className="h-3 w-3" /> Action required
              </Badge>
            ) : null}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-5 max-w-2xl mx-auto">
            <p className="text-xs text-muted-foreground">SUPERTRANSPORT Management · {formatStamp(selected.created_at)}</p>
            <h2 className="text-xl font-bold mt-1 mb-3">{selected.subject}</h2>
            <div
              className="text-sm leading-7 text-foreground"
              dangerouslySetInnerHTML={{ __html: safeBody + cta }}
            />
            {selected.requires_acknowledgment && !selected.acknowledged_at && (
              <div className="mt-6 p-4 rounded-md border-l-4 border-gold bg-gold/10">
                <p className="text-sm font-semibold text-foreground mb-2">
                  Acknowledgment required
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Management is tracking who has seen this message. Tap below to confirm you've read it.
                </p>
                <Button onClick={handleAcknowledge} disabled={acking} className="bg-gold hover:bg-gold/90 text-black gap-2">
                  {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Acknowledge
                </Button>
              </div>
            )}
            {selected.acknowledged_at && (
              <p className="mt-6 text-xs text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Acknowledged on {formatStamp(selected.acknowledged_at)}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {items.map((i) => {
          const isUnread = !i.read_at;
          const needsAck = i.requires_acknowledgment && !i.acknowledged_at;
          return (
            <button
              key={i.recipient_id}
              onClick={() => setSelectedId(i.broadcast_id)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 flex items-start gap-3"
            >
              <div className="mt-1 shrink-0">
                {isUnread ? (
                  <span className="block h-2.5 w-2.5 rounded-full bg-gold" aria-label="Unread" />
                ) : (
                  <span className="block h-2.5 w-2.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm truncate ${isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                    {i.subject}
                  </p>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    {formatStamp(i.created_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  SUPERTRANSPORT Management
                </p>
                {needsAck && (
                  <Badge className="bg-gold text-black text-[10px] mt-1.5 gap-1">
                    <ShieldCheck className="h-2.5 w-2.5" /> Action required
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}