import { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Archive, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { archiveApplicant } from '@/lib/pei/api';

const REASONS = [
  'Applicant withdrew',
  'Did not onboard with SUPERTRANSPORT',
  'Hired elsewhere',
  'Duplicate record',
] as const;

const schema = z.string().trim().min(1, 'A reason is required').max(500, 'Reason is too long');

interface Props {
  open: boolean;
  applicationId: string;
  applicantName: string;
  requestCount: number;
  onClose: () => void;
  onDone: () => void;
}

export function ArchiveApplicantDialog({
  open, applicationId, applicantName, requestCount, onClose, onDone,
}: Props) {
  const [choice, setChoice] = useState<string>(REASONS[0]);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);

  const isOther = choice === 'Other';

  async function handleArchive() {
    const reason = isOther ? other : choice;
    const parsed = schema.safeParse(reason);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await archiveApplicant(applicationId, parsed.data);
      toast.success(`${applicantName} archived — automated follow-ups stopped`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to archive applicant');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Archive {applicantName}
          </DialogTitle>
          <DialogDescription>
            Moves all {requestCount} previous employment {requestCount === 1 ? 'investigation' : 'investigations'} out
            of the active queue and stops all automated follow-ups and auto-GFEs. This can be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Reason <span className="text-destructive">*</span></Label>
          <RadioGroup value={choice} onValueChange={setChoice} className="space-y-2">
            {[...REASONS, 'Other'].map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`archive-${r}`} />
                <Label htmlFor={`archive-${r}`} className="font-normal cursor-pointer">{r}</Label>
              </div>
            ))}
          </RadioGroup>
          {isOther && (
            <Textarea
              value={other}
              maxLength={500}
              rows={3}
              placeholder="Describe the reason"
              onChange={(e) => setOther(e.target.value)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleArchive} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Archive applicant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}