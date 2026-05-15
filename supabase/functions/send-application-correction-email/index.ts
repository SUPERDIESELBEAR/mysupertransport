import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { buildEmail, sendEmailStrict, BRAND_NAME, RECRUITING_EMAIL } from '../_shared/email-layout.ts';
import { buildAppUrl } from '../_shared/app-url.ts';
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

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v).trim();
  return s.length ? s : '(empty)';
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
    if (!roleRows || roleRows.length === 0) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: reqRow, error: reqErr } = await admin
      .from('application_correction_requests')
      .select('id, application_id, token, reason_for_changes, courtesy_message, requested_by_staff_name, status')
      .eq('id', requestId).maybeSingle();
    if (reqErr || !reqRow) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (reqRow.status !== 'pending') return new Response(JSON.stringify({ error: 'not_pending' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: app } = await admin
      .from('applications').select('first_name, last_name, email').eq('id', reqRow.application_id).maybeSingle();
    if (!app?.email) return new Response(JSON.stringify({ error: 'no_email' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: fields } = await admin
      .from('application_correction_fields')
      .select('field_label, old_value, new_value')
      .eq('request_id', requestId).order('field_label');

    const approveUrl = buildAppUrl(`/application/approve/${encodeURIComponent(reqRow.token)}`);

    const nameDisplay = app.first_name ? escapeHtml(String(app.first_name)) : 'there';
    const reasonHtml = escapeHtml(reqRow.reason_for_changes || '').replace(/\n/g, '<br/>');
    const courtesyHtml = reqRow.courtesy_message
      ? `<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${escapeHtml(reqRow.courtesy_message).replace(/\n/g,'<br/>')}</p>`
      : '';

    const rows = (fields ?? []).map((f) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#444;font-size:13px;font-weight:600;width:36%;">${escapeHtml(f.field_label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#999;font-size:13px;text-decoration:line-through;">${escapeHtml(fmt(f.old_value))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#0a7c3a;font-size:13px;font-weight:600;">${escapeHtml(fmt(f.new_value))}</td>
      </tr>
    `).join('');
    const changesTable = `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:6px;overflow:hidden;margin:0 0 20px;">
      <thead><tr style="background:#fafafa;">
        <th align="left" style="padding:10px 12px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Field</th>
        <th align="left" style="padding:10px 12px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Current</th>
        <th align="left" style="padding:10px 12px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Proposed</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    const { data: tpl } = await admin
      .from('email_templates')
      .select('subject, heading, body_html, cta_label')
      .eq('milestone_key', 'application_correction_request')
      .maybeSingle();

    const substitute = (s: string) => s
      .replace(/\{\{name\}\}/g, nameDisplay)
      .replace(/\{\{reason\}\}/g, reasonHtml)
      .replace(/\{\{courtesy_block\}\}/g, courtesyHtml)
      .replace(/\{\{changes_table\}\}/g, changesTable);

    const subject = substitute(tpl?.subject ?? `Action needed: approve corrections to your ${BRAND_NAME} application`);
    const heading = tpl?.heading ?? 'Corrections Awaiting Approval';
    const bodyHtml = substitute(tpl?.body_html ?? `<p>Hi {{name}},</p><p>Our team has prepared corrections.</p>{{courtesy_block}}<p>Reason: {{reason}}</p>{{changes_table}}`);
    const ctaLabel = (tpl?.cta_label ?? 'Review & approve changes').trim() || 'Review & approve changes';
    const html = buildEmail(subject, heading, bodyHtml, { label: ctaLabel, url: approveUrl }, RECRUITING_EMAIL);

    if (!resendKey) {
      console.error('send-application-correction-email: RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ ok: false, sent: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const messageId = makeMessageId(`appcorrection-${requestId}`);
    await withEmailLog(getLogClient(), {
      messageId,
      templateName: 'application-correction-request',
      recipientEmail: app.email,
      metadata: { application_id: reqRow.application_id, request_id: requestId, approve_url: approveUrl },
    }, () => sendEmailStrict(app.email, subject, html, resendKey));

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-application-correction-email error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});