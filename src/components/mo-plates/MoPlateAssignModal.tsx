import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { MoPlate } from './MoPlateFormModal';
import { useAuth } from '@/hooks/useAuth';

type OperatorOption = {
  id: string;
  name: string;
  unit_number: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  plate: MoPlate | null;
}

export default function MoPlateAssignModal({ open, onClose, onSaved, plate }: Props) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedOperatorId('');
    setUnitNumber('');
    setNotes('');
    fetchOperators();
  }, [open]);

  // Auto-fill unit number when operator is selected
  useEffect(() => {
    const op = operators.find(o => o.id === selectedOperatorId);
    if (op?.unit_number) setUnitNumber(op.unit_number);
  }, [selectedOperatorId, operators]);

  const fetchOperators = async () => {
    setLoadingOps(true);
    const { data } = await supabase
      .from('operators')
      .select('id, unit_number, onboarding_status(unit_number), applications(first_name, last_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const opts: OperatorOption[] = (data ?? []).map((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator';
      const unit = os?.unit_number ?? op.unit_number ?? null;
      return { id: op.id, name, unit_number: unit };
    });
    setOperators(opts);
    setLoadingOps(false);
  };

  const handleAssign = async () => {
    if (!plate || !selectedOperatorId) {
      toast({ title: 'Select a driver', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const op = operators.find(o => o.id === selectedOperatorId);
      const driverName = op?.name ?? 'Unknown Driver';

      // 1. Close any open assignment for this plate
      await supabase
        .from('mo_plate_assignments')
        .update({ returned_at: new Date().toISOString(), returned_by: session?.user?.id ?? null })
        .eq('plate_id', plate.id)
        .is('returned_at', null)
        .eq('event_type', 'assignment');

      // 2. Insert new assignment
      const { error } = await supabase.from('mo_plate_assignments').insert({
        plate_id: plate.id,
        operator_id: selectedOperatorId,
        driver_name: driverName,
        unit_number: unitNumber.trim() || null,
        event_type: 'assignment',
        notes: notes.trim() || null,
        assigned_by: session?.user?.id ?? null,
      });
      if (error) throw error;

      // 3. Update plate status to assigned
      await supabase.from('mo_plates').update({ status: 'assigned' }).eq('id', plate.id);

      toast({ title: 'Plate assigned', description: `${plate.plate_number} → ${driverName}` });
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!plate) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Plate <span className="font-mono">{plate.plate_number}</span></DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Driver / Operator <span className="text-destructive">*</span></Label>
            <Select value={selectedOperatorId} onValueChange={setSelectedOperatorId} disabled={loadingOps}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={loadingOps ? 'Loading…' : 'Select a driver'} />
              </SelectTrigger>
              <SelectContent>
                {operators.map(op => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.name}{op.unit_number ? ` — Unit #${op.unit_number}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Unit Number <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Input
              className="mt-1"
              placeholder="e.g. 142"
              value={unitNumber}
              onChange={e => setUnitNumber(e.target.value)}
            />
          </div>
          <div>
            <Label>Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Textarea
              className="mt-1 resize-none"
              rows={2}
              placeholder="e.g. Assigned at orientation"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving || !selectedOperatorId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Assign Plate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
