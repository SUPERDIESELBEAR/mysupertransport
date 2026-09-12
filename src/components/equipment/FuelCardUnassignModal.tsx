import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RotateCcw, Info } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import { supabase } from '@/integrations/supabase/client';
import { updatePayload } from '@/integrations/supabase/helpers';
import { normalizeSerial } from '@/lib/equipmentSync';
import type { EquipmentItem } from './EquipmentInventory';

interface Props {
  open: boolean;
  item: EquipmentItem | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Fuel cards are never physically returned, so the generic Return modal (with
 * damaged / not-returned conditions) does not apply. Unassign simply closes the
 * driver's assignment as "Good — Available to Reissue" and puts the card back
 * into unassigned inventory. Deactivate stays the archive path.
 */
export default function FuelCardUnassignModal({ open, item, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) { setNotes(''); setConfirming(false); }
  }, [open]);

  const handleUnassign = async () => {
    if (guardDemo()) return;
    if (!item) return;
    if (!confirming) { setConfirming(true); return; }
    setSaving(true);
    try {
      // 1. Close the open assignment as returned in good condition.
      if (item.current_assignment_id) {
        const { error: assignErr } = await supabase
          .from('equipment_assignments')
          .update({
            returned_at: new Date().toISOString(),
            return_condition: 'available',
            notes: notes.trim() || null,
          })
          .eq('id', item.current_assignment_id);
        if (assignErr) throw assignErr;
      }

      // 2. Card returns to available inventory.
      const { error: itemErr } = await supabase
        .from('equipment_items')
        .update({ status: 'available' })
        .eq('id', item.id);
      if (itemErr) throw itemErr;

      // 3. Clear the Stage 5 fuel card field ONLY if it still records THIS card.
      //    Unassigning an old card must never blank a newer one: assign 224,
      //    then unassign 212, and a blind clear wipes the card the driver is
      //    actually carrying. `fuel_resolve_card` and the fuel import review
      //    queue read this value, so the damage surfaces weeks later as
      //    unmatched fuel. Compared with the same normalisation
      //    EquipmentAssignModal uses when it writes the value.
      if (item.current_assignment_id) {
        const { data: assignment, error: readErr } = await supabase
          .from('equipment_assignments')
          .select('operator_id')
          .eq('id', item.current_assignment_id)
          .single();
        if (readErr) throw readErr;
        if (assignment) {
          const { data: os, error: osErr } = await supabase
            .from('onboarding_status')
            .select('fuel_card_number')
            .eq('operator_id', assignment.operator_id)
            .maybeSingle();
          if (osErr) throw osErr;
          const recorded = normalizeSerial(os?.fuel_card_number);
          if (recorded && recorded === normalizeSerial(item.serial_number)) {
            const { error: clearErr } = await supabase
              .from('onboarding_status')
              .update(updatePayload('onboarding_status', { fuel_card_number: null }))
              .eq('operator_id', assignment.operator_id);
            if (clearErr) throw clearErr;
          }
        }
      }

      toast({
        title: '✅ Fuel card unassigned',
        description: `Card ${item.serial_number} is back in unassigned inventory.`,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Unassign failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-status-complete" />
            Unassign Fuel Card
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm mb-1 space-y-0.5">
            <div>
              <span className="text-muted-foreground">Fuel Card:</span>{' '}
              <span className="font-mono font-semibold">{item.serial_number}</span>
            </div>
            {item.current_operator_name && (
              <div className="text-muted-foreground text-xs">
                Currently assigned to:{' '}
                <span className="text-foreground font-medium">{item.current_operator_name}</span>
              </div>
            )}
          </div>
        )}
        <div className="space-y-4 py-1">
          <div className="flex gap-2 rounded-lg border border-status-complete/30 bg-status-complete/5 px-3 py-2 text-xs text-foreground">
            <Info className="h-4 w-4 text-status-complete shrink-0 mt-0.5" />
            <p>
              The card returns to Unassigned Inventory and can be issued to another driver right
              away. Use Deactivate instead if the card should be retired for good.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for unassigning, e.g. issued in error..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>
          {confirming && item && (
            <div className="rounded-lg border border-status-complete/40 bg-status-complete/10 px-3 py-2.5 text-sm text-foreground">
              This will take card <span className="font-mono font-semibold">{item.serial_number}</span>
              {item.current_operator_name ? <> off <span className="font-semibold">{item.current_operator_name}</span>'s record</> : ''} and mark it Available to Reissue. Continue?
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={confirming ? () => setConfirming(false) : onClose} disabled={saving}>
            {confirming ? 'Go Back' : 'Cancel'}
          </Button>
          <Button onClick={handleUnassign} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DemoLockIcon />}
            {confirming ? 'Yes, Unassign' : 'Unassign Card'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
