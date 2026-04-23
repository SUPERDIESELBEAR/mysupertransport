import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileSignature, CheckCircle2, Search } from 'lucide-react';
import LeaseTerminationViewModal from '@/components/ica/LeaseTerminationViewModal';

interface TerminationRow {
  id: string;
  operator_id: string;
  effective_date: string;
  reason: string;
  contractor_label: string | null;
  carrier_typed_name: string | null;
  insurance_notified_at: string | null;
  truck_vin: string | null;
  unit_number: string | null;
  driver_name: string;
}

const REASON_LABEL: Record<string, string> = {
  voluntary: 'Voluntary',
  mutual: 'Mutual',
  cause: 'For cause',
};

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  const dateStr = v.length === 10 ? `${v}T12:00:00` : v;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TerminationsView() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TerminationRow[]>([]);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openName, setOpenName] = useState<string>('');

  const load = async () => {
    setLoading(true);
    const { data: terms } = await supabase
      .from('lease_terminations' as any)
      .select('id, operator_id, effective_date, reason, contractor_label, carrier_typed_name, insurance_notified_at, truck_vin')
      .order('effective_date', { ascending: false });

    const list = (terms ?? []) as any[];
    const opIds = Array.from(new Set(list.map((r) => r.operator_id)));
    const operatorMap = new Map<string, { name: string; unit: string | null }>();

    if (opIds.length) {
      const [{ data: ops }, { data: oss }] = await Promise.all([
        supabase
          .from('operators')
          .select('id, application_id, unit_number, applications(first_name, last_name)')
          .in('id', opIds),
        supabase
          .from('onboarding_status')
          .select('operator_id, unit_number')
          .in('operator_id', opIds),
      ]);
      const unitFromOs = new Map((oss ?? []).map((r: any) => [r.operator_id, r.unit_number]));
      (ops ?? []).forEach((o: any) => {
        const app = Array.isArray(o.applications) ? o.applications[0] : o.applications;
        const name =
          [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';
        operatorMap.set(o.id, {
          name,
          unit: (unitFromOs.get(o.id) as string | null) ?? o.unit_number ?? null,
        });
      });
    }

    setRows(
      list.map((r) => ({
        id: r.id,
        operator_id: r.operator_id,
        effective_date: r.effective_date,
        reason: r.reason,
        contractor_label: r.contractor_label,
        carrier_typed_name: r.carrier_typed_name,
        insurance_notified_at: r.insurance_notified_at,
        truck_vin: r.truck_vin,
        unit_number: operatorMap.get(r.operator_id)?.unit ?? null,
        driver_name: operatorMap.get(r.operator_id)?.name ?? r.contractor_label ?? 'Driver',
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const years = useMemo(() => {
    const ys = new Set<string>();
    rows.forEach((r) => ys.add(String(new Date(`${r.effective_date}T12:00:00`).getFullYear())));
    return Array.from(ys).sort().reverse();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (yearFilter !== 'all' && String(new Date(`${r.effective_date}T12:00:00`).getFullYear()) !== yearFilter) return false;
    if (reasonFilter !== 'all' && r.reason !== reasonFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !r.driver_name.toLowerCase().includes(s) &&
        !(r.unit_number ?? '').toLowerCase().includes(s) &&
        !(r.truck_vin ?? '').toLowerCase().includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-gold" />
          Lease Terminations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Signed Appendix C lease termination notices and their delivery status to the insurance carrier.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search driver, unit, VIN…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Reason" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            <SelectItem value="voluntary">Voluntary</SelectItem>
            <SelectItem value="mutual">Mutual</SelectItem>
            <SelectItem value="cause">For cause</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No lease terminations found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Driver</th>
                <th className="text-left px-4 py-2 font-medium">Unit</th>
                <th className="text-left px-4 py-2 font-medium">Effective</th>
                <th className="text-left px-4 py-2 font-medium">Reason</th>
                <th className="text-left px-4 py-2 font-medium">Signed By</th>
                <th className="text-left px-4 py-2 font-medium">Insurance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => { setOpenId(r.id); setOpenName(r.driver_name); }}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{r.driver_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.unit_number ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.effective_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{REASON_LABEL[r.reason] ?? r.reason}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.carrier_typed_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.insurance_notified_at ? (
                      <span className="inline-flex items-center gap-1 text-status-complete text-xs font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {fmtDate(r.insurance_notified_at.slice(0, 10))}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">— not sent</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openId && (
        <LeaseTerminationViewModal
          terminationId={openId}
          operatorName={openName}
          onClose={() => { setOpenId(null); load(); }}
        />
      )}
    </div>
  );
}