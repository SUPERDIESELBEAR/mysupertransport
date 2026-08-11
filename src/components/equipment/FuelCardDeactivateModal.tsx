import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Archive, AlertTriangle } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import { archiveEquipmentItem } from '@/lib/equipmentSync';
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
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) { setNotes(''); setConfirming(false); }
  }, [open]);

  const handleDeactivate = async () => {
    if (guardDemo()) return;
    if (!item) return;
    if (!confirming) { setConfirming(true); return; }
    setSaving(true);
    try {
      // Shared with the Edit Device danger zone so both behave identically.
      await archiveEquipmentItem(item, notes);

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
          {confirming && item && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground">
              This will archive card <span className="font-mono font-semibold">{item.serial_number}</span>
              {item.current_operator_name ? <> and clear it from <span className="font-semibold">{item.current_operator_name}</span>'s record</> : ''}. Continue?
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={confirming ? () => setConfirming(false) : onClose} disabled={saving}>
            {confirming ? 'Go Back' : 'Cancel'}
          </Button>
          <Button onClick={handleDeactivate} disabled={saving} variant="destructive" className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DemoLockIcon />}
            {confirming ? 'Yes, Deactivate' : 'Deactivate Card'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}