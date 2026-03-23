// ─── Brand constants ──────────────────────────────────────────────────────────
export const BRAND_NAME     = 'SUPERTRANSPORT';
export const BRAND_COLOR    = '#C9A84C';
export const BRAND_DARK     = '#0f1117';
export const SUPPORT_EMAIL  = 'support@mysupertransport.com';
export const ONBOARDING_EMAIL = 'onboarding@mysupertransport.com';

// ─── emailHeader ─────────────────────────────────────────────────────────────
// Returns the <tr> header row HTML. subtitle defaults to 'DRIVER OPERATIONS'.
export function emailHeader(subtitle = 'DRIVER OPERATIONS'): string {
  return `<!-- Header -->
        <tr>
          <td style="background:#0f1117;padding:24px 40px;border-bottom:3px solid #C9A84C;">
            <p style="margin:0;color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:2px;">SUPERTRANSPORT</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">${subtitle}</p>
          </td>
        </tr>`;
}

// ─── emailFooter ─────────────────────────────────────────────────────────────
// Returns the <tr> footer row HTML.
// footerEmail  – the mailto link address (defaults to SUPPORT_EMAIL)
// footerNote   – second line text (defaults to standard do-not-reply copy)
export function emailFooter(
  footerEmail = SUPPORT_EMAIL,
  footerNote  = 'This is an automated notification. Please do not reply to this email.'
): string {
  return `<!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT &nbsp;·&nbsp; Questions? <a href="mailto:${footerEmail}" style="color:#C9A84C;">${footerEmail}</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">${footerNote}</p>
          </td>
        </tr>`;
}

// ─── buildEmail ──────────────────────────────────────────────────────────────
// Generates a full branded email HTML string.
// footerEmail defaults to SUPPORT_EMAIL ('support@mysupertransport.com').
export function buildEmail(
  subject: string,
  heading: string,
  body: string,
  cta?: { label: string; url: string },
  footerEmail = SUPPORT_EMAIL
): string {
  const ctaHtml = cta
    ? `<div style="text-align:center;margin:32px 0;">
        <a href="${cta.url}" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
          ${cta.label}
        </a>
      </div>`
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
            <h1 style="margin:0 0 16px;font-size:22px;color:#0f1117;font-weight:700;">${heading}</h1>
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
// Sends an email via Resend. from defaults to onboarding@mysupertransport.com.
// Pass a custom from for support@ or recruiting@ senders.
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  resendKey: string,
  from = 'SUPERTRANSPORT <onboarding@mysupertransport.com>'
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Log but don't throw — email failure must not block in-app notifications
    console.warn(`Resend warning [${res.status}] to ${to}: ${err}`);
  }
}

// ─── sendEmailStrict ─────────────────────────────────────────────────────────
// Same as sendEmail but THROWS on failure (used where callers handle the error).
export async function sendEmailStrict(
  to: string,
  subject: string,
  html: string,
  resendKey: string,
  from = 'SUPERTRANSPORT <onboarding@mysupertransport.com>'
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error [${res.status}]: ${err}`);
  }
}
