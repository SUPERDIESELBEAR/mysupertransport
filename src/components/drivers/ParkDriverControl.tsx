import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import {
  canSubmitPark, formatParkedReturn, PARKED_REASONS, parkedReasonLabel,
  type ParkedReason,
} from '@/lib/parking';

export interface ParkedFields {
  is_parked: boolean;
  parked_reason: string | null;
  parked_note: string | null;
  parked_expected_return: string | null;
  parked_at: string | null;
}

interface Props {
  operatorId: string;
  operatorName: string;
  value: ParkedFields;
  onChanged: (next: ParkedFields) => void;
  /** Dispatch, management or owner. */
  canEdit: boolean;
}

/**
 * The control that should have existed. Parking keeps the driver ACTIVE:
 * equipment stays assigned, the R&M deposit keeps building, settlements run.
 * It writes nothing to lease_terminations and nothing to dispatch_status.
 */
export default function ParkDriverControl({
  operatorId, operatorName, value, onChanged, canEdit,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState<ParkedReason | ''>('');
  const [note, setNote] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');

  useEffect(() => {
    if (open) { setReason(''); setNote(''); setExpectedReturn(''); }
  }, [open]);

  const park = async () => {
    if (!canSubmitPark(reason || null, note)) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_operator_parked', {
        _operator_id: operatorId,
        _reason: reason as ParkedReason,
        _note: note.trim() || null,
        _expected_return: expectedReturn || null,
      } as never);
      if (error) throw error;
      onChanged({
        is_parked: true,
        parked_reason: reason as string,
        parked_note: note.trim() || null,
        parked_expected_return: expectedReturn || null,
        parked_at: new Date().toISOString(),
      });
      setOpen(false);
      toast({
        title: `${operatorName} is parked`,
        description: 'Still active — equipment stays assigned and settlements run normally.',
      });
    } catch (err: any) {
      toast({ title: 'Could not park driver', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const unpark = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('clear_operator_parked', {
        _operator_id: operatorId,
        _note: null,
      } as never);
      if (error) throw error;
      onChanged({
        is_parked: false,
        parked_reason: null,
        parked_note: null,
        parked_expected_return: null,
        parked_at: null,
      });
      toast({ title: `${operatorName} is back on dispatch` });
    } catch (err: any) {
      toast({ title: 'Could not unpark driver', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="park-driver-control">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Parked (temporarily unavailable)</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Truck down, vacation, time off, medical. The driver stays active, keeps equipment,
            and settlements run normally. This is not a termination.
          </p>
        </div>
        {value.is_parked ? (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={!canEdit || saving} onClick={unpark}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Unpark
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={!canEdit} onClick={() => setOpen(true)}>
            <PauseCircle className="h-3.5 w-3.5" />
            Park Driver
          </Button>
        )}
      </div>

      {value.is_parked && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          <span className="font-medium">{parkedReasonLabel(value.parked_reason)}</span>
          {' · '}
          {formatParkedReturn(value.parked_expected_return)
            ? `expected back ${formatParkedReturn(value.parked_expected_return)}`
            : 'return date unknown'}
          {value.parked_note ? <div className="mt-1 text-muted-foreground">{value.parked_note}</div> : null}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => (saving ? null : setOpen(v))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Park {operatorName}</DialogTitle>
            <DialogDescription>
              Marks this driver as temporarily unavailable. They stay active and keep their equipment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ParkedReason)}>
                <SelectTrigger data-testid="park-reason-trigger">
                  <SelectValue placeholder="Choose a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {PARKED_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{parkedReasonLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Expected return <span className="normal-case">(leave blank if unknown)</span>
              </Label>
              <Input
                type="date"
                data-testid="park-expected-return"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Note {reason === 'other' ? <span className="text-destructive">*</span> : '(optional)'}
              </Label>
              <Textarea
                data-testid="park-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. engine rebuild at Peterbilt Kansas City"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={park} disabled={saving || !canSubmitPark(reason || null, note)} data-testid="park-confirm">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Park Driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
