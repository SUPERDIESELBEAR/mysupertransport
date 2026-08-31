import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, PackageCheck, Undo2, Truck } from 'lucide-react';
import {
  canReverse, equipmentOutstanding, equipmentShipped, formatConfirmedAt, openConfirmation,
  type EquipmentReturnConfirmation,
} from '@/lib/equipmentReceipt';

interface Props {
  operatorId: string;
  operatorName: string;
  /** Management or owner. Dispatch cannot confirm receipt; a driver never can. */
  canEdit: boolean;
}

/**
 * Management confirms that the equipment set is PHYSICALLY BACK.
 *
 * Distinct from the driver's shipment upload, which is shown here for context
 * and can never stand in for this. Confirming changes nothing else: not
 * is_active, not the lease, not dispatch status. One writer per fact.
 */
export default function EquipmentReceiptControl({ operatorId, operatorName, canEdit }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EquipmentReturnConfirmation[]>([]);
  const [shipped, setShipped] = useState(false);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: confs }, { data: receipts }] = await Promise.all([
      supabase
        .from('equipment_return_confirmations')
        .select('id, operator_id, confirmed_at, confirmed_by, note, reversed_at, reversed_by, reversal_reason')
        .eq('operator_id', operatorId)
        .order('confirmed_at', { ascending: false }),
      supabase
        .from('equipment_receipts')
        .select('id, direction')
        .eq('operator_id', operatorId),
    ]);
    const list = (confs ?? []) as unknown as EquipmentReturnConfirmation[];
    setRows(list);
    setShipped(equipmentShipped((receipts ?? []) as { direction?: string | null }[]));

    const ids = Array.from(new Set(
      list.flatMap(r => [r.confirmed_by, r.reversed_by]).filter(Boolean) as string[],
    ));
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, first_name, last_name').in('id', ids);
      setActors(Object.fromEntries(
        (profiles ?? []).map((p: { id: string; first_name?: string | null; last_name?: string | null }) =>
          [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Staff']),
      ));
    }
  }, [operatorId]);

  useEffect(() => { load(); }, [load]);

  const open = openConfirmation(rows);
  const outstanding = equipmentOutstanding(rows);

  const confirm = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('confirm_equipment_returned', {
        _operator_id: operatorId,
        _note: note.trim() || null,
      } as never);
      if (error) throw error;
      setConfirmOpen(false);
      setNote('');
      await load();
      toast({
        title: 'Equipment receipt confirmed',
        description: `${operatorName}'s equipment is recorded as physically back.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not confirm receipt',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const reverse = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('reverse_equipment_return_confirmation', {
        _operator_id: operatorId,
        _reason: reason.trim(),
      } as never);
      if (error) throw error;
      setReverseOpen(false);
      setReason('');
      await load();
      toast({ title: 'Confirmation reversed', description: 'Equipment is outstanding again.' });
    } catch (err: unknown) {
      toast({
        title: 'Could not reverse',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="equipment-receipt-control">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Equipment Receipt (management confirms)</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            A tracking number is not a returned ELD. This records that the set is physically in hand.
            Management only — the driver can never mark this. Nothing else changes: not their active
            status, not their lease, not dispatch.
          </p>
        </div>
        {outstanding ? (
          <Button
            size="sm" variant="outline" className="gap-1.5 shrink-0"
            disabled={!canEdit} onClick={() => setConfirmOpen(true)}
            data-testid="equipment-receipt-confirm-open"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Confirm Equipment Received
          </Button>
        ) : (
          <Button
            size="sm" variant="outline" className="gap-1.5 shrink-0"
            disabled={!canEdit} onClick={() => setReverseOpen(true)}
            data-testid="equipment-receipt-reverse-open"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Reverse
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className={`rounded-md px-2 py-1 text-[11px] font-medium ${
            shipped ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-muted text-muted-foreground'
          }`}
          data-testid="equipment-shipped-chip"
        >
          <Truck className="inline h-3 w-3 mr-1" />
          {shipped ? 'Shipped by driver' : 'No shipment recorded'}
        </span>
        <span
          className={`rounded-md px-2 py-1 text-[11px] font-medium ${
            outstanding
              ? 'bg-warning/15 text-foreground'
              : 'bg-status-complete/15 text-status-complete'
          }`}
          data-testid="equipment-outstanding-chip"
        >
          {outstanding ? 'Equipment outstanding' : 'Received by management'}
        </span>
      </div>

      {open && (
        <div className="rounded-lg border border-status-complete/40 bg-status-complete/10 px-3 py-2 text-xs text-foreground">
          <span className="font-medium" data-testid="equipment-receipt-stamp">
            Confirmed {formatConfirmedAt(open.confirmed_at)}
            {open.confirmed_by && actors[open.confirmed_by] ? ` by ${actors[open.confirmed_by]}` : ''}
          </span>
          {open.note ? <div className="mt-1 text-muted-foreground">{open.note}</div> : null}
        </div>
      )}

      {rows.some(r => r.reversed_at) && (
        <div className="space-y-1" data-testid="equipment-receipt-history">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
          <ul className="space-y-1">
            {rows.filter(r => r.reversed_at).map(r => (
              <li key={r.id} className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                <span className="font-medium text-foreground">Confirmation reversed</span>
                <span>{formatConfirmedAt(r.reversed_at)}</span>
                {r.reversed_by && actors[r.reversed_by] ? <span>· by {actors[r.reversed_by]}</span> : null}
                {r.reversal_reason ? <span>· {r.reversal_reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(v) => (saving ? null : setConfirmOpen(v))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm {operatorName}'s equipment is back</DialogTitle>
            <DialogDescription>
              Records that you physically have the equipment set. This does not deactivate the driver,
              end the lease or change dispatch. Reversible if confirmed in error.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Note <span className="normal-case">(optional — partial or damaged returns)</span>
            </Label>
            <Textarea
              data-testid="equipment-receipt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. ELD and plate received, dash cam mount cracked"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={saving} onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={confirm} data-testid="equipment-receipt-confirm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Received
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reverseOpen} onOpenChange={(v) => (saving ? null : setReverseOpen(v))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse the receipt confirmation</DialogTitle>
            <DialogDescription>
              Equipment goes back to outstanding. The reversal is recorded with your name and reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reason (required)</Label>
            <Textarea
              data-testid="equipment-receipt-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. confirmed against the wrong driver"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={saving} onClick={() => setReverseOpen(false)}>Cancel</Button>
            <Button
              disabled={saving || !canReverse(reason)}
              onClick={reverse}
              data-testid="equipment-receipt-reverse"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reverse Confirmation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
