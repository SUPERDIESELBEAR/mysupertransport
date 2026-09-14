import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Pencil, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface InterviewNote {
  id: string;
  application_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

/**
 * The notes table is created by the staged migration, so it is not yet present
 * in the generated database types. This narrow accessor keeps the untyped
 * surface to a single place instead of scattering casts through the component.
 */
const notesTable = () =>
  (supabase as unknown as { from: (t: string) => any }).from('application_interview_notes');

function stamp(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function logNoteAction(
  action: string,
  applicationId: string,
  applicantLabel: string | undefined,
  actorId: string | undefined,
  actorName: string,
  metadata: Record<string, unknown>,
) {
  await supabase.from('audit_log').insert({
    action,
    entity_type: 'application',
    entity_id: applicationId,
    entity_label: applicantLabel ?? null,
    actor_id: actorId ?? null,
    actor_name: actorName,
    metadata: metadata as never,
  });
}

interface Props {
  applicationId: string;
  applicantName?: string;
  /** Keeps the list row's count badge in sync after an add or delete. */
  onCountChange?: (applicationId: string, count: number) => void;
  compact?: boolean;
}

export function InterviewNotesPanel({ applicationId, applicantName, onCountChange, compact }: Props) {
  const { user, profile, roles } = useAuth();
  const isManagement = roles.includes('management') || roles.includes('owner');
  const staffName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Staff';

  const [notes, setNotes] = useState<InterviewNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Held in a ref so a caller passing an inline callback cannot retrigger the
  // load effect on every render.
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const load = useCallback(async () => {
    const { data, error } = await notesTable()
      .select('id, application_id, author_id, author_name, body, created_at, edited_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to load interview notes', error);
      toast.error('Could not load interview notes.');
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as InterviewNote[];
    setNotes(rows);
    onCountChange?.(applicationId, rows.length);
    setLoading(false);
  }, [applicationId, onCountChange]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const addNote = async () => {
    const body = draft.trim();
    if (!body || !user) return;
    setSaving(true);
    try {
      const { error } = await notesTable().insert({
        application_id: applicationId,
        author_id: user.id,
        author_name: staffName,
        body,
      });
      if (error) throw error;
      await logNoteAction('interview_note_added', applicationId, applicantName, user.id, staffName, {
        length: body.length,
      });
      setDraft('');
      await load();
      toast.success('Interview note added.');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (note: InterviewNote) => {
    const body = editBody.trim();
    if (!body || body === note.body) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    try {
      const { error } = await notesTable().update({ body }).eq('id', note.id);
      if (error) throw error;
      await logNoteAction('interview_note_edited', applicationId, applicantName, user?.id, staffName, {
        note_id: note.id,
        original_author: note.author_name,
      });
      setEditingId(null);
      await load();
      toast.success('Interview note updated.');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to update note.');
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async (note: InterviewNote) => {
    setDeletingId(note.id);
    try {
      const { error } = await notesTable().delete().eq('id', note.id);
      if (error) throw error;
      await logNoteAction('interview_note_deleted', applicationId, applicantName, user?.id, staffName, {
        note_id: note.id,
        original_author: note.author_name,
        body: note.body,
      });
      await load();
      toast.success('Interview note deleted.');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to delete note.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" /> Interview Notes
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading notes…
        </p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No interview notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map(note => {
            const canEdit = isManagement || note.author_id === user?.id;
            const isEditing = editingId === note.id;
            return (
              <div key={note.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">
                    {note.author_name}
                    <span className="font-normal text-muted-foreground"> · {stamp(note.created_at)}</span>
                    {note.edited_at && (
                      <span className="font-normal text-muted-foreground italic"> · edited {stamp(note.edited_at)}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && !isEditing && (
                      <button
                        type="button"
                        onClick={() => { setEditingId(note.id); setEditBody(note.body); }}
                        className="p-1 rounded text-muted-foreground hover:text-gold hover:bg-secondary transition-colors"
                        aria-label="Edit note"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {isManagement && !isEditing && (
                      <button
                        type="button"
                        onClick={() => removeNote(note)}
                        disabled={deletingId === note.id}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        aria-label="Delete note"
                      >
                        {deletingId === note.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      rows={3}
                      className="text-xs resize-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1 border-gold/40 text-gold hover:bg-gold/10"
                        onClick={() => saveEdit(note)}
                        disabled={saving || !editBody.trim()}
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-foreground whitespace-pre-wrap mt-1">{note.body}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add your interview note…"
          rows={compact ? 2 : 3}
          className="text-xs resize-none"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={addNote}
            disabled={saving || !draft.trim()}
            className="h-8 px-3 text-xs gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save note
          </Button>
        </div>
      </div>
    </div>
  );
}

export default InterviewNotesPanel;
