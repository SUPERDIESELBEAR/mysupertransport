import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Archive, AlertTriangle } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import type { EquipmentItem } from './EquipmentInventory';

interface Props {
  open: boolean;
  item: EquipmentItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function FuelCardDeactivateModal({ open, item, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const handleDeactivate = async () => {
    if (guardDemo()) return;
    if (!item) return;
    setSaving(true);
    try {
      // 1. If assigned, close the open assignment row and clear the operator's fuel_card_number
      if (item.current_assignment_id) {
        const { error: assignErr } = await supabase
          .from('equipment_assignments')
          .update({
            returned_at: new Date().toISOString(),
            return_condition: 'deactivated',
            notes: notes.trim() || null,
          })
          .eq('id', item.current_assignment_id);
        if (assignErr) throw assignErr;

        const { data: assignment } = await supabase
          .from('equipment_assignments')
          .select('operator_id')
          .eq('id', item.current_assignment_id)
          .single();
        if (assignment) {
          const { error: clearErr } = await supabase
            .from('onboarding_status')
            .update({ fuel_card_number: null })
            .eq('operator_id', assignment.operator_id);
          if (clearErr) throw clearErr;
        }
      }

      // 2. Mark the item deactivated
      const { error: itemErr } = await supabase
        .from('equipment_items')
        .update({ status: 'deactivated' })
        .eq('id', item.id);
      if (itemErr) throw itemErr;

      toast({ title: '✅ Fuel card deactivated', description: `Card ${item.serial_number} archived.` });
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Deactivation failed',
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
            <Archive className="h-4 w-4 text-muted-foreground" />
            Deactivate Fuel Card
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
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p>
              This card will be archived and can no longer be assigned to a driver. Fuel cards do
              not need to be physically returned like other equipment.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for deactivation, card status, etc..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleDeactivate} disabled={saving} variant="destructive" className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DemoLockIcon />}
            Deactivate Card
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}