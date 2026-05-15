import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { buildEmail, sendEmailStrict, BRAND_NAME, RECRUITING_EMAIL } from '../_shared/email-layout.ts';
import { getLogClient, makeMessageId, withEmailLog } from '../_shared/email-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: claims, error: claimsErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: roleRows } = await admin
      .from('user_roles').select('role').eq('user_id', userId)
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner']).limit(1);
    if (!roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: app } = await admin
      .from('applications').select('first_name, last_name, email, review_status').eq('id', applicationId).maybeSingle();
    if (!app?.email) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const greeting = app.first_name ? `Hi ${escapeHtml(String(app.first_name))},` : 'Hello,';
    const bodyHtml = `
      <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
      <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
        Good news — our team is reviewing your ${BRAND_NAME} driver application and has reopened it so we can take care of a few small corrections on your behalf.
      </p>
      <div style="margin:0 0 18px;padding:14px 16px;background:#f1f8ff;border-left:4px solid #2c7be5;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 6px;font-weight:700;color:#1a4d8f;">What happens next</p>
        <p style="margin:0;">If any changes need your approval, you'll receive a separate email with a secure link to review and e-sign them. You don't need to log back in or resubmit anything right now.</p>
      </div>
      <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
        Any earlier "please update your application" link we sent you has been retired and will no longer work — please disregard it.
      </p>
      <p style="margin:0 0 0;color:#666;font-size:13px;line-height:1.6;">
        Questions? Just reply to this email and our recruiting team will get back to you.
      </p>
    `;

    const subject = `Update on your ${BRAND_NAME} driver application`;
    const html = buildEmail(subject, 'Application Reopened', bodyHtml, undefined, RECRUITING_EMAIL);

    if (!resendKey) {
      console.error('notify-application-moved-to-pending: RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ ok: false, sent: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const messageId = makeMessageId(`movedtopending-${applicationId}`);
    await withEmailLog(getLogClient(), {
      messageId,
      templateName: 'application-moved-to-pending',
      recipientEmail: app.email,
      metadata: { application_id: applicationId },
    }, () => sendEmailStrict(app.email, subject, html, resendKey));

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('notify-application-moved-to-pending error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});