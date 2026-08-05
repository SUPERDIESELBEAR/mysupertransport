import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts';

const SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';
// Resend hard cap on total email payload ~40MB base64; keep attachments <20MB raw combined
const MAX_ATTACHED_BYTES = 20 * 1024 * 1024;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', csv: 'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}

function buildDotEmail(data: {
  driverName: string;
  operatorEmail: string;
  yearsExperience: string | null;
  vin: string | null;
  truckYear: string | null;
  truckMake: string | null;
  unitNumber: string | null;
  goLiveDate: string | null;
  operatorType: string | null;
  notes: string | null;
  dlAttached: boolean;
  dlSignedUrl: string | null;
  extraLinks: { name: string; url: string }[];
  attachedNames: string[];
  senderName: string;
  greeting: string;
}): string {
  const notesSection = data.notes
    ? `<div style="margin-top:20px;padding:12px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;">
        <strong>Notes from ${escapeHtml(data.senderName)}:</strong><br/>${escapeHtml(data.notes).replace(/\n/g, '<br/>')}
       </div>`
    : '';

  const dlSection = data.dlAttached
    ? `<p style="margin:16px 0 0;"><strong>Driver's License:</strong> <span style="color:#27ae60;">✓ Attached</span></p>`
    : data.dlSignedUrl
      ? `<p style="margin:16px 0 0;"><strong>Driver's License:</strong> <a href="${data.dlSignedUrl}" style="color:#C9A84C;font-weight:600;">View Driver's License</a> <em style="color:#999;font-size:12px;">(link expires in 7 days)</em></p>`
      : '';

  const attachedList = data.attachedNames.length
    ? `<p style="margin:12px 0 4px;font-weight:600;">Attached files:</p><ul style="margin:0 0 0 18px;padding:0;color:#444;font-size:13px;">${data.attachedNames.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : '';

  const linkList = data.extraLinks.length
    ? `<p style="margin:16px 0 4px;font-weight:600;">Additional files (too large to attach — 7-day links):</p><ul style="margin:0 0 0 18px;padding:0;color:#444;font-size:13px;">${data.extraLinks.map(l => `<li><a href="${l.url}" style="color:#C9A84C;">${escapeHtml(l.name)}</a></li>`).join('')}</ul>`
    : '';

  const goLive = data.goLiveDate
    ? new Date(data.goLiveDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Not set';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DOT Consultant Request — ${data.driverName}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader('DOT CONSULTANT REQUEST')}
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">DOT Consultant Request — ${data.driverName}</h1>
          <p style="margin:0 0 24px;color:#666;font-size:14px;">${escapeHtml(data.greeting)}, please review the following owner-operator details.</p>

          <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Driver Information</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Driver Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.driverName}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.operatorEmail || 'N/A'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:600;">CMV Experience</td><td style="padding:8px 12px;">${data.yearsExperience ?? 'N/A'}</td></tr>
          </table>

          <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Vehicle & Go-Live</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Unit Number</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.unitNumber ?? 'N/A'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">VIN</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${data.vin ?? 'N/A'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Year</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.truckYear ?? 'N/A'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Make</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.truckMake ?? 'N/A'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Operator Type</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.operatorType === 'team' ? 'Team Driver' : data.operatorType === 'solo' ? 'Solo Driver' : 'N/A'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:600;">Go-Live Date</td><td style="padding:8px 12px;">${goLive}</td></tr>
          </table>

          ${dlSection}
          ${attachedList}
          ${linkList}
          ${notesSection}

          <p style="margin:28px 0 0;color:#666;font-size:13px;">Reply directly to this email or contact <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>
        </td></tr>
        ${emailFooter('onboarding@mysupertransport.com', 'Sent by the SUPERTRANSPORT onboarding team.')}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(withErrorEnvelope(async (req) => {
    const auth = await requireStaff(req, { roles: ['onboarding_staff', 'dispatcher', 'management', 'owner'] });
    if (auth instanceof Response) return auth;
    const { supabase, userId } = auth;
    const caller = { id: userId };

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return fail(500, 'Email provider not configured (RESEND_API_KEY missing)');

    const body = await req.json() as { operator_id?: string; notes?: string; attachment_paths?: string[]; to_emails?: unknown; cc_emails?: unknown; greeting_name?: unknown };
    const operator_id = body.operator_id;
    if (!operator_id) return fail(400, 'operator_id required');

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizeList = (raw: unknown, cap: number): string[] =>
      Array.from(new Set(
        (Array.isArray(raw) ? raw : [])
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim().toLowerCase())
          .filter(v => EMAIL_RE.test(v)),
      )).slice(0, cap);

    // Saved DOT Consultant record (recipients + greeting fallback).
    const { data: settings } = await supabase
      .from('dot_consultant_email_settings')
      .select('recipient_emails, greeting_name')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();

    // Resolve To recipients: per-send override, else saved defaults.
    let toEmails = normalizeList(body.to_emails, 15);
    if (toEmails.length === 0) {
      toEmails = normalizeList((settings as any)?.recipient_emails, 15);
    }
    if (toEmails.length === 0) return fail(400, 'At least one To recipient is required');

    // Greeting: per-send override wins, else the saved name, else a neutral "Hello".
    const rawGreeting = typeof body.greeting_name === 'string' ? body.greeting_name.trim().slice(0, 60) : '';
    const savedGreeting = typeof (settings as any)?.greeting_name === 'string'
      ? ((settings as any).greeting_name as string).trim().slice(0, 60)
      : '';
    const greetingName = rawGreeting || savedGreeting;
    const greeting = greetingName ? `Hi ${greetingName}` : 'Hello';

    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : null;
    const attachmentPaths = Array.isArray(body.attachment_paths)
      ? body.attachment_paths.filter((p): p is string => typeof p === 'string').slice(0, 10)
      : [];

    const [opResult, callerProfileResult] = await Promise.all([
      supabase.from('operators').select(`
        id, user_id, unit_number,
        applications (first_name, last_name, years_experience, dl_front_url),
        ica_contracts (truck_vin, truck_year, truck_make)
      `).eq('id', operator_id).single(),
      supabase.from('profiles').select('first_name, last_name').eq('user_id', caller.id).maybeSingle(),
    ]);

    if (opResult.error || !opResult.data) {
      return fail(404, 'Operator not found', opResult.error?.message);
    }
    const op = opResult.data as any;
    const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
    const ica = Array.isArray(op.ica_contracts) ? op.ica_contracts[0] : op.ica_contracts;

    const { data: os } = await supabase.from('onboarding_status').select(
      'truck_vin, truck_year, truck_make, unit_number, go_live_date, operator_type'
    ).eq('operator_id', operator_id).single();

    const { data: { user: opUser } } = await supabase.auth.admin.getUserById(op.user_id);

    const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';
    const senderName = callerProfileResult.data
      ? [callerProfileResult.data.first_name, callerProfileResult.data.last_name].filter(Boolean).join(' ').trim() || 'SUPERTRANSPORT Onboarding'
      : 'SUPERTRANSPORT Onboarding';

    // DL attachment
    let dlBase64: string | null = null;
    let dlSignedUrl: string | null = null;
    let dlFileName = 'drivers_license.jpg';
    let dlBytes = 0;
    const dlStoragePath: string | null = app?.dl_front_url ?? null;
    if (dlStoragePath) {
      try {
        const bucket = 'application-documents';
        const filePath = dlStoragePath.replace(/^.*?application-documents\//, '');
        const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(filePath);
        if (!dlErr && fileData) {
          const buf = await fileData.arrayBuffer();
          if (buf.byteLength > 4 * 1024 * 1024) {
            const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(filePath, 604800);
            dlSignedUrl = signed?.signedUrl ?? null;
          } else {
            dlBase64 = base64Encode(new Uint8Array(buf));
            dlBytes = buf.byteLength;
            const last = filePath.split('/').pop();
            if (last) dlFileName = last;
          }
        }
      } catch (e) { console.warn('DL download failed:', e); }
    }

    // Staff attachments
    const attachments: { filename: string; content: string; content_type?: string }[] = [];
    const extraLinks: { name: string; url: string }[] = [];
    let runningBytes = dlBytes;
    if (dlBase64) attachments.push({ filename: dlFileName, content: dlBase64 });

    for (const path of attachmentPaths) {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage.from('dot-consultant-attachments').download(path);
        if (dlErr || !fileData) { console.warn('Attachment download failed:', path, dlErr?.message); continue; }
        const buf = await fileData.arrayBuffer();
        const filename = path.split('/').pop() ?? 'attachment';
        // Strip timestamp prefix if present (format: {ts}-{originalName})
        const cleanName = filename.replace(/^\d+-/, '');
        if (runningBytes + buf.byteLength <= MAX_ATTACHED_BYTES) {
          attachments.push({
            filename: cleanName,
            content: base64Encode(new Uint8Array(buf)),
            content_type: contentTypeFor(cleanName),
          });
          runningBytes += buf.byteLength;
        } else {
          const { data: signed } = await supabase.storage.from('dot-consultant-attachments').createSignedUrl(path, 604800);
          if (signed?.signedUrl) extraLinks.push({ name: cleanName, url: signed.signedUrl });
        }
      } catch (e) {
        console.warn('Attachment error:', path, e);
      }
    }

    const attachedNames = attachments
      .filter(a => a.filename !== dlFileName || !dlBase64 || attachments.indexOf(a) !== 0)
      .map(a => a.filename);

    const html = buildDotEmail({
      driverName,
      operatorEmail: opUser?.email ?? '',
      yearsExperience: app?.years_experience ?? null,
      vin: os?.truck_vin || ica?.truck_vin || null,
      truckYear: os?.truck_year || ica?.truck_year || null,
      truckMake: os?.truck_make || ica?.truck_make || null,
      unitNumber: os?.unit_number || op.unit_number || null,
      goLiveDate: os?.go_live_date ?? null,
      operatorType: os?.operator_type ?? null,
      notes,
      dlAttached: !!dlBase64,
      dlSignedUrl,
      extraLinks,
      attachedNames,
      senderName,
      greeting,
    });

    const subject = `DOT Consultant Request — ${driverName}`;

    const payload: Record<string, unknown> = {
      from: `SUPERTRANSPORT Onboarding <onboarding@mysupertransport.com>`,
      to: toEmails,
      reply_to: 'onboarding@mysupertransport.com',
      subject,
      html,
    };
    if (attachments.length) payload.attachments = attachments;

    // Optional CC recipients (per-send). Validate, dedupe, drop anything already in To, cap at 10.
    const ccEmails = normalizeList(body.cc_emails, 10).filter(v => !toEmails.includes(v));
    if (ccEmails.length) payload.cc = ccEmails;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let emailError: string | null = null;
    if (!res.ok) {
      emailError = `Resend error [${res.status}]: ${await res.text()}`;
      console.error('send-dot-consultant-request email error:', emailError);
    }

    await supabase.from('audit_log').insert({
      actor_id: caller.id,
      actor_name: senderName,
      entity_type: 'operator',
      entity_id: operator_id,
      entity_label: driverName,
      action: 'dot_consultant_request_sent',
      metadata: {
        recipients: toEmails,
        cc: ccEmails,
        attachment_count: attachments.length - (dlBase64 ? 1 : 0),
        extra_link_count: extraLinks.length,
        has_notes: !!notes,
        email_error: emailError,
      },
    });

    if (emailError) {
      return fail(502, 'Email delivery failed', emailError);
    }

    return ok({ success: true, sent_to: [...toEmails, ...ccEmails] });
}, 'send-dot-consultant-request'));