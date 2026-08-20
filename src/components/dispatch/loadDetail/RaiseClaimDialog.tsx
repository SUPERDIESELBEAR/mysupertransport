import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { manageClaimFlag } from '@/lib/loadDetail';
import { CLAIM_TYPES, CLAIM_TYPE_LABELS, type ClaimType } from './claimConstants';

type NewLevel = 'watch' | 'hold';

const LEVELS: { value: NewLevel; label: string; help: string }[] = [
  { value: 'watch', label: 'Watch', help: 'Track the claim. Settlement is not affected.' },
  { value: 'hold', label: 'Hold', help: 'Stop settlement on this load until the claim is resolved.' },
];

export default function RaiseClaimDialog({
  loadId, open, onOpenChange, onSaved,
}: {
  loadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const [level, setLevel] = useState<NewLevel>('watch');
  const [claimType, setClaimType] = useState<ClaimType | ''>('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [estimated, setEstimated] = useState('');
  const [docUrl, setDocUrl] = useState('');

  const mutation = useMutation({
    mutationFn: () => manageClaimFlag({
      action: 'raise',
      loadId,
      flagLevel: level,
      claimType: claimType as ClaimType,
      description,
      reportedByContact: contact,
      estimatedAmount: estimated.trim() ? Number(estimated) : null,
      documentationUrl: docUrl,
    }),
    onSuccess: async () => {
      await onSaved();
      toast({ title: level === 'hold' ? 'Hold placed on this load' : 'Claim raised' });
      onOpenChange(false);
    },
    onError: (err) => {
      logDbError('manageClaimFlag:raise', err, { loadId, level, claimType });
      toast({
        title: 'Could not raise the claim',
        description: getDbErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const invalidAmount = estimated.trim() !== '' && !Number.isFinite(Number(estimated));
  const disabled = mutation.isPending || !claimType || !description.trim() || invalidAmount;

  return (
    <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a Claim</DialogTitle>
          <DialogDescription>Record a claim or hold against this load.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Flag level</Label>
            <RadioGroup value={level} onValueChange={v => setLevel(v as NewLevel)} className="space-y-2">
              {LEVELS.map(l => (
                <label key={l.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                  <RadioGroupItem value={l.value} id={`level-${l.value}`} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">{l.help}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {level === 'hold' ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                A hold excludes this load from settlement until the claim is resolved. The driver will not be
                paid for it while the hold is active.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="claim-type">Claim type <span className="text-destructive">*</span></Label>
            <Select value={claimType} onValueChange={v => setClaimType(v as ClaimType)}>
              <SelectTrigger id="claim-type"><SelectValue placeholder="Select a claim type" /></SelectTrigger>
              <SelectContent>
                {CLAIM_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{CLAIM_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim-description">Description <span className="text-destructive">*</span></Label>
            <Textarea
              id="claim-description" rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What happened, and what the broker is claiming"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="claim-contact">Reported by (broker contact)</Label>
              <Input
                id="claim-contact" value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="Name, phone or email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-estimate">Estimated claim amount</Label>
              <Input
                id="claim-estimate" inputMode="decimal" value={estimated}
                onChange={e => setEstimated(e.target.value)}
                placeholder="0.00"
              />
              {invalidAmount ? (
                <p className="text-xs text-destructive">Enter a valid dollar amount.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim-doc">Documentation URL</Label>
            <Input
              id="claim-doc" value={docUrl}
              onChange={e => setDocUrl(e.target.value)}
              placeholder="Link to claim paperwork"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={disabled}>
            {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Raise Claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
