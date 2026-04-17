import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { TRUCK_MAKES } from '@/components/operator/TruckInfoCard';
import { saveTruckSpecs } from '@/lib/truckSync';

interface QuickTruckEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  operatorId: string;
  driverName: string;
  initialValues: {
    truck_year: string | null;
    truck_make: string | null;
    truck_vin: string | null;
    truck_plate: string | null;
    truck_plate_state: string | null;
    unit_number: string | null;
    trailer_number?: string | null;
  };
}

export default function QuickTruckEditModal({
  open, onClose, onSaved, operatorId, driverName, initialValues,
}: QuickTruckEditModalProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [otherMake, setOtherMake] = useState('');
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [plateState, setPlateState] = useState('');
  const [unit, setUnit] = useState('');
  const [trailer, setTrailer] = useState('');

  useEffect(() => {
    if (!open) return;
    setYear(initialValues.truck_year || '');
    const currentMake = initialValues.truck_make || '';
    const isKnown = TRUCK_MAKES.includes(currentMake as any);
    setMake(isKnown ? currentMake : currentMake ? 'Other' : '');
    setOtherMake(isKnown ? '' : currentMake);
    setVin(initialValues.truck_vin || '');
    setPlate(initialValues.truck_plate || '');
    setPlateState(initialValues.truck_plate_state || '');
    setUnit(initialValues.unit_number || '');
    setTrailer(initialValues.trailer_number || '');
  }, [open, initialValues]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const resolvedMake = make === 'Other' ? otherMake.trim() : make;
      const result = await saveTruckSpecs(
        operatorId,
        null,
        {
          truck_year: year,
          truck_make: resolvedMake,
          truck_vin: vin,
          truck_plate: plate,
          truck_plate_state: plateState,
          unit_number: unit,
          trailer_number: trailer,
        },
        session?.user?.id ?? null,
        { entityLabel: driverName },
      );
      if (!result.ok) throw new Error(result.error || 'Failed to save');
      toast({ title: 'Truck specs updated' });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" />
            Edit Truck Specs — {driverName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Unit #</Label>
              <Input className="h-9 text-sm" value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. 1042" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Year</Label>
              <Input className="h-9 text-sm" value={year} onChange={e => setYear(e.target.value)} placeholder="2022" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Make</Label>
            <Select value={make} onValueChange={v => { setMake(v); if (v !== 'Other') setOtherMake(''); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select make" />
              </SelectTrigger>
              <SelectContent>
                {TRUCK_MAKES.map(m => <SelectItem key={m} value={m} className="text-sm">{m}</SelectItem>)}
                <SelectItem value="Other" className="text-sm">Other</SelectItem>
              </SelectContent>
            </Select>
            {make === 'Other' && (
              <Input className="h-9 text-sm mt-1.5" value={otherMake} onChange={e => setOtherMake(e.target.value)} placeholder="Enter make" />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">VIN</Label>
            <Input className="h-9 text-sm font-mono" value={vin} onChange={e => setVin(e.target.value)} placeholder="VIN" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">License Plate</Label>
              <Input className="h-9 text-sm font-mono" value={plate} onChange={e => setPlate(e.target.value)} placeholder="Plate #" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input className="h-9 text-sm" value={plateState} onChange={e => setPlateState(e.target.value)} placeholder="MO" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Trailer #</Label>
            <Input className="h-9 text-sm" value={trailer} onChange={e => setTrailer(e.target.value)} placeholder="Optional" />
          </div>

          <p className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded px-2 py-1.5">
            Empty fields won't overwrite existing values. Changes also sync to any active ICA draft.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
