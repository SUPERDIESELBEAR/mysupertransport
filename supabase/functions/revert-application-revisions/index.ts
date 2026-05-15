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
    if (!roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
    const sendCourtesyEmail = body?.sendCourtesyEmail === true;
    const retryEmailOnly = body?.retryEmailOnly === true;

    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id, first_name, email, review_status, reviewer_notes, revision_count, pre_revision_status')
      .eq('id', applicationId)
      .maybeSingle();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For full revert, status must currently be revisions_requested.
    // For retryEmailOnly, the status was already restored — skip this check.
    if (!retryEmailOnly && app.review_status !== 'revisions_requested') {
      return new Response(JSON.stringify({ error: 'invalid_status' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const restoredStatus = (app.pre_revision_status as string | null) || 'approved';

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle();
    const staffName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Staff';

    const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    let invalidatedTokens = 0;

    if (!retryEmailOnly) {
      const auditLine = `[${stamp}] Revision request reverted by ${staffName} (sent in error).`;
      const newNotes = app.reviewer_notes ? `${app.reviewer_notes}\n\n${auditLine}` : auditLine;

      const { error: updErr } = await admin
        .from('applications')
        .update({
          review_status: restoredStatus as any,
          is_draft: restoredStatus === 'approved' ? false : true,
          pre_revision_status: null,
          revision_requested_at: null,
          revision_requested_by: null,
          revision_request_message: null,
          revision_count: Math.max(0, (app.revision_count ?? 1) - 1),
          reviewer_notes: newNotes,
        })
        .eq('id', applicationId);

      if (updErr) {
        console.error('revert-application-revisions update error:', updErr);
        return new Response(JSON.stringify({ error: 'update_failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Invalidate any unused resume tokens
      const { data: invalidated, error: tokErr } = await admin
        .from('application_resume_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('application_id', applicationId)
        .is('used_at', null)
        .select('token');

      if (tokErr) {
        console.error('revert-application-revisions token invalidate error:', tokErr);
      }
      invalidatedTokens = invalidated?.length ?? 0;
    }

    let courtesyEmailSent = false;
    let courtesyEmailError: string | null = null;

    if (sendCourtesyEmail) {
      if (!resendKey) {
        courtesyEmailError = 'email_not_configured';
      } else {
        try {
          const greeting = app.first_name
            ? `Hi ${escapeHtml(String(app.first_name))},`
            : 'Hello,';
          const bodyHtml = `
            <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
            <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
              We recently emailed you asking for revisions to your ${BRAND_NAME} driver application. That message was sent in error — <strong>please disregard it</strong>.
            </p>
            <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
              No action is needed from you. The link in the previous email has been deactivated. We'll be in touch with next steps.
            </p>
            <p style="margin:0;color:#666;font-size:13px;line-height:1.6;">
              Sorry for any confusion. If you have questions, just reply to this email.
            </p>
          `;
          const subject = `Please disregard our last email — ${BRAND_NAME}`;
          const html = buildEmail(subject, 'Please Disregard', bodyHtml, undefined, RECRUITING_EMAIL);

          const messageId = makeMessageId(`revert-${applicationId}`);
          await withEmailLog(
            getLogClient(),
            {
              messageId,
              templateName: 'application-revision-reverted-courtesy',
              recipientEmail: app.email,
              metadata: {
                application_id: applicationId,
                reverted_by: userId,
              },
            },
            () => sendEmailStrict(app.email, subject, html, resendKey)
          );
          courtesyEmailSent = true;
        } catch (e: any) {
          console.error('revert-application-revisions courtesy email error:', e);
          courtesyEmailError = e?.message || 'send_failed';
        }
      }
    }

    const { error: auditErr } = await admin
      .from('audit_log')
      .insert({
        actor_id: userId,
        actor_name: staffName,
        action: 'revision_request_reverted',
        entity_type: 'application',
        entity_id: applicationId,
        entity_label: [app.first_name, app.email].filter(Boolean).join(' — '),
        metadata: {
          restored_status: restoredStatus,
          invalidated_tokens: invalidatedTokens,
          courtesy_email_requested: sendCourtesyEmail,
          courtesy_email_sent: courtesyEmailSent,
          courtesy_email_error: courtesyEmailError,
          previous_revision_count: app.revision_count ?? 0,
          retry_email_only: retryEmailOnly,
        },
      });
    if (auditErr) {
      console.error('revert-application-revisions audit insert error:', auditErr);
    }

    return new Response(JSON.stringify({
      ok: true,
      restoredStatus,
      invalidatedTokens,
      courtesyEmailSent,
      courtesyEmailError,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('revert-application-revisions error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});