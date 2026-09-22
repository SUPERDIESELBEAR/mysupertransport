/**
 * Unread What's New announcements for the signed-in staff member.
 *
 * Unread means: published, inside the viewer's audience, and either never seen
 * or — when the announcement requires a "Got it" — not yet acknowledged. That
 * second case is what makes an important announcement keep coming back.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  notesDb,
  RELEASE_NOTE_COLUMNS,
  isInAudience,
  type ReleaseNote,
  type ReleaseNoteRead,
} from '@/lib/releaseNotes/types';

export function useUnreadReleaseNotes() {
  const { session, roles, isStaff } = useAuth();
  const userId = session?.user?.id ?? null;
  const [unread, setUnread] = useState<ReleaseNote[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Announcements waiting for the owner's approval. The SELECT policy already
  // limits pending rows to management and the owner, so anyone else reads zero.
  const canReview = roles.includes('owner') || roles.includes('management');

  const load = useCallback(async () => {
    if (!userId || !isStaff) {
      setUnread([]);
      setPendingCount(0);
      setLoading(false);
      return;
    }

    if (canReview) {
      const { count } = await notesDb
        .from('release_notes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingCount(count ?? 0);
    } else {
      setPendingCount(0);
    }



    const { data: notes, error } = await notesDb
      .from('release_notes')
      .select(RELEASE_NOTE_COLUMNS)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      // A failed read must not hide the rest of the app; it simply shows nothing.
      setUnread([]);
      setLoading(false);
      return;
    }

    const mine = ((notes ?? []) as ReleaseNote[]).filter(n => isInAudience(n, roles));
    if (mine.length === 0) {
      setUnread([]);
      setLoading(false);
      return;
    }

    const { data: reads } = await notesDb
      .from('release_note_reads')
      .select('id, release_note_id, user_id, seen_at, acknowledged_at')
      .eq('user_id', userId)
      .in('release_note_id', mine.map(n => n.id));

    const byNote = new Map<string, ReleaseNoteRead>(
      ((reads ?? []) as ReleaseNoteRead[]).map(r => [r.release_note_id, r]),
    );

    setUnread(
      mine.filter(n => {
        const read = byNote.get(n.id);
        if (!read) return true;
        return n.requires_ack && !read.acknowledged_at;
      }),
    );
    setLoading(false);
  }, [userId, isStaff, roles, canReview]);

  useEffect(() => { load(); }, [load]);

  /** Record that this person has seen — and, when required, acknowledged — a note. */
  const markRead = useCallback(async (noteId: string, acknowledge: boolean) => {
    if (!userId) return;
    const { error } = await notesDb
      .from('release_note_reads')
      .upsert(
        {
          release_note_id: noteId,
          user_id: userId,
          seen_at: new Date().toISOString(),
          acknowledged_at: acknowledge ? new Date().toISOString() : null,
        },
        { onConflict: 'release_note_id,user_id' },
      );
    if (error) throw new Error(error.message);
    setUnread(prev => prev.filter(n => n.id !== noteId));
  }, [userId]);

  return { unread, pendingCount, loading, markRead, refresh: load };
}
