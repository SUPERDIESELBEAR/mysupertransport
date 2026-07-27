import { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Archive, CalendarClock, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { archiveApplicant, logManualSend, runBulk } from '@/lib/pei/api';
import {
  ARCHIVE_CATEGORY_LABEL, SEND_METHOD_LABEL,
  type PEIArchiveCategory, type PEISendMethod,
} from '@/lib/pei/types';

const REASONS = [
  'Applicant withdrew',
  'Did not onboard with SUPERTRANSPORT',
  'Hired elsewhere',
  'Duplicate record',
] as const;

const reasonSchema = z.string().trim().min(1, 'A reason is required').max(500, 'Reason is too long');

function reportBulk(result: { ok: number; failed: number; firstError?: string }, verb: string) {
  if (result.failed === 0) {
    toast.success(`${result.ok} ${result.ok === 1 ? 'record' : 'records'} ${verb}`);
  } else {
    toast.error(`${result.ok} ${verb}, ${result.failed} failed — ${result.firstError ?? 'unknown error'}`);
  }
}

interface BulkArchiveProps {
  open: boolean;
  applicationIds: string[];
  onClose: () => void;
  onDone: () => void;
}

export function BulkArchiveDialog({ open, applicationIds, onClose, onDone }: BulkArchiveProps) {
  const [choice, setChoice] = useState<string>(REASONS[0]);
  const [other, setOther] = useState('');
  const [category, setCategory] = useState<PEIArchiveCategory>('hired');
  const [saving, setSaving] = useState(false);
  const isOther = choice === 'Other';
  const count = applicationIds.length;

  async function handleArchive() {
    const parsed = reasonSchema.safeParse(isOther ? other : choice);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const result = await runBulk(applicationIds, (id) =>
        archiveApplicant(id, parsed.data, category)
      );
      reportBulk(result, `archived as ${ARCHIVE_CATEGORY_LABEL[category]}`);
      onDone();
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
            Archive {count} {count === 1 ? 'applicant' : 'applicants'}
          </DialogTitle>
          <DialogDescription>
            Moves every investigation for the selected applicants out of the active queue and stops all
            automated follow-ups and auto-GFEs. This can be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <Label>Archive category <span className="text-destructive">*</span></Label>
            <RadioGroup value={category} onValueChange={(v) => setCategory(v as PEIArchiveCategory)} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="not_hired" id="bulk-archive-not-hired" />
                <Label htmlFor="bulk-archive-not-hired" className="font-normal cursor-pointer">Not Hired</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="hired" id="bulk-archive-hired" />
                <Label htmlFor="bulk-archive-hired" className="font-normal cursor-pointer">Hired</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <RadioGroup value={choice} onValueChange={setChoice} className="space-y-2">
              {[...REASONS, 'Other'].map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`bulk-archive-${r}`} />
                  <Label htmlFor={`bulk-archive-${r}`} className="font-normal cursor-pointer">{r}</Label>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleArchive} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Archive {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const sendSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
    .refine((d) => new Date(`${d}T12:00:00`) <= new Date(), 'Date cannot be in the future'),
  method: z.enum(['email_external', 'fax', 'mail', 'phone']),
  note: z.string().max(1000, 'Note must be under 1000 characters').optional(),
});

interface BulkSendProps {
  open: boolean;
  /** pei_request ids that are still unresolved. */
  requestIds: string[];
  applicantCount: number;
  onClose: () => void;
  onDone: () => void;
}

export function BulkSendDateDialog({ open, requestIds, applicantCount, onClose, onDone }: BulkSendProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PEISendMethod>('email_external');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = sendSchema.safeParse({ date, method, note: note.trim() || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const iso = new Date(`${parsed.data.date}T12:00:00`).toISOString();
      const result = await runBulk(requestIds, (id) =>
        logManualSend(id, iso, parsed.data.method, parsed.data.note)
      );
      reportBulk(result, 'updated');
      onDone();
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
            Update send date &amp; note
          </DialogTitle>
          <DialogDescription>
            Applies to {requestIds.length} unresolved {requestIds.length === 1 ? 'investigation' : 'investigations'} across{' '}
            {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}. No emails are sent; each 30-day deadline
            is recalculated from this date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-send-date">Date sent <span className="text-destructive">*</span></Label>
            <Input
              id="bulk-send-date"
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
            <Label htmlFor="bulk-send-note">Note (optional)</Label>
            <Textarea
              id="bulk-send-note"
              value={note}
              maxLength={1000}
              rows={3}
              placeholder="e.g. Batch mailed 3/14, certified mail"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || requestIds.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save for {requestIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}