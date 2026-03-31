import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RotateCcw } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import type { EquipmentItem } from './EquipmentInventory';
import { DEVICE_CONFIG_LABELS } from './equipmentUtils';

type ReturnCondition = 'available' | 'damaged' | 'lost';

interface Props {
  open: boolean;
  item: EquipmentItem | null;
  isManagement: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const CONDITIONS: { value: ReturnCondition; label: string; description: string; mgmtOnly?: boolean }[] = [
  { value: 'available', label: 'Good — Available to Reissue', description: 'Device returned in working condition, ready for the next operator.' },
  { value: 'damaged',   label: 'Damaged / Needs Repair',       description: 'Device returned but requires inspection or repair before reissue.', mgmtOnly: true },
  { value: 'lost',      label: 'Lost / Not Returned',          description: 'Device was not returned by the operator.', mgmtOnly: true },
];

export default function EquipmentReturnModal({ open, item, isManagement, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [condition, setCondition] = useState<ReturnCondition>('available');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReturn = async () => {
    if (guardDemo()) return;
    if (!item) return;
    // Block staff from setting damaged/lost
    if (!isManagement && (condition === 'damaged' || condition === 'lost')) {
      toast({ title: 'Only management can mark as Damaged or Lost', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // 1. Close the current open assignment
      if (item.current_assignment_id) {
        const { error: assignErr } = await supabase
          .from('equipment_assignments')
          .update({
            returned_at: new Date().toISOString(),
            return_condition: condition,
            notes: notes.trim() || null,
          })
          .eq('id', item.current_assignment_id);
        if (assignErr) throw assignErr;
      }

      // 2. Update item status
      const { error: itemErr } = await supabase.from('equipment_items').update({ status: condition }).eq('id', item.id);
      if (itemErr) throw itemErr;

      // 3. Clear the Stage 5 field on the operator's onboarding_status
      const fieldMap: Record<string, string> = {
        eld:       'eld_serial_number',
        dash_cam:  'dash_cam_number',
        bestpass:  'bestpass_number',
        fuel_card: 'fuel_card_number',
      };
      const field = fieldMap[item.device_type];
      if (field && item.current_assignment_id) {
        const { data: assignment } = await supabase
          .from('equipment_assignments')
          .select('operator_id')
          .eq('id', item.current_assignment_id)
          .single();
        if (assignment) {
          const { error: clearErr } = await supabase
            .from('onboarding_status')
            .update({ [field]: null })
            .eq('operator_id', assignment.operator_id);
          if (clearErr) throw clearErr;
        }
      }

      const conditionLabel = CONDITIONS.find(c => c.value === condition)?.label ?? condition;
      toast({ title: '✅ Return recorded', description: `${DEVICE_CONFIG_LABELS[item.device_type]} ${item.serial_number} — ${conditionLabel}` });
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({ title: 'Return failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const availableConditions = CONDITIONS.filter(c => isManagement || !c.mgmtOnly);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-status-complete" />
            Record Equipment Return
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm mb-1 space-y-0.5">
            <div>
              <span className="text-muted-foreground">{DEVICE_CONFIG_LABELS[item.device_type]}:</span>{' '}
              <span className="font-mono font-semibold">{item.serial_number}</span>
            </div>
            {item.current_operator_name && (
              <div className="text-muted-foreground text-xs">
                Currently assigned to: <span className="text-foreground font-medium">{item.current_operator_name}</span>
              </div>
            )}
          </div>
        )}
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Return Condition</Label>
            <div className="space-y-2">
              {availableConditions.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCondition(c.value)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    condition === c.value
                      ? c.value === 'available' ? 'border-status-complete/50 bg-status-complete/10' :
                        c.value === 'damaged' ? 'border-warning/50 bg-warning/10' :
                        'border-destructive/50 bg-destructive/10'
                      : 'border-border hover:border-primary/30 bg-background'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    condition === c.value
                      ? c.value === 'available' ? 'text-status-complete' :
                        c.value === 'damaged' ? 'text-warning' : 'text-destructive'
                      : 'text-foreground'
                  }`}>{c.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                </button>
              ))}
              {!isManagement && (
                <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                  ⚠️ Damaged and Lost statuses require management access.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Return notes, condition details..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleReturn} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DemoLockIcon />}
            Record Return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
