import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AssignmentEvent {
  id: string;                 // notification id (of type 'assignment')
  title: string;
  body: string | null;
  link: string | null;
  sent_at: string;
  entity_id: string | null;   // source notification id
  assignerName: string;
  assignerAvatar: string | null;
}

/**
 * Fetches unread in-app notifications of type 'assignment' addressed to the
 * current user, and subscribes to realtime inserts so a freshly-assigned item
 * shows up without a page refresh. `dismiss` marks the popup notification read
 * (removing it from this list) without touching archived_at.
 */
export function useAssignmentPopupEvents() {
  const { session } = useAuth();
  const [events, setEvents] = useState<AssignmentEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    if (!session?.user?.id) { setEvents([]); return; }
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, sent_at, entity_id')
      .eq('user_id', session.user.id)
      .eq('type', 'assignment')
      .is('read_at', null)
      .is('archived_at', null)
      .order('sent_at', { ascending: false })
      .limit(10);
    if (!data) { setEvents([]); return; }

    // Derive assigner from title prefix "<Name> assigned you…". Simple parse.
    const enriched: AssignmentEvent[] = (data as Array<{
      id: string; title: string; body: string | null; link: string | null;
      sent_at: string; entity_id: string | null;
    }>).map(row => {
      const m = row.title.match(/^(.+?) assigned you/);
      const assignerName = m?.[1] ?? 'A teammate';
      return { ...row, assignerName, assignerAvatar: null };
    });
    setEvents(enriched);
  }, [session?.user?.id]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('assignment-popup')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => { void fetchEvents(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, fetchEvents]);

  const dismiss = useCallback(async (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  }, []);

  return { events, dismiss, refresh: fetchEvents };
}