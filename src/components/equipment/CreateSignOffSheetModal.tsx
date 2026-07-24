import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Send, Save, Cpu, Camera, Gauge, AlertTriangle } from 'lucide-react';
import DriverCombobox from '@/components/inspection/DriverCombobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type OsasDeviceType = 'eld' | 'dash_cam' | 'bestpass';
type OsasStatus = Database['public']['Enums']['osas_status'];
type EquipmentItem = Database['public']['Tables']['equipment_items']['Row'];

interface OperatorOption {
  userId: string;
  operatorId: string;
  name: string;
  unitNumber: string | null;
  email: string | null;
  phone: string | null;
  truckYear: string | null;
  truckMake: string | null;
  truckVin: string | null;
  truckPlate: string | null;
  truckPlateState: string | null;
  trailerNumber: string | null;
}

interface DeviceChoice {
  equipmentId: string | null;
  serial: string | null;
}

interface Props {
  open: boolean;
  initialOperatorId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const DEVICE_LABELS: Record<OsasDeviceType, string> = {
  eld: 'ELD Unit',
  dash_cam: 'Dash Camera',
  bestpass: 'BestPass',
};

const DEVICE_ICONS: Record<OsasDeviceType, React.ReactNode> = {
  eld: <Cpu className="h-4 w-4" />,
  dash_cam: <Camera className="h-4 w-4" />,
  bestpass: <Gauge className="h-4 w-4" />,
};

const BESTPASS_FEE_CENTS = 6000;

export default function CreateSignOffSheetModal({ open, initialOperatorId, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [inventory, setInventory] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(initialOperatorId ?? null);
  const [assignmentDate, setAssignmentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [devices, setDevices] = useState<Record<OsasDeviceType, DeviceChoice>>({
    eld: { equipmentId: null, serial: null },
    dash_cam: { equipmentId: null, serial: null },
    bestpass: { equipmentId: null, serial: null },
  });
  const [includeBestPass, setIncludeBestPass] = useState(false);

  const selectedOperator = useMemo(() => operators.find(o => o.operatorId === selectedOperatorId), [operators, selectedOperatorId]);

  const todayCentral = useMemo(() => {
    return format(new Date(), 'yyyy-MM-dd');
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([fetchOperators(), fetchInventory()]).finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (initialOperatorId && open) {
      setSelectedOperatorId(initialOperatorId);
    }
  }, [initialOperatorId, open]);

  const fetchOperators = async () => {
    const { data, error } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        unit_number,
        onboarding_status (
          unit_number, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number
        ),
        applications (
          first_name, last_name, email, phone
        )
      `)
      .eq('is_active', true);

    if (error) {
      console.error('[CreateSignOffSheetModal] fetchOperators failed', error);
      toast({ title: 'Could not load operators', variant: 'destructive' });
      return;
    }

    const rows = (data ?? []).map((o: any) => {
      const app = o.applications;
      const os = o.onboarding_status;
      const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
      return {
        userId: o.user_id,
        operatorId: o.id,
        name,
        unitNumber: o.unit_number ?? os?.unit_number ?? null,
        email: app?.email ?? null,
        phone: app?.phone ?? null,
        truckYear: os?.truck_year ?? null,
        truckMake: os?.truck_make ?? null,
        truckVin: os?.truck_vin ?? null,
        truckPlate: os?.truck_plate ?? null,
        truckPlateState: os?.truck_plate_state ?? null,
        trailerNumber: os?.trailer_number ?? null,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    setOperators(rows);
  };

  const fetchInventory = async () => {
    const { data, error } = await supabase
      .from('equipment_items')
      .select('*')
      .order('device_type')
      .order('serial_number');
    if (error) {
      console.error('[CreateSignOffSheetModal] fetchInventory failed', error);
      toast({ title: 'Could not load inventory', variant: 'destructive' });
      return;
    }
    setInventory((data ?? []) as EquipmentItem[]);
  };

  const availableDevices = (type: OsasDeviceType) => {
    return inventory.filter(i => i.device_type === type && i.status === 'available');
  };

  const updateDevice = (type: OsasDeviceType, equipmentId: string | null) => {
    const serial = equipmentId ? inventory.find(i => i.id === equipmentId)?.serial_number ?? null : null;
    setDevices(prev => ({ ...prev, [type]: { equipmentId, serial } }));
  };

  const hasAtLeastOneDevice = useMemo(() => {
    if (devices.eld.equipmentId) return true;
    if (devices.dash_cam.equipmentId) return true;
    if (includeBestPass && devices.bestpass.equipmentId) return true;
    return false;
  }, [devices, includeBestPass]);

  const buildPayload = (): any => {
    const items = [] as { deviceType: OsasDeviceType; equipmentId: string; serial: string }[];
    if (devices.eld.equipmentId) {
      items.push({ deviceType: 'eld', equipmentId: devices.eld.equipmentId, serial: devices.eld.serial ?? '' });
    }
    if (devices.dash_cam.equipmentId) {
      items.push({ deviceType: 'dash_cam', equipmentId: devices.dash_cam.equipmentId, serial: devices.dash_cam.serial ?? '' });
    }
    if (includeBestPass && devices.bestpass.equipmentId) {
      items.push({ deviceType: 'bestpass', equipmentId: devices.bestpass.equipmentId, serial: devices.bestpass.serial ?? '' });
    }
    return {
      operatorId: selectedOperatorId,
      unitNumber: selectedOperator?.unitNumber ?? null,
      assignmentDate,
      bestpassIncluded: includeBestPass,
      bestpassFeeCents: includeBestPass ? BESTPASS_FEE_CENTS : null,
      items,
    };
  };

  const handleSave = async (sendToOperator: boolean) => {
    if (!selectedOperatorId) {
      toast({ title: 'Please select a driver', variant: 'destructive' });
      return;
    }
    if (!hasAtLeastOneDevice) {
      toast({ title: 'Select at least one device to issue', variant: 'destructive' });
      return;
    }
    if (sendToOperator) {
      setSending(true);
    } else {
      setSaving(true);
    }

    try {
      const payload = buildPayload();
      const { data, error } = await supabase.functions.invoke('send-osas-to-operator', {
        body: {
          ...payload,
          sendToOperator,
        },
      });
      if (error) {
        const details = error instanceof Error ? error.message : String(error);
        console.error('[CreateSignOffSheetModal] invoke failed', error);
        toast({ title: 'Error', description: details, variant: 'destructive' });
        return;
      }
      toast({
        title: sendToOperator ? '✅ Sent to operator' : '✅ Draft saved',
        description: sendToOperator
          ? 'The driver will receive an email to review and sign the assignment sheet.'
          : 'The sheet has been saved as a draft.',
      });
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('[CreateSignOffSheetModal] save failed', err);
      toast({ title: 'Error', description: err?.message ?? 'Could not save sheet', variant: 'destructive' });
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  const handleClose = () => {
    if (saving || sending) return;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sign-off Sheet</DialogTitle>
          <DialogDescription>
            Build an Onboard Systems Assignment Sheet (OSAS). All serial numbers must be chosen from inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <DriverCombobox
                  operators={operators.map(o => ({ userId: o.operatorId, name: o.name }))}
                  value={selectedOperatorId ?? ''}
                  onChange={id => setSelectedOperatorId(id)}
                  placeholder="Select a driver…"
                />
              </div>

              {selectedOperator && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Unit:</span> {selectedOperator.unitNumber ?? '—'}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {selectedOperator.phone ?? '—'}</div>
                  <div className="sm:col-span-2"><span className="text-muted-foreground">Email:</span> {selectedOperator.email ?? '—'}</div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Truck:</span>{' '}
                    {[selectedOperator.truckYear, selectedOperator.truckMake, selectedOperator.truckVin].filter(Boolean).join(' ') || '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plate:</span>{' '}
                    {selectedOperator.truckPlate && selectedOperator.truckPlateState
                      ? `${selectedOperator.truckPlate} (${selectedOperator.truckPlateState})`
                      : selectedOperator.truckPlate ?? '—'}
                  </div>
                  <div><span className="text-muted-foreground">Trailer:</span> {selectedOperator.trailerNumber ?? '—'}</div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Assignment Date</Label>
                <DateInput value={assignmentDate} onChange={setAssignmentDate} />
              </div>

              <div className="space-y-3">
                <Label>Devices</Label>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    {DEVICE_ICONS.eld}
                    <span className="font-medium">ELD Unit</span>
                  </div>
                  <Select value={devices.eld.equipmentId ?? 'none'} onValueChange={v => updateDevice('eld', v === 'none' ? null : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select available ELD…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not selected —</SelectItem>
                      {availableDevices('eld').map(item => (
                        <SelectItem key={item.id} value={item.id}>{item.serial_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    {DEVICE_ICONS.dash_cam}
                    <span className="font-medium">Dash Camera</span>
                  </div>
                  <Select value={devices.dash_cam.equipmentId ?? 'none'} onValueChange={v => updateDevice('dash_cam', v === 'none' ? null : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select available dash cam…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not selected —</SelectItem>
                      {availableDevices('dash_cam').map(item => (
                        <SelectItem key={item.id} value={item.id}>{item.serial_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="bestpass"
                      checked={includeBestPass}
                      onCheckedChange={c => {
                        setIncludeBestPass(c === true);
                        if (c !== true) updateDevice('bestpass', null);
                      }}
                    />
                    <Label htmlFor="bestpass" className="font-normal cursor-pointer">
                      Issue BestPass transponder (+$60.00)
                    </Label>
                  </div>
                  {includeBestPass && (
                    <Select value={devices.bestpass.equipmentId ?? 'none'} onValueChange={v => updateDevice('bestpass', v === 'none' ? null : v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select available BestPass…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Not selected —</SelectItem>
                        {availableDevices('bestpass').map(item => (
                          <SelectItem key={item.id} value={item.id}>{item.serial_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm space-y-2">
                <div className="flex items-center gap-2 text-gold font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Terms included on the assignment sheet
                </div>
                <ul className="list-disc pl-4 text-muted-foreground space-y-1">
                  <li>Unreturned ELD equipment will be assessed a <strong className="text-foreground">$1,000.00</strong> replacement charge.</li>
                  <li>Additional charges may be incurred for unreturned license plates or other issued equipment.</li>
                  {includeBestPass && (
                    <li>A BestPass transponder fee of <strong className="text-foreground">$60.00</strong> is acknowledged on this sheet.</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving || sending}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={!selectedOperatorId || !hasAtLeastOneDevice || saving || sending}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save Draft
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={!selectedOperatorId || !hasAtLeastOneDevice || saving || sending}
          >
            {sending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send to Operator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
