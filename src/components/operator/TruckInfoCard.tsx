import { useState, useEffect } from 'react';
import { Truck, Cpu, Camera, Gauge, CreditCard, Pencil, Save, X, Hash, ChevronDown, Plus, Package, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { US_STATES } from '@/components/application/types';
import { buildTrackingUrl, shortTracking } from '@/components/equipment/equipmentTracking';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { format, parseISO } from 'date-fns';

export const TRUCK_MAKES = [
  'Freightliner', 'Kenworth', 'Peterbilt', 'Volvo',
  'Mack', 'International', 'Western Star',
] as const;

export interface TruckInfo {
  truck_year?: string | null;
  truck_make?: string | null;
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

export interface TruckFieldsEditPayload {
  truck_year: string | null;
  truck_make: string | null;
  truck_vin: string | null;
  truck_plate: string | null;
  truck_plate_state: string | null;
  trailer_number: string | null;
}

/** One device's shipping info, keyed by device_type ('eld' | 'dash_cam' | 'bestpass' | 'fuel_card'). */
export interface EquipmentShippingInfo {
  device_type: string;
  shipping_carrier: string | null;
  tracking_number: string | null;
  ship_date: string | null;
  tracking_receipt_url: string | null;
}

interface TruckInfoCardProps {
  truckInfo?: TruckInfo | null;
  deviceInfo?: DeviceInfo | null;
  /** If provided, an Edit button appears for staff/management to edit device numbers */
  onEdit?: (payload: TruckInfoCardEditPayload) => Promise<void>;
  /** If provided, truck fields (year/make/model/VIN/plate) become editable */
  onTruckEdit?: (payload: TruckFieldsEditPayload) => Promise<void>;
  /** Optional shipping info per device — when set, shows tracking badges next to serial numbers */
  shippingInfo?: EquipmentShippingInfo[] | null;
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

interface DeviceCellProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  shipping?: EquipmentShippingInfo;
  onPreviewReceipt: (url: string) => void;
}

function DeviceCell({ icon, label, value, shipping, onPreviewReceipt }: DeviceCellProps) {
  const trackingUrl = shipping ? buildTrackingUrl(shipping.shipping_carrier, shipping.tracking_number) : null;
  const hasShipping = !!(shipping && (shipping.shipping_carrier || shipping.tracking_number || shipping.tracking_receipt_url));
  return (
    <div className="bg-card px-4 py-3 flex items-start gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 shrink-0 mt-0.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">{label}</p>
        <p className="font-mono text-sm font-bold text-foreground tracking-widest break-all">{value}</p>
        {hasShipping && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(shipping!.shipping_carrier || shipping!.tracking_number) && (
              trackingUrl ? (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  <Package className="h-2.5 w-2.5" />
                  Shipped {shipping!.shipping_carrier}
                  {shipping!.tracking_number && <span className="font-mono">· {shortTracking(shipping!.tracking_number, 6)}</span>}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  <Package className="h-2.5 w-2.5" />
                  Shipped {shipping!.shipping_carrier ?? ''}
                  {shipping!.tracking_number && <span className="font-mono">· {shortTracking(shipping!.tracking_number, 6)}</span>}
                </span>
              )
            )}
            {shipping!.ship_date && (
              <span className="text-[10px] text-muted-foreground">
                {format(parseISO(shipping!.ship_date), 'MMM d, yyyy')}
              </span>
            )}
            {shipping!.tracking_receipt_url && (
              <button
                type="button"
                onClick={() => onPreviewReceipt(shipping!.tracking_receipt_url!)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                <FileText className="h-2.5 w-2.5 text-primary" />
                Receipt
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TruckInfoCard({ truckInfo, deviceInfo, onEdit, onTruckEdit, shippingInfo }: TruckInfoCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [truckEditOpen, setTruckEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [truckSaving, setTruckSaving] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // Map device_type -> latest shipping row for quick lookup beside each serial
  const shippingByDevice: Record<string, EquipmentShippingInfo | undefined> = {};
  for (const s of shippingInfo ?? []) {
    // First entry per device_type wins (RPC returns most recent first)
    if (!shippingByDevice[s.device_type]) shippingByDevice[s.device_type] = s;
  }

  const [draft, setDraft] = useState<TruckInfoCardEditPayload>({
    unit_number: deviceInfo?.unit_number ?? null,
    eld_serial_number: deviceInfo?.eld_serial_number ?? null,
    dash_cam_number: deviceInfo?.dash_cam_number ?? null,
    bestpass_number: deviceInfo?.bestpass_number ?? null,
    fuel_card_number: deviceInfo?.fuel_card_number ?? null,
  });

  const [truckDraft, setTruckDraft] = useState<TruckFieldsEditPayload>({
    truck_year: truckInfo?.truck_year ?? null,
    truck_make: truckInfo?.truck_make ?? null,
    truck_vin: truckInfo?.truck_vin ?? null,
    truck_plate: truckInfo?.truck_plate ?? null,
    truck_plate_state: truckInfo?.truck_plate_state ?? null,
    trailer_number: truckInfo?.trailer_number ?? null,
  });

  // Re-sync drafts when props update
  useEffect(() => {
    if (editOpen) return;
    setDraft({
      unit_number: deviceInfo?.unit_number ?? null,
      eld_serial_number: deviceInfo?.eld_serial_number ?? null,
      dash_cam_number: deviceInfo?.dash_cam_number ?? null,
      bestpass_number: deviceInfo?.bestpass_number ?? null,
      fuel_card_number: deviceInfo?.fuel_card_number ?? null,
    });
  }, [deviceInfo]);

  useEffect(() => {
    if (truckEditOpen) return;
    setTruckDraft({
      truck_year: truckInfo?.truck_year ?? null,
      truck_make: truckInfo?.truck_make ?? null,
      truck_vin: truckInfo?.truck_vin ?? null,
      truck_plate: truckInfo?.truck_plate ?? null,
      truck_plate_state: truckInfo?.truck_plate_state ?? null,
      trailer_number: truckInfo?.trailer_number ?? null,
    });
    // Auto-expand trailer section if trailer_number has a value
    if (truckInfo?.trailer_number) setTrailerOpen(true);
  }, [truckInfo]);

  // Build display name for the truck
  const truckYearMake = [truckInfo?.truck_year, truckInfo?.truck_make]
    .filter(Boolean)
    .join(' ');

  const hasTruckInfo = !!(truckInfo?.truck_year || truckInfo?.truck_make ||
    truckInfo?.truck_vin || truckInfo?.truck_plate || truckInfo?.truck_plate_state || truckInfo?.trailer_number);

  const hasDeviceInfo = !!(deviceInfo?.unit_number || deviceInfo?.eld_serial_number ||
    deviceInfo?.dash_cam_number || deviceInfo?.bestpass_number || deviceInfo?.fuel_card_number);

  // Don't render if nothing to show (and no onEdit/onTruckEdit to allow adding)
  if (!hasTruckInfo && !hasDeviceInfo && !onEdit && !onTruckEdit) return null;

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

  const handleOpenTruckEdit = () => {
    setTruckDraft({
      truck_year: truckInfo?.truck_year ?? null,
      truck_make: truckInfo?.truck_make ?? null,
      truck_vin: truckInfo?.truck_vin ?? null,
      truck_plate: truckInfo?.truck_plate ?? null,
      truck_plate_state: truckInfo?.truck_plate_state ?? null,
      trailer_number: truckInfo?.trailer_number ?? null,
    });
    if (truckInfo?.trailer_number) setTrailerOpen(true);
    setTruckEditOpen(true);
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

  const handleTruckSave = async () => {
    if (!onTruckEdit) return;
    setTruckSaving(true);
    try {
      await onTruckEdit(truckDraft);
      setTruckEditOpen(false);
    } finally {
      setTruckSaving(false);
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
              {truckYearMake || 'Truck & Equipment'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Truck details and assigned device numbers</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Truck info edit popover */}
          {onTruckEdit && (
            <Popover open={truckEditOpen} onOpenChange={setTruckEditOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={handleOpenTruckEdit}>
                  <Truck className="h-3.5 w-3.5" />
                  Edit Truck
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Edit Truck Info</p>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setTruckEditOpen(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {[
                    { key: 'truck_year' as const, label: 'Year', placeholder: 'e.g. 2022' },
                    { key: 'truck_vin' as const, label: 'VIN', placeholder: '17-character VIN' },
                    { key: 'truck_plate' as const, label: 'License Plate', placeholder: 'Plate number' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={truckDraft[key] ?? ''}
                        onChange={e => setTruckDraft(prev => ({ ...prev, [key]: e.target.value || null }))}
                        placeholder={placeholder}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs">Plate State</Label>
                    <Select
                      value={truckDraft.truck_plate_state ?? ''}
                      onValueChange={v => setTruckDraft(prev => ({ ...prev, truck_plate_state: v || null }))}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(st => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Collapsible Trailer Section */}
                  <Collapsible open={trailerOpen} onOpenChange={setTrailerOpen}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                      >
                        {trailerOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {trailerOpen ? 'Trailer' : 'Add Trailer'}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Trailer Number</Label>
                        <Input
                          value={truckDraft.trailer_number ?? ''}
                          onChange={e => setTruckDraft(prev => ({ ...prev, trailer_number: e.target.value || null }))}
                          placeholder="e.g. TR-4210"
                          className="h-8 text-sm"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleTruckSave} disabled={truckSaving} size="sm" className="flex-1 h-8 gap-1.5">
                      {truckSaving ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setTruckEditOpen(false)}>Cancel</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {/* Device number edit popover */}
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
      </div>

      <div className="divide-y divide-border">
        {/* Truck Info Section */}
        {hasTruckInfo && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Truck Info</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              {truckYearMake && <InfoField label="Year / Make" value={truckYearMake} />}
              <InfoField label="VIN" value={truckInfo?.truck_vin} mono />
              <InfoField label="License Plate" value={truckInfo?.truck_plate} mono />
              <InfoField label="Plate State" value={truckInfo?.truck_plate_state} />
              <InfoField label="Trailer #" value={truckInfo?.trailer_number} mono />
            </div>
          </div>
        )}
        {!hasTruckInfo && onTruckEdit && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Truck Info</p>
            <p className="text-xs text-muted-foreground italic">No truck details yet. Click "Edit Truck" to add year, make, VIN, and plate info.</p>
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
                  <DeviceCell
                    icon={<Cpu className="h-3.5 w-3.5 text-primary" />}
                    label="ELD Serial #"
                    value={deviceInfo.eld_serial_number}
                    shipping={shippingByDevice['eld']}
                    onPreviewReceipt={setReceiptPreview}
                  />
                )}
                {deviceInfo?.dash_cam_number && (
                  <DeviceCell
                    icon={<Camera className="h-3.5 w-3.5 text-primary" />}
                    label="Dash Cam #"
                    value={deviceInfo.dash_cam_number}
                    shipping={shippingByDevice['dash_cam']}
                    onPreviewReceipt={setReceiptPreview}
                  />
                )}
                {deviceInfo?.bestpass_number && (
                  <DeviceCell
                    icon={<Gauge className="h-3.5 w-3.5 text-primary" />}
                    label="BestPass #"
                    value={deviceInfo.bestpass_number}
                    shipping={shippingByDevice['bestpass']}
                    onPreviewReceipt={setReceiptPreview}
                  />
                )}
                {deviceInfo?.fuel_card_number && (
                  <DeviceCell
                    icon={<CreditCard className="h-3.5 w-3.5 text-primary" />}
                    label="Fuel Card #"
                    value={deviceInfo.fuel_card_number}
                    shipping={shippingByDevice['fuel_card']}
                    onPreviewReceipt={setReceiptPreview}
                  />
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
