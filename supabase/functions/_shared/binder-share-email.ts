// Branded HTML for roadside document shares out of the driver inspection
// binder. Replaces the old plain-text `mailto:` blob, which mail clients
// reflowed into a wall of raw UUID URLs.

const GOLD = '#C9A84C';
const DARK = '#0F0F0F';

export interface BinderShareDoc {
  title: string;
  url: string;
  /** Optional short human note, e.g. "Expires Mar 4, 2027". */
  meta?: string | null;
}

export interface BinderShareEmailInput {
  docs: BinderShareDoc[];
  driverName: string;
  unitNumber?: string | null;
  note?: string | null;
  sharedAt?: Date;
}

function centralTimestamp(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' CT';
  } catch {
    return d.toISOString();
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unitTag(unitNumber?: string | null): string {
  return unitNumber ? ` — Unit ${unitNumber}` : '';
}

export function binderShareSubject(input: BinderShareEmailInput): string {
  const { docs, driverName, unitNumber } = input;
  return docs.length === 1
    ? `SUPERTRANSPORT — ${driverName}${unitTag(unitNumber)} — ${docs[0].title}`
    : `SUPERTRANSPORT — ${docs.length} Roadside Documents — ${driverName}${unitTag(unitNumber)}`;
}

export function binderShareText(input: BinderShareEmailInput): string {
  const { docs, driverName, unitNumber, note } = input;
  const stamp = centralTimestamp(input.sharedAt ?? new Date());
  const lines: string[] = [
    `SUPERTRANSPORT — Digital Inspection Binder`,
    `${driverName}${unitTag(unitNumber)}`,
    '',
  ];
  if (note) lines.push(note, '');
  lines.push(`Documents (${docs.length}):`, '');
  docs.forEach((d, i) => {
    lines.push(`${i + 1}. ${d.title} — ${d.url}`);
    lines.push('');
  });
  lines.push(`Shared ${stamp}. Links are secure and time-limited.`);
  return lines.join('\n');
}

export function binderShareHtml(input: BinderShareEmailInput): string {
  const { docs, driverName, unitNumber, note } = input;
  const stamp = centralTimestamp(input.sharedAt ?? new Date());

  const rows = docs.map((d, i) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #EDEDED;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="28" valign="top" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#9A9A9A;padding-top:8px;">${i + 1}.</td>
                  <td valign="top" style="font-family:Arial,Helvetica,sans-serif;">
                    <div style="font-size:15px;font-weight:bold;color:${DARK};line-height:1.35;">${esc(d.title)}</div>
                    ${d.meta ? `<div style="font-size:12px;color:#7A7A7A;margin-top:2px;">${esc(d.meta)}</div>` : ''}
                  </td>
                  <td valign="top" align="right" style="padding-left:12px;">
                    <a href="${esc(d.url)}" target="_blank" rel="noopener"
                       style="display:inline-block;background:${GOLD};color:${DARK};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;padding:9px 18px;border-radius:6px;white-space:nowrap;">View</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(binderShareSubject(input))}</title></head>
<body style="margin:0;padding:0;background:#F4F4F4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F4F4;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:94%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:${DARK};padding:22px 32px;border-bottom:3px solid ${GOLD};font-family:Arial,Helvetica,sans-serif;">
            <div style="color:${GOLD};font-size:20px;font-weight:bold;letter-spacing:2px;">SUPERTRANSPORT</div>
            <div style="color:#999;font-size:11px;letter-spacing:1.4px;margin-top:4px;">DIGITAL INSPECTION BINDER</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:12px;letter-spacing:1.2px;color:#8A8A8A;text-transform:uppercase;">Driver</div>
            <div style="font-size:19px;font-weight:bold;color:${DARK};margin-top:2px;">${esc(driverName)}${unitNumber ? `<span style="font-weight:normal;color:#6A6A6A;"> &nbsp;·&nbsp; Unit ${esc(unitNumber)}</span>` : ''}</div>
            ${note ? `<div style="margin-top:16px;background:#FAF8F2;border:1px solid #EDE6CF;border-left:4px solid ${GOLD};border-radius:4px;padding:12px 14px;font-size:13px;color:${DARK};line-height:1.55;">${esc(note).replace(/\n/g, '<br>')}</div>` : ''}
            <div style="margin-top:18px;font-size:13px;color:#4A4A4A;line-height:1.6;">
              ${docs.length === 1 ? 'The roadside document below' : `The ${docs.length} roadside documents below`} can be opened with the buttons on the right. Each link is secure and time-limited.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:11px;letter-spacing:1.2px;color:#8A8A8A;text-transform:uppercase;border-bottom:2px solid ${GOLD};padding-bottom:6px;">Documents (${docs.length})</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 30px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:12px;color:#8A8A8A;line-height:1.6;">Shared ${stamp}<br>SUPERTRANSPORT — Digital Inspection Binder · Powered by SUPERDRIVE</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}