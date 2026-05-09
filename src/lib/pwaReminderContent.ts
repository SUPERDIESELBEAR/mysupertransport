/**
 * Shared content for the SUPERDRIVE install reminder.
 *
 * IMPORTANT: This content is duplicated in `supabase/functions/notify-pwa-install/index.ts`
 * (the edge function that actually sends the in-app + email). When you edit one,
 * edit the other. The preview UI reads from this file so staff can see the exact
 * message that will be sent.
 */

export const PWA_REMINDER_IN_APP_TITLE = "Action required: Install SUPERDRIVE";

export const PWA_REMINDER_IN_APP_BODY =
  "The Roadside Inspection Binder is moving from Google Drive to SUPERDRIVE. Your existing Drive binder will no longer be updated or accessible. Install the SUPERDRIVE app now so you always have the latest inspection documents on hand. Tap for install instructions.";

export const PWA_REMINDER_EMAIL_SUBJECT =
  "Install SUPERDRIVE — your Roadside Inspection Binder is moving";

export const PWA_REMINDER_EMAIL_HEADING =
  "Install SUPERDRIVE — Roadside Inspection Binder is moving";

const BRAND_NAME = "SUPERTRANSPORT";
const BRAND_COLOR = "#C9A84C";
const BRAND_DARK = "#0f1117";
const SUPPORT_EMAIL = "support@mysupertransport.com";
const APP_URL = "https://mysupertransport.lovable.app";

/** Body HTML used inside the branded email shell (matches edge function). */
export const PWA_REMINDER_EMAIL_BODY_HTML = `
        <p>Your <strong>Roadside Inspection Binder</strong> is moving out of <strong>Google Drive</strong> and into <strong>SUPERDRIVE</strong>. The Drive copy will no longer be updated and will soon be inaccessible.</p>

        <p>To make sure you always have current inspection documents on hand, please install the <strong>SUPERDRIVE</strong> app today. It only takes a minute and works without an app store.</p>

        <div style="background:#f8f8f8;border-radius:10px;padding:24px;margin:24px 0;">
          <p style="margin:0 0 12px;font-weight:700;color:${BRAND_DARK};">📱 Android (Chrome)</p>
          <ol style="margin:0 0 20px;padding-left:20px;color:#444;line-height:1.8;">
            <li>Open SUPERDRIVE in <strong>Chrome</strong></li>
            <li>Tap the <strong>"Install"</strong> banner at the bottom, <em>or</em></li>
            <li>Tap <strong>⋮ Menu → Add to Home Screen</strong></li>
          </ol>

          <p style="margin:0 0 12px;font-weight:700;color:${BRAND_DARK};">🍎 iPhone (Safari)</p>
          <ol style="margin:0;padding-left:20px;color:#444;line-height:1.8;">
            <li>Open SUPERDRIVE in <strong>Safari</strong></li>
            <li>Tap the <strong>Share</strong> button (square with arrow)</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          </ol>
        </div>

        <p>Once installed, <strong>SUPERDRIVE</strong> becomes your single, always-current source for Roadside Inspection Binder documents and other compliance items.</p>
        <p style="color:#666;font-size:14px;">After installing, you can open SUPERDRIVE from your home screen anytime — no need to open a browser first.</p>
      `;

/** Full email HTML preview — mirrors `_shared/email-layout.ts buildEmail()`. */
export function buildPwaReminderEmailHtml(): string {
  const subject = PWA_REMINDER_EMAIL_SUBJECT;
  const heading = PWA_REMINDER_EMAIL_HEADING;
  const body = PWA_REMINDER_EMAIL_BODY_HTML;
  const cta = { label: "Open SUPERDRIVE", url: APP_URL };

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${BRAND_DARK};padding:24px 40px;border-bottom:3px solid ${BRAND_COLOR};">
            <p style="margin:0;color:${BRAND_COLOR};font-size:22px;font-weight:800;letter-spacing:2px;">${BRAND_NAME}</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">DRIVER OPERATIONS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:${BRAND_DARK};font-weight:700;">${heading}</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">${body}</div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${cta.url}" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                ${cta.label}
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">${BRAND_NAME} &nbsp;·&nbsp; Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}