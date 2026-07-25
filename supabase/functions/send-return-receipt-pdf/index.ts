import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts';

/**
 * Staff-only: emails a consolidated equipment return receipt PDF (generated
 * client-side in the preview modal) to the operator on file. The PDF is
 * uploaded as a base64 attachment via Resend, mirroring send-dot-consultant-request.
 */

const FROM_ADDRESS = 'SUPERTRANSPORT Operations <onboarding@mysupertransport.com>';
const REPLY_TO = 'onboarding@mysupertransport.com';
const MAX_PDF_BYTES = 15 * 1024 * 1024; // Resend attachment safety cap

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildHtml(opts: {
  driverName: string;
  itemCount: number;
  senderName: string;
  note: string | null;
}): string {
  const noteBlock = opts.note
    ? `<div style="margin-top:20px;padding:12px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;">
         <strong>Note from ${escapeHtml(opts.senderName)}:</strong><br/>${escapeHtml(opts.note).replace(/\n/g, '<br/>')}
       </div>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Equipment Return Receipt</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0F0F0F;padding:22px 32px;">
          <div style="height:4px;width:56px;background:#C9A84C;margin-bottom:12px;"></div>
          <div style="color:#C9A84C;font-size:12px;letter-spacing:2px;font-weight:700;">SUPERTRANSPORT</div>
          <div style="color:#ffffff;font-size:11px;letter-spacing:1px;margin-top:4px;">EQUIPMENT RETURN RECEIPT</div>
        </td></tr>
        <tr><td style="padding:32px 36px;color:#0F0F0F;font-size:14px;line-height:1.55;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;">Your equipment return receipt</h1>
          <p style="margin:0 0 16px;">Hi ${escapeHtml(opts.driverName)},</p>
          <p style="margin:0 0 16px;">
            Attached is your official SUPERTRANSPORT equipment return receipt covering
            <strong>${opts.itemCount} returned item${opts.itemCount === 1 ? '' : 's'}</strong>.
            Please keep this PDF for your records.
          </p>
          ${noteBlock}
          <p style="margin:24px 0 4px;color:#666;font-size:13px;">
            Questions? Reply to this email and it will reach ${escapeHtml(opts.senderName)}.
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:#888;">— SUPERTRANSPORT Operations</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(withErrorEnvelope(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Method not allowed');

  const auth = await requireStaff(req, { roles: ['onboarding_staff', 'dispatcher', 'management', 'owner'] });
  if (auth instanceof Response) return auth;
  const { supabase, userId } = auth;
  const caller = { id: userId };

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return fail(500, 'Email provider not configured (RESEND_API_KEY missing)');

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body'); }

  const operatorId = typeof body?.operatorId === 'string' ? body.operatorId : null;
  const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : null;
  const filenameRaw = typeof body?.filename === 'string' ? body.filename : 'return-receipts.pdf';
  const itemCount = Number.isFinite(body?.itemCount) ? Math.max(0, Math.floor(body.itemCount)) : 0;
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : null;

  if (!operatorId || !pdfBase64) {
    return fail(400, 'operatorId and pdfBase64 are required');
  }
  // Rough byte estimate from base64 length
  const estBytes = Math.floor((pdfBase64.length * 3) / 4);
  if (estBytes > MAX_PDF_BYTES) {
    return fail(413, 'PDF exceeds the 15MB email attachment limit.');
  }
  const filename = /^[\w.\-]+\.pdf$/i.test(filenameRaw) ? filenameRaw : 'return-receipts.pdf';

  const { data: op, error: opErr } = await supabase
    .from('operators')
    .select('id, applications(first_name, last_name, email)')
    .eq('id', operatorId)
    .maybeSingle();
  if (opErr || !op) return fail(404, 'Operator not found', opErr?.message);
  const app: any = Array.isArray((op as any).applications) ? (op as any).applications[0] : (op as any).applications;
  const recipient = app?.email as string | undefined;
  if (!recipient) return fail(400, 'Operator has no email on file.');
  const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';

  const { data: prof } = await supabase
    .from('profiles').select('first_name, last_name').eq('user_id', caller.id).maybeSingle();
  const senderName = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim() || 'SUPERTRANSPORT Operations';

  const html = buildHtml({ driverName, itemCount, senderName, note });
  const subject = `Your SUPERTRANSPORT equipment return receipt${itemCount ? ` (${itemCount} item${itemCount === 1 ? '' : 's'})` : ''}`;

  const payload: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to: [recipient],
    reply_to: REPLY_TO,
    subject,
    html,
    attachments: [{ filename, content: pdfBase64, content_type: 'application/pdf' }],
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let emailError: string | null = null;
  if (!res.ok) {
    emailError = `Resend error [${res.status}]: ${await res.text()}`;
    console.error('send-return-receipt-pdf email error:', emailError);
  }

  await supabase.from('audit_log').insert({
    actor_id: caller.id,
    actor_name: senderName,
    entity_type: 'operator',
    entity_id: operatorId,
    entity_label: driverName,
    action: 'return_receipt_pdf_emailed',
    metadata: {
      recipient,
      item_count: itemCount,
      filename,
      has_note: !!note,
      email_error: emailError,
    },
  });

  if (emailError) return fail(502, 'Email delivery failed', emailError);
  return ok({ success: true, recipient });
}, 'send-return-receipt-pdf'));