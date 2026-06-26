// Cron-driven cert reminder cadence.
// Sends one email per (driver, doc, threshold, day) — dedupe is enforced by a
// partial UNIQUE index on cert_reminders so a retried cron run cannot send a
// duplicate. Cadence matches the approved Phase B plan.
//
// Thresholds (days_until → label):
//   45 → 45d, 14 → 14d, 3 → 3d, 0 → 0d, -1 → expired+1
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmailStrict as sendEmail } from '../_shared/email-layout.ts';

import { buildAppUrl } from '../_shared/app-url.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ComplianceRow {
  entity_kind: string;
  operator_id: string | null;
  operator_name: string;
  doc_key: string;
  inspection_doc_id: string | null;
  expires_at: string | null;
  days_until: number | null;
}

const THRESHOLDS: Array<{ days: number; label: string }> = [
  { days: 45, label: '45d' },
  { days: 14, label: '14d' },
  { days:  3, label: '3d' },
  { days:  0, label: '0d' },
  { days: -1, label: 'expired+1' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const appUrl = new URL(buildAppUrl('/')).origin;

  // Pull every per-driver CDL / Med Cert row at one of our threshold days.
  const targetDays = THRESHOLDS.map(t => t.days);
  const { data: rows, error: rowsErr } = await supabase
    .from('v_compliance_items')
    .select('entity_kind, operator_id, operator_name, doc_key, inspection_doc_id, expires_at, days_until')
    .eq('entity_kind', 'driver')
    .in('doc_key', ['CDL', 'Medical Certificate'])
    .in('days_until', targetDays);

  if (rowsErr) {
    return new Response(JSON.stringify({ error: rowsErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const items = (rows ?? []) as ComplianceRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of items) {
    if (!row.operator_id || row.days_until === null || !row.expires_at) continue;
    const threshold = THRESHOLDS.find(t => t.days === row.days_until);
    if (!threshold) continue;

    const docType = row.doc_key === 'CDL' ? 'CDL' : 'Medical Cert';

    // Resolve operator → user_id → email
    const { data: op } = await supabase
      .from('operators')
      .select('user_id, applications (first_name, last_name)')
      .eq('id', row.operator_id)
      .single();
    if (!op?.user_id) { skipped++; continue; }

    // #14 — Per-driver cert-reminder opt-out. event_type maps to the toggle
    // surfaced in the operator notification prefs modal. If the driver has
    // explicitly disabled email for that doc type we skip the send entirely
    // (no cert_reminders row inserted so the cadence is fully silent).
    const prefEventType = row.doc_key === 'CDL'
      ? 'cert_reminder_cdl'
      : row.doc_key === 'Medical Certificate'
      ? 'cert_reminder_medical'
      : 'cert_reminder_irp';
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', op.user_id)
      .eq('event_type', prefEventType)
      .maybeSingle();
    if (pref && pref.email_enabled === false) { skipped++; continue; }

    const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
    const firstName = app?.first_name || 'Driver';

    const { data: userResp } = await supabase.auth.admin.getUserById(op.user_id);
    const toEmail = userResp?.user?.email;
    if (!toEmail) { skipped++; continue; }

    // Pre-insert with dedupe. If a row already exists for (operator_id,
    // doc_type, threshold, sent_on=today CT) the partial unique index rejects
    // it and we skip — guaranteeing idempotency on retried cron runs.
    const { error: insertErr } = await supabase.from('cert_reminders').insert({
      operator_id: row.operator_id,
      doc_type: docType,
      source: 'cron',
      threshold: threshold.label,
      sent_by: null,
      sent_by_name: 'Automated reminder',
      email_sent: false,
    });
    if (insertErr) {
      if (insertErr.code === '23505') { skipped++; continue; }
      failed++;
      console.warn('cron-cert-reminders insert error', insertErr);
      continue;
    }

    const expired = row.days_until < 0;
    const isUrgent = !expired && row.days_until <= 3;
    const expiryStr = new Date(row.expires_at).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' });

    let subject: string;
    let heading: string;
    let urgencyBlock: string;
    if (expired) {
      subject = `🚨 Your ${docType} has expired`;
      heading = `🚨 ${docType} Expired`;
      urgencyBlock = `<p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <strong>Your ${docType} expired on ${expiryStr}.</strong> Renew and upload the updated document immediately to remain compliant.
      </p>`;
    } else if (isUrgent) {
      subject = `⚠️ ${docType} expires in ${row.days_until} day${row.days_until !== 1 ? 's' : ''}`;
      heading = `⚠️ ${docType} Expires Very Soon`;
      urgencyBlock = `<p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <strong>Only ${row.days_until} day${row.days_until !== 1 ? 's' : ''} left.</strong> Renew immediately to stay compliant.
      </p>`;
    } else {
      subject = `📅 ${docType} renewal reminder — ${row.days_until} days`;
      heading = `📅 ${docType} Renewal Reminder`;
      urgencyBlock = `<p style="background:#f0f7ff;border-left:4px solid #3498db;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <strong>${row.days_until} days until expiry.</strong> Start your renewal now so you don't run into last-minute issues.
      </p>`;
    }

    const html = buildEmail(
      subject,
      heading,
      `<p>Hi ${firstName},</p>
       <p>This is an automated reminder about your <strong>${docType}</strong>.</p>
       <p>Expiration date: <strong>${expiryStr}</strong>.</p>
       ${urgencyBlock}
       <p style="background:#fff8e6;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>How to upload:</strong> Open your operator portal → Progress tab → upload your renewed ${docType}.
       </p>`,
      { label: 'View My Portal', url: `${appUrl}/operator/progress` }
    );

    try {
      await sendEmail(toEmail, subject, html, RESEND_API_KEY);
      sent++;
      await supabase.from('cert_reminders')
        .update({ email_sent: true })
        .eq('operator_id', row.operator_id)
        .eq('doc_type', docType)
        .eq('source', 'cron')
        .eq('threshold', threshold.label)
        .order('sent_at', { ascending: false })
        .limit(1);
    } catch (err) {
      failed++;
      await supabase.from('cert_reminders')
        .update({ email_sent: false, email_error: String(err) })
        .eq('operator_id', row.operator_id)
        .eq('doc_type', docType)
        .eq('source', 'cron')
        .eq('threshold', threshold.label)
        .order('sent_at', { ascending: false })
        .limit(1);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: items.length, sent, skipped, failed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});