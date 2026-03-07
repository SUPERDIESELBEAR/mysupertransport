import { useState, useEffect } from 'react';
import StaffLayout from '@/components/layouts/StaffLayout';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LayoutDashboard, Truck, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DispatchStatusType = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

interface DispatchRow {
  operator_id: string;
  dispatch_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  unit_number: string | null;
  dispatch_status: DispatchStatusType;
  assigned_dispatcher: string | null;
  current_load_lane: string | null;
  eta_redispatch: string | null;
  status_notes: string | null;
}

const statusConfig: Record<DispatchStatusType, { label: string; rowClass: string; badgeClass: string }> = {
  not_dispatched: { label: 'Not Dispatched', rowClass: '', badgeClass: 'status-neutral border' },
  dispatched: { label: 'Dispatched', rowClass: 'bg-status-complete/5', badgeClass: 'status-complete border' },
  home: { label: 'Home', rowClass: 'bg-status-progress/5', badgeClass: 'status-progress border' },
  truck_down: { label: 'Truck Down', rowClass: 'bg-destructive/5', badgeClass: 'status-action border' },
};

export default function DispatchPortal() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<DispatchRow>>({});

  useEffect(() => {
    fetchDispatch();
  }, []);

  const fetchDispatch = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('operators')
      .select(`
        id,
        unit_number,
        profiles!operators_user_id_fkey (first_name, last_name, phone, home_state),
        onboarding_status (fully_onboarded, unit_number),
        active_dispatch (id, dispatch_status, assigned_dispatcher, current_load_lane, eta_redispatch, status_notes)
      `);

    if (data) {
      const mapped: DispatchRow[] = (data as any[])
        .filter(op => op.onboarding_status?.[0]?.fully_onboarded)
        .map(op => {
          const d = op.active_dispatch?.[0] ?? {};
          const p = op.profiles ?? {};
          return {
            operator_id: op.id,
            dispatch_id: d.id ?? null,
            first_name: p.first_name,
            last_name: p.last_name,
            phone: p.phone,
            home_state: p.home_state,
            unit_number: op.onboarding_status?.[0]?.unit_number ?? op.unit_number ?? null,
            dispatch_status: (d.dispatch_status ?? 'not_dispatched') as DispatchStatusType,
            assigned_dispatcher: d.assigned_dispatcher ?? null,
            current_load_lane: d.current_load_lane ?? null,
            eta_redispatch: d.eta_redispatch ?? null,
            status_notes: d.status_notes ?? null,
          };
        });
      setRows(mapped);
    }
    setLoading(false);
  };

  const startEdit = (row: DispatchRow) => {
    setEditRow(row.operator_id);
    setEditData({
      dispatch_status: row.dispatch_status,
      current_load_lane: row.current_load_lane,
      eta_redispatch: row.eta_redispatch,
      status_notes: row.status_notes,
    });
  };

  const saveEdit = async (row: DispatchRow) => {
    const payload = {
      operator_id: row.operator_id,
      dispatch_status: editData.dispatch_status ?? 'not_dispatched',
      current_load_lane: editData.current_load_lane ?? null,
      eta_redispatch: editData.eta_redispatch ?? null,
      status_notes: editData.status_notes ?? null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (row.dispatch_id) {
      ({ error } = await supabase.from('active_dispatch').update(payload).eq('id', row.dispatch_id));
    } else {
      ({ error } = await supabase.from('active_dispatch').insert(payload));
    }

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: 'Dispatch status saved.' });
      setEditRow(null);
      fetchDispatch();
    }
  };

  const counts = {
    total: rows.length,
    dispatched: rows.filter(r => r.dispatch_status === 'dispatched').length,
    home: rows.filter(r => r.dispatch_status === 'home').length,
    truck_down: rows.filter(r => r.dispatch_status === 'truck_down').length,
    not_dispatched: rows.filter(r => r.dispatch_status === 'not_dispatched').length,
  };

  const navItems = [
    { label: 'Active Operators', icon: <Truck className="h-4 w-4" />, path: 'dispatch' },
  ];

  return (
    <StaffLayout navItems={navItems} currentPath="dispatch" onNavigate={() => {}} title="Dispatch">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Active Operators</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage dispatch status for all active operators</p>
        </div>

        {/* Ticker */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Active', value: counts.total, icon: <Users className="h-4 w-4 text-gold" />, color: 'border-gold/30' },
            { label: 'Dispatched', value: counts.dispatched, icon: <CheckCircle2 className="h-4 w-4 text-status-complete" />, color: 'border-status-complete/30' },
            { label: 'Home', value: counts.home, icon: <LayoutDashboard className="h-4 w-4 text-status-progress" />, color: 'border-status-progress/30' },
            { label: 'Truck Down', value: counts.truck_down, icon: <AlertTriangle className="h-4 w-4 text-destructive" />, color: 'border-destructive/30' },
            { label: 'Not Dispatched', value: counts.not_dispatched, icon: <Truck className="h-4 w-4 text-muted-foreground" />, color: 'border-border' },
          ].map(m => (
            <div key={m.label} className={`bg-white border ${m.color} rounded-xl p-3 shadow-sm`}>
              <div className="flex items-center gap-2">
                {m.icon}
                <div>
                  <p className="text-xl font-bold text-foreground">{m.value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{m.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Dispatch table */}
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Operator</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Unit #</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">Load / Lane</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">ETA Redispatch</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground hidden xl:table-cell">Notes</th>
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12"><div className="flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" /></div></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No active operators yet.</td></tr>
                ) : rows.map(row => {
                  const cfg = statusConfig[row.dispatch_status];
                  const isEditing = editRow === row.operator_id;
                  return (
                    <tr key={row.operator_id} className={`border-b border-border last:border-0 transition-colors ${cfg.rowClass}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—'}</p>
                        <p className="text-xs text-muted-foreground">{row.phone ?? ''}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{row.unit_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Select value={editData.dispatch_status} onValueChange={v => setEditData(p => ({ ...p, dispatch_status: v as DispatchStatusType }))}>
                            <SelectTrigger className="h-8 text-xs w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_dispatched">Not Dispatched</SelectItem>
                              <SelectItem value="dispatched">Dispatched</SelectItem>
                              <SelectItem value="home">Home</SelectItem>
                              <SelectItem value="truck_down">Truck Down</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={`${cfg.badgeClass} text-xs`}>{cfg.label}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isEditing ? (
                          <Input value={editData.current_load_lane ?? ''} onChange={e => setEditData(p => ({ ...p, current_load_lane: e.target.value }))} className="h-8 text-xs w-40" placeholder="e.g. ATL→CHI" />
                        ) : <span className="text-muted-foreground text-xs">{row.current_load_lane ?? '—'}</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isEditing ? (
                          <Input value={editData.eta_redispatch ?? ''} onChange={e => setEditData(p => ({ ...p, eta_redispatch: e.target.value }))} className="h-8 text-xs w-32" placeholder="e.g. Fri AM" />
                        ) : <span className="text-muted-foreground text-xs">{row.eta_redispatch ?? '—'}</span>}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell max-w-[200px]">
                        {isEditing ? (
                          <Input value={editData.status_notes ?? ''} onChange={e => setEditData(p => ({ ...p, status_notes: e.target.value }))} className="h-8 text-xs" placeholder="Notes…" />
                        ) : <span className="text-muted-foreground text-xs truncate block">{row.status_notes ?? '—'}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" onClick={() => saveEdit(row)} className="h-7 text-xs bg-gold text-surface-dark hover:bg-gold-light">Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditRow(null)} className="h-7 text-xs">Cancel</Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => startEdit(row)} className="h-7 text-xs text-gold hover:bg-gold/10">Edit</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
