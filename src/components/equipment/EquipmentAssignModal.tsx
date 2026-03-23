import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserCheck } from 'lucide-react';
import type { EquipmentItem } from './EquipmentInventory';
import { DEVICE_CONFIG_LABELS } from './equipmentUtils';

interface Operator {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  item: EquipmentItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EquipmentAssignModal({ open, item, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedOperator('');
    setNotes('');
    fetchOperators();
  }, [open]);

  const fetchOperators = async () => {
    setLoadingOps(true);
    const { data } = await supabase
      .from('operators')
      .select('id, applications(first_name, last_name)')
      .order('created_at');
    if (data) {
      const ops: Operator[] = (data as any[]).map(op => {
        const app = op.applications;
        const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator';
        return { id: op.id, name };
      });
      setOperators(ops);
    }
    setLoadingOps(false);
  };

  const handleAssign = async () => {
    if (!item || !selectedOperator) {
      toast({ title: 'Please select an operator', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // 1. Create assignment record
    const { error: assignError } = await supabase.from('equipment_assignments').insert({
      equipment_id: item.id,
      operator_id: selectedOperator,
      assigned_by: user?.id ?? null,
      notes: notes.trim() || null,
    });

    if (assignError) {
      toast({ title: 'Assignment failed', description: assignError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Update item status to assigned
    await supabase.from('equipment_items').update({ status: 'assigned' }).eq('id', item.id);

    // 3. Auto-fill Stage 5 onboarding_status field
    const fieldMap: Record<string, string> = {
      eld:       'eld_serial_number',
      dash_cam:  'dash_cam_number',
      bestpass:  'bestpass_number',
      fuel_card: 'fuel_card_number',
    };
    const field = fieldMap[item.device_type];
    if (field) {
      const { data: os } = await supabase
        .from('onboarding_status')
        .select('id')
        .eq('operator_id', selectedOperator)
        .single();
      if (os) {
        await supabase
          .from('onboarding_status')
          .update({ [field]: item.serial_number })
          .eq('operator_id', selectedOperator);
      }
    }

    toast({ title: '✅ Device assigned', description: `${DEVICE_CONFIG_LABELS[item.device_type]} ${item.serial_number} assigned.` });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            Assign Device to Operator
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm mb-1">
            <span className="text-muted-foreground">{DEVICE_CONFIG_LABELS[item.device_type]}:</span>{' '}
            <span className="font-mono font-semibold">{item.serial_number}</span>
          </div>
        )}
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Assign To Operator</Label>
            {loadingOps ? (
              <div className="h-9 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading operators...
              </div>
            ) : (
              <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select operator..." />
                </SelectTrigger>
                <SelectContent>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Assignment notes..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2 border border-primary/15">
            ℹ️ This will automatically populate the device number in the operator's Stage 5 onboarding panel.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAssign} disabled={saving || !selectedOperator}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Assign Device
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
