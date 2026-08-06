import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useShowDemo } from '@/hooks/useShowDemo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { Cpu, Camera, CreditCard, Tag, Search, Loader2, AlertTriangle, Users } from 'lucide-react';

type Slot = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card';

interface DeviceValue {
  /** Value shown to the user (inventory wins when both exist) */
  value: string | null;
  /** Serial from an open equipment assignment */
  inventory: string | null;
  /** Number stored on the driver's onboarding record */
  onboarding: string | null;
  status: string | null;
}

interface DriverRow {
  operatorId: string;
  name: string;
  unitNumber: string | null;
  devices: Record<Slot, DeviceValue>;
}

const SLOT_META: Record<Slot, { label: string; icon: React.ReactNode; color: string }> = {
  eld: { label: 'ELD', icon: <Cpu className="h-3.5 w-3.5" />, color: 'text-primary' },
  dash_cam: { label: 'Dash Camera', icon: <Camera className="h-3.5 w-3.5" />, color: 'text-status-progress' },
  bestpass: { label: 'BestPass', icon: <Tag className="h-3.5 w-3.5" />, color: 'text-status-complete' },
  fuel_card: { label: 'Fuel Card', icon: <CreditCard className="h-3.5 w-3.5" />, color: 'text-warning' },
};

function makeDevice(inventory: string | null, onboarding: string | null, status: string | null): DeviceValue {
  return {
    value: inventory ?? onboarding ?? null,
    inventory,
    onboarding,
    status: inventory ? status : null,
  };
}

function mismatch(d: DeviceValue) {
  return !!(d.inventory && d.onboarding && d.inventory.trim().toLowerCase() !== d.onboarding.trim().toLowerCase());
}

function sourceNote(d: DeviceValue): string | null {
  if (!d.value) return null;
  if (mismatch(d)) return `Onboarding record says ${d.onboarding}`;
  if (d.inventory && !d.onboarding) return 'Not in onboarding record';
  if (!d.inventory && d.onboarding) return 'Onboarding record only';
  return null;
}

/** Small inline value with mismatch / source annotation. */
function DeviceValueText({ d, missingLabel }: { d: DeviceValue; missingLabel?: string }) {
  if (!d.value) {
    return missingLabel
      ? <span className="text-xs font-semibold text-destructive">{missingLabel}</span>
      : <span className="text-xs text-muted-foreground">—</span>;
  }
  const note = sourceNote(d);
  const bad = mismatch(d);
  const body = (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="font-mono text-sm font-semibold text-foreground break-all">{d.value}</span>
      {bad && <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />}
    </span>
  );
  if (!note) return body;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild><span className="cursor-help">{body}</span></TooltipTrigger>
        <TooltipContent><span className="text-xs">{note}</span></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function EquipmentByDriver() {
  const { toast } = useToast();
  const { showDemo } = useShowDemo();
  const [viewMode, setViewMode] = useViewMode('onboard_systems_by_driver_view', 'dmode', 'cards');
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gapsOnly, setGapsOnly] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);

    const { data: ops, error } = await supabase
      .from('operators')
      .select(`
        id,
        unit_number,
        is_demo,
        applications(first_name, last_name),
        onboarding_status(unit_number, eld_serial_number, dash_cam_number, bestpass_number, fuel_card_number)
      `)
      .eq('is_active', true);

    if (error) {
      toast({ title: 'Error loading drivers', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const { data: assignments } = await supabase
      .from('equipment_assignments')
      .select('operator_id, equipment_items(device_type, serial_number, status)')
      .is('returned_at', null);

    const assignedByOperator: Record<string, Partial<Record<Slot, { serial: string; status: string }>>> = {};
    for (const a of (assignments ?? []) as any[]) {
      const item = Array.isArray(a.equipment_items) ? a.equipment_items[0] : a.equipment_items;
      if (!item || !a.operator_id) continue;
      const slot = item.device_type as Slot;
      if (!assignedByOperator[a.operator_id]) assignedByOperator[a.operator_id] = {};
      // First open assignment per slot wins
      if (!assignedByOperator[a.operator_id][slot]) {
        assignedByOperator[a.operator_id][slot] = { serial: item.serial_number, status: item.status };
      }
    }

    const built: DriverRow[] = ((ops ?? []) as any[])
      .filter(o => showDemo || !o.is_demo)
      .map(o => {
        const app = Array.isArray(o.applications) ? o.applications[0] : o.applications;
        const onb = Array.isArray(o.onboarding_status) ? o.onboarding_status[0] : o.onboarding_status;
        const inv = assignedByOperator[o.id] ?? {};
        return {
          operatorId: o.id,
          name: [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator',
          unitNumber: onb?.unit_number ?? o.unit_number ?? null,
          devices: {
            eld: makeDevice(inv.eld?.serial ?? null, onb?.eld_serial_number ?? null, inv.eld?.status ?? null),
            dash_cam: makeDevice(inv.dash_cam?.serial ?? null, onb?.dash_cam_number ?? null, inv.dash_cam?.status ?? null),
            bestpass: makeDevice(inv.bestpass?.serial ?? null, onb?.bestpass_number ?? null, inv.bestpass?.status ?? null),
            fuel_card: makeDevice(inv.fuel_card?.serial ?? null, onb?.fuel_card_number ?? null, inv.fuel_card?.status ?? null),
          },
        };
      });

    built.sort((a, b) => {
      const ua = a.unitNumber ?? '';
      const ub = b.unitNumber ?? '';
      if (ua && ub && ua !== ub) return ua.localeCompare(ub, undefined, { numeric: true });
      if (ua && !ub) return -1;
      if (!ua && ub) return 1;
      return a.name.localeCompare(b.name);
    });

    setRows(built);
    setLoading(false);
  }, [toast, showDemo]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (gapsOnly && r.devices.eld.value && r.devices.dash_cam.value) return false;
      if (!q) return true;
      const hay = [
        r.name,
        r.unitNumber ?? '',
        ...(Object.keys(r.devices) as Slot[]).flatMap(s => [r.devices[s].value ?? '', r.devices[s].onboarding ?? '']),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, gapsOnly]);

  const gapCount = rows.filter(r => !r.devices.eld.value || !r.devices.dash_cam.value).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading drivers...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search driver, unit #, serial number..."
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={gapsOnly ? 'default' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setGapsOnly(v => !v)}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Missing ELD or Dash Cam
            <Badge variant="secondary" className="ml-1">{gapCount}</Badge>
          </Button>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No drivers match this view.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(r => (
            <div key={r.operatorId} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">
                  {r.unitNumber ? `Unit ${r.unitNumber} · ` : ''}{r.name}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border">
                {(['eld', 'dash_cam'] as Slot[]).map(slot => {
                  const meta = SLOT_META[slot];
                  const d = r.devices[slot];
                  return (
                    <div key={slot} className="bg-card px-4 py-3 min-w-0">
                      <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide mb-1 ${meta.color}`}>
                        {meta.icon}{meta.label}
                      </p>
                      <DeviceValueText d={d} missingLabel={slot === 'eld' ? 'No ELD' : 'No Dash Cam'} />
                    </div>
                  );
                })}
              </div>
              {(r.devices.fuel_card.value || r.devices.bestpass.value) && (
                <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border">
                  {(['fuel_card', 'bestpass'] as Slot[]).map(slot => {
                    const d = r.devices[slot];
                    if (!d.value) return null;
                    const meta = SLOT_META[slot];
                    return (
                      <span key={slot} className="inline-flex items-center gap-1.5 min-w-0">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>
                          {meta.icon}{meta.label}
                        </span>
                        <DeviceValueText d={d} />
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                {['Unit #', 'Driver', 'ELD', 'Dash Camera', 'Fuel Card', 'BestPass'].map(h => (
                  <th key={h} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(r => (
                <tr key={r.operatorId} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-sm whitespace-nowrap">{r.unitNumber ?? '—'}</td>
                  <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{r.name}</td>
                  <td className="px-4 py-2"><DeviceValueText d={r.devices.eld} missingLabel="No ELD" /></td>
                  <td className="px-4 py-2"><DeviceValueText d={r.devices.dash_cam} missingLabel="No Dash Cam" /></td>
                  <td className="px-4 py-2"><DeviceValueText d={r.devices.fuel_card} /></td>
                  <td className="px-4 py-2"><DeviceValueText d={r.devices.bestpass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}