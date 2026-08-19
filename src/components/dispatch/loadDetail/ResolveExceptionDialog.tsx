import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { formatEnumLabel } from '@/lib/loadFormat';
import {
  resolveDocumentException, type LoadDocument, type LoadDocumentException,
} from '@/lib/loadDocuments';

type Outcome = 'approved' | 'resolved' | 'denied';

const OUTCOMES: { value: Outcome; label: string; help: string }[] = [
  { value: 'approved', label: 'Approve', help: 'The load may proceed without this document.' },
  { value: 'resolved', label: 'Resolve with a document', help: 'Link an uploaded document that satisfies this exception.' },
  { value: 'denied', label: 'Deny', help: 'The document must still be obtained.' },
];

export default function ResolveExceptionDialog({
  loadId, exception, documents, open, onOpenChange,
}: {
  loadId: string;
  exception: LoadDocumentException;
  documents: LoadDocument[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome>('approved');
  const [documentId, setDocumentId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => resolveDocumentException({
      exceptionId: exception.id,
      status: outcome,
      resolutionNotes: notes,
      resolvingDocumentId: outcome === 'resolved' ? documentId : null,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['load-document-exceptions', loadId] });
      await qc.invalidateQueries({ queryKey: ['load-documents', loadId] });
      toast({ title: 'Exception updated' });
      onOpenChange(false);
    },
    onError: (err) => {
      logDbError('resolveDocumentException', err, { exceptionId: exception.id, outcome });
      toast({
        title: 'Could not update the exception',
        description: getDbErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const notesMissing = !notes.trim();
  const docMissing = outcome === 'resolved' && !documentId;

  return (
    <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Document Exception</DialogTitle>
          <DialogDescription>
            {formatEnumLabel(exception.document_type)} reported missing by the driver.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={outcome} onValueChange={v => setOutcome(v as Outcome)} className="space-y-2">
            {OUTCOMES.map(o => (
              <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                <RadioGroupItem value={o.value} id={`outcome-${o.value}`} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.help}</span>
                </span>
              </label>
            ))}
          </RadioGroup>

          {outcome === 'resolved' ? (
            <div className="space-y-1.5">
              <Label htmlFor="resolving-doc">Satisfying document</Label>
              {documents.length ? (
                <Select value={documentId} onValueChange={setDocumentId}>
                  <SelectTrigger id="resolving-doc"><SelectValue placeholder="Select a document on this load" /></SelectTrigger>
                  <SelectContent>
                    {documents.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {`${formatEnumLabel(d.document_type)} — ${d.document_name || 'Untitled'}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No documents are attached to this load yet. Upload one first.
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="resolution-notes">Resolution notes <span className="text-destructive">*</span></Label>
            <Textarea
              id="resolution-notes" rows={3} value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why this outcome was chosen"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || notesMissing || docMissing}>
            {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Resolution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
