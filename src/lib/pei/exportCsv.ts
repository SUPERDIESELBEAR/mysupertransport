import type { PEIQueueRow } from './types';
import { STATUS_LABEL, GFE_REASON_LABEL, SEND_METHOD_LABEL } from './types';

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function fmt(d: string | null): string {
  if (!d) return '';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d);
  return isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-US');
}

const HEADERS = [
  'Applicant',
  'Previous Employer',
  'City',
  'State',
  'Status',
  'Send Method',
  'Date Sent',
  'Deadline',
  'Days Remaining',
  'Overdue',
  'Response Received',
  'GFE Created',
  'GFE Reason',
  'Archived',
  'Archive Reason',
];

/** Builds a CSV string for the rows currently visible in the queue. */
export function buildPEICsv(rows: PEIQueueRow[]): string {
  const lines = [HEADERS.map(cell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        [r.applicant_first_name, r.applicant_last_name].filter(Boolean).join(' '),
        r.employer_name,
        r.employer_city ?? '',
        r.employer_state ?? '',
        STATUS_LABEL[r.status],
        r.send_method ? SEND_METHOD_LABEL[r.send_method] : '',
        fmt(r.date_sent),
        fmt(r.deadline_date),
        r.days_remaining ?? '',
        r.is_overdue ? 'Yes' : 'No',
        fmt(r.date_response_received),
        fmt(r.date_gfe_created),
        r.gfe_reason ? GFE_REASON_LABEL[r.gfe_reason] : '',
        r.pei_archived_at ? 'Yes' : 'No',
        r.pei_archive_reason ?? '',
      ]
        .map(cell)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

export function downloadPEICsv(rows: PEIQueueRow[]): void {
  const blob = new Blob([buildPEICsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pei-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}