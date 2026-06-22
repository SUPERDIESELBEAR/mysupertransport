import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Megaphone, ShieldCheck } from 'lucide-react';
import OperatorMessagesView from './OperatorMessagesView';
import OperatorAnnouncementsView from './OperatorAnnouncementsView';

interface Props {
  /** Deep-link to a specific broadcast id, opens the Announcements tab. */
  initialBroadcastId?: string;
}

export default function OperatorMessagesHub({ initialBroadcastId }: Props) {
  const { user } = useAuth();
  const [announceUnread, setAnnounceUnread] = useState(0);
  const [needsAck, setNeedsAck] = useState(0);
  const [tab, setTab] = useState<'announcements' | 'direct'>(
    initialBroadcastId ? 'announcements' : 'direct'
  );

  // Load badge counts for announcements
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('operator_broadcast_recipients')
        .select('read_at, acknowledged_at, operator_broadcasts(requires_acknowledgment, status)')
        .limit(200);
      if (cancelled) return;
      const rows = (data ?? []).filter((r: any) =>
        r.operator_broadcasts &&
        !['draft', 'scheduled'].includes(r.operator_broadcasts.status)
      );
      setAnnounceUnread(rows.filter((r: any) => !r.read_at).length);
      setNeedsAck(rows.filter((r: any) =>
        r.operator_broadcasts.requires_acknowledgment === true && !r.acknowledged_at
      ).length);
    };
    load();
    // Re-load when the user switches into the announcements tab so the badge stays fresh.
  }, [user?.id, tab]);

  // If a deep-link broadcast id arrives later, jump to it
  useEffect(() => {
    if (initialBroadcastId) setTab('announcements');
  }, [initialBroadcastId]);

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '480px' }}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'announcements' | 'direct')} className="flex flex-col flex-1 min-h-0">
        <div className="border-b px-3 py-2 shrink-0">
          <TabsList>
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Announcements
              {announceUnread > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{announceUnread}</Badge>
              )}
              {needsAck > 0 && (
                <span title={`${needsAck} need acknowledgment`} className="inline-flex items-center text-gold">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="direct" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Direct
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="announcements" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col">
          <OperatorAnnouncementsView initialBroadcastId={initialBroadcastId} />
        </TabsContent>
        <TabsContent value="direct" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <OperatorMessagesView />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}