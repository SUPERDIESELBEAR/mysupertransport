import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Database, Loader2 } from 'lucide-react';
import { fetchProfileNames, formatProfileName, ProfileName } from '@/lib/profileNames';

type ModelRow = { id: string; provider_name: string; device_make: string; device_model: string };

type DeviceRow = {
  id: string;
  operator_id: string;
  eld_device_model_id: string | null;
  serial_number: string | null;
  truck_number: string | null;
  operators?: { unit_number: string | null; user_id: string | null } | null;
  /** Joined by a second read — operators has no FK to profiles. */
  driver?: ProfileName | null;
};

function isMalformed(d: DeviceRow) {
  const s = (d.serial_number ?? '').trim();
  return !d.eld_device_model_id || s.length < 4 || /^(n\/?a|none|unknown|test)$/i.test(s);
}

/** Staff view for spotting and fixing malformed ELD device records. */
export default function ELDDeviceDataQuality() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Partial<DeviceRow>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: modelData }] = await Promise.all([
      supabase
        .from('eld_devices')
        .select('id, operator_id, eld_device_model_id, serial_number, truck_number, operators!inner(unit_number, user_id)')
        .eq('is_active', true),
      supabase
        .from('eld_device_models')
        .select('id, provider_name, device_make, device_model')
        .eq('is_active', true)
        .order('provider_name'),
    ]);
    if (error) toast.error(error.message);
    setModels((modelData as ModelRow[]) ?? []);
    const malformed = ((data as unknown as DeviceRow[]) ?? []).filter(isMalformed);
    const names = await fetchProfileNames(malformed.map((d) => d.operators?.user_id));
    for (const d of malformed) {
      d.driver = d.operators?.user_id ? names.get(d.operators.user_id) ?? null : null;
    }
    setRows(malformed);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(row: DeviceRow) {
    const draft = drafts[row.id] ?? {};
    const modelId = draft.eld_device_model_id ?? row.eld_device_model_id;
    const serial = (draft.serial_number ?? row.serial_number ?? '').trim();
    if (!modelId || !serial) {
      toast.error('Pick a device model and enter a serial number.');
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from('eld_devices')
      .update({ eld_device_model_id: modelId, serial_number: serial })
      .eq('id', row.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Device record updated.');
    void load();
  }

  const name = (r: DeviceRow) => formatProfileName(r.driver);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Database className="h-4 w-4" /> Device data quality
      </div>
      <p className="text-xs text-muted-foreground">
        Devices missing a registered model or a usable serial number. Malfunction notices are weaker without them.
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
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  defaultValue={row.eld_device_model_id ?? undefined}
                  onValueChange={(v) => setDrafts((d) => ({ ...d, [row.id]: { ...d[row.id], eld_device_model_id: v } }))}
                >
                  <SelectTrigger><SelectValue placeholder="Device model" /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.provider_name} — {m.device_make} {m.device_model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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