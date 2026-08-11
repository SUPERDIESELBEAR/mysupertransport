import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Archive, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import type { EquipmentItem, DeviceType, EquipmentStatus } from './EquipmentInventory';
import {
  normalizeSerial, SERIAL_DASH_MESSAGE, serialHasDash,
  archiveEquipmentItem, restoreEquipmentItem, deleteEquipmentItem,
  getDeleteEligibility, type DeleteEligibility,
} from '@/lib/equipmentSync';

interface Props {
  open: boolean;
  item?: EquipmentItem | null;
  isManagement: boolean;
  /** When adding from a device-type section, lock the type to that section. */
  defaultDeviceType?: DeviceType | null;
  onClose: () => void;
  onSaved: () => void;
}

const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
  { value: 'eld',       label: 'ELD' },
  { value: 'dash_cam',  label: 'Dash Camera' },
  { value: 'bestpass',  label: 'BestPass' },
  { value: 'fuel_card', label: 'Fuel Card' },
];

const STATUSES: { value: EquipmentStatus; label: string; mgmtOnly?: boolean }[] = [
  { value: 'available', label: 'Available' },
  { value: 'assigned',  label: 'Assigned' },
  { value: 'damaged',   label: 'Damaged / Needs Replacement', mgmtOnly: true },
  { value: 'lost',      label: 'Lost / Not Returned',    mgmtOnly: true },
  { value: 'deactivated', label: 'Archived', mgmtOnly: true },
];

export default function EquipmentItemModal({ open, item, isManagement, defaultDeviceType, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [saving, setSaving] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>('eld');
  const [serialNumber, setSerialNumber] = useState('');
  const [status, setStatus] = useState<EquipmentStatus>('available');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<null | 'archive' | 'restore' | 'delete'>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteSerialInput, setDeleteSerialInput] = useState('');
  const [eligibility, setEligibility] = useState<DeleteEligibility | null>(null);

  useEffect(() => {
    if (item) {
      setDeviceType(item.device_type);
      setSerialNumber(item.serial_number);
      setStatus(item.status);
      setNotes(item.notes ?? '');
    } else {
      setDeviceType(defaultDeviceType ?? 'eld');
      setSerialNumber('');
      setStatus('available');
      setNotes('');
    }
    setArchiveConfirm(false);
    setArchiveReason('');
    setDeleteConfirm(false);
    setDeleteSerialInput('');
    setEligibility(null);
  }, [item, open, defaultDeviceType]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !item || !isManagement) return;
    getDeleteEligibility(item.id)
      .then(e => { if (!cancelled) setEligibility(e); })
      .catch(() => { if (!cancelled) setEligibility({ allowed: false, reason: 'real_history' }); });
    return () => { cancelled = true; };
  }, [open, item, isManagement]);

  const runDanger = useCallback(async (
    kind: 'archive' | 'restore' | 'delete',
    fn: () => Promise<void>,
    successTitle: string,
  ) => {
    if (guardDemo()) return;
    setBusy(kind);
    try {
      await fn();
      toast({ title: successTitle });
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }, [guardDemo, onClose, onSaved, toast]);

  const handleSave = async () => {
    if (serialHasDash(serialNumber)) {
      toast({ title: SERIAL_DASH_MESSAGE, variant: 'destructive' });
      return;
    }
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
    const normalizedSerial = normalizeSerial(serialNumber) as string;
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
  const isArchived = item?.status === 'deactivated';
  const canDelete = isManagement && eligibility?.allowed === true;
  const deleteBlockedNote = eligibility && !eligibility.allowed
    ? 'This device has assignment history — archive it instead.'
    : null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Device' : 'Add New Device'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Device Type</Label>
            <Select
              value={deviceType}
              onValueChange={v => setDeviceType(v as DeviceType)}
              disabled={!item && !!defaultDeviceType}
            >
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
              placeholder={deviceType === 'fuel_card' ? 'e.g. 123' : 'e.g. A1B2C3D4'}
              maxLength={deviceType === 'fuel_card' ? 3 : 20}
              className="font-mono"
            />
            {serialHasDash(serialNumber) && (
              <p className="text-xs text-destructive">{SERIAL_DASH_MESSAGE}</p>
            )}
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

        {item && isManagement && (
          <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Danger zone
            </div>

            {isArchived ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  This device is archived and cannot be assigned. Restoring puts it back as Available.
                </p>
                <Button
                  variant="outline" size="sm" className="gap-1.5"
                  disabled={busy !== null}
                  onClick={() => runDanger('restore', () => restoreEquipmentItem(item), '✅ Device restored')}
                >
                  {busy === 'restore' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Restore device
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Archiving keeps the device and its full assignment history but removes it from the working
                  list. Use it for hardware that is lost, damaged beyond use, or returned to the vendor.
                </p>
                {archiveConfirm && (
                  <Textarea
                    value={archiveReason}
                    onChange={e => setArchiveReason(e.target.value)}
                    placeholder="Reason (optional) — e.g. written off, returned to vendor"
                    className="min-h-[56px] resize-none text-sm"
                  />
                )}
                <Button
                  variant="outline" size="sm" className="gap-1.5"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!archiveConfirm) { setArchiveConfirm(true); return; }
                    void runDanger('archive', () => archiveEquipmentItem(item, archiveReason), '✅ Device archived');
                  }}
                >
                  {busy === 'archive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                  {archiveConfirm ? 'Confirm archive' : 'Archive device'}
                </Button>
              </div>
            )}

            <div className="border-t border-destructive/20 pt-3 space-y-2">
              {eligibility === null ? (
                <p className="text-xs text-muted-foreground">Checking assignment history…</p>
              ) : !canDelete ? (
                <p className="text-xs text-muted-foreground">{deleteBlockedNote}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {eligibility.reason === 'demo_only'
                      ? 'This device was only ever held by demo/test drivers, so it can be removed completely. Any open assignment is released first.'
                      : 'This device was never assigned to anyone, so it can be removed completely.'}
                  </p>
                  {deleteConfirm && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Type <span className="font-mono">{item.serial_number}</span> to confirm</Label>
                      <Input
                        value={deleteSerialInput}
                        onChange={e => setDeleteSerialInput(e.target.value)}
                        className="h-8 font-mono text-sm"
                        placeholder={item.serial_number}
                      />
                    </div>
                  )}
                  <Button
                    variant="destructive" size="sm" className="gap-1.5"
                    disabled={busy !== null || (deleteConfirm && deleteSerialInput.trim().toUpperCase() !== item.serial_number.toUpperCase())}
                    onClick={() => {
                      if (!deleteConfirm) { setDeleteConfirm(true); return; }
                      void runDanger('delete', () => deleteEquipmentItem(item), '🗑️ Device deleted');
                    }}
                  >
                    {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {deleteConfirm ? 'Confirm permanent delete' : 'Delete permanently'}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
