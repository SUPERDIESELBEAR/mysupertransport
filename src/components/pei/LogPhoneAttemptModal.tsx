import { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { logPhoneAttempt } from '@/lib/pei/api';

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
    .refine((d) => new Date(`${d}T12:00:00`) <= new Date(), 'Date cannot be in the future'),
  spokeWith: z.string().trim().max(200, 'Name is too long'),
  outcome: z.string().trim().min(1, 'Describe the outcome').max(1000, 'Outcome is too long'),
});

interface Props {
  open: boolean;
  requestId: string;
  employerName: string;
  onClose: () => void;
  onDone: () => void;
}

/** Documents a phone follow-up attempt — counts toward good-faith effort. */
export function LogPhoneAttemptModal({ open, requestId, employerName, onClose, onDone }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [spokeWith, setSpokeWith] = useState('');
  const [outcome, setOutcome] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = schema.safeParse({ date, spokeWith, outcome });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await logPhoneAttempt(
        requestId,
        new Date(`${parsed.data.date}T12:00:00`).toISOString(),
        parsed.data.spokeWith,
        parsed.data.outcome
      );
      toast.success('Phone attempt logged');
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to log attempt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Log phone attempt
          </DialogTitle>
          <DialogDescription>
            Documents a call to {employerName} on the request timeline as good-faith effort.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pei-call-date">Date <span className="text-destructive">*</span></Label>
            <Input
              id="pei-call-date"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pei-call-who">Spoke with</Label>
            <Input
              id="pei-call-who"
              value={spokeWith}
              maxLength={200}
              placeholder="e.g. Dana in HR, or left voicemail"
              onChange={(e) => setSpokeWith(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pei-call-outcome">Outcome <span className="text-destructive">*</span></Label>
            <Textarea
              id="pei-call-outcome"
              rows={3}
              maxLength={1000}
              value={outcome}
              placeholder="e.g. Said they would fax the form back this week"
              onChange={(e) => setOutcome(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Log attempt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}