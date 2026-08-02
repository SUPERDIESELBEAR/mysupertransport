import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Loader2, ShieldCheck, ExternalLink } from 'lucide-react';
import RevokedListCheckModal from './RevokedListCheckModal';
import {
  ageBand, daysSinceCheck, daysUntil, DEVICE_MODEL_SELECT, RESULT_LABEL,
  type DeviceModelRow,
} from '@/lib/eld/revokedList';

interface AssignedTruck {
  modelId: string;
  truckNumber: string | null;
  unitNumber: string | null;
}

const BAND_CLASS: Record<string, string> = {
  gold: 'border-primary/40 bg-primary/5',
  amber: 'border-amber-500/50 bg-amber-500/5',
  red: 'border-destructive/50 bg-destructive/5',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function ELDDeviceModelsPanel() {
  const [models, setModels] = useState<DeviceModelRow[]>([]);
  const [trucks, setTrucks] = useState<AssignedTruck[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<DeviceModelRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: modelRows }, { data: deviceRows }] = await Promise.all([
      supabase.from('eld_device_models').select(DEVICE_MODEL_SELECT)
        .order('provider_name').order('device_model'),
      // Demo operators never count toward exposure: a sandbox driver is not a
      // truck on the road.
      supabase.from('eld_devices')
        .select('eld_device_model_id, truck_number, operators!inner(unit_number, is_demo)')
        .eq('is_active', true)
        .eq('operators.is_demo', false),
    ]);
    setModels((modelRows as unknown as DeviceModelRow[]) ?? []);
    setTrucks(((deviceRows ?? []) as any[])
      .filter((d) => d.eld_device_model_id)
      .map((d) => ({
        modelId: d.eld_device_model_id as string,
        truckNumber: d.truck_number ?? null,
        unitNumber: d.operators?.unit_number ?? null,
      })));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const truckCount = useCallback(
    (modelId: string) => trucks.filter((t) => t.modelId === modelId).length,
    [trucks],
  );

  // The banner keys on a revoked model that still has assigned active devices,
  // NOT on eld_device_models.is_active. Deactivating the model in the registry
  // does not replace the hardware, and clearing a red banner is exactly what a
  // stressed admin reaches for. When the fleet genuinely retires the model the
  // truck count falls to zero and the banner clears on its own — a fact rather
  // than a flag someone set.
  const revokedInUse = useMemo(
    () => models.filter((m) => m.last_check_result === 'revoked' && truckCount(m.id) > 0),
    [models, truckCount],
  );

  const sorted = useMemo(() => {
    const rank = (m: DeviceModelRow) =>
      m.last_check_result === 'revoked' ? 0
        : ageBand(m) === 'red' ? 1 : ageBand(m) === 'amber' ? 2 : 3;
    return [...models].sort((a, b) => rank(a) - rank(b)
      || a.provider_name.localeCompare(b.provider_name));
  }, [models]);

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading device models…
    </div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ELD Device Models</h1>
        <p className="text-sm text-muted-foreground">
          49 CFR 395.8(a)(1) requires a device that is self-certified and registered on
          FMCSA's list. FMCSA publishes no API, so this check is done by hand and recorded here.
        </p>
      </div>

      {revokedInUse.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {revokedInUse.length === 1 ? 'A revoked ELD model is still in service'
                : `${revokedInUse.length} revoked ELD models are still in service`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {revokedInUse.map((m) => {
              const list = trucks.filter((t) => t.modelId === m.id);
              const left = daysUntil(m.replacement_deadline);
              return (
                <div key={m.id} className="space-y-2">
                  <div className="font-semibold">
                    {m.provider_name} · {m.device_make} {m.device_model}
                    {!m.is_active && (
                      <Badge variant="outline" className="ml-2">Deactivated in registry</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    Revoked {fmt(m.revocation_date)} · Replacement deadline {fmt(m.replacement_deadline)}
                    {left !== null && (
                      <> · <span className="font-semibold text-destructive">
                        {left >= 0 ? `${left} day${left === 1 ? '' : 's'} left` : `${Math.abs(left)} days past deadline`}
                      </span></>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {list.map((t, i) => (
                      <Badge key={`${m.id}-${i}`} variant="secondary">
                        {t.truckNumber || t.unitNumber || 'Unassigned unit'}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Replacing the hardware clears this. Deactivating the model in the registry does not:
              the banner counts trucks actually running the device.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {sorted.map((m) => {
          const band = ageBand(m);
          const days = daysSinceCheck(m.last_check_at);
          const count = truckCount(m.id);
          return (
            <Card key={m.id} className={BAND_CLASS[band]}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.device_make} {m.device_model}</span>
                    <span className="text-sm text-muted-foreground">{m.provider_name}</span>
                    {m.last_check_result && (
                      <Badge variant={m.last_check_result === 'revoked' ? 'destructive' : 'secondary'}>
                        {RESULT_LABEL[m.last_check_result]}
                      </Badge>
                    )}
                    {!m.is_active && <Badge variant="outline">Deactivated</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    FMCSA registration ID: {m.fmcsa_registration_id || '— not recorded (not required on any federal document) —'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {count} truck{count === 1 ? '' : 's'} assigned ·{' '}
                    {m.last_check_at
                      ? `Last checked ${fmt(m.last_check_at)} (${days} day${days === 1 ? '' : 's'} ago)`
                      : 'Never checked'}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => setTarget(m)}>
                    <ShieldCheck className="mr-1.5 h-4 w-4" /> Verify
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5" />
        Verification opens FMCSA's registered and revoked lists; the outcome is recorded by hand
        and kept permanently in the retention archive.
      </p>

      <RevokedListCheckModal
        model={target}
        open={!!target}
        onOpenChange={(v) => { if (!v) setTarget(null); }}
        onRecorded={() => void load()}
      />
    </div>
  );
}