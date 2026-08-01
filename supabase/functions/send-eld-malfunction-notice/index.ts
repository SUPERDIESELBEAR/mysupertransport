import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';
import { ok, fail, withErrorEnvelope, sendResendDirect } from '../_shared/email/index.ts';

const ELD_NOTICE_BUCKET = 'eld-notices';

const CODE_LABEL: Record<string, string> = {
  P: 'Power compliance',
  E: 'Engine synchronization',
  T: 'Timing compliance',
  L: 'Positioning compliance',
  R: 'Data recording compliance',
  S: 'Data transfer compliance',
  O: 'Other',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Authorizes either the internal hourly retry job (service-role bearer) or a
 * signed-in user. The event row itself is the authority for whose notice this
 * is — the caller never supplies driver identity.
 */
async function authorize(req: Request): Promise<{ authHeader: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'Unauthorized: missing bearer token');
  const token = authHeader.slice('Bearer '.length);

  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return { authHeader };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getClaims(token);
  if (error || !data?.claims) return fail(401, 'Unauthorized: invalid or expired token');
  return { authHeader };
}

function buildHtml(v: {
  driverName: string;
  unitNumber: string | null;
  code: string;
  codeLabel: string;
  description: string;
  discovered: string;
  location: string;
  device: string;
  hindersHos: boolean;
  deadline: string;
}): string {
  const row = (k: string, val: string) =>
    `<tr><td style="padding:8px 12px;background:#faf9f6;font-weight:600;width:40%;">${escapeHtml(k)}</td>
      <td style="padding:8px 12px;">${escapeHtml(val)}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ELD Malfunction Notice — ${escapeHtml(v.driverName)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        ${emailHeader('ELD MALFUNCTION NOTICE')}
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">
            ELD malfunction reported — ${escapeHtml(v.driverName)}
          </h1>
          <p style="margin:0 0 20px;color:#666;font-size:14px;">
            Written driver notice under 49 CFR 395.34. The signed notice is attached.
            The device must be repaired or replaced within 8 days of discovery.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:14px;">
            ${row('Unit', v.unitNumber || '—')}
            ${row('Malfunction', `${v.code} — ${v.codeLabel}`)}
            ${row('Discovered', v.discovered)}
            ${row('Location', v.location)}
            ${row('Device', v.device)}
            ${row('Hours no longer recording', v.hindersHos ? 'Yes — driver is on paper logs' : 'No')}
            ${row('Repair deadline', v.deadline)}
          </table>
          <div style="margin-top:20px;padding:12px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;font-size:14px;">
            <strong>Driver's description:</strong><br/>${escapeHtml(v.description).replace(/\n/g, '<br/>')}
          </div>
        </td></tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Everything a notice needs, resolved from the database. Reads only — this
 * function performs no writes at all, so a dry run cannot stamp delivery state.
 */
interface ResolvedNotice {
  // deno-lint-ignore no-explicit-any
  event: any;
  eventId: string;
  driverName: string;
  unitNumber: string | null;
  recipients: string[];
  subject: string;
  html: string;
}

// deno-lint-ignore no-explicit-any
type Supa = any;

async function resolveNotice(supabase: Supa, eventId: string): Promise<ResolvedNotice | Response> {
  const { data: event, error: eventError } = await supabase
    .from('eld_malfunction_events')
    .select(`id, operator_id, discovered_at, discovered_location, malfunction_code,
      malfunction_description, hinders_hos_recording, repair_deadline, notice_pdf_path,
      notice_uploaded_at, notice_sent_at, notice_send_attempts, device_provider, device_make,
      device_model, device_serial, is_demo,
      operators!inner(unit_number, user_id)`)
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) return fail(500, 'Could not load the malfunction event', eventError.message);
  if (!event) return fail(404, 'Malfunction event not found');

  // operators has no FK to profiles (user_id points at auth.users), so the
  // driver's name is a second read rather than an embed.
  const operator = event.operators;
  let profile: { first_name: string | null; last_name: string | null } | null = null;
  if (operator?.user_id) {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', operator.user_id)
      .maybeSingle();
    profile = data;
  }
  const driverName = resolvedDriverName(profile?.first_name, profile?.last_name);
  // 395.34(a)(1). This notice is the document that starts the 8-day clock and
  // the driver's evidence the protocol was followed; it does not go out
  // addressed to a placeholder.
  if (!driverName) {
    return fail(
      422,
      'This driver has no name on file, so the written malfunction notice cannot be generated. Add the driver\'s legal name to their profile and try again.',
    );
  }
  const unitNumber: string | null = operator?.unit_number ?? null;

  const { data: recipientRows, error: recipientError } = await supabase
    .from('carrier_notification_settings')
    .select('email')
    .eq('is_active', true);
  if (recipientError) return fail(500, 'Could not load carrier recipients', recipientError.message);
  const recipients = (recipientRows ?? []).map((r: { email: string }) => r.email).filter(Boolean);

  const discovered = new Date(event.discovered_at).toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const deadline = new Date(`${event.repair_deadline}T12:00:00`)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const device = [event.device_provider, event.device_make, event.device_model, event.device_serial]
    .filter(Boolean).join(' · ') || 'Not recorded';

  const html = buildHtml({
    driverName,
    unitNumber,
    code: event.malfunction_code,
    codeLabel: CODE_LABEL[event.malfunction_code] ?? 'Malfunction',
    description: event.malfunction_description,
    discovered,
    location: event.discovered_location,
    device,
    hindersHos: event.hinders_hos_recording,
    deadline,
  });

  return {
    event,
    eventId,
    driverName,
    unitNumber,
    recipients,
    subject: `ELD Malfunction Notice — ${driverName}${unitNumber ? ` (Unit ${unitNumber})` : ''}`,
    html,
  };
}

/**
 * The ONLY caller of sendResendDirect and the ONLY writer of notice_sent_at /
 * notice_send_attempts in this function. It is invoked from exactly one line —
 * after the dry-run branch has already returned — and it takes the resolved
 * payload as an argument, so a dry run can never reach a constructed sender.
 */
async function deliverNotice(
  supabase: Supa,
  r: ResolvedNotice,
  authHeader: string,
): Promise<Response> {
  const { event, eventId, recipients } = r;
  const attempts = (event.notice_send_attempts ?? 0) + 1;

  if (recipients.length === 0) {
    await supabase.from('eld_malfunction_events').update({
      notice_send_attempts: attempts,
      notice_last_send_error: 'No active carrier notification recipients configured',
    }).eq('id', eventId);
    return fail(400, 'No active carrier notification recipients are configured');
  }

  // A demo run must not put anything in a real inbox. Suppression is visible,
  // not silent: the caller gets the exact recipient list and subject that a
  // live run would have used, so the driver sees the flow complete rather than
  // an error. The event is still marked sent so the repair clock and the rest
  // of the workflow behave exactly as they would for a real driver.
  if (event.is_demo === true) {
    await supabase.from('eld_malfunction_events').update({
      notice_sent_at: new Date().toISOString(),
      notice_send_attempts: attempts,
      notice_last_send_error: null,
    }).eq('id', eventId);
    return ok({
      success: true,
      suppressed: true,
      suppressed_reason: 'demo_operator',
      would_have_sent: {
        to: recipients,
        subject: r.subject,
        attachment: 'ELD malfunction notice (PDF, DEMO watermarked)',
      },
      recipients: recipients.length,
    });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(ELD_NOTICE_BUCKET)
    .download(event.notice_pdf_path);
  if (downloadError || !file) {
    await supabase.from('eld_malfunction_events').update({
      notice_send_attempts: attempts,
      notice_last_send_error: `Notice PDF unreadable: ${downloadError?.message ?? 'not found'}`,
    }).eq('id', eventId);
    return fail(502, 'Notice PDF could not be read from storage', downloadError?.message);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const pdfBase64 = btoa(binary);

  const result = await sendResendDirect({
    supabase,
    role: 'onboarding',
    to: recipients,
    subject: r.subject,
    html: r.html,
    attachments: [{
      filename: `eld-malfunction-notice-${eventId.slice(0, 8)}.pdf`,
      content: pdfBase64,
      content_type: 'application/pdf',
    }],
    logLabel: 'eld_malfunction_notice',
    skipSuppression: true,
    authHeader,
  });

  if (!result.success) {
    await supabase.from('eld_malfunction_events').update({
      notice_send_attempts: attempts,
      notice_last_send_error: `${result.error ?? 'Send failed'}${result.details ? ` — ${result.details}` : ''}`.slice(0, 500),
    }).eq('id', eventId);
    return fail(result.status || 502, result.error ?? 'Notice send failed', result.details);
  }

  await supabase.from('eld_malfunction_events').update({
    notice_sent_at: new Date().toISOString(),
    notice_send_attempts: attempts,
    notice_last_send_error: null,
  }).eq('id', eventId);

  return ok({ success: true, recipients: recipients.length });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as
    | { event_id?: string; dryRun?: boolean }
    | null;
  const eventId = body?.event_id;
  if (!eventId || typeof eventId !== 'string') {
    return fail(400, 'event_id is required');
  }
  const dryRun = body?.dryRun === true;

  const supabase = serviceClient();

  const resolved = await resolveNotice(supabase, eventId);
  if (resolved instanceof Response) return resolved;

  // A dry run returns here, before deliverNotice exists in the call path. It
  // writes nothing: no notice_sent_at, no attempt increment, no email_send_log
  // row (that row is written by sendResendDirect, which is never reached), and
  // it does not even download the PDF.
  if (dryRun) {
    return ok({
      success: true,
      dryRun: true,
      event_id: eventId,
      driverName: resolved.driverName,
      unitNumber: resolved.unitNumber,
      subject: resolved.subject,
      recipients: resolved.recipients,
      recipient_count: resolved.recipients.length,
      is_demo: resolved.event.is_demo === true,
      notice_uploaded: Boolean(resolved.event.notice_uploaded_at && resolved.event.notice_pdf_path),
      already_sent: Boolean(resolved.event.notice_sent_at),
      html_bytes: resolved.html.length,
    });
  }

  // The upload is the gate: never claim a send when there is no PDF in storage.
  if (!resolved.event.notice_uploaded_at || !resolved.event.notice_pdf_path) {
    return ok({ success: false, reason: 'notice_not_uploaded' });
  }
  if (resolved.event.notice_sent_at) {
    return ok({ success: true, alreadySent: true });
  }

  return await deliverNotice(supabase, resolved, auth.authHeader);
}

Deno.serve(withErrorEnvelope(handler, 'send-eld-malfunction-notice'));