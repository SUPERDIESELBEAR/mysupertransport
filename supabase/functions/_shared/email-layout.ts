// ─── Brand constants ──────────────────────────────────────────────────────────
export const BRAND_NAME       = 'SUPERTRANSPORT';
export const BRAND_COLOR      = '#C9A84C';   // restored to original gold
export const BRAND_DARK       = '#0f1117';
export const SUPPORT_EMAIL    = 'support@mysupertransport.com';
export const ONBOARDING_EMAIL  = 'onboarding@mysupertransport.com';
export const RECRUITING_EMAIL  = 'recruiting@mysupertransport.com';

// ─── emailHeader ─────────────────────────────────────────────────────────────
export function emailHeader(subtitle = 'DRIVER OPERATIONS'): string {
  return `<!-- Header -->
        <tr>
          <td style="background:${BRAND_DARK};padding:24px 40px;border-bottom:3px solid ${BRAND_COLOR};">
            <p style="margin:0;color:${BRAND_COLOR};font-size:22px;font-weight:800;letter-spacing:2px;">${BRAND_NAME}</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">${subtitle}</p>
          </td>
        </tr>`;
}

// ─── emailFooter ─────────────────────────────────────────────────────────────
export function emailFooter(
  footerEmail = SUPPORT_EMAIL,
  footerNote  = 'This is an automated notification. Please do not reply to this email.'
): string {
  return `<!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">${BRAND_NAME} &nbsp;·&nbsp; Questions? <a href="mailto:${footerEmail}" style="color:${BRAND_COLOR};">${footerEmail}</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">${footerNote}</p>
          </td>
        </tr>`;
}

// ─── buildEmail ──────────────────────────────────────────────────────────────
export function buildEmail(
  subject: string,
  heading: string,
  body: string,
  cta?: { label: string; url: string },
  footerEmail = SUPPORT_EMAIL
): string {
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto;"><tr><td align="center" bgcolor="${BRAND_COLOR}" style="background:${BRAND_COLOR};border-radius:8px;"><a href="${cta.url}" target="_blank" rel="noopener" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:block;line-height:1;mso-padding-alt:14px 32px;">${cta.label}</a></td></tr></table>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader()}
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:${BRAND_DARK};font-weight:700;">${heading}</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">${body}</div>
            ${ctaHtml}
          </td>
        </tr>
        ${emailFooter(footerEmail)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── sendEmail ───────────────────────────────────────────────────────────────
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  resendKey: string,
  from = `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
  opts?: { messageId?: string; trackOpens?: boolean }
): Promise<void> {
  const finalHtml = await maybeInjectTrackingPixel(html, opts);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html: finalHtml }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`Resend warning [${res.status}] to ${to}: ${err}`);
  }
}

// ─── sendEmailStrict ─────────────────────────────────────────────────────────
export async function sendEmailStrict(
  to: string,
  subject: string,
  html: string,
  resendKey: string,
  from = `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
  opts?: { messageId?: string; trackOpens?: boolean }
): Promise<void> {
  const finalHtml = await maybeInjectTrackingPixel(html, opts);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html: finalHtml }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error [${res.status}]: ${err}`);
  }
}

// ─── Open tracking pixel ─────────────────────────────────────────────────────
// Injects a 1×1 transparent GIF that hits the `email-track-open` edge function,
// which stamps `email_send_log.opened_at` / increments `open_count` for the
// matching `message_id`. Silent no-op when there's no messageId, no secret,
// no Supabase URL, or the caller opted out.

function b64url(bytes: ArrayBuffer): string {
  const b = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeOpenToken(messageId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(messageId));
  return b64url(sig).slice(0, 16);
}

async function maybeInjectTrackingPixel(
  html: string,
  opts?: { messageId?: string; trackOpens?: boolean },
): Promise<string> {
  if (!opts?.messageId) return html;
  if (opts.trackOpens === false) return html;
  const secret = Deno.env.get('EMAIL_TRACK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!secret || !supabaseUrl) return html;
  try {
    const token = await computeOpenToken(opts.messageId, secret);
    const src = `${supabaseUrl}/functions/v1/email-track-open?m=${encodeURIComponent(opts.messageId)}&t=${token}`;
    const pixel = `<img src="${src}" width="1" height="1" alt="" style="display:none;border:0;outline:none;width:1px;height:1px;" />`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${pixel}</body>`);
    }
    return html + pixel;
  } catch (e) {
    console.warn('[email-layout] failed to inject tracking pixel:', e);
    return html;
  }
}
