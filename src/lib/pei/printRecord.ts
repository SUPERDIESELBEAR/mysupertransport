import type {
  PEIAccident,
  PEIRequest,
  PEIRequestEvent,
  PEIResponse,
} from './types';
import { GFE_REASON_LABEL } from './types';

const EVENT_LABEL: Record<PEIRequestEvent['event_type'], string> = {
  opened_response_link: 'Opened response link',
  opened_release_link: 'Opened FCRA release',
  submitted: 'Submitted response',
  phone_attempt: 'Phone attempt logged',
  manual_send_logged: 'Manual send logged',
};

export function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yn(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v ? 'Yes' : 'No';
}

function row(label: string, value: unknown): string {
  return `<tr><th>${esc(label)}</th><td>${value === undefined || value === null || value === '' ? '—' : esc(value)}</td></tr>`;
}

/** Builds the inner HTML fragment for one PEI record (no <html>/<head>). */
export function buildRecordFragment(args: {
  request: PEIRequest;
  response: PEIResponse | null;
  accidents: PEIAccident[];
  events: PEIRequestEvent[];
  applicantName: string;
}): string {
  const { request, response, accidents, events, applicantName } = args;
  const isGFE = request.status === 'gfe_documented';

  const headerBlock = `
    <header>
      <h1>PEI Record — ${esc(request.employer_name)}</h1>
      <table class="meta">
        ${row('Applicant', applicantName || '—')}
        ${row('Claimed employment', request.employment_start_date ? `${esc(request.employment_start_date)} → ${esc(request.employment_end_date ?? 'present')}` : '—')}
        ${row('Status', request.status)}
      </table>
    </header>`;

  const gfeBlock = isGFE ? `
    <section>
      <h2>Good Faith Effort Documented</h2>
      <table>
        ${row('Reason', request.gfe_reason ? GFE_REASON_LABEL[request.gfe_reason] : '—')}
        ${request.gfe_other_reason ? row('Details', request.gfe_other_reason) : ''}
        ${row('Documented by', request.gfe_signed_by_name ?? '—')}
        ${row('Date', request.date_gfe_created ? new Date(request.date_gfe_created).toLocaleDateString() : '—')}
      </table>
      <p class="note">Per 49 CFR §391.23(c)(2), this record satisfies the good-faith effort requirement.</p>
    </section>` : '';

  const responseBlock = !isGFE && response ? `
    <section>
      <h2>Employment Verification</h2>
      <table>
        ${row('Was employed', yn(response.was_employed))}
        ${row('Dates accurate', yn(response.dates_accurate))}
        ${response.actual_start_date ? row('Actual start', response.actual_start_date) : ''}
        ${response.actual_end_date ? row('Actual end', response.actual_end_date) : ''}
        ${row('Safe & efficient', yn(response.safe_and_efficient))}
        ${row('Reason for leaving', response.reason_for_leaving ?? '—')}
        ${response.reason_detail ? row('Details', response.reason_detail) : ''}
      </table>
    </section>
    <section>
      <h2>Equipment & Trailers</h2>
      <table>
        ${row('Equipment', [
          response.equipment_straight_truck && 'Straight truck',
          response.equipment_tractor_semi && 'Tractor/Semi',
          response.equipment_bus && 'Bus',
        ].filter(Boolean).join(', ') || '—')}
        ${row('Trailers', [
          response.trailer_van && 'Van',
          response.trailer_flatbed && 'Flatbed',
          response.trailer_reefer && 'Reefer',
          response.trailer_cargo_tank && 'Cargo tank',
          response.trailer_triples && 'Triples',
          response.trailer_doubles && 'Doubles',
          response.trailer_na && 'N/A',
        ].filter(Boolean).join(', ') || '—')}
      </table>
    </section>
    <section>
      <h2>Accidents</h2>
      <table>${row('Had accidents', yn(response.had_accidents))}</table>
      ${accidents.length > 0 ? `
        <ul>
          ${accidents.map(a => `<li>${esc(a.accident_date ?? '—')} · ${esc(a.location_city_state ?? '—')} · injuries ${esc(a.number_of_injuries ?? 0)} · fatalities ${esc(a.number_of_fatalities ?? 0)}${a.hazmat_spill ? ' · HazMat' : ''}</li>`).join('')}
        </ul>` : ''}
    </section>
    <section>
      <h2>Drug & Alcohol</h2>
      <table>
        ${row('Violation', yn(response.drug_alcohol_violation))}
        ${response.drug_alcohol_violation ? `
          ${row('Failed SAP rehab', yn(response.failed_rehab))}
          ${row('Post-rehab violations', yn(response.post_rehab_violations))}
          ${response.drug_alcohol_notes ? row('Notes', response.drug_alcohol_notes) : ''}
        ` : ''}
      </table>
    </section>
    <section>
      <h2>Performance Ratings</h2>
      <table>
        ${row('Quality of work', response.rating_quality_of_work ?? '—')}
        ${row('Cooperation', response.rating_cooperation ?? '—')}
        ${row('Safety habits', response.rating_safety_habits ?? '—')}
        ${row('Personal habits', response.rating_personal_habits ?? '—')}
        ${row('Driving skills', response.rating_driving_skills ?? '—')}
        ${row('Attitude', response.rating_attitude ?? '—')}
      </table>
    </section>
    <section>
      <h2>Responder</h2>
      <table>
        ${row('Name', response.responder_name)}
        ${row('Title', response.responder_title ?? '—')}
        ${row('Company', response.responder_company ?? '—')}
        ${row('Email', response.responder_email ?? '—')}
        ${row('Phone', response.responder_phone ?? '—')}
        ${row('Signed at', response.signed_at ? new Date(response.signed_at).toLocaleString() : response.date_signed ? new Date(response.date_signed).toLocaleString() : '—')}
        ${row('Signed from IP', response.signed_ip ?? '—')}
        ${row('Browser', response.signed_user_agent ?? '—')}
      </table>
    </section>` : '';

  const noResponseBlock = !isGFE && !response
    ? `<section><p class="note">No response recorded yet.</p></section>`
    : '';

  type Row = { ts: string; label: string; detail?: string };
  const auditRows: Row[] = [];
  if (request.date_sent) auditRows.push({ ts: request.date_sent, label: 'Initial email sent' });
  if (request.date_follow_up_sent) auditRows.push({ ts: request.date_follow_up_sent, label: 'Follow-up email sent' });
  if (request.date_final_notice_sent) auditRows.push({ ts: request.date_final_notice_sent, label: 'Final notice email sent' });
  for (const e of events) {
    const detail = [e.ip_address, e.user_agent].filter(Boolean).join(' · ');
    auditRows.push({ ts: e.occurred_at, label: EVENT_LABEL[e.event_type], detail });
  }
  auditRows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const auditBlock = `
    <section>
      <h2>Audit Trail</h2>
      ${auditRows.length === 0
        ? `<p class="note">No activity recorded yet.</p>`
        : `<table class="audit">
            ${auditRows.map(r => `<tr>
              <td class="ts">${esc(new Date(r.ts).toLocaleString())}</td>
              <td><strong>${esc(r.label)}</strong>${r.detail ? ` — <span class="muted">${esc(r.detail)}</span>` : ''}</td>
            </tr>`).join('')}
          </table>`}
      <p class="note">IP and browser are recorded server-side from request headers when the previous employer interacts with the tokenized links. This trail is retained for FMCSA audit defensibility per 49 CFR §391.53.</p>
    </section>`;

  return `${headerBlock}${gfeBlock}${responseBlock}${noResponseBlock}${auditBlock}`;
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #0D0D0D; margin: 32px; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #C9A84C; }
  header { border-bottom: 2px solid #0D0D0D; padding-bottom: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 4px; }
  th, td { text-align: left; vertical-align: top; padding: 4px 8px; }
  th { width: 180px; font-weight: 600; color: #555; }
  tr + tr th, tr + tr td { border-top: 1px solid #eee; }
  ul { margin: 6px 0; padding-left: 18px; }
  li { margin-bottom: 4px; border-left: 2px solid #C9A84C; padding-left: 6px; list-style: none; }
  .note { font-size: 11px; color: #555; margin-top: 8px; }
  .audit .ts { width: 200px; font-variant-numeric: tabular-nums; color: #555; }
  .muted { color: #555; }
  .cover { text-align: center; padding: 40px 20px; border-bottom: 2px solid #0D0D0D; margin-bottom: 24px; }
  .cover h1 { font-size: 22px; margin-bottom: 8px; }
  .cover .sub { color: #555; font-size: 13px; }
  .record-wrap + .record-wrap { page-break-before: always; }
  @media print {
    body { margin: 16mm; }
    section { page-break-inside: avoid; }
  }
`;

export function buildPrintHtml(args: {
  request: PEIRequest;
  response: PEIResponse | null;
  accidents: PEIAccident[];
  events: PEIRequestEvent[];
  applicantName: string;
}): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PEI Record — ${esc(args.request.employer_name)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>${buildRecordFragment(args)}</body>
</html>`;
}

export interface CombinedRecordInput {
  request: PEIRequest;
  response: PEIResponse | null;
  accidents: PEIAccident[];
  events: PEIRequestEvent[];
}

export function buildCombinedPrintHtml(args: {
  applicantName: string;
  records: CombinedRecordInput[];
}): string {
  const { applicantName, records } = args;
  const generated = new Date().toLocaleString();
  const cover = `
    <div class="cover">
      <h1>Previous Employment Investigations</h1>
      <div class="sub"><strong>${esc(applicantName || '—')}</strong></div>
      <div class="sub">${records.length} employer record${records.length === 1 ? '' : 's'} · Generated ${esc(generated)}</div>
      <div class="sub" style="margin-top:12px;">49 CFR §391.23 — investigate each DOT-regulated employer in the preceding 3 years.</div>
    </div>`;

  const body = records
    .map((r) => `<div class="record-wrap">${buildRecordFragment({ ...r, applicantName })}</div>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PEI History — ${esc(applicantName || 'Applicant')}</title>
<style>${PRINT_CSS}</style>
</head>
<body>${cover}${body}</body>
</html>`;
}

/**
 * Opens the print HTML in a popup, waits for load, then triggers print.
 * Throws if popup is blocked so callers can toast.
 */
export function openPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('popup blocked');
  win.document.open();
  win.document.write(html);
  win.document.close();
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error('Print window print() failed:', e);
    }
  };
  win.onafterprint = () => win.close();
  if (win.document.readyState === 'complete') {
    setTimeout(trigger, 50);
  } else {
    win.addEventListener('load', () => setTimeout(trigger, 50));
  }
}