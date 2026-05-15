import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { buildEmail, sendEmailStrict, BRAND_NAME, RECRUITING_EMAIL } from '../_shared/email-layout.ts';
import { buildAppUrl } from '../_shared/app-url.ts';
import { getLogClient, makeMessageId, withEmailLog } from '../_shared/email-log.ts';

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

/**
 * Admin-only: resend a fresh application link to an applicant without bumping
 * the revision count or rewriting reviewer notes. Used when a previously sent
 * link is broken or expired.
 *
 * Modes:
 *  - If the application is in 'revisions_requested' state, sends the same
 *    "Action needed" email with the latest revision_request_message and a
 *    fresh 7-day token.
 *  - Otherwise (draft / pending), sends the generic "Resume your application"
 *    email with a fresh 24-hour token.
 */
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

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner'])
      .limit(1);
    const isStaff = !!(roleRows && roleRows.length > 0);

    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id, user_id, first_name, email, review_status, revision_request_message, is_draft')
      .eq('id', applicationId)
      .maybeSingle();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: staff can resend for anyone; otherwise caller must own the application
    const isOwner = app.user_id === userId;
    if (!isStaff && !isOwner) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Self-serve cooldown: 2 minutes between applicant-initiated resends
    if (!isStaff) {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from('email_send_log')
        .select('id, sent_at')
        .eq('application_id', applicationId)
        .in('email_type', ['application-revisions-resent', 'application-resume-resent'])
        .gte('sent_at', since)
        .limit(1);
      if (recent && recent.length > 0) {
        return new Response(JSON.stringify({ error: 'cooldown', message: 'Please wait a couple of minutes before requesting another link.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!app.email) {
      return new Response(JSON.stringify({ error: 'no_email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'email_not_configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isRevisions = app.review_status === 'revisions_requested';
    const ttlMs = isRevisions ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const tok = generateToken();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const { error: tokErr } = await admin
      .from('application_resume_tokens')
      .insert({
        token: tok,
        application_id: applicationId,
        email: app.email,
        expires_at: expiresAt,
      });
    if (tokErr) {
      console.error('resend-application-link token insert error:', tokErr);
      return new Response(JSON.stringify({ error: 'token_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resumeUrl = buildAppUrl(`/apply?resume=${encodeURIComponent(tok)}`);
    const greeting = app.first_name
      ? `Hi ${escapeHtml(String(app.first_name))},`
      : 'Hello,';

    let subject: string;
    let html: string;
    let templateName: string;

    if (isRevisions) {
      const message = app.revision_request_message || 'Please review and update the items previously requested by our team.';
      const escapedMessage = escapeHtml(String(message)).replace(/\n/g, '<br/>');
      subject = `Action needed: please update your ${BRAND_NAME} application`;
      templateName = 'application-revisions-resent';
      const bodyHtml = `
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          We're resending a fresh link to update your ${BRAND_NAME} driver application. The previous link may have expired or stopped working.
        </p>
        <div style="margin:0 0 18px;padding:14px 16px;background:#fff7e0;border-left:4px solid #C9A84C;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 6px;font-weight:700;color:#7a5b00;">What we need you to update:</p>
          <p style="margin:0;">${escapedMessage}</p>
        </div>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          Click the button below to reopen your application. Your previous answers are saved.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.6;">
          This secure link is valid for <strong>7 days</strong> and can only be used once. Please ignore any earlier emails — only this newest link will work.
        </p>
      `;
      html = buildEmail(subject, 'Updates Requested', bodyHtml, {
        label: 'Update my application',
        url: resumeUrl,
      }, RECRUITING_EMAIL);
    } else {
      subject = `Resume your ${BRAND_NAME} application`;
      templateName = 'application-resume-resent';
      const bodyHtml = `
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          Here's a fresh link to pick up your ${BRAND_NAME} driver application where you left off.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.6;">
          This link is valid for <strong>24 hours</strong> and can only be used once. Please ignore any earlier emails — only this newest link will work.
        </p>
      `;
      html = buildEmail(subject, 'Resume Your Application', bodyHtml, {
        label: 'Resume application',
        url: resumeUrl,
      }, RECRUITING_EMAIL);
    }

    const messageId = makeMessageId(`resend-${applicationId}`);
    const result = await withEmailLog(
      getLogClient(),
      {
        messageId,
        templateName,
        recipientEmail: app.email,
        metadata: {
          application_id: applicationId,
          resume_url: resumeUrl,
          mode: isRevisions ? 'revisions' : 'resume',
          requested_by: userId,
        },
      },
      () => sendEmailStrict(app.email, subject, html, resendKey)
    );

    if (result === null) {
      return new Response(JSON.stringify({ error: 'send_failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Audit trail
    await admin.from('audit_log').insert({
      actor_id: userId,
      action: 'application_link_resent',
      entity_type: 'application',
      entity_id: applicationId,
      entity_label: [app.first_name, app.email].filter(Boolean).join(' — '),
      metadata: { mode: isRevisions ? 'revisions' : 'resume', resume_url: resumeUrl },
    });

    return new Response(JSON.stringify({ success: true, resumeUrl, mode: isRevisions ? 'revisions' : 'resume' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('resend-application-link error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});