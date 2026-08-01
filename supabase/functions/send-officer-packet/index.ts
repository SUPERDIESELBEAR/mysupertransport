/**
 * Officer email merge — send path (Pass B §8).
 *
 * The packet is built and uploaded by the device; this function only sends it.
 *
 * Two rules drive the shape:
 *
 * 1. OFFICER FIRST, CARRIER BEST-EFFORT. The officer's copy is the one that
 *    matters at the roadside. If the officer send succeeds and a carrier copy
 *    fails, the driver is told the packet was sent — the carrier outcome is
 *    recorded separately in the audit entry and never surfaces as "the packet
 *    didn't send".
 *
 * 2. IDEMPOTENCY IS KEYED ON THE QUEUE ENTRY ID. Not on a storage path with a
 *    timestamp (a retry would send twice) and not on (operator, event) (a
 *    second legitimate officer on the same day would be swallowed). The entry
 *    id is a client-generated uuid: stable across retries of that entry,
 *    distinct for a genuinely new send. Two officers on one day means two
 *    entries, so both go out.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';
import { ok, fail, withErrorEnvelope, sendResendDirect } from '../_shared/email/index.ts';
import { resolvedDriverName } from '../_shared/placeholder-name.ts';

const PACKET_BUCKET = 'eld-notices';
const LINK_TTL_HOURS = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUDIT_ACTION = 'eld.officer_packet.sent';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface Body {
  entry_id: string;
  operator_id: string;
  storage_path: string;
  officer_email: string;
  officer_name?: string | null;
  window_start: string;
  window_end: string;
  included_dates: string[];
  dispositions: Array<{ log_date: string; status: string; reason?: string | null }>;
  downsampled_pass?: number | null;
  /** Device could not get the packet under the ceiling: send a link instead. */
  link_mode?: boolean;
  copy_carrier?: boolean;
}

function validate(raw: unknown): Body | string {
  const b = raw as Partial<Body> | null;
  if (!b || typeof b !== 'object') return 'A JSON body is required';
  if (!b.entry_id || !UUID_RE.test(b.entry_id)) return 'entry_id must be a uuid';
  if (!b.operator_id || !UUID_RE.test(b.operator_id)) return 'operator_id must be a uuid';
  if (!b.storage_path || typeof b.storage_path !== 'string' || b.storage_path.length > 400) {
    return 'storage_path is required';
  }
  if (!b.officer_email || !EMAIL_RE.test(b.officer_email) || b.officer_email.length > 320) {
    return 'officer_email must be a valid email address';
  }
  if (!b.window_start || !b.window_end) return 'window_start and window_end are required';
  if (!Array.isArray(b.included_dates)) return 'included_dates must be an array';
  if (!Array.isArray(b.dispositions) || b.dispositions.length === 0) {
    return 'dispositions must be a non-empty array';
  }
  // The packet is written by the device under its own operator prefix; refuse
  // anything that reaches outside it.
  if (!b.storage_path.startsWith(`${b.operator_id}/officer-packets/`)) {
    return 'storage_path must be inside the operator officer-packets prefix';
  }
  return b as Body;
}

/** The caller must be the driver the packet belongs to, or a staff/service caller. */
async function authorize(
  req: Request, supabase: SupabaseClient, operatorId: string,
): Promise<{ authHeader: string; actorId: string | null } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'Unauthorized: missing bearer token');
  const token = authHeader.slice('Bearer '.length);

  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return { authHeader, actorId: null };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getClaims(token);
  if (error || !data?.claims) return fail(401, 'Unauthorized: invalid or expired token');
  const userId = data.claims.sub as string;

  const { data: operator } = await supabase
    .from('operators').select('id, user_id').eq('id', operatorId).maybeSingle();
  if (operator?.user_id === userId) return { authHeader, actorId: userId };

  const { data: roles } = await supabase
    .from('user_roles').select('role').eq('user_id', userId)
    .in('role', ['management', 'owner', 'onboarding_staff', 'dispatcher']).limit(1);
  if (roles && roles.length > 0) return { authHeader, actorId: userId };

  return fail(403, 'Not authorized to send this packet');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function buildHtml(v: {
  driverName: string;
  unitNumber: string | null;
  carrierName: string;
  usdot: string | null;
  windowStart: string;
  windowEnd: string;
  dispositions: Body['dispositions'];
  reduced: boolean;
  link: string | null;
  linkExpires: string | null;
}): string {
  const rows = v.dispositions.map((d) => {
    const included = d.status === 'embedded';
    return `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${escapeHtml(d.log_date)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:${included ? '#0D0D0D' : '#8a6d1f'};">
        ${included ? 'Included' : `Not included — ${escapeHtml(d.reason ?? 'unavailable')}`}
      </td></tr>`;
  }).join('');

  const linkBlock = v.link
    ? `<div style="margin:20px 0;padding:14px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;font-size:14px;">
        The packet was too large to attach to an email. Download it here:<br/>
        <a href="${escapeHtml(v.link)}" style="color:#8a6d1f;font-weight:600;">Download the 8-day packet (PDF)</a><br/>
        <span style="color:#666;font-size:12px;">This link stops working at ${escapeHtml(v.linkExpires ?? '')} and every open is logged.</span>
      </div>`
    : '<p style="margin:16px 0 0;color:#666;font-size:13px;">The packet is attached to this email as a single PDF.</p>';

  const reducedBlock = v.reduced
    ? `<p style="margin:12px 0 0;color:#666;font-size:12px;">
        Photographed log pages were reduced in resolution so the file could be emailed.
        No day was omitted and no page was replaced.</p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Record of Duty Status — ${escapeHtml(v.driverName)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        ${emailHeader('RECORD OF DUTY STATUS')}
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">
            8-day log packet — ${escapeHtml(v.driverName)}
          </h1>
          <p style="margin:0 0 18px;color:#666;font-size:14px;">
            ${escapeHtml(v.carrierName)}${v.usdot ? ` · USDOT ${escapeHtml(v.usdot)}` : ''}
            ${v.unitNumber ? ` · Unit ${escapeHtml(v.unitNumber)}` : ''}<br/>
            Records for ${escapeHtml(v.windowStart)} through ${escapeHtml(v.windowEnd)}, kept under 49 CFR 395.8.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:13px;">
            ${rows}
          </table>
          ${linkBlock}
          ${reducedBlock}
        </td></tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function handler(req: Request): Promise<Response> {
  const parsed = validate(await req.json().catch(() => null));
  if (typeof parsed === 'string') return fail(400, parsed);
  const body = parsed;

  const supabase = serviceClient();
  const auth = await authorize(req, supabase, body.operator_id);
  if (auth instanceof Response) return auth;

  const officerEmail = body.officer_email.trim().toLowerCase();

  // Idempotency, keyed on the queue entry id. A retry of the same entry to the
  // same officer is a no-op; the same entry to a different officer is not
  // possible (each send is its own entry), and two officers on one day are two
  // entries, so neither is swallowed.
  const { data: priorRows } = await supabase
    .from('audit_log')
    .select('id, metadata')
    .eq('action', AUDIT_ACTION)
    .eq('entity_id', body.entry_id)
    .limit(5);
  const alreadySent = (priorRows ?? []).some((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return m.officer_email === officerEmail && m.officer_outcome === 'sent';
  });
  if (alreadySent) {
    return ok({ success: true, alreadySent: true, officer_outcome: 'sent' });
  }

  const { data: operator } = await supabase
    .from('operators')
    .select('id, unit_number, is_demo, user_id')
    .eq('id', body.operator_id)
    .maybeSingle();
  // operators has no FK to profiles (user_id points at auth.users), so the
  // embed above never resolved and every packet was addressed to "Driver".
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
  // A roadside packet is a federal record. If the name cannot be resolved the
  // packet does not go out under a placeholder — the same reasoning as refusing
  // to certify on a blank signature.
  if (!driverName) {
    return fail(
      422,
      'This driver has no name on file, so a roadside packet cannot be generated. Add the driver\'s legal name to their profile and try again.',
    );
  }
  const unitNumber: string | null = operator?.unit_number ?? null;

  const { data: carrier } = await supabase
    .from('carrier_profile').select('legal_name, usdot_number').limit(1).maybeSingle();

  // Demo operator: nothing leaves the system. No officer email, no carrier
  // copy, and no share token — a token is a real public URL against real
  // infrastructure, and a training packet behind one is exactly the artifact
  // this guardrail exists to prevent. The audit row is still written so staff
  // can see the attempt, and the caller is told what would have gone out.
  if ((operator as { is_demo?: boolean } | null)?.is_demo === true) {
    const { data: carrierRecipients } = await supabase
      .from('carrier_notification_settings').select('email').eq('is_active', true);
    const carrierEmails = (carrierRecipients ?? [])
      .map((r) => r.email as string).filter(Boolean);

    await supabase.from('audit_log').insert({
      actor_id: auth.actorId,
      actor_name: driverName,
      action: AUDIT_ACTION,
      entity_type: 'rods_officer_packet',
      entity_id: body.entry_id,
      entity_label: `${body.window_start} → ${body.window_end}`,
      metadata: {
        operator_id: body.operator_id,
        officer_email: officerEmail,
        officer_name: body.officer_name ?? null,
        officer_outcome: 'suppressed_demo',
        carrier_outcome: 'suppressed_demo',
        carrier_recipients: carrierEmails.length,
        delivery: 'suppressed',
        included_dates: body.included_dates,
        dispositions: body.dispositions,
        storage_path: body.storage_path,
      },
    });

    return ok({
      success: true,
      suppressed: true,
      suppressed_reason: 'demo_operator',
      officer_outcome: 'suppressed_demo',
      carrier_outcome: 'suppressed_demo',
      delivery: 'suppressed',
      share_token: null,
      included_dates: body.included_dates,
      would_have_sent: {
        to: [officerEmail, ...carrierEmails],
        subject: `Driver's daily logs — ${driverName}`,
        attachment: 'Officer packet (PDF, DEMO watermarked)',
      },
    });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(PACKET_BUCKET).download(body.storage_path);
  if (downloadError || !file) {
    return fail(502, 'The packet could not be read from storage', downloadError?.message);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Link fallback. Reached only after the device's four downsampling passes
  // left the packet over the ceiling. A share token rather than a signed
  // storage URL: revocable from the driver's roadside screen, throttled, and
  // every open recorded in share_token_access_log. A raw signed URL has none
  // of those, and this link holds a driver's complete logs.
  let link: string | null = null;
  let linkExpiresIso: string | null = null;
  let shareToken: string | null = null;
  if (body.link_mode) {
    shareToken = crypto.randomUUID();
    linkExpiresIso = new Date(Date.now() + LINK_TTL_HOURS * 3600_000).toISOString();
    const { error: tokenError } = await supabase.from('share_tokens').insert({
      token: shareToken,
      scope: 'officer_packet',
      resource_id: body.entry_id,
      expires_at: linkExpiresIso,
      created_by: auth.actorId,
    });
    if (tokenError) return fail(500, 'Could not create the download link', tokenError.message);
    const { error: linkError } = await supabase.from('officer_packet_links').insert({
      token: shareToken,
      operator_id: body.operator_id,
      storage_path: body.storage_path,
      bucket: PACKET_BUCKET,
    });
    if (linkError) return fail(500, 'Could not create the download link', linkError.message);
    link = `${Deno.env.get('SUPABASE_URL')}/functions/v1/officer-packet-download?t=${shareToken}`;
  }

  const html = buildHtml({
    driverName,
    unitNumber,
    carrierName: carrier?.legal_name ?? 'Carrier',
    usdot: carrier?.usdot_number ?? null,
    windowStart: body.window_start,
    windowEnd: body.window_end,
    dispositions: body.dispositions,
    reduced: body.downsampled_pass !== null && body.downsampled_pass !== undefined,
    link,
    linkExpires: linkExpiresIso
      ? new Date(linkExpiresIso).toLocaleString('en-US', { timeZone: 'America/Chicago' })
      : null,
  });

  const attachments = link ? undefined : [{
    filename: `rods-8-day-packet-${body.window_start}-to-${body.window_end}.pdf`,
    content: toBase64(bytes),
    content_type: 'application/pdf',
  }];
  const subject = `Record of Duty Status — ${driverName}${unitNumber ? ` (Unit ${unitNumber})` : ''}`
    + ` — ${body.window_start} to ${body.window_end}`;

  // Officer first, on its own.
  const officerResult = await sendResendDirect({
    supabase,
    role: 'onboarding',
    to: officerEmail,
    subject,
    html,
    attachments,
    logLabel: 'officer_packet',
    skipSuppression: true,
    authHeader: auth.authHeader,
  });

  // Carrier copy: best-effort, and its failure never becomes the driver's
  // failure. Recorded on its own so the office can see it went missing.
  let carrierOutcome: 'sent' | 'failed' | 'skipped' | 'no_recipients' = 'skipped';
  let carrierError: string | null = null;
  let carrierCount = 0;
  if (officerResult.success && body.copy_carrier !== false) {
    try {
      const { data: recipientRows } = await supabase
        .from('carrier_notification_settings').select('email').eq('is_active', true);
      const recipients = (recipientRows ?? [])
        .map((r) => (r.email as string | null)?.trim().toLowerCase())
        .filter((e): e is string => !!e && e !== officerEmail);
      carrierCount = recipients.length;
      if (recipients.length === 0) {
        carrierOutcome = 'no_recipients';
      } else {
        const copy = await sendResendDirect({
          supabase,
          role: 'onboarding',
          to: recipients,
          subject: `[Copy] ${subject}`,
          html,
          attachments,
          logLabel: 'officer_packet_carrier_copy',
          skipSuppression: true,
          authHeader: auth.authHeader,
        });
        carrierOutcome = copy.success ? 'sent' : 'failed';
        carrierError = copy.success ? null : `${copy.error ?? 'Send failed'}${copy.details ? ` — ${copy.details}` : ''}`.slice(0, 500);
      }
    } catch (e) {
      carrierOutcome = 'failed';
      carrierError = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    }
  }

  await supabase.from('audit_log').insert({
    actor_id: auth.actorId,
    actor_name: driverName,
    action: AUDIT_ACTION,
    entity_type: 'rods_officer_packet',
    entity_id: body.entry_id,
    entity_label: `${body.window_start} → ${body.window_end}`,
    metadata: {
      operator_id: body.operator_id,
      officer_email: officerEmail,
      officer_name: body.officer_name ?? null,
      officer_outcome: officerResult.success ? 'sent' : 'failed',
      officer_error: officerResult.success
        ? null
        : `${officerResult.error ?? 'Send failed'}${officerResult.details ? ` — ${officerResult.details}` : ''}`.slice(0, 500),
      carrier_outcome: carrierOutcome,
      carrier_error: carrierError,
      carrier_recipients: carrierCount,
      delivery: link ? 'link' : 'attachment',
      share_token: shareToken,
      link_expires_at: linkExpiresIso,
      packet_bytes: bytes.byteLength,
      downsampled_pass: body.downsampled_pass ?? null,
      included_dates: body.included_dates,
      dispositions: body.dispositions,
      storage_path: body.storage_path,
    },
  });

  if (!officerResult.success) {
    return fail(
      officerResult.status || 502,
      officerResult.error ?? 'The packet could not be sent to the officer',
      officerResult.details,
    );
  }

  return ok({
    success: true,
    officer_outcome: 'sent',
    carrier_outcome: carrierOutcome,
    delivery: link ? 'link' : 'attachment',
    share_token: shareToken,
    link_expires_at: linkExpiresIso,
    included_dates: body.included_dates,
  });
}

Deno.serve(withErrorEnvelope(handler, 'send-officer-packet'));