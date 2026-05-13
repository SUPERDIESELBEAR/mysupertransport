import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { createGoodFaithEffort } from '@/lib/pei/api';
import { GFE_REASON_LABEL, type PEIGFEReason } from '@/lib/pei/types';

interface Props {
  open: boolean;
  requestId: string;
  employerName: string;
  onClose: () => void;
  onDone: () => void;
}

export function GFEModal({ open, requestId, employerName, onClose, onDone }: Props) {
  const { user, profile } = useAuth();
  const [reason, setReason] = useState<PEIGFEReason>('no_response');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (reason === 'other' && !other.trim()) {
      toast.error('Please describe the reason.');
      return;
    }
    if (!user?.id) return;
    setBusy(true);
    try {
      const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Staff';
      await createGoodFaithEffort(requestId, reason, reason === 'other' ? other : null, user.id, name);
      toast.success(`Good Faith Effort documented for ${employerName}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to document GFE');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document Good Faith Effort</DialogTitle>
          <DialogDescription>Previous Employer: {employerName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium">Reason</Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as PEIGFEReason)} className="mt-2 space-y-2">
              {(Object.keys(GFE_REASON_LABEL) as PEIGFEReason[]).map((k) => (
                <div key={k} className="flex items-start gap-2">
                  <RadioGroupItem value={k} id={`gfe-${k}`} className="mt-1" />
                  <Label htmlFor={`gfe-${k}`} className="text-sm font-normal cursor-pointer">
                    {GFE_REASON_LABEL[k]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {reason === 'other' && (
            <div>
              <Label htmlFor="gfe-other" className="text-sm">Please describe</Label>
              <Textarea id="gfe-other" value={other} onChange={(e) => setOther(e.target.value)} rows={3} className="mt-1" />
            </div>
          )}
          <p className="text-xs text-muted-foreground border-t pt-3">
            Documented by {`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Staff'} on {new Date().toLocaleDateString()}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Document Good Faith Effort
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}