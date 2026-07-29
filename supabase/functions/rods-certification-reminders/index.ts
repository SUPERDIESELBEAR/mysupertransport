/**
 * Hourly job. For every driver with an open ELD malfunction, decides whether it
 * is 08:00 or 20:00 in that driver's home terminal timezone and, if so, sends
 * the appropriate paper-log reminder.
 *
 * Rules:
 *  - Never prompt a driver to certify a 24-hour period that has not ended. The
 *    08:00 reminder always targets the MOST RECENTLY COMPLETED day (yesterday
 *    in the driver's local timezone), and only when it is uncertified.
 *  - While reconstruction is incomplete (any of the 8 required days is Needed
 *    or In progress), the 08:00 single-day reminder is suppressed and replaced
 *    with the reconstruction count.
 *  - The 20:00 nudge only says to keep the log current. It never mentions
 *    certifying, because that day is still running.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const RECONSTRUCTION_DAYS = 8;

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
    .select('id, user_id, home_terminal_timezone')
    .in('id', operatorIds);

  let sent = 0;

  for (const op of operators ?? []) {
    const tz = (op.home_terminal_timezone as string) || 'America/Chicago';
    let local: { date: string; hour: number };
    try {
      local = localParts(tz, now);
    } catch {
      local = localParts('America/Chicago', now);
    }
    if (local.hour !== 8 && local.hour !== 20) continue;
    if (!op.user_id) continue;

    const windowStart = shiftDate(local.date, -(RECONSTRUCTION_DAYS - 1));
    const { data: days } = await supabase
      .from('rods_days')
      .select('log_date, status, record_source')
      .eq('operator_id', op.id)
      .neq('status', 'superseded')
      .gte('log_date', windowStart)
      .lte('log_date', local.date);

    const rows = days ?? [];
    const completeDates = new Set(
      rows.filter((r) => r.status === 'certified').map((r) => r.log_date as string),
    );
    let completeCount = 0;
    for (let i = 0; i < RECONSTRUCTION_DAYS; i += 1) {
      if (completeDates.has(shiftDate(local.date, -i))) completeCount += 1;
    }
    const reconstructionComplete = completeCount === RECONSTRUCTION_DAYS;

    let title: string | null = null;
    let body: string | null = null;
    let type = 'rods_certify_reminder';

    if (local.hour === 8) {
      if (!reconstructionComplete) {
        type = 'rods_reconstruction_reminder';
        title = 'Reconstruction incomplete';
        body = `${RECONSTRUCTION_DAYS - completeCount} of ${RECONSTRUCTION_DAYS} days still needed.`;
      } else {
        const yesterday = shiftDate(local.date, -1);
        if (!completeDates.has(yesterday)) {
          title = 'Certify yesterday\u2019s log';
          body = `Your paper log for ${yesterday} is not certified yet.`;
        }
      }
    } else {
      // 20:00 — the day is still running, so this never mentions certifying.
      type = 'rods_keep_current_reminder';
      title = 'Keep your paper log current';
      body = 'Record any changes of duty status from today before you go off duty.';
    }

    if (!title) continue;

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