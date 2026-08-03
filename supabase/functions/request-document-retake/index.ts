import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { buildEmail, sendEmailStrict, BRAND_NAME, RECRUITING_EMAIL } from '../_shared/email-layout.ts';
import { buildAppUrl } from '../_shared/app-url.ts';
import { getLogClient, makeMessageId, withEmailLog } from '../_shared/email-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DOC_LABELS: Record<string, string> = {
  dl_front_url: "Front of Driver's License",
  dl_rear_url: "Rear of Driver's License",
  medical_cert_url: 'Medical Certificate',
};

const REASON_LABELS: Record<string, string> = {
  blurry: 'Blurry / out of focus',
  cut_off: 'Edges cut off',
  glare: 'Glare or shadow over the text',
  unreadable: 'Text is not readable',
  expired: 'Document is expired',
  wrong_document: 'Wrong document uploaded',
  other: 'Other',
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

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const resendKey = Deno.env.get('RESEND_API_KEY');

    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ error: 'unauthorized' }, 401);

    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner'])
      .limit(1);
    if (!roleRows || roleRows.length === 0) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const rawDocs = Array.isArray(body?.documents) ? body.documents : [];

    const documents = rawDocs
      .filter((d: unknown) => d && typeof d === 'object')
      .map((d: { key?: unknown; reason?: unknown }) => ({
        key: typeof d.key === 'string' ? d.key : '',
        reason: typeof d.reason === 'string' ? d.reason : 'other',
      }))
      .filter((d: { key: string; reason: string }) => DOC_LABELS[d.key] && REASON_LABELS[d.reason]);

    if (!applicationId || documents.length === 0) return json({ error: 'invalid_input' }, 400);

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id, first_name, email, review_status, reviewer_notes, revision_count, pre_revision_status, document_retake_requests, dl_front_url, dl_rear_url, medical_cert_url')
      .eq('id', applicationId)
      .maybeSingle();
    if (appErr || !app) return json({ error: 'not_found' }, 404);

    if (!['pending', 'revisions_requested', 'approved'].includes(app.review_status as string)) {
      return json({ error: 'invalid_status' }, 400);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle();
    const staffName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Staff';

    const nowIso = new Date().toISOString();
    const appRow = app as unknown as Record<string, string | null>;

    // Archive the current file for each requested slot, then clear it.
    const historyRows = documents.map((d: { key: string; reason: string }) => ({
      application_id: applicationId,
      document_key: d.key,
      old_path: appRow[d.key] ?? null,
      new_path: null,
      source: 'retake_requested',
      reason: d.reason,
      note: note || null,
      changed_by: userId,
      changed_by_name: staffName,
    }));
    const { error: histErr } = await admin.from('application_document_history').insert(historyRows);
    if (histErr) {
      console.error('request-document-retake history insert error:', histErr);
      return json({ error: 'history_failed' }, 500);
    }

    const retakeMap: Record<string, unknown> = {};
    for (const d of documents) {
      retakeMap[d.key] = {
        reason: d.reason,
        note: note || null,
        requested_at: nowIso,
        requested_by_name: staffName,
      };
    }

    const summaryLines = documents
      .map((d: { key: string; reason: string }) => `• ${DOC_LABELS[d.key]} — ${REASON_LABELS[d.reason]}`)
      .join('\n');
    const message = `Please re-upload the following document${documents.length === 1 ? '' : 's'}:\n${summaryLines}${note ? `\n\n${note}` : ''}`;

    const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const auditLine = `[${stamp}] Document retake requested by ${staffName}: ${message}`;
    const newNotes = app.reviewer_notes ? `${app.reviewer_notes}\n\n${auditLine}` : auditLine;

    const preRevisionStatus =
      (app as { pre_revision_status?: string | null }).pre_revision_status ??
      (app.review_status === 'approved' ? 'approved' : null);

    const clearedSlots: Record<string, null> = {};
    for (const d of documents) clearedSlots[d.key] = null;

    const { error: updErr } = await admin
      .from('applications')
      .update({
        ...clearedSlots,
        is_draft: true,
        review_status: 'revisions_requested',
        submitted_at: null,
        current_step: 7,
        revision_requested_at: nowIso,
        revision_requested_by: userId,
        revision_request_message: message,
        revision_count: (app.revision_count ?? 0) + 1,
        reviewer_notes: newNotes,
        pre_revision_status: preRevisionStatus,
        document_retake_requests: retakeMap,
      })
      .eq('id', applicationId);

    if (updErr) {
      console.error('request-document-retake update error:', updErr);
      return json({ error: 'update_failed' }, 500);
    }

    const tok = generateToken();
    const { error: tokErr } = await admin
      .from('application_resume_tokens')
      .insert({
        token: tok,
        application_id: applicationId,
        email: app.email,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    if (tokErr) console.error('request-document-retake token insert error:', tokErr);

    const { error: auditErr } = await admin.from('audit_log').insert({
      actor_id: userId,
      actor_name: staffName,
      action: 'application_document_retake_requested',
      entity_type: 'application',
      entity_id: applicationId,
      entity_label: [app.first_name, app.email].filter(Boolean).join(' — '),
      metadata: {
        documents: documents,
        note: note || null,
        previous_status: app.review_status,
      },
    });
    if (auditErr) console.error('request-document-retake audit insert error:', auditErr);

    const resumeUrl = buildAppUrl(`/apply?resume=${encodeURIComponent(tok)}`);

    if (resendKey) {
      const greeting = app.first_name ? `Hi ${escapeHtml(String(app.first_name))},` : 'Hello,';
      const listHtml = documents
        .map((d: { key: string; reason: string }) =>
          `<li style="margin:0 0 6px;"><strong>${escapeHtml(DOC_LABELS[d.key])}</strong> — ${escapeHtml(REASON_LABELS[d.reason])}</li>`)
        .join('');

      const bodyHtml = `
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          We reviewed your ${BRAND_NAME} driver application and need a clearer copy of the document${documents.length === 1 ? '' : 's'} below before we can move forward.
        </p>
        <div style="margin:0 0 18px;padding:14px 16px;background:#fff7e0;border-left:4px solid #C9A84C;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 6px;font-weight:700;color:#7a5b00;">Documents to re-upload:</p>
          <ul style="margin:0;padding-left:18px;">${listHtml}</ul>
          ${note ? `<p style="margin:10px 0 0;">${escapeHtml(note).replace(/\n/g, '<br/>')}</p>` : ''}
        </div>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          Tap the button below to reopen your application — it takes you straight to the document upload step. On a phone you can snap a new photo right there. Everything else you filled out is saved.
        </p>
        <p style="margin:0 0 10px;color:#666;font-size:13px;line-height:1.6;">
          Tips for a good photo: lay the document flat on a dark surface, avoid glare, and make sure all four corners are inside the frame.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.6;">
          This secure link is valid for <strong>7 days</strong> and can only be used once. You can also email a scan or photo by replying to this message.
        </p>
      `;
      const subject = `Action needed: re-upload your ${BRAND_NAME} application document${documents.length === 1 ? '' : 's'}`;
      const html = buildEmail(subject, 'Document Re-upload Needed', bodyHtml, {
        label: 'Re-upload my document',
        url: resumeUrl,
      }, RECRUITING_EMAIL);

      const messageId = makeMessageId(`doc-retake-${applicationId}`);
      await withEmailLog(
        getLogClient(),
        {
          messageId,
          templateName: 'application-document-retake',
          recipientEmail: app.email,
          metadata: {
            application_id: applicationId,
            resume_url: resumeUrl,
            documents: documents.map((d: { key: string }) => d.key),
            requested_by: userId,
          },
        },
        () => sendEmailStrict(app.email, subject, html, resendKey, undefined, { messageId })
      );
    } else {
      console.error('request-document-retake: RESEND_API_KEY not configured');
    }

    return json({ success: true });
  } catch (err) {
    console.error('request-document-retake error:', err);
    return json({ error: 'internal_error' }, 500);
  }
});