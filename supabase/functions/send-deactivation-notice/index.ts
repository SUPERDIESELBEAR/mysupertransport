import { emailHeader, emailFooter } from '../_shared/email-layout.ts';
import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function buildHtml(d: {
  driverName: string;
  unitNumber: string | null;
  terminationDate: string;
  reason: string;
  rehire: 'yes' | 'no';
  notes: string;
  senderName: string;
  greeting: string;
}): string {
  const rehireBadge = d.rehire === 'yes'
    ? '<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#e7f7ec;color:#1e7c3a;font-weight:700;font-size:12px;letter-spacing:0.5px;">YES</span>'
    : '<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fdecec;color:#a3251f;font-weight:700;font-size:12px;letter-spacing:0.5px;">NO</span>';

  const notesBlock = d.notes
    ? `<div style="margin-top:20px;padding:12px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;">
         <strong>Notes from ${escapeHtml(d.senderName)}:</strong><br/>${escapeHtml(d.notes).replace(/\n/g, '<br/>')}
       </div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Driver Deactivation — ${escapeHtml(d.driverName)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader('DRIVER DEACTIVATION NOTICE')}
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">Driver Deactivation — ${escapeHtml(d.driverName)}</h1>
          <p style="margin:0 0 24px;color:#666;font-size:14px;">${escapeHtml(d.greeting)}, please find the deactivation details below.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:14px;">
            <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Driver Name</td><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(d.driverName)}</td></tr>
            <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Unit Number</td><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(d.unitNumber ?? 'N/A')}</td></tr>
            <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Termination Date</td><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(fmtDate(d.terminationDate))}</td></tr>
            <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Reason for Deactivation</td><td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(d.reason)}</td></tr>
            <tr><td style="padding:10px 12px;background:#f9f9f9;font-weight:600;">Available for Rehire?</td><td style="padding:10px 12px;">${rehireBadge}</td></tr>
          </table>

          ${notesBlock}

          <p style="margin:28px 0 0;color:#444;font-size:13px;">Please reply to this email with your acknowledgment or any follow-up. Your reply will reach ${escapeHtml(d.senderName)} and everyone copied on this thread.</p>
        </td></tr>
        ${emailFooter('onboarding@mysupertransport.com', 'Sent by SUPERTRANSPORT management.')}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(withErrorEnvelope(async (req) => {
    const auth = await requireStaff(req, { roles: ['onboarding_staff', 'dispatcher', 'management', 'owner'] });
    if (auth instanceof Response) return auth;
    const { supabase, userId, email: callerEmail } = auth;
    const caller = { id: userId, email: callerEmail };

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return fail(500, 'Email provider not configured (RESEND_API_KEY missing)');

    const body = await req.json() as {
      operator_id?: string;
      termination_date?: string;
      reason?: string;
      rehire?: string;
      notes?: string;
      to_emails?: unknown;
      cc_emails?: unknown;
      greeting_name?: unknown;
    };

    const operator_id = body.operator_id;
    if (!operator_id) {
      return fail(400, 'operator_id required');
    }
    const terminationDate = typeof body.termination_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.termination_date)
      ? body.termination_date
      : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    const rehireRaw = typeof body.rehire === 'string' ? body.rehire.toLowerCase() : '';
    const rehire: 'yes' | 'no' | null = rehireRaw === 'yes' ? 'yes' : rehireRaw === 'no' ? 'no' : null;
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : '';

    if (!terminationDate || !reason || !rehire) {
      return fail(400, 'termination_date, reason, and rehire (yes|no) are required');
    }

    // Normalize To recipients (the DOT Consultant is pre-filled client-side but removable).
    const rawTos = Array.isArray(body.to_emails) ? body.to_emails as unknown[] : [];
    const toEmails = Array.from(new Set(
      rawTos
        .filter((v): v is string => typeof v === 'string')
        .map(v => v.trim().toLowerCase())
        .filter(v => EMAIL_RE.test(v)),
    )).slice(0, 15);
    if (toEmails.length === 0) {
      return fail(400, 'At least one To recipient is required');
    }

    // Saved DOT Consultant record: primary email + greeting fallback.
    const { data: settings } = await supabase
      .from('dot_consultant_email_settings')
      .select('recipient_emails, greeting_name')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();
    const consultantEmails = ((settings as any)?.recipient_emails ?? [])
      .filter((v: unknown): v is string => typeof v === 'string')
      .map((v: string) => v.trim().toLowerCase());
    const consultantIncluded = consultantEmails.length === 0
      ? false
      : toEmails.some(e => consultantEmails.includes(e));

    // Greeting: per-send override wins, else the saved name, else a neutral "Hello".
    const rawGreeting = typeof body.greeting_name === 'string' ? body.greeting_name.trim().slice(0, 60) : '';
    const savedGreeting = typeof (settings as any)?.greeting_name === 'string'
      ? ((settings as any).greeting_name as string).trim().slice(0, 60)
      : '';
    const greetingName = rawGreeting || savedGreeting;
    const greeting = greetingName ? `Hi ${greetingName}` : 'Hello';

    // Fetch driver context
    const [opResult, callerProfileResult] = await Promise.all([
      supabase.from('operators').select(`
        id, user_id, unit_number,
        applications (first_name, last_name)
      `).eq('id', operator_id).single(),
      supabase.from('profiles').select('first_name, last_name').eq('user_id', caller.id).maybeSingle(),
    ]);

    if (opResult.error || !opResult.data) {
      return fail(404, 'Operator not found', opResult.error?.message);
    }
    const op = opResult.data as any;
    const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
    const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';
    const senderName = callerProfileResult.data
      ? [callerProfileResult.data.first_name, callerProfileResult.data.last_name].filter(Boolean).join(' ').trim() || 'SUPERTRANSPORT Management'
      : 'SUPERTRANSPORT Management';

    // Normalize CCs from client + auto-add owner(s) via service role.
    // Exclude anything already in the To list to avoid duplicates.
    const rawCcs = Array.isArray(body.cc_emails) ? body.cc_emails as unknown[] : [];
    const ccSet = new Set<string>(
      rawCcs
        .filter((v): v is string => typeof v === 'string')
        .map(v => v.trim().toLowerCase())
        .filter(v => EMAIL_RE.test(v) && !toEmails.includes(v)),
    );
    try {
      const { data: ownerRoleRows } = await supabase
        .from('user_roles').select('user_id').eq('role', 'owner');
      const ownerIds = Array.from(new Set((ownerRoleRows ?? []).map((r: any) => r.user_id).filter(Boolean)));
      for (const uid of ownerIds) {
        try {
          const { data: u } = await supabase.auth.admin.getUserById(uid as string);
          const e = (u?.user?.email ?? '').toLowerCase();
          if (e && EMAIL_RE.test(e) && !toEmails.includes(e)) ccSet.add(e);
        } catch (e) { console.warn('owner email lookup failed:', uid, e); }
      }
    } catch (e) {
      console.warn('owner CC lookup failed:', e);
    }
    const ccEmails = Array.from(ccSet).slice(0, 15);

    // Reply-To: sender + all CCs, so Reply-All lands with the whole thread
    const replyToList = Array.from(new Set(
      [caller.email, ...ccEmails]
        .filter(v => typeof v === 'string' && v.length > 0)
        .map(v => v.trim().toLowerCase())
        .filter(v => EMAIL_RE.test(v))
    ));

    const html = buildHtml({
      driverName,
      unitNumber: op.unit_number ?? null,
      terminationDate,
      reason,
      rehire,
      notes,
      senderName,
      greeting,
    });

    const subject = `Driver Deactivation — ${driverName}${op.unit_number ? ` (Unit ${op.unit_number})` : ''} — ${fmtDate(terminationDate)}`;

    const payload: Record<string, unknown> = {
      from: `SUPERTRANSPORT Management <onboarding@mysupertransport.com>`,
      to: toEmails,
      subject,
      html,
    };
    if (ccEmails.length) payload.cc = ccEmails;
    if (replyToList.length) payload.reply_to = replyToList;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('send-deactivation-notice resend error:', res.status, errText);
      return fail(502, `Email delivery failed (Resend ${res.status})`, errText);
    }

    // Stamp operator notification timestamp only when the DOT Consultant actually received it.
    // Test sends (consultant removed) should not clear the "notification required" banner.
    const notifiedAt = new Date().toISOString();
    if (consultantIncluded) {
      const { error: stampErr } = await supabase
        .from('operators')
        .update({ safety_advisor_notified_at: notifiedAt } as any)
        .eq('id', operator_id);
      if (stampErr) console.error('Failed to stamp safety_advisor_notified_at:', stampErr.message);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      actor_id: caller.id,
      actor_name: senderName,
      action: consultantIncluded ? 'driver_deactivation_email_sent' : 'driver_deactivation_email_test_sent',
      entity_type: 'operator',
      entity_id: operator_id,
      entity_label: driverName,
      metadata: {
        to: toEmails,
        consultant_included: consultantIncluded,
        greeting_name: greetingName || null,
        cc: ccEmails,
        reply_to: replyToList,
        termination_date: terminationDate,
        reason,
        rehire,
        notes: notes || null,
      },
    });

    return ok({
      success: true,
      sent_to: [...toEmails, ...ccEmails],
      notified_at: consultantIncluded ? notifiedAt : null,
      consultant_included: consultantIncluded,
    });
}, 'send-deactivation-notice'));