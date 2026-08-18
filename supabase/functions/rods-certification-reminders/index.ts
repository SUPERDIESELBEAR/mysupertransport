/**
 * Hourly job. For every driver with an open ELD malfunction, decides whether it
 * is 08:00 in that driver's home terminal timezone and, if so, reminds them
 * about a completed day they have not certified.
 *
 * Rules:
 *  - Never prompt a driver to certify a 24-hour period that has not ended. The
 *    reminder targets the MOST RECENTLY COMPLETED day (yesterday in the
 *    driver's local timezone), and only when it is uncertified.
 *  - This is a backstop, not the prompt. The app itself asks the driver to
 *    certify on the first open after midnight; a notification that arrives
 *    before they have had a working day to sign is noise, so nothing fires
 *    until the day has been closed for a full 24 hours.
 *  - The 20:00 "keep your log current" nudge was removed with the tap-to-change
 *    redesign: a status now runs until the next tap, so there is no unfinished
 *    entry to go back and close out at the end of a shift.
 *  - Demo drivers are excluded. A sandbox account generating real reminders
 *    trains staff to ignore them.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * How long a completed day is left alone before the backstop fires. The app's
 * own rollover prompt gets the whole of the following day first.
 */
const GRACE_HOURS = 24;

function localParts(tz: string, now: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = parseInt(parts.hour === '24' ? '0' : parts.hour, 10);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour };
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const now = new Date();
  const results: Array<Record<string, unknown>> = [];

  const { data: events, error: evErr } = await supabase
    .from('eld_malfunction_events')
    .select('operator_id, resolved_at')
    .is('resolved_at', null);
  if (evErr) {
    return new Response(JSON.stringify({ error: evErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const operatorIds = [...new Set((events ?? []).map((e) => e.operator_id as string))];
  if (operatorIds.length === 0) {
    return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: operators } = await supabase
    .from('operators')
    .select('id, user_id, home_terminal_timezone, is_demo')
    .in('id', operatorIds)
    .or('is_demo.is.null,is_demo.eq.false');

  let sent = 0;

  for (const op of operators ?? []) {
    const tz = (op.home_terminal_timezone as string) || 'America/Chicago';
    let local: { date: string; hour: number };
    try {
      local = localParts(tz, now);
    } catch {
      local = localParts('America/Chicago', now);
    }
    if (local.hour !== 8) continue;
    if (!op.user_id) continue;

    // Only ever the last completed day, and only once it has been closed for a
    // full grace period. At 08:00 local, yesterday ended 8 hours ago, so the
    // day this can speak to is the day before that.
    const targetDate = shiftDate(local.date, local.hour >= GRACE_HOURS ? -1 : -2);
    const windowStart = targetDate;
    const { data: days } = await supabase
      .from('rods_days')
      .select('log_date, status, record_source')
      .eq('operator_id', op.id)
      .neq('status', 'superseded')
      .gte('log_date', windowStart)
      .lte('log_date', targetDate);

    const rows = days ?? [];
    // BLIND SPOT: this query only sees the server-side rods_days row. It does
    // not see device-local state from the offline queue (local_certified_at,
    // sync_rejected, sync_stalled) in IndexedDB. A driver who has signed and
    // locked a log on their phone but has not yet synced will still receive the
    // reminder until the queue uploads. Fixing this requires a server-side
    // heartbeat or sync-state event; do not assume the row is the whole truth.
    const completeDates = new Set(
      rows.filter((r) => r.status === 'certified').map((r) => r.log_date as string),
    );
    // Nothing on file for that day is not the same as an uncertified log. A
    // driver whose ELD came back, or who was off, has no row — and gets no
    // reminder. Only a day that exists and is not certified is chased.
    const hasRow = rows.some((r) => r.log_date === targetDate);
    if (!hasRow || completeDates.has(targetDate)) continue;

    const type = 'rods_certify_reminder';
    const title = 'Certify your paper log';
    const body = `Your paper log for ${targetDate} is not certified yet.`;

    // One of each reminder type per local day.
    const since = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', op.user_id)
      .eq('type', type)
      .gte('sent_at', since)
      .limit(1);
    if ((existing?.length ?? 0) > 0) continue;

    const { error } = await supabase.from('notifications').insert({
      user_id: op.user_id,
      type,
      title,
      body,
      link: '/operator/paper-logs',
      priority: 'action',
    });
    if (!error) sent += 1;
    results.push({ operator_id: op.id, tz, hour: local.hour, type, sent: !error });
  }

  return new Response(JSON.stringify({ checked: operators?.length ?? 0, sent, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});