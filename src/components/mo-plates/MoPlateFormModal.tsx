import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export type MoPlate = {
  id: string;
  plate_number: string;
  registration_number: string | null;
  notes: string | null;
  status: 'available' | 'assigned' | 'lost_stolen' | 'retired';
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  plate?: MoPlate | null;
}

export default function MoPlateFormModal({ open, onClose, onSaved, plate }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    plate_number: '',
    registration_number: '',
    notes: '',
    status: 'available' as MoPlate['status'],
  });

  useEffect(() => {
    if (plate) {
      setForm({
        plate_number: plate.plate_number,
        registration_number: plate.registration_number ?? '',
        notes: plate.notes ?? '',
        status: plate.status,
      });
    } else {
      setForm({ plate_number: '', registration_number: '', notes: '', status: 'available' });
    }
  }, [plate, open]);

  const handleSave = async () => {
    if (!form.plate_number.trim()) {
      toast({ title: 'Plate number required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        plate_number: form.plate_number.trim().toUpperCase(),
        registration_number: form.registration_number.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };
      if (plate) {
        const { error } = await supabase.from('mo_plates').update(payload).eq('id', plate.id);
        if (error) throw error;
        toast({ title: 'Plate updated' });
      } else {
        const { error } = await supabase.from('mo_plates').insert(payload);
        if (error) throw error;
        toast({ title: 'Plate added' });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{plate ? 'Edit Plate Record' : 'Add MO Plate'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Plate Number <span className="text-destructive">*</span></Label>
            <Input
              className="mt-1 font-mono uppercase"
              placeholder="e.g. AB1234"
              value={form.plate_number}
              onChange={e => setForm(f => ({ ...f, plate_number: e.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <Label>MO Registration Number</Label>
            <Input
              className="mt-1"
              placeholder="Optional registration #"
              value={form.registration_number}
              onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as MoPlate['status'] }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="lost_stolen">Lost / Stolen</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1 resize-none"
              rows={3}
              placeholder="Optional notes…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {plate ? 'Save Changes' : 'Add Plate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
