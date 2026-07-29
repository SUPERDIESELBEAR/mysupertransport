import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Database, Loader2 } from 'lucide-react';

type DeviceRow = {
  id: string;
  operator_id: string;
  provider: string | null;
  model: string | null;
  serial_number: string | null;
  operators?: { unit_number: string | null; profiles?: { first_name: string | null; last_name: string | null } | null } | null;
};

function isMalformed(d: DeviceRow) {
  const s = (d.serial_number ?? '').trim();
  return !d.provider?.trim() || !d.model?.trim() || s.length < 4 || /^(n\/?a|none|unknown|test)$/i.test(s);
}

/** Staff view for spotting and fixing malformed ELD device records. */
export default function ELDDeviceDataQuality() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Partial<DeviceRow>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('eld_devices')
      .select('id, operator_id, provider, model, serial_number, operators!inner(unit_number, profiles(first_name, last_name))')
      .eq('is_active', true);
    if (error) toast.error(error.message);
    setRows(((data as unknown as DeviceRow[]) ?? []).filter(isMalformed));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(row: DeviceRow) {
    const draft = drafts[row.id] ?? {};
    setSavingId(row.id);
    const { error } = await supabase
      .from('eld_devices')
      .update({
        provider: (draft.provider ?? row.provider ?? '').trim() || null,
        model: (draft.model ?? row.model ?? '').trim() || null,
        serial_number: (draft.serial_number ?? row.serial_number ?? '').trim() || null,
      })
      .eq('id', row.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Device record updated.');
    void load();
  }

  const name = (r: DeviceRow) => {
    const p = r.operators?.profiles;
    return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Driver';
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Database className="h-4 w-4" /> Device data quality
      </div>
      <p className="text-xs text-muted-foreground">
        Devices missing a provider, model, or a usable serial number. Malfunction notices are weaker without them.
      </p>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Checking…</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">All active device records look complete.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3 space-y-2">
              <div className="text-xs font-medium text-foreground">
                {name(row)} · Unit {row.operators?.unit_number || '—'}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Provider" defaultValue={row.provider ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: { ...d[row.id], provider: e.target.value } }))}
                />
                <Input
                  placeholder="Model" defaultValue={row.model ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: { ...d[row.id], model: e.target.value } }))}
                />
                <Input
                  placeholder="Serial number" defaultValue={row.serial_number ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: { ...d[row.id], serial_number: e.target.value } }))}
                />
              </div>
              <Button size="sm" variant="outline" disabled={savingId === row.id} onClick={() => save(row)}>
                {savingId === row.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null} Save
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}