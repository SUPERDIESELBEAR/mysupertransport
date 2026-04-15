import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { EquipmentItem, DeviceType, EquipmentStatus } from './EquipmentInventory';

interface Props {
  open: boolean;
  item?: EquipmentItem | null;
  isManagement: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
  { value: 'eld',       label: 'ELD' },
  { value: 'dash_cam',  label: 'Dash Cam' },
  { value: 'bestpass',  label: 'BestPass' },
  { value: 'fuel_card', label: 'Fuel Card' },
];

const STATUSES: { value: EquipmentStatus; label: string; mgmtOnly?: boolean }[] = [
  { value: 'available', label: 'Available' },
  { value: 'assigned',  label: 'Assigned' },
  { value: 'damaged',   label: 'Damaged / Needs Repair', mgmtOnly: true },
  { value: 'lost',      label: 'Lost / Not Returned',    mgmtOnly: true },
];

export default function EquipmentItemModal({ open, item, isManagement, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>('eld');
  const [serialNumber, setSerialNumber] = useState('');
  const [status, setStatus] = useState<EquipmentStatus>('available');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (item) {
      setDeviceType(item.device_type);
      setSerialNumber(item.serial_number);
      setStatus(item.status);
      setNotes(item.notes ?? '');
    } else {
      setDeviceType('eld');
      setSerialNumber('');
      setStatus('available');
      setNotes('');
    }
  }, [item, open]);

  const handleSave = async () => {
    if (!serialNumber.trim()) {
      toast({ title: 'Serial number is required', variant: 'destructive' });
      return;
    }
    // Block non-management from setting damaged/lost
    if (!isManagement && (status === 'damaged' || status === 'lost')) {
      toast({ title: 'Only management can set Damaged or Lost status', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // Duplicate serial+type guard
    const normalizedSerial = serialNumber.trim().toUpperCase();
    let dupQuery = supabase
      .from('equipment_items')
      .select('id')
      .eq('device_type', deviceType)
      .ilike('serial_number', normalizedSerial);
    if (item) dupQuery = dupQuery.neq('id', item.id);
    const { data: dupRows } = await dupQuery.limit(1);
    if (dupRows && dupRows.length > 0) {
      const label = DEVICE_TYPES.find(t => t.value === deviceType)?.label ?? deviceType;
      toast({ title: `A ${label} with serial ${normalizedSerial} already exists`, variant: 'destructive' });
      setSaving(false);
      return;
    }

    const payload = {
      device_type: deviceType,
      serial_number: normalizedSerial,
      status,
      notes: notes.trim() || null,
    };
    let error;
    if (item) {
      ({ error } = await supabase.from('equipment_items').update(payload).eq('id', item.id));
    } else {
      ({ error } = await supabase.from('equipment_items').insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: item ? '✅ Device updated' : '✅ Device added' });
    onSaved();
    onClose();
  };

  const availableStatuses = STATUSES.filter(s => isManagement || !s.mgmtOnly);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Device' : 'Add New Device'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Device Type</Label>
            <Select value={deviceType} onValueChange={v => setDeviceType(v as DeviceType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Serial / ID Number
              {deviceType === 'fuel_card' && (
                <span className="text-xs text-muted-foreground ml-2">(3 digits)</span>
              )}
            </Label>
            <Input
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              placeholder={deviceType === 'fuel_card' ? 'e.g. 123' : 'e.g. ELD-A1B2C3D4'}
              maxLength={deviceType === 'fuel_card' ? 3 : 20}
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as EquipmentStatus)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isManagement && (
              <p className="text-xs text-muted-foreground">
                Damaged and Lost statuses require management access.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this device..."
              className="min-h-[70px] resize-none text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {item ? 'Save Changes' : 'Add Device'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
