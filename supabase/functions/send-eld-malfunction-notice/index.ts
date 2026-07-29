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

async function handler(req: Request): Promise<Response> {
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as { event_id?: string } | null;
  const eventId = body?.event_id;
  if (!eventId || typeof eventId !== 'string') {
    return fail(400, 'event_id is required');
  }

  const supabase = serviceClient();

  const { data: event, error: eventError } = await supabase
    .from('eld_malfunction_events')
    .select(`id, operator_id, discovered_at, discovered_location, malfunction_code,
      malfunction_description, hinders_hos_recording, repair_deadline, notice_pdf_path,
      notice_uploaded_at, notice_sent_at, notice_send_attempts, device_provider, device_make,
      device_model, device_serial,
      operators!inner(unit_number, profiles(first_name, last_name))`)
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) return fail(500, 'Could not load the malfunction event', eventError.message);
  if (!event) return fail(404, 'Malfunction event not found');

  // The upload is the gate: never claim a send when there is no PDF in storage.
  if (!event.notice_uploaded_at || !event.notice_pdf_path) {
    return ok({ success: false, reason: 'notice_not_uploaded' });
  }
  if (event.notice_sent_at) {
    return ok({ success: true, alreadySent: true });
  }

  const { data: recipientRows, error: recipientError } = await supabase
    .from('carrier_notification_settings')
    .select('email')
    .eq('is_active', true);
  if (recipientError) return fail(500, 'Could not load carrier recipients', recipientError.message);

  const recipients = (recipientRows ?? []).map((r) => r.email as string).filter(Boolean);
  if (recipients.length === 0) {
    await supabase.from('eld_malfunction_events').update({
      notice_send_attempts: (event.notice_send_attempts ?? 0) + 1,
      notice_last_send_error: 'No active carrier notification recipients configured',
    }).eq('id', eventId);
    return fail(400, 'No active carrier notification recipients are configured');
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(ELD_NOTICE_BUCKET)
    .download(event.notice_pdf_path);
  if (downloadError || !file) {
    await supabase.from('eld_malfunction_events').update({
      notice_send_attempts: (event.notice_send_attempts ?? 0) + 1,
      notice_last_send_error: `Notice PDF unreadable: ${downloadError?.message ?? 'not found'}`,
    }).eq('id', eventId);
    return fail(502, 'Notice PDF could not be read from storage', downloadError?.message);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const pdfBase64 = btoa(binary);

  // deno-lint-ignore no-explicit-any
  const operator = (event as any).operators;
  const profile = operator?.profiles;
  const driverName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Driver';
  const unitNumber: string | null = operator?.unit_number ?? null;
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

  const result = await sendResendDirect({
    supabase,
    role: 'onboarding',
    to: recipients,
    subject: `ELD Malfunction Notice — ${driverName}${unitNumber ? ` (Unit ${unitNumber})` : ''}`,
    html,
    attachments: [{
      filename: `eld-malfunction-notice-${eventId.slice(0, 8)}.pdf`,
      content: pdfBase64,
      content_type: 'application/pdf',
    }],
    logLabel: 'eld_malfunction_notice',
    skipSuppression: true,
    authHeader: auth.authHeader,
  });

  if (!result.success) {
    await supabase.from('eld_malfunction_events').update({
      notice_send_attempts: (event.notice_send_attempts ?? 0) + 1,
      notice_last_send_error: `${result.error ?? 'Send failed'}${result.details ? ` — ${result.details}` : ''}`.slice(0, 500),
    }).eq('id', eventId);
    return fail(result.status || 502, result.error ?? 'Notice send failed', result.details);
  }

  await supabase.from('eld_malfunction_events').update({
    notice_sent_at: new Date().toISOString(),
    notice_send_attempts: (event.notice_send_attempts ?? 0) + 1,
    notice_last_send_error: null,
  }).eq('id', eventId);

  return ok({ success: true, recipients: recipients.length });
}

Deno.serve(withErrorEnvelope(handler, 'send-eld-malfunction-notice'));