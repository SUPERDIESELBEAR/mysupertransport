import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

/**
 * Passive health read of `eld_cron_runs`. No watchdog job: the console reads on
 * load and the staff member is the detector. If nobody opens this page for two
 * days, the missing escalations are the signal that fails first, not this card.
 */
const STALE_AFTER_MINUTES = 90; // hourly schedule + grace

interface Run {
  id: string;
  job_name: string;
  trigger_source: string;
  is_override: boolean;
  effective_date: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  events_evaluated: number;
  ledger_rows_inserted: number;
  emails_sent: number;
  status: string;
  error_text: string | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

export default function ELDEscalationJobHealth() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('eld_cron_runs')
      .select('*')
      .eq('job_name', 'process-eld-escalations')
      .order('started_at', { ascending: false })
      .limit(12);
    setRuns((data as unknown as Run[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const last = runs[0] ?? null;
  const ageMin = last ? (Date.now() - new Date(last.started_at).getTime()) / 60000 : Infinity;
  const stale = ageMin > STALE_AFTER_MINUTES;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Escalation job</span>
        {loading ? (
          <span className="text-xs text-muted-foreground">Checking…</span>
        ) : !last ? (
          <Badge variant="destructive">Never run</Badge>
        ) : stale ? (
          <Badge variant="destructive">
            No run in {Math.floor(ageMin / 60)}h — the repair clock is unattended
          </Badge>
        ) : (
          <Badge variant="outline">Healthy</Badge>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void load()}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {last && (
        <div className="space-y-1 p-3 text-xs">
          <p className="text-foreground">
            Ran {fmt(last.started_at)} CT ({last.trigger_source}
            {last.is_override ? ', override' : ''}) — {last.events_evaluated} event
            {last.events_evaluated === 1 ? '' : 's'} evaluated,{' '}
            {last.ledger_rows_inserted === 0 && last.emails_sent === 0
              ? 'nothing due'
              : `${last.ledger_rows_inserted} ledger row${last.ledger_rows_inserted === 1 ? '' : 's'}, ${last.emails_sent} email${last.emails_sent === 1 ? '' : 's'}`}
            . Status: {last.status}
            {last.duration_ms != null ? ` · ${last.duration_ms}ms` : ''}
          </p>
          {last.error_text && <p className="text-destructive">{last.error_text}</p>}

          <button
            type="button"
            className="flex items-center gap-1 pt-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Recent runs
          </button>
          {open && (
            <div className="overflow-x-auto pt-1">
              <table className="w-full text-left text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Started</th>
                    <th className="py-1 pr-3 font-medium">Source</th>
                    <th className="py-1 pr-3 font-medium">Events</th>
                    <th className="py-1 pr-3 font-medium">Ledger</th>
                    <th className="py-1 pr-3 font-medium">Emails</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="py-1 pr-3 whitespace-nowrap">{fmt(r.started_at)}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">
                        {r.trigger_source}{r.is_override ? ' · override' : ''}
                      </td>
                      <td className="py-1 pr-3">{r.events_evaluated}</td>
                      <td className="py-1 pr-3">{r.ledger_rows_inserted}</td>
                      <td className="py-1 pr-3">{r.emails_sent}</td>
                      <td className="py-1">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}