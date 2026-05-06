import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildEmail, sendEmail, BRAND_NAME, RECRUITING_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const appUrl = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app';

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorize: must be staff (recruiter / management / owner / admin)
    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['recruiter', 'management', 'owner', 'admin'])
      .limit(1);
    if (!roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!applicationId || message.length < 10 || message.length > 2000) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id, first_name, email, review_status, reviewer_notes, revision_count')
      .eq('id', applicationId)
      .maybeSingle();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['pending', 'revisions_requested'].includes(app.review_status as string)) {
      return new Response(JSON.stringify({ error: 'invalid_status' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve staff name for audit trail
    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle();
    const staffName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Staff';

    const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const auditLine = `[${stamp}] Revisions requested by ${staffName}: ${message}`;
    const newNotes = app.reviewer_notes ? `${app.reviewer_notes}\n\n${auditLine}` : auditLine;

    const { error: updErr } = await admin
      .from('applications')
      .update({
        is_draft: true,
        review_status: 'revisions_requested' as any,
        submitted_at: null,
        revision_requested_at: new Date().toISOString(),
        revision_requested_by: userId,
        revision_request_message: message,
        revision_count: (app.revision_count ?? 0) + 1,
        reviewer_notes: newNotes,
      })
      .eq('id', applicationId);

    if (updErr) {
      console.error('request-application-revisions update error:', updErr);
      return new Response(JSON.stringify({ error: 'update_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate a 7-day resume token
    const tok = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: tokErr } = await admin
      .from('application_resume_tokens')
      .insert({
        token: tok,
        application_id: applicationId,
        email: app.email,
        expires_at: expiresAt,
      });

    if (tokErr) {
      console.error('request-application-revisions token insert error:', tokErr);
    }

    const resumeUrl = `${appUrl.replace(/\/$/, '')}/apply?resume=${encodeURIComponent(tok)}`;

    if (resendKey) {
      const greeting = app.first_name
        ? `Hi ${escapeHtml(String(app.first_name))},`
        : 'Hello,';
      const escapedMessage = escapeHtml(message).replace(/\n/g, '<br/>');

      const bodyHtml = `
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          Our team reviewed your ${BRAND_NAME} driver application and needs a few updates before we can move forward.
        </p>
        <div style="margin:0 0 18px;padding:14px 16px;background:#fff7e0;border-left:4px solid #C9A84C;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 6px;font-weight:700;color:#7a5b00;">What we need you to update:</p>
          <p style="margin:0;">${escapedMessage}</p>
        </div>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          Click the button below to reopen your application. Your previous answers are saved — just make the changes above and re-submit.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.6;">
          This secure link is valid for <strong>7 days</strong> and can only be used once. If you have questions, reply to this email.
        </p>
      `;
      const subject = `Action needed: please update your ${BRAND_NAME} application`;
      const html = buildEmail(subject, 'Updates Requested', bodyHtml, {
        label: 'Update my application',
        url: resumeUrl,
      }, RECRUITING_EMAIL);

      try {
        await sendEmail(app.email, subject, html, resendKey);
      } catch (e) {
        console.error('request-application-revisions sendEmail error:', e);
      }
    } else {
      console.error('request-application-revisions: RESEND_API_KEY not configured');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('request-application-revisions error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});