// Quarterly Inspection Program reminders.
//
// Runs daily. Sends an in-app notification (and an email when Resend is
// configured) at three points relative to a driver's assigned inspection month:
//   30 days before the month starts, 14 days before month end, 3 days before month end.
// One send per driver per cycle per stage — the notification row itself is the
// idempotency record, so a re-run on the same day sends nothing twice.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROUP_MONTHS: Record<'A' | 'B', number[]> = { A: [1, 4, 7, 10], B: [3, 6, 9, 12] };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function groupFor(unit: string | null): 'A' | 'B' | null {
  if (!unit) return null;
  const digits = String(unit).replace(/\D/g, '');
  if (!digits) return null;
  return Number(digits[digits.length - 1]) % 2 === 1 ? 'A' : 'B';
}

function nextCycle(group: 'A' | 'B', from: Date) {
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth() + 1;
  for (let i = 0; i < 24; i++) {
    if (GROUP_MONTHS[group].includes(month)) return { year, month };
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month };
}

const dayDiff = (a: Date, b: Date) =>
  Math.round((Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
    - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / 86_400_000);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();

    const [{ data: operators }, { data: cycles }, { data: settings }] = await Promise.all([
      // NAMES AND EMAIL LIVE ON `applications`. `operators` has no name column;
      // asking for one made PostgREST reject the read, so this job silently sent
      // nothing at all.
      supabase.from('operators')
        .select('id, user_id, unit_number, is_active, application_id, applications(first_name, last_name, email)')
        .eq('is_active', true),
      supabase.from('inspection_cycles').select('*'),
      supabase.from('inspection_program_settings').select('*').limit(1).maybeSingle(),
    ]);

    const offsets: number[] = settings?.reminder_offsets_days ?? [30, 14, 3];
    const [preMonth, midMonth, lateMonth] = [offsets[0] ?? 30, offsets[1] ?? 14, offsets[2] ?? 3];

    let sent = 0, skipped = 0;

    for (const op of operators ?? []) {
      const group = groupFor(op.unit_number);
      if (!group || !op.user_id) { skipped++; continue; }

      const cycle = nextCycle(group, now);
      const monthStart = new Date(Date.UTC(cycle.year, cycle.month - 1, 1));
      const monthEnd = new Date(Date.UTC(cycle.year, cycle.month, 0));

      const row = (cycles ?? []).find((c: any) =>
        c.operator_id === op.id && c.cycle_year === cycle.year && c.cycle_month === cycle.month);
      if (row?.closed_at || row?.submitted_at) { skipped++; continue; }

      const deadline = row?.grace_until ? new Date(`${row.grace_until}T00:00:00Z`) : monthEnd;

      let stage: string | null = null;
      let message = '';
      const label = `${MONTHS[cycle.month - 1]} ${cycle.year}`;

      if (dayDiff(monthStart, now) === preMonth) {
        stage = 'pre_month';
        message = `Your quarterly DOT inspection is due in ${label}. Book it early so the report and invoice reach us before the month ends.`;
      } else if (dayDiff(deadline, now) === midMonth) {
        stage = 'mid_month';
        message = `${midMonth} days left to complete your ${label} quarterly DOT inspection and send in the report and itemised invoice.`;
      } else if (dayDiff(deadline, now) === lateMonth) {
        stage = 'final';
        message = `Only ${lateMonth} days left for your ${label} quarterly DOT inspection. Without it on file the truck is not dispatch eligible.`;
      }

      if (!stage) { skipped++; continue; }

      const type = `inspection_reminder_${cycle.year}_${cycle.month}_${stage}`;

      const { data: already } = await supabase.from('notifications')
        .select('id').eq('user_id', op.user_id).eq('type', type).limit(1);
      if (already && already.length) { skipped++; continue; }

      await supabase.from('notifications').insert({
        user_id: op.user_id,
        title: `Quarterly DOT inspection — ${label}`,
        body: message,
        type,
        channel: 'in_app',
        link: '/operator/truck',
        sent_at: new Date().toISOString(),
        entity_type: 'operator',
        entity_id: op.id,
      });

      // Resolve email from the operator's original application record.
      let email: string | null = null;
      if (op.application_id) {
        const { data: app } = await supabase
          .from('applications')
          .select('email')
          .eq('id', op.application_id)
          .maybeSingle();
        email = app?.email ?? null;
      }

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (email && resendKey) {
        const subject = `Quarterly DOT inspection due — ${label}`;
        const html = buildEmail(
          subject,
          `Quarterly DOT inspection — ${label}`,
          `<p>Hi ${op.first_name ?? 'there'},</p><p>${message}</p>
           <p>SUPERTRANSPORT covers the inspection fee up to $${Number(settings?.reimbursement_cap ?? 150).toFixed(0)}.
           Send the inspection report, the itemised invoice and your unit number within seven days of the inspection.</p>`,
        );
        await sendEmail(email, subject, html, resendKey);
      }

      sent++;
    }

    return new Response(JSON.stringify({ sent, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
