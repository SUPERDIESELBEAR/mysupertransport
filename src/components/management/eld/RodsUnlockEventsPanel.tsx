import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Unlock } from 'lucide-react';

interface UnlockRow {
  id: string;
  operator_id: string;
  log_date: string;
  unlocked_at: string;
  local_certified_at: string | null;
  reason: string;
  device_info: string | null;
  cancelled_entry_ids: unknown;
  operators?: { driver_name: string | null; unit_number: string | null } | null;
}

/**
 * Office view of every log a driver reopened after signing it.
 *
 * This is an append-only federal-record audit trail, not a work queue: there
 * is nothing to acknowledge or clear here. The bell already carried the event
 * at the moment it happened; this is where it stays readable afterwards.
 */
export default function RodsUnlockEventsPanel({ operatorId }: { operatorId?: string }) {
  const [rows, setRows] = useState<UnlockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('rods_unlock_events')
      .select('*, operators(driver_name, unit_number)')
      .order('unlocked_at', { ascending: false })
      .limit(100);
    if (operatorId) query = query.eq('operator_id', operatorId);
    const { data } = await query;
    setRows((data ?? []) as unknown as UnlockRow[]);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Unlock className="h-4 w-4 text-muted-foreground" />
          Reopened logs
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => { void load(); }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No driver has reopened a signed log.
          </p>
        )}
        {rows.map((row) => {
          const cancelledCount = Array.isArray(row.cancelled_entry_ids)
            ? row.cancelled_entry_ids.length : 0;
          return (
            <div key={row.id} className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {row.operators?.driver_name ?? 'Driver'}
                  {row.operators?.unit_number ? ` — Unit ${row.operators.unit_number}` : ''}
                </span>
                <Badge variant="outline" className="shrink-0 whitespace-nowrap">Log {row.log_date}</Badge>
                {cancelledCount > 0 && (
                  <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                    {cancelledCount} queued item{cancelledCount === 1 ? '' : 's'} cancelled
                  </Badge>
                )}
              </div>
              <p className="text-sm text-foreground">{row.reason}</p>
              <p className="text-xs text-muted-foreground">
                Signed on device {row.local_certified_at
                  ? new Date(row.local_certified_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })
                  : 'unknown'}
                {' · reopened '}
                {new Date(row.unlocked_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}