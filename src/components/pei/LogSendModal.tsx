import { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, CalendarClock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logManualSend } from '@/lib/pei/api';
import { SEND_METHOD_LABEL, type PEISendMethod } from '@/lib/pei/types';

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
    .refine((d) => new Date(`${d}T12:00:00`) <= new Date(), 'Date cannot be in the future'),
  method: z.enum(['email_external', 'fax', 'mail', 'phone']),
  note: z.string().max(1000, 'Note must be under 1000 characters').optional(),
});

interface Props {
  open: boolean;
  requestId: string;
  employerName: string;
  /** true when the request has never been sent — logging will mark it Sent. */
  isFirstSend: boolean;
  currentDate: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function LogSendModal({
  open, requestId, employerName, isFirstSend, currentDate, onClose, onDone,
}: Props) {
  const [date, setDate] = useState(
    currentDate ? new Date(currentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [method, setMethod] = useState<PEISendMethod>('email_external');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = schema.safeParse({ date, method, note: note.trim() || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await logManualSend(
        requestId,
        new Date(`${parsed.data.date}T12:00:00`).toISOString(),
        parsed.data.method,
        parsed.data.note
      );
      toast.success(isFirstSend ? 'Send recorded — 30-day clock started' : 'Send date updated');
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to record send');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            {isFirstSend ? 'Log send' : 'Edit send date'}
          </DialogTitle>
          <DialogDescription>
            {isFirstSend
              ? `Record a PEI sent to ${employerName} outside the app. No email will be sent; the 30-day deadline starts from this date.`
              : `Correct the recorded send date for ${employerName}. The 30-day deadline is recalculated.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pei-send-date">Date sent <span className="text-destructive">*</span></Label>
            <Input
              id="pei-send-date"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Method <span className="text-destructive">*</span></Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PEISendMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SEND_METHOD_LABEL) as PEISendMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>{SEND_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pei-send-note">Note (optional)</Label>
            <Textarea
              id="pei-send-note"
              value={note}
              maxLength={1000}
              rows={3}
              placeholder="e.g. Faxed to 555-0100, confirmation received"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}