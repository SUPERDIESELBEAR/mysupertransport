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
    const nameDisplay = app.first_name ? escapeHtml(String(app.first_name)) : 'there';

    const { data: tpl } = await admin
      .from('email_templates')
      .select('subject, heading, body_html, cta_label')
      .eq('milestone_key', 'application_moved_to_pending')
      .maybeSingle();

    const subject = (tpl?.subject ?? `Update on your ${BRAND_NAME} driver application`).replace(/\{\{name\}\}/g, nameDisplay);
    const heading = tpl?.heading ?? 'Application Reopened';
    const bodyHtml = (tpl?.body_html ?? `<p>${greeting}</p><p>Good news — our team is reviewing your ${BRAND_NAME} driver application and has reopened it.</p>`)
      .replace(/\{\{name\}\}/g, nameDisplay);
    const ctaLabel = (tpl?.cta_label ?? '').trim();
    const cta = ctaLabel ? { label: ctaLabel, url: 'https://mysupertransport.com' } : undefined;
    const html = buildEmail(subject, heading, bodyHtml, cta, RECRUITING_EMAIL);

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