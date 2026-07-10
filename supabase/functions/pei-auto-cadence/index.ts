// PEI auto-send cadence.
// Anchored on `date_sent` (the initial staff-triggered send).
// - Days 5, 10, 15, 20, 25: send `pei-request-follow-up`.
// - Day 30+: auto-create GFE with reason `no_response`.
// Stop conditions: status not in ('sent','follow_up_sent'), a response
// was received, applicant application was denied, or the recipient email
// is on suppressed_emails.
// Idempotency: `auto_send_count` gates which milestones fire, and the
// send-transactional-email idempotency key `pei-<id>-auto-day<N>` prevents
// duplicate sends across retried cron runs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MILESTONES = [5, 10, 15, 20, 25];
const GFE_DAY = 30;

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' });
}

function fmtDeadline(value: string | null | undefined): string {
  if (!value) return 'within 30 days of receipt';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'within 30 days of receipt';
  return `by ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const PUBLISHED_ORIGIN = 'https://mysupertransport.lovable.app';
  const now = new Date();

  // Candidates: still awaiting a response
  const { data: rows, error } = await supabase
    .from('pei_requests')
    .select('*')
    .in('status', ['sent', 'follow_up_sent'])
    .not('date_sent', 'is', null)
    .is('date_response_received', null)
    .is('auto_paused_reason', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const summary = { checked: rows?.length ?? 0, sent: 0, gfe: 0, paused: 0, skipped: 0, errors: [] as string[] };

  for (const r of rows ?? []) {
    try {
      const dateSent = new Date(r.date_sent as string);
      const daysSince = Math.floor((now.getTime() - dateSent.getTime()) / 86_400_000);

      // Skip if applicant application was denied
      const { data: app } = await supabase
        .from('applications')
        .select('first_name, last_name, review_status')
        .eq('id', r.application_id)
        .maybeSingle();
      if (app?.review_status === 'denied') {
        summary.skipped++;
        continue;
      }

      // Day 30 → auto-GFE
      if (daysSince >= GFE_DAY) {
        const { error: gfeErr } = await supabase
          .from('pei_requests')
          .update({
            status: 'gfe_documented',
            date_gfe_created: now.toISOString(),
            gfe_reason: 'no_response',
            gfe_signed_by_name: 'System (Auto-GFE)',
          } as any)
          .eq('id', r.id);
        if (gfeErr) throw gfeErr;
        summary.gfe++;
        continue;
      }

      // Find highest milestone reached
      const dueCount = MILESTONES.filter((m) => daysSince >= m).length;
      const alreadySent = (r.auto_send_count as number) ?? 0;
      if (dueCount <= alreadySent) {
        summary.skipped++;
        continue;
      }

      // Suppression pre-check
      const recipient = String(r.employer_contact_email || '').toLowerCase();
      if (!recipient) {
        await supabase
          .from('pei_requests')
          .update({ auto_paused_reason: 'missing_email' } as any)
          .eq('id', r.id);
        summary.paused++;
        continue;
      }
      const { data: suppressed } = await supabase
        .from('suppressed_emails')
        .select('email')
        .eq('email', recipient)
        .maybeSingle();
      if (suppressed) {
        await supabase
          .from('pei_requests')
          .update({ auto_paused_reason: 'suppressed' } as any)
          .eq('id', r.id);
        summary.paused++;
        continue;
      }

      // Send the next milestone
      const nextMilestone = MILESTONES[alreadySent]; // 0-indexed
      const applicantName =
        [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'the applicant';

      let daysRemaining: number | undefined;
      if (r.deadline_date) {
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(r.deadline_date as string)
          ? `${r.deadline_date}T12:00:00`
          : (r.deadline_date as string);
        const ms = new Date(iso).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(ms / 86_400_000));
      }

      const responseUrl = `${PUBLISHED_ORIGIN}/pei/respond/${r.response_token}`;
      const releaseUrl = `${PUBLISHED_ORIGIN}/pei/release/${r.response_token}`;

      const invokeRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateName: 'pei-request-follow-up',
          recipientEmail: recipient,
          idempotencyKey: `pei-${r.id}-auto-day${nextMilestone}`,
          templateData: {
            applicantName,
            employerName: r.employer_name,
            contactName: r.employer_contact_name || undefined,
            employmentStartDate: fmtDate(r.employment_start_date as string | null),
            employmentEndDate: fmtDate(r.employment_end_date as string | null),
            responseUrl,
            releaseUrl,
            deadlineDate: fmtDeadline(r.deadline_date as string | null),
            daysRemaining,
          },
        }),
      });

      if (!invokeRes.ok) {
        const body = await invokeRes.text();
        throw new Error(`send-transactional-email ${invokeRes.status}: ${body}`);
      }

      const { error: updErr } = await supabase
        .from('pei_requests')
        .update({
          status: 'follow_up_sent',
          date_follow_up_sent: now.toISOString(),
          auto_send_count: alreadySent + 1,
          last_auto_send_at: now.toISOString(),
        } as any)
        .eq('id', r.id);
      if (updErr) throw updErr;
      summary.sent++;
    } catch (e: any) {
      console.error('[pei-auto-cadence]', r.id, e?.message ?? e);
      summary.errors.push(`${r.id}: ${e?.message ?? String(e)}`);
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});