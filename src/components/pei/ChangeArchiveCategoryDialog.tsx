import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Tag } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { updateArchiveCategory } from '@/lib/pei/api';
import type { PEIArchiveCategory } from '@/lib/pei/types';
import { ARCHIVE_CATEGORY_LABEL } from '@/lib/pei/types';

interface Props {
  open: boolean;
  applicationId: string;
  applicantName: string;
  current: PEIArchiveCategory;
  onClose: () => void;
  onDone: () => void;
}

export function ChangeArchiveCategoryDialog({
  open, applicationId, applicantName, current, onClose, onDone,
}: Props) {
  const [category, setCategory] = useState<PEIArchiveCategory>(current);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const unchanged = category === current;

  async function handleSave() {
    setSaving(true);
    try {
      await updateArchiveCategory(applicationId, category, note);
      toast.success(`${applicantName} moved to ${ARCHIVE_CATEGORY_LABEL[category]}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to change archive type');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Change archive type
          </DialogTitle>
          <DialogDescription>
            {applicantName} is currently archived as{' '}
            <strong>{ARCHIVE_CATEGORY_LABEL[current]}</strong>. The change is recorded in the
            audit history with your name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <Label>Archive type <span className="text-destructive">*</span></Label>
            <RadioGroup
              value={category}
              onValueChange={(v) => setCategory(v as PEIArchiveCategory)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="not_hired" id="change-not-hired" />
                <Label htmlFor="change-not-hired" className="font-normal cursor-pointer">Not Hired</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="hired" id="change-hired" />
                <Label htmlFor="change-hired" className="font-normal cursor-pointer">Hired</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="change-note">Audit note (optional)</Label>
            <Textarea
              id="change-note"
              value={note}
              maxLength={500}
              rows={3}
              placeholder="Why is this being changed?"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || unchanged}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
