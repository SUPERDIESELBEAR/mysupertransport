import { useState, useEffect } from 'react';
import { Truck, Cpu, Camera, Gauge, CreditCard, Pencil, Save, X, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface TruckInfo {
  truck_year?: string | null;
  truck_make?: string | null;
  truck_model?: string | null;
  truck_vin?: string | null;
  truck_plate?: string | null;
  truck_plate_state?: string | null;
  trailer_number?: string | null;
}

export interface DeviceInfo {
  unit_number?: string | null;
  eld_serial_number?: string | null;
  dash_cam_number?: string | null;
  bestpass_number?: string | null;
  fuel_card_number?: string | null;
}

export interface TruckInfoCardEditPayload {
  unit_number: string | null;
  eld_serial_number: string | null;
  dash_cam_number: string | null;
  bestpass_number: string | null;
  fuel_card_number: string | null;
}

interface TruckInfoCardProps {
  truckInfo?: TruckInfo | null;
  deviceInfo?: DeviceInfo | null;
  /** If provided, an Edit button appears for staff/management to edit device numbers */
  onEdit?: (payload: TruckInfoCardEditPayload) => Promise<void>;
}

interface InfoFieldProps {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}

function InfoField({ label, value, mono = false }: InfoFieldProps) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
        {label}
      </span>
      <span className={`text-sm font-semibold text-foreground leading-tight break-all ${mono ? 'font-mono tracking-widest' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function TruckInfoCard({ truckInfo, deviceInfo, onEdit }: TruckInfoCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TruckInfoCardEditPayload>({
    unit_number: deviceInfo?.unit_number ?? null,
    eld_serial_number: deviceInfo?.eld_serial_number ?? null,
    dash_cam_number: deviceInfo?.dash_cam_number ?? null,
    bestpass_number: deviceInfo?.bestpass_number ?? null,
    fuel_card_number: deviceInfo?.fuel_card_number ?? null,
  });

  // Re-sync draft when deviceInfo prop updates from parent
  useEffect(() => {
    setDraft({
      unit_number: deviceInfo?.unit_number ?? null,
      eld_serial_number: deviceInfo?.eld_serial_number ?? null,
      dash_cam_number: deviceInfo?.dash_cam_number ?? null,
      bestpass_number: deviceInfo?.bestpass_number ?? null,
      fuel_card_number: deviceInfo?.fuel_card_number ?? null,
    });
  }, [deviceInfo]);

  // Build display name for the truck
  const truckYearMakeModel = [truckInfo?.truck_year, truckInfo?.truck_make, truckInfo?.truck_model]
    .filter(Boolean)
    .join(' ');

  const hasTruckInfo = !!(truckInfo?.truck_year || truckInfo?.truck_make || truckInfo?.truck_model ||
    truckInfo?.truck_vin || truckInfo?.truck_plate || truckInfo?.truck_plate_state || truckInfo?.trailer_number);

  const hasDeviceInfo = !!(deviceInfo?.unit_number || deviceInfo?.eld_serial_number ||
    deviceInfo?.dash_cam_number || deviceInfo?.bestpass_number || deviceInfo?.fuel_card_number);

  // Don't render if nothing to show (and no onEdit to allow adding)
  if (!hasTruckInfo && !hasDeviceInfo && !onEdit) return null;

  const handleOpenEdit = () => {
    setDraft({
      unit_number: deviceInfo?.unit_number ?? null,
      eld_serial_number: deviceInfo?.eld_serial_number ?? null,
      dash_cam_number: deviceInfo?.dash_cam_number ?? null,
      bestpass_number: deviceInfo?.bestpass_number ?? null,
      fuel_card_number: deviceInfo?.fuel_card_number ?? null,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!onEdit) return;
    setSaving(true);
    try {
      await onEdit(draft);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Truck className="h-4 w-4 text-primary" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-none">
              {truckYearMakeModel || 'Truck & Equipment'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Truck details and assigned device numbers</p>
          </div>
        </div>
        {onEdit && (
          <Popover open={editOpen} onOpenChange={setEditOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={handleOpenEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Edit Device Numbers</p>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditOpen(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">Truck details (year/make/VIN) are managed through the ICA builder.</p>
                {[
                  { key: 'unit_number' as const, label: 'Unit Number', placeholder: 'e.g. 1042' },
                  { key: 'eld_serial_number' as const, label: 'ELD Serial #', placeholder: 'Serial number' },
                  { key: 'dash_cam_number' as const, label: 'Dash Cam #', placeholder: 'Device number' },
                  { key: 'bestpass_number' as const, label: 'BestPass #', placeholder: 'Account number' },
                  { key: 'fuel_card_number' as const, label: 'Fuel Card #', placeholder: 'Card number' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={draft[key] ?? ''}
                      onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value || null }))}
                      placeholder={placeholder}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 h-8 gap-1.5">
                    {saving ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => setEditOpen(false)}>Cancel</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="divide-y divide-border">
        {/* Truck Info Section */}
        {hasTruckInfo && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Truck Info</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              {truckYearMakeModel && <InfoField label="Year / Make / Model" value={truckYearMakeModel} />}
              <InfoField label="VIN" value={truckInfo?.truck_vin} mono />
              <InfoField label="License Plate" value={truckInfo?.truck_plate} mono />
              <InfoField label="Plate State" value={truckInfo?.truck_plate_state} />
              <InfoField label="Trailer #" value={truckInfo?.trailer_number} mono />
            </div>
          </div>
        )}

        {/* Devices & Cards Section */}
        {(hasDeviceInfo || onEdit) && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Devices & Cards</p>
            {hasDeviceInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
                {deviceInfo?.unit_number && (
                  <div className="bg-card px-4 py-3 flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 shrink-0 mt-0.5">
                      <Hash className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">Unit #</p>
                      <p className="font-mono text-sm font-bold text-foreground tracking-widest break-all">{deviceInfo.unit_number}</p>
                    </div>
                  </div>
                )}
                {deviceInfo?.eld_serial_number && (
                  <div className="bg-card px-4 py-3 flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 shrink-0 mt-0.5">
                      <Cpu className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">ELD Serial #</p>
                      <p className="font-mono text-sm font-bold text-foreground tracking-widest break-all">{deviceInfo.eld_serial_number}</p>
                    </div>
                  </div>
                )}
                {deviceInfo?.dash_cam_number && (
                  <div className="bg-card px-4 py-3 flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 shrink-0 mt-0.5">
                      <Camera className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">Dash Cam #</p>
                      <p className="font-mono text-sm font-bold text-foreground tracking-widest break-all">{deviceInfo.dash_cam_number}</p>
                    </div>
                  </div>
                )}
                {deviceInfo?.bestpass_number && (
                  <div className="bg-card px-4 py-3 flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 shrink-0 mt-0.5">
                      <Gauge className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">BestPass #</p>
                      <p className="font-mono text-sm font-bold text-foreground tracking-widest break-all">{deviceInfo.bestpass_number}</p>
                    </div>
                  </div>
                )}
                {deviceInfo?.fuel_card_number && (
                  <div className="bg-card px-4 py-3 flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 shrink-0 mt-0.5">
                      <CreditCard className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">Fuel Card #</p>
                      <p className="font-mono text-sm font-bold text-foreground tracking-widest break-all">{deviceInfo.fuel_card_number}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : onEdit ? (
              <p className="text-xs text-muted-foreground italic">No device numbers assigned yet. Click the edit icon to add them.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
