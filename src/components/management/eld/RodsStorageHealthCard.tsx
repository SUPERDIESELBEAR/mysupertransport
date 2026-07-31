import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, HardDrive, Loader2, RefreshCw } from 'lucide-react';

type IncompletePurge = {
  audit_id: string;
  day_id: string;
  log_date: string | null;
  operator_id: string | null;
  reason: string | null;
  age_minutes: number;
  storage_paths: string[];
  still_present: string[];
};

type SweepResult = {
  scanned: number;
  referenced: number;
  orphans?: string[];
  removed?: string[];
  incompletePurges?: IncompletePurge[];
};

/**
 * Reader for purges that never confirmed their storage removal.
 *
 * `purge_rods_day` stamps `storage_disposition: 'pending_caller'` and the
 * edge function moves it to `completed`. A caller that crashed in between
 * leaves the stamp behind, along with the exact paths it failed to remove.
 * Those are known orphans; the reachability scan below them is the inferred
 * kind.
 */
export default function RodsStorageHealthCard() {
  const { isManagement } = useAuth();
  const [result, setResult] = useState<SweepResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const scan = useCallback(async (apply = false) => {
    apply ? setApplying(true) : setLoading(true);
    const { data, error } = await supabase.functions.invoke('sweep-rods-orphans', {
      body: { apply },
    });
    apply ? setApplying(false) : setLoading(false);
    if (error) {
      toast.error('Storage scan failed', { description: error.message });
      return;
    }
    const payload = (data?.data ?? data) as SweepResult;
    setResult(payload);
    if (apply) {
      toast.success(`Removed ${payload?.removed?.length ?? 0} unreferenced file(s)`);
      void scan(false);
    }
  }, []);

  useEffect(() => {
    if (isManagement) void scan(false);
  }, [isManagement, scan]);

  if (!isManagement) return null;

  const incomplete = result?.incompletePurges ?? [];
  const orphans = result?.orphans ?? [];
  const hasWork = incomplete.length > 0 || orphans.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          Duty-status storage
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => scan(false)} disabled={loading || applying}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {hasWork && (
            <Button size="sm" onClick={() => scan(true)} disabled={applying || loading}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clean up
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {incomplete.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {incomplete.length} purge{incomplete.length === 1 ? '' : 's'} did not confirm object removal
            </div>
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
              {incomplete.map((p) => (
                <li key={p.audit_id} className="space-y-1">
                  <div className="font-medium text-foreground">
                    {p.log_date ?? p.day_id}
                    <Badge variant="outline" className="ml-2">{p.age_minutes} min ago</Badge>
                  </div>
                  {p.reason && <div className="italic">{p.reason}</div>}
                  <div className="break-all font-mono">
                    {(p.still_present.length > 0 ? p.still_present : p.storage_paths).join(', ') || '—'}
                    {p.still_present.length === 0 && ' (already gone)'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          {result
            ? `${result.scanned} object(s) in the log bucket, ${result.referenced} referenced by a log, ${orphans.length} unreferenced.`
            : 'Not scanned yet.'}
        </div>
      </CardContent>
    </Card>
  );
}
