import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Truck, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';

interface FleetRow {
  operatorId: string;
  unitNumber: string | null;
  driverName: string;
  ownerName: string;
  truckYear: string | null;
  truckMake: string | null;
  truckModel: string | null;
  truckVin: string | null;
  totalRepairCost: number;
  dotNextDue: string | null;
}

interface FleetRosterProps {
  onSelectOperator: (operatorId: string) => void;
}

function dotStatusBadge(nextDue: string | null) {
  if (!nextDue) return <Badge variant="outline" className="text-[10px]">No Record</Badge>;
  const days = differenceInDays(startOfDay(parseISO(nextDue)), startOfDay(new Date()));
  if (days < 0) return <Badge variant="destructive" className="text-[10px]">Overdue</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">{days}d</Badge>;
  if (days <= 90) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">{days}d</Badge>;
  return <Badge variant="outline" className="text-[10px] text-emerald-700">{days}d</Badge>;
}

export default function FleetRoster({ onSelectOperator }: FleetRosterProps) {
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchFleet = useCallback(async () => {
    setLoading(true);

    // Get operators with their truck info from onboarding_status + ICA + application name
    const { data: operators } = await supabase
      .from('operators')
      .select(`
        id,
        unit_number,
        applications(first_name, last_name),
        onboarding_status(unit_number, truck_year, truck_make, truck_model, truck_vin),
        ica_contracts(owner_name, owner_business_name, truck_year, truck_make, truck_model, truck_vin)
      `)
      .eq('is_active', true);

    if (!operators) { setLoading(false); return; }

    // Get total repair costs per operator
    const { data: maintenance } = await supabase
      .from('truck_maintenance_records')
      .select('operator_id, amount');

    const costMap = new Map<string, number>();
    (maintenance ?? []).forEach((r: any) => {
      costMap.set(r.operator_id, (costMap.get(r.operator_id) ?? 0) + Number(r.amount ?? 0));
    });

    // Get latest DOT inspection per operator
    const { data: dotInspections } = await supabase
      .from('truck_dot_inspections')
      .select('operator_id, next_due_date')
      .order('inspection_date', { ascending: false });

    const dotMap = new Map<string, string>();
    (dotInspections ?? []).forEach((r: any) => {
      if (!dotMap.has(r.operator_id)) dotMap.set(r.operator_id, r.next_due_date);
    });

    const fleet: FleetRow[] = (operators as any[]).map(op => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
      const ica = Array.isArray(op.ica_contracts) ? op.ica_contracts[0] : op.ica_contracts;

      const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown';
      const ownerName = ica?.owner_name || ica?.owner_business_name || driverName;

      return {
        operatorId: op.id,
        unitNumber: os?.unit_number || op.unit_number || null,
        driverName,
        ownerName,
        truckYear: os?.truck_year || ica?.truck_year || null,
        truckMake: os?.truck_make || ica?.truck_make || null,
        truckModel: os?.truck_model || ica?.truck_model || null,
        truckVin: os?.truck_vin || ica?.truck_vin || null,
        totalRepairCost: costMap.get(op.id) ?? 0,
        dotNextDue: dotMap.get(op.id) ?? null,
      };
    });

    fleet.sort((a, b) => {
      const aNum = parseInt(a.unitNumber ?? '99999');
      const bNum = parseInt(b.unitNumber ?? '99999');
      return aNum - bNum;
    });

    setRows(fleet);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFleet(); }, [fetchFleet]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.driverName.toLowerCase().includes(q) ||
      r.ownerName.toLowerCase().includes(q) ||
      (r.unitNumber ?? '').toLowerCase().includes(q) ||
      (r.truckVin ?? '').toLowerCase().includes(q) ||
      (r.truckMake ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Vehicle Hub</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{rows.length} vehicle{rows.length !== 1 ? 's' : ''} in fleet</p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vehicles…"
            className="pl-9 text-sm h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
          <p className="text-sm">Loading fleet…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? 'No vehicles match your search.' : 'No active vehicles found.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-semibold w-20">Unit #</TableHead>
                  <TableHead className="text-xs font-semibold">Driver</TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Owner</TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell">Vehicle</TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">VIN</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Repair Cost</TableHead>
                  <TableHead className="text-xs font-semibold text-center">DOT Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => (
                  <TableRow
                    key={row.operatorId}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => onSelectOperator(row.operatorId)}
                  >
                    <TableCell className="text-xs font-mono font-semibold text-primary">
                      {row.unitNumber || '—'}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{row.driverName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{row.ownerName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                      {[row.truckYear, row.truckMake, row.truckModel].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {row.totalRepairCost > 0 ? `$${row.totalRepairCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {dotStatusBadge(row.dotNextDue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
