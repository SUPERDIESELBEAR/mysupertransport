import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FilePreviewModal, bucketForBinderDoc } from '@/components/inspection/DocRow';
import { downloadBlob } from '@/lib/downloadBlob';
import { TRUCK_MAKES } from '@/components/operator/TruckInfoCard';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { saveTruckSpecs } from '@/lib/truckSync';
import MaintenanceRecordModal from './MaintenanceRecordModal';
import DOTInspectionModal from './DOTInspectionModal';
import { syncInspectionBinderDateFromVehicleHub } from '@/lib/syncInspectionBinderDate';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Plus, Truck, Wrench, ShieldCheck, Eye, Download,
  Loader2, Search, AlertTriangle, CheckCircle2, Clock, FileText, Pencil, X, Save, Trash2,
} from 'lucide-react';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';

interface MaintenanceRecord {
  id: string;
  service_date: string;
  odometer: number | null;
  shop_name: string | null;
  amount: number | null;
  description: string | null;
  invoice_number: string | null;
  categories: string[];
  invoice_file_path: string | null;
  invoice_file_name: string | null;
  notes: string | null;
  created_at: string;
}

interface DOTInspection {
  id: string;
  inspection_date: string;
  reminder_interval: number;
  next_due_date: string | null;
  inspector_name: string | null;
  location: string | null;
  result: string;
  certificate_file_path: string | null;
  certificate_file_name: string | null;
  notes: string | null;
  created_at: string;
}

interface FleetDetailDrawerProps {
  operatorId: string;
  onBack: () => void;
  readOnly?: boolean;
  /** Fired exactly once after the first data fetch resolves. */
  onReady?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  pm_service: 'PM Service',
  general_repair: 'General Repair',
  tires: 'Tires',
};

function categoryBadge(cat: string) {
  const label = CATEGORY_LABELS[cat] || cat;
  const colors: Record<string, string> = {
    pm_service: 'bg-blue-100 text-blue-800 border-blue-300',
    general_repair: 'bg-orange-100 text-orange-800 border-orange-300',
    tires: 'bg-purple-100 text-purple-800 border-purple-300',
  };
  return <Badge key={cat} className={`text-[10px] px-1.5 py-0 ${colors[cat] ?? ''}`}>{label}</Badge>;
}

export default function FleetDetailDrawer({ operatorId, onBack, readOnly = false, onReady }: FleetDetailDrawerProps) {
  const readyFiredRef = useRef(false);
  const { session } = useAuth();
  const [truckInfo, setTruckInfo] = useState<any>(null);
  const [driverName, setDriverName] = useState('');
  const [unitNumber, setUnitNumber] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [dotInspections, setDotInspections] = useState<DOTInspection[]>([]);
  const [driverUserId, setDriverUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [dotModalOpen, setDotModalOpen] = useState(false);
  const [editingDot, setEditingDot] = useState<DOTInspection | null>(null);
  const [deletingDot, setDeletingDot] = useState<DOTInspection | null>(null);
  const [deletingDotBusy, setDeletingDotBusy] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [maintenanceSearch, setMaintenanceSearch] = useState('');

  // Truck specs editing
  const [isEditing, setIsEditing] = useState(false);
  const [draftYear, setDraftYear] = useState('');
  const [draftMake, setDraftMake] = useState('');
  const [draftVin, setDraftVin] = useState('');
  const [draftUnit, setDraftUnit] = useState('');
  const [draftPlate, setDraftPlate] = useState('');
  const [draftPlateState, setDraftPlateState] = useState('');
  const [otherMake, setOtherMake] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraftYear(truckInfo?.year || '');
    const currentMake = truckInfo?.make || '';
    const isKnown = TRUCK_MAKES.includes(currentMake as any);
    setDraftMake(isKnown ? currentMake : currentMake ? 'Other' : '');
    setOtherMake(isKnown ? '' : currentMake);
    setDraftVin(truckInfo?.vin || '');
    setDraftUnit(unitNumber || '');
    setDraftPlate(truckInfo?.plate || '');
    setDraftPlateState(truckInfo?.plateState || '');
    setIsEditing(true);
  };

  const cancelEditing = () => setIsEditing(false);

  const handleSaveSpecs = async () => {
    setSaving(true);
    try {
      const resolvedMake = draftMake === 'Other' ? otherMake.trim() : draftMake;
      const result = await saveTruckSpecs(
        operatorId,
        null,
        {
          truck_year: draftYear,
          truck_make: resolvedMake,
          truck_vin: draftVin,
          unit_number: draftUnit,
          truck_plate: draftPlate,
          truck_plate_state: draftPlateState,
        },
        session?.user?.id ?? null,
        { entityLabel: driverName },
      );
      if (!result.ok) throw new Error(result.error || 'Failed to save');
      toast({ title: 'Truck specs updated' });
      setIsEditing(false);
      await fetchData();
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [opResult, maintenanceResult, dotResult] = await Promise.all([
      supabase
        .from('operators')
        .select(`
          id, user_id, unit_number,
          applications(first_name, last_name),
      onboarding_status(unit_number, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state),
          ica_contracts(owner_name, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state)
        `)
        .eq('id', operatorId)
        .single(),
      supabase
        .from('truck_maintenance_records')
        .select('*')
        .eq('operator_id', operatorId)
        .order('service_date', { ascending: false }),
      supabase
        .from('truck_dot_inspections')
        .select('*')
        .eq('operator_id', operatorId)
        .order('inspection_date', { ascending: false }),
    ]);

    if (opResult.data) {
      const op = opResult.data as any;
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const ica = Array.isArray(op.ica_contracts) ? op.ica_contracts[0] : op.ica_contracts;
      setDriverName([app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown');
      setUnitNumber(os?.unit_number || op.unit_number || null);
      setDriverUserId(op.user_id ?? null);
      setTruckInfo({
        year: os?.truck_year || ica?.truck_year,
        make: os?.truck_make || ica?.truck_make,
        vin: os?.truck_vin || ica?.truck_vin,
        plate: os?.truck_plate || ica?.truck_plate,
        plateState: os?.truck_plate_state || ica?.truck_plate_state,
      });
    }

    setMaintenance((maintenanceResult.data as MaintenanceRecord[]) ?? []);
    setDotInspections((dotResult.data as DOTInspection[]) ?? []);
    setLoading(false);
    if (!readyFiredRef.current) { readyFiredRef.current = true; onReady?.(); }
  }, [operatorId, onReady]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // After save/delete of a DOT row, refresh data and re-sync the driver's binder
  // doc so it reflects the new latest inspection date (or reverts on delete).
  const handleDotMutated = useCallback(async () => {
    await fetchData();
    if (driverUserId) {
      try {
        await syncInspectionBinderDateFromVehicleHub(driverUserId);
      } catch (err) {
        console.warn('[FleetDetailDrawer] binder sync after DOT mutation failed', err);
      }
    }
  }, [fetchData, driverUserId]);

  const confirmDeleteDot = async () => {
    if (!deletingDot) return;
    setDeletingDotBusy(true);
    try {
      const { error } = await supabase
        .from('truck_dot_inspections')
        .delete()
        .eq('id', deletingDot.id);
      if (error) throw error;
      toast({ title: 'Inspection deleted' });
      setDeletingDot(null);
      await handleDotMutated();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDeletingDotBusy(false);
    }
  };

  const totalCost = useMemo(() =>
    maintenance.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    [maintenance]
  );

  const filteredMaintenance = useMemo(() => {
    let items = maintenance;
    if (categoryFilter !== 'all') {
      items = items.filter(r => r.categories.includes(categoryFilter));
    }
    if (maintenanceSearch.trim()) {
      const q = maintenanceSearch.toLowerCase();
      items = items.filter(r =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.shop_name ?? '').toLowerCase().includes(q) ||
        (r.invoice_number ?? '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [maintenance, categoryFilter, maintenanceSearch]);

  const latestDot = dotInspections[0] ?? null;
  const dotDaysLeft = latestDot?.next_due_date
    ? differenceInDays(startOfDay(parseISO(latestDot.next_due_date)), startOfDay(new Date()))
    : null;

  const handlePreviewFile = async (filePath: string, fileName: string) => {
    const bucket = bucketForBinderDoc(filePath);
    const { data } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
    if (data?.signedUrl) {
      setPreviewDoc({ url: data.signedUrl, name: fileName });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
        <p className="text-sm">Loading vehicle details…</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                {unitNumber ? `Unit ${unitNumber}` : 'Vehicle Detail'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {driverName} · {[truckInfo?.year, truckInfo?.make].filter(Boolean).join(' ') || 'No truck info'}
              {truckInfo?.vin && <span className="ml-2 text-xs font-mono">VIN: {truckInfo.vin}</span>}
            </p>
          </div>
        </div>

        {/* Truck Specs Card */}
        <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Truck Specs</h3>
            </div>
            {!readOnly && !isEditing && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Year</Label>
                  <Input className="h-8 text-xs" value={draftYear} onChange={e => setDraftYear(e.target.value)} placeholder="e.g. 2022" />
                </div>
                <div>
                  <Label className="text-xs">Make</Label>
                  <Select value={draftMake} onValueChange={v => { setDraftMake(v); if (v !== 'Other') setOtherMake(''); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select make" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRUCK_MAKES.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                      <SelectItem value="Other" className="text-xs">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {draftMake === 'Other' && (
                    <Input className="h-8 text-xs mt-1.5" value={otherMake} onChange={e => setOtherMake(e.target.value)} placeholder="Enter make" />
                  )}
                </div>
                <div>
                  <Label className="text-xs">VIN</Label>
                  <Input className="h-8 text-xs font-mono" value={draftVin} onChange={e => setDraftVin(e.target.value)} placeholder="VIN" />
                </div>
                <div>
                  <Label className="text-xs">Unit Number</Label>
                  <Input className="h-8 text-xs" value={draftUnit} onChange={e => setDraftUnit(e.target.value)} placeholder="Unit #" />
                </div>
                <div>
                  <Label className="text-xs">License Plate</Label>
                  <Input className="h-8 text-xs font-mono" value={draftPlate} onChange={e => setDraftPlate(e.target.value)} placeholder="Plate #" />
                </div>
                <div>
                  <Label className="text-xs">Plate State</Label>
                  <Input className="h-8 text-xs" value={draftPlateState} onChange={e => setDraftPlateState(e.target.value)} placeholder="e.g. MO" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={cancelEditing} disabled={saving}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" className="text-xs h-7" onClick={handleSaveSpecs} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground">Year</p>
                <p className="text-xs font-medium">{truckInfo?.year || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Make</p>
                <p className="text-xs font-medium">{truckInfo?.make || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">VIN</p>
                <p className="text-xs font-medium font-mono">{truckInfo?.vin || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Unit Number</p>
                <p className="text-xs font-medium">{unitNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">License Plate</p>
                <p className="text-xs font-medium font-mono">
                  {truckInfo?.plate
                    ? `${truckInfo.plate}${truckInfo.plateState ? ` (${truckInfo.plateState})` : ''}`
                    : '—'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* DOT Inspection Section */}
        <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">DOT Periodic Inspections</h3>
            </div>
            {!readOnly && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setDotModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Inspection
              </Button>
            )}
          </div>

          {/* Countdown card */}
          {latestDot && (
            <div className={`rounded-lg border p-4 ${
              dotDaysLeft !== null && dotDaysLeft < 0
                ? 'bg-destructive/5 border-destructive/30'
                : dotDaysLeft !== null && dotDaysLeft <= 30
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Inspection Date</p>
                    <p className="text-sm font-semibold">
                      {format(parseISO(latestDot.inspection_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Next DOT Due</p>
                    <p className="text-lg font-bold">
                      {latestDot.next_due_date ? format(parseISO(latestDot.next_due_date), 'MMM d, yyyy') : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {dotDaysLeft !== null && (
                    <p className={`text-2xl font-bold ${
                      dotDaysLeft < 0 ? 'text-destructive' : dotDaysLeft <= 30 ? 'text-amber-700' : 'text-emerald-700'
                    }`}>
                      {dotDaysLeft < 0 ? `${Math.abs(dotDaysLeft)}d overdue` : `${dotDaysLeft}d`}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Interval: {latestDot.reminder_interval} days
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {dotInspections.length > 0 ? (
            <div className="divide-y divide-border">
              {dotInspections.map(dot => (
                <div key={dot.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">{format(parseISO(dot.inspection_date), 'MMM d, yyyy')}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {dot.inspector_name && `${dot.inspector_name} · `}
                      {dot.location && `${dot.location} · `}
                      {dot.reminder_interval}d interval
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={dot.result === 'pass' ? 'outline' : 'destructive'} className="text-[10px]">
                      {dot.result}
                    </Badge>
                    {dot.certificate_file_path && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePreviewFile(dot.certificate_file_path!, dot.certificate_file_name || 'Certificate')}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!readOnly && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingDot(dot)}
                          title="Edit inspection"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeletingDot(dot)}
                          title="Delete inspection"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No DOT inspections recorded yet.</p>
          )}
        </div>

        {/* Repairs & Maintenance Section */}
        <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Repairs & Maintenance</h3>
              <span className="text-xs text-muted-foreground">({maintenance.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-foreground">
                Total: ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              {!readOnly && (
                <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setMaintenanceModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Record
                </Button>
              )}
            </div>
          </div>

          {/* Filters */}
          {maintenance.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search records…"
                  className="pl-8 h-8 text-xs"
                  value={maintenanceSearch}
                  onChange={e => setMaintenanceSearch(e.target.value)}
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                  <SelectItem value="pm_service" className="text-xs">PM Service</SelectItem>
                  <SelectItem value="general_repair" className="text-xs">General Repair</SelectItem>
                  <SelectItem value="tires" className="text-xs">Tires</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Records table */}
          {filteredMaintenance.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[10px] font-semibold">Date</TableHead>
                    <TableHead className="text-[10px] font-semibold">Shop</TableHead>
                    <TableHead className="text-[10px] font-semibold">Description</TableHead>
                    <TableHead className="text-[10px] font-semibold">Category</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Amount</TableHead>
                    <TableHead className="text-[10px] font-semibold w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaintenance.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(parseISO(r.service_date), 'M/d/yy')}</TableCell>
                      <TableCell className="text-xs">{r.shop_name || '—'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{r.description || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {r.categories.map(c => categoryBadge(c))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {r.amount ? `$${Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell>
                        {r.invoice_file_path && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePreviewFile(r.invoice_file_path!, r.invoice_file_name || 'Invoice')}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              {maintenance.length > 0 ? 'No records match your filters.' : 'No maintenance records yet.'}
            </p>
          )}
        </div>
      </div>

      {!readOnly && (
        <>
          <MaintenanceRecordModal
            open={maintenanceModalOpen}
            onClose={() => setMaintenanceModalOpen(false)}
            operatorId={operatorId}
            onSaved={fetchData}
          />
          <DOTInspectionModal
            open={dotModalOpen}
            onClose={() => setDotModalOpen(false)}
            operatorId={operatorId}
            onSaved={handleDotMutated}
          />
          <DOTInspectionModal
            open={!!editingDot}
            onClose={() => setEditingDot(null)}
            operatorId={operatorId}
            onSaved={handleDotMutated}
            existingInspection={editingDot}
          />
          <AlertDialog open={!!deletingDot} onOpenChange={o => { if (!o && !deletingDotBusy) setDeletingDot(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this DOT inspection?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deletingDot && (
                    <>
                      This will permanently remove the inspection dated{' '}
                      <strong>{format(parseISO(deletingDot.inspection_date), 'MMM d, yyyy')}</strong>.
                      The driver's binder will re-sync to the next most recent inspection on file.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingDotBusy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); confirmDeleteDot(); }}
                  disabled={deletingDotBusy}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletingDotBusy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {previewDoc && <FilePreviewModal url={previewDoc.url} name={previewDoc.name} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}
