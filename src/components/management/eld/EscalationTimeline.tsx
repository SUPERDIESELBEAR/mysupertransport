import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LADDER_RUNGS_UI, evidenceRows, firedRungs, rungRows, type LedgerRow } from '@/lib/eld/escalationLedger';

/**
 * The §2 ledger for one event.
 *
 * Evidence-only by default: an `is_override` row came from a time-travelled or
 * channel-forced verification run and must never read as proof the office was
 * notified on time.
 */
interface Row extends LedgerRow {
  id: string;
  channel: string;
  sent_on: string;
  created_at: string;
  recipient_name: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  escalation_day: 'Repair-window escalation',
  ack_overdue: 'Not acknowledged',
  extension_prompt: 'Extension window prompt',
  pause_lapsed: 'Escalation pause ended',
};

export default function EscalationTimeline({
  eventId,
  skippedRungs = [],
}: {
  eventId: string;
  skippedRungs?: number[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverrides, setShowOverrides] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_eld_escalation_ledger', { p_event_id: eventId });
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const evidence = evidenceRows(rows);
  const visible = showOverrides ? rows : evidence;
  const overrideCount = rows.length - evidence.length;
  const evidenceRungs = firedRungs(evidence);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          {evidenceRungs.length > 0
            ? `Office notified on rung${evidenceRungs.length === 1 ? '' : 's'} ${evidenceRungs.join(', ')}`
            : 'No escalation rung has fired yet'}
          {overrideCount > 0 && (
            <span className="text-muted-foreground">
              {' '}— {overrideCount} verification run{overrideCount === 1 ? '' : 's'} not counted
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Switch id="show-overrides" checked={showOverrides} onCheckedChange={setShowOverrides} />
          <Label htmlFor="show-overrides" className="text-xs text-muted-foreground">
            Show verification runs
          </Label>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading ledger…</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Nothing sent for this event yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 p-2.5 text-xs">
                <span className="font-semibold text-foreground">
                  {TYPE_LABEL[r.notification_type] ?? r.notification_type}
                </span>
                {r.notification_type === 'escalation_day' && r.day_number != null && (
                  <Badge variant="outline">Day {r.day_number}</Badge>
                )}
                {r.notification_type === 'extension_prompt' && r.day_number != null && (
                  // day_number here is the day the prompt happened to fire, not
                  // a rung — say so rather than drawing it as one.
                  <span className="text-muted-foreground">fired on day {r.day_number}</span>
                )}
                {r.is_override && <Badge variant="secondary">verification run</Badge>}
                <span className="text-muted-foreground">
                  {r.sent_on} · {r.channel} · {r.recipient_name || 'staff recipient'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LADDER_RUNGS_UI.map((rung) => {
          const fired = evidenceRungs.includes(rung);
          const skipped = skippedRungs.includes(rung);
          return (
            <Badge
              key={rung}
              variant={fired ? 'default' : 'outline'}
              className={!fired && skipped ? 'line-through opacity-70' : undefined}
              title={skipped ? 'Elapsed before the driver reported it — not sent' : undefined}
            >
              Day {rung}
            </Badge>
          );
        })}
        {rungRows(rows).some((r) => (r.day_number ?? 0) >= 9) && <Badge variant="destructive">Past deadline</Badge>}
      </div>
      {skippedRungs.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Day {skippedRungs.join(', ')} elapsed before the driver reported it — not sent.
        </p>
      )}
    </div>
  );
}