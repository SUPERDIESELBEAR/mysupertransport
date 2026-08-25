import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage } from '@/lib/dbError';
import { normalizeMultiline } from '@/lib/textNormalize';
import { addBrokerNote, fetchBrokerNotes, type BrokerNote } from '@/lib/brokerRelationship';

interface Props {
  brokerId: string;
  /** The old single notes blob, shown read-only so there is one place to write. */
  legacyNotes?: string | null;
}

export const brokerNotesQueryKey = (id: string) => ['broker-notes', id] as const;

function stamp(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

/**
 * A running, attributed record of what working with this broker is actually
 * like — not a single current opinion that the next person overwrites.
 */
export default function BrokerNotesSection({ brokerId, legacyNotes }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');

  const { data: notes, isLoading, error } = useQuery({
    queryKey: brokerNotesQueryKey(brokerId),
    queryFn: () => fetchBrokerNotes(brokerId),
  });

  const add = useMutation({
    mutationFn: () => addBrokerNote(brokerId, normalizeMultiline(draft)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: brokerNotesQueryKey(brokerId) });
      setDraft('');
      toast({ description: 'Note added.' });
    },
    onError: (e: unknown) => toast({
      variant: 'destructive',
      title: 'Note not saved',
      description: getDbErrorMessage(e, 'Could not save the note.'),
    }),
  });

  const rows = notes ?? [];

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Dispatcher notes</p>

      {legacyNotes?.trim() && (
        <div className="rounded-md border border-border bg-muted/40 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Legacy note (read-only)
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{legacyNotes}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            This note predates attributed notes and has no author or date. Notes are now added below.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">Could not load notes.</p>}
      {isLoading && <p className="text-xs text-muted-foreground">Loading notes…</p>}

      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((n: BrokerNote) => (
            <li key={n.id} className="rounded-md border border-border p-2.5">
              <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {n.author_name ?? 'Unknown staff'} · {stamp(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="broker-note-draft" className="text-xs">Add a note</Label>
        <Textarea
          id="broker-note-draft"
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="e.g., pays on time but detention takes three calls to approve"
        />
        <div className="flex justify-end">
          <Button
            type="button" size="sm"
            disabled={!draft.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
