import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GitCompareArrows, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchProfileNames, formatProfileName } from '@/lib/profileNames';

interface DivergenceRow {
  id: string;
  operator_id: string;
  log_date: string;
  local_row_id: string | null;
  server_row_id: string | null;
  differing_fields: string[] | null;
  local_values: Record<string, unknown> | null;
  server_values: Record<string, unknown> | null;
  detected_at: string;
  device_info: string | null;
  acknowledged: boolean;
  acknowledged_source: string | null;
  acknowledged_reason: string | null;
  acknowledged_at: string | null;
  is_demo: boolean;
  operators?: { unit_number: string | null; user_id: string | null } | null;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Office view of certified days whose copy on the driver's phone does not
 * match the office copy.
 *
 * Both copies are shown side by side and neither is ever overwritten from
 * here. Acknowledging records that a human looked at the pair and understood
 * why they differ — it does not reconcile the records, and it is written once.
 */
export default function RodsDivergencesPanel({
  operatorId, focusId,
}: { operatorId?: string; focusId?: string | null }) {
  const [rows, setRows] = useState<DivergenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('rods_divergences')
      .select('*, operators(unit_number, user_id)')
      .order('detected_at', { ascending: false })
      .limit(200);
    if (operatorId) query = query.eq('operator_id', operatorId);
    const { data, error } = await query;
    if (error) {
      toast.error('Could not load divergences.');
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as DivergenceRow[];
    const names = await fetchProfileNames(list.map((r) => r.operators?.user_id ?? null));
    setNameById(new Map(list.map((r) => [
      r.id, formatProfileName(names.get(r.operators?.user_id ?? '')),
    ])));
    setRows(list);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => rows.filter((r) => showResolved || !r.acknowledged || r.id === focusId),
    [rows, showResolved, focusId],
  );
  const openCount = rows.filter((r) => !r.acknowledged).length;

  async function acknowledge(row: DivergenceRow) {
    const reason = (reasonById[row.id] ?? '').trim();
    if (!reason) {
      toast.error('A written reason is required to resolve a divergence.');
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase.rpc('acknowledge_rods_divergence', {
      p_divergence_id: row.id,
      p_reason: reason,
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message ?? 'Could not record the acknowledgement.');
      return;
    }
    toast.success('Divergence acknowledged.');
    setReasonById((prev) => ({ ...prev, [row.id]: '' }));
    void load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
          Log divergences
          {openCount > 0 && <Badge variant="destructive">{openCount} open</Badge>}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { void load(); }} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No driver device reports a certified day that differs from the office copy.
          </p>
        )}
        {visible.map((row) => {
          const fields = row.differing_fields?.length ? row.differing_fields : ['row identity'];
          return (
            <div
              key={row.id}
              className={`rounded-lg border p-3 space-y-2 ${
                row.id === focusId ? 'border-primary' : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {nameById.get(row.id) ?? 'Driver'}
                  {row.operators?.unit_number ? ` — Unit ${row.operators.unit_number}` : ''}
                </span>
                <Badge variant="outline">{row.log_date}</Badge>
                {row.is_demo && <Badge variant="secondary">Demo</Badge>}
                {row.acknowledged ? (
                  <Badge variant="secondary">
                    Acknowledged{row.acknowledged_source === 'driver' ? ' by the driver' : ''}
                  </Badge>
                ) : (
                  <Badge variant="destructive">Open</Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Detected {new Date(row.detected_at).toLocaleString()}
                {row.device_info ? ` · ${row.device_info}` : ''}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Field</th>
                      <th className="py-1 pr-3 font-medium">Driver device</th>
                      <th className="py-1 font-medium">Office copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f} className="border-t border-border/60">
                        <td className="py-1 pr-3 font-medium text-foreground">{f}</td>
                        <td className="py-1 pr-3 text-foreground">
                          {renderValue(row.local_values?.[f])}
                        </td>
                        <td className="py-1 text-foreground">
                          {renderValue(row.server_values?.[f])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Device record {row.local_row_id ?? '—'} · office record {row.server_row_id ?? '—'}.
                Neither copy is altered by acknowledging.
              </p>

              {row.acknowledged ? (
                <p className="text-xs text-muted-foreground">
                  {row.acknowledged_reason}
                  {row.acknowledged_at
                    ? ` — ${new Date(row.acknowledged_at).toLocaleString()}`
                    : ''}
                </p>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={reasonById[row.id] ?? ''}
                    onChange={(e) => setReasonById((p) => ({ ...p, [row.id]: e.target.value }))}
                    placeholder="What explains the difference? This is written once and cannot be edited."
                    rows={2}
                  />
                  <Button
                    size="sm"
                    onClick={() => { void acknowledge(row); }}
                    disabled={savingId === row.id}
                  >
                    {savingId === row.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Acknowledge
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
