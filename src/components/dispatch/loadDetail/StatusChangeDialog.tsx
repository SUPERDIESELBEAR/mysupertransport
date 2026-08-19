import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import { formatEnumLabel, type LoadStatus } from '@/lib/loadFormat';
import { classifyTransition, noteReason, requiresNote, TRANSITION_LABELS } from '@/lib/loadStatusFlow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: LoadStatus;
  targetStatus: LoadStatus | null;
  submitting: boolean;
  onConfirm: (note: string | null) => void;
}

export default function StatusChangeDialog({
  open, onOpenChange, currentStatus, targetStatus, submitting, onConfirm,
}: Props) {
  const [note, setNote] = useState('');

  useEffect(() => { if (open) setNote(''); }, [open, targetStatus]);

  if (!targetStatus) return null;

  const kind = classifyTransition(currentStatus, targetStatus);
  const needsNote = requiresNote(currentStatus, targetStatus);
  const reason = noteReason(currentStatus, targetStatus);
  const canConfirm = !submitting && (!needsNote || note.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => (submitting ? null : onOpenChange(v))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change load status</DialogTitle>
          <DialogDescription>{TRANSITION_LABELS[kind]}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <LoadStatusBadge status={currentStatus} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <LoadStatusBadge status={targetStatus} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status-change-note">
            Note {needsNote ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
          </Label>
          <Textarea
            id="status-change-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={needsNote ? 'Explain why this change is being made…' : 'Add context for this change…'}
          />
          {reason ? <p className="text-xs text-muted-foreground">{reason}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(note.trim() ? note.trim() : null)} disabled={!canConfirm}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Mark {formatEnumLabel(targetStatus)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
