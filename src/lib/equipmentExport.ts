import type { EquipmentItem, DeviceType } from '@/components/equipment/EquipmentInventory';

export type ExportScope = 'eld' | 'dash_cam' | 'eld_dash_cam' | 'fuel_card';

const TYPE_LABEL: Record<DeviceType, string> = {
  eld: 'ELD',
  dash_cam: 'Dash Cam',
  bestpass: 'BestPass',
  fuel_card: 'Fuel Card',
};

const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  assigned: 'Assigned',
  damaged: 'Damaged / Needs Repair',
  lost: 'Lost / Missing',
};

export const SCOPE_LABEL: Record<ExportScope, string> = {
  eld: 'ELDs',
  dash_cam: 'Dash Cams',
  eld_dash_cam: 'ELDs + Dash Cams',
  fuel_card: 'Fuel Cards',
};

const SCOPE_SLUG: Record<ExportScope, string> = {
  eld: 'elds',
  dash_cam: 'dash-cams',
  eld_dash_cam: 'elds-and-dash-cams',
  fuel_card: 'fuel-cards',
};

function scopeTypes(scope: ExportScope): DeviceType[] {
  if (scope === 'eld') return ['eld'];
  if (scope === 'dash_cam') return ['dash_cam'];
  if (scope === 'fuel_card') return ['fuel_card'];
  return ['eld', 'dash_cam'];
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '';
  }
}

export interface ExportRow {
  device_type: string;
  serial_number: string;
  status: string;
  operator: string;
  notes: string;
  created: string;
  updated: string;
}

export function buildExportRows(items: EquipmentItem[], scope: ExportScope): ExportRow[] {
  const types = new Set(scopeTypes(scope));
  return items
    .filter((i) => types.has(i.device_type))
    .sort((a, b) => {
      if (a.device_type !== b.device_type) return a.device_type.localeCompare(b.device_type);
      return a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true });
    })
    .map((i) => ({
      device_type: TYPE_LABEL[i.device_type] ?? i.device_type,
      serial_number: i.serial_number,
      status: STATUS_LABEL[i.status] ?? i.status,
      operator: i.current_operator_name ?? '',
      notes: i.notes ?? '',
      created: fmtDate(i.created_at),
      updated: fmtDate(i.updated_at),
    }));
}

const HEADERS: Array<[keyof ExportRow, string]> = [
  ['device_type', 'Device Type'],
  ['serial_number', 'Serial Number'],
  ['status', 'Status'],
  ['operator', 'Assigned Operator'],
  ['notes', 'Notes'],
  ['created', 'Created'],
  ['updated', 'Last Updated'],
];

function csvCell(v: string): string {
  if (v == null) return '';
  const needsQuote = /[",\n\r]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [HEADERS.map(([, label]) => csvCell(label)).join(',')];
  for (const r of rows) {
    lines.push(HEADERS.map(([key]) => csvCell(r[key] ?? '')).join(','));
  }
  return lines.join('\r\n');
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function exportFilename(scope: ExportScope, ext: 'csv' | 'pdf'): string {
  return `equipment-${SCOPE_SLUG[scope]}-${todayStamp()}.${ext}`;
}

export function downloadCsv(scope: ExportScope, rows: ExportRow[]) {
  const csv = toCsv(rows);
  // BOM so Excel detects UTF-8
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(scope, 'csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

export function openEquipmentPdf(scope: ExportScope, rows: ExportRow[]) {
  const title = `Equipment List — ${SCOPE_LABEL[scope]}`;
  const generated = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  const byType = new Map<string, ExportRow[]>();
  for (const r of rows) {
    const arr = byType.get(r.device_type) ?? [];
    arr.push(r);
    byType.set(r.device_type, arr);
  }

  const sections = Array.from(byType.entries()).map(([type, list]) => `
    <h2>${esc(type)} <span class="count">(${list.length})</span></h2>
    <table>
      <thead>
        <tr>
          <th style="width:22%">Serial Number</th>
          <th style="width:18%">Status</th>
          <th style="width:22%">Assigned Operator</th>
          <th>Notes</th>
          <th style="width:11%">Created</th>
          <th style="width:11%">Updated</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((r) => `
          <tr>
            <td class="mono">${esc(r.serial_number)}</td>
            <td>${esc(r.status)}</td>
            <td>${esc(r.operator)}</td>
            <td>${esc(r.notes)}</td>
            <td>${esc(r.created)}</td>
            <td>${esc(r.updated)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `).join('');

  const empty = rows.length === 0
    ? `<p class="empty">No devices found for this selection.</p>` : '';

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: letter landscape; margin: 0.4in; }
  html, body { margin:0; padding:0; background:#fff; color:#0D0D0D;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif; }
  body { padding: 16px 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand { font-size: 11px; letter-spacing: 0.18em; color:#C9A84C; font-weight: 700; }
  h1 { font-size: 20px; margin: 4px 0 2px; }
  .meta { font-size: 11px; color: #555; margin-bottom: 14px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h2 .count { color:#888; font-weight: 500; font-size: 11px; margin-left: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background:#F6F4EE; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color:#555; }
  tr:nth-child(even) td { background: #fafafa; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; }
  .empty { color:#666; font-style: italic; margin-top: 24px; }
  .actions { position: fixed; top:0; left:0; right:0; padding:8px; background:#0F0F0F; color:#fff;
    display:flex; gap:8px; justify-content:center; font-size:13px; z-index:9999; }
  .actions button { appearance:none; border:0; cursor:pointer; background:#C9A84C; color:#0F0F0F;
    font-weight:700; padding:6px 14px; border-radius:6px; font-size:13px; }
  .actions button.secondary { background:transparent; color:#fff; border:1px solid #555; }
  .spacer { height: 44px; }
  @media print { .actions, .spacer { display:none !important; } body { padding: 0; } }
</style>
</head><body>
  <div class="actions">
    <button onclick="window.print()">Save as PDF / Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="spacer"></div>
  <div class="brand">SUPERTRANSPORT</div>
  <h1>${esc(title)}</h1>
  <div class="meta">Generated ${esc(generated)} · ${rows.length} device${rows.length === 1 ? '' : 's'}</div>
  ${empty}
  ${sections}
  <script>
    window.addEventListener('load', function(){
      setTimeout(function(){ try { window.print(); } catch(_){} }, 300);
    });
  </script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }
  // Fallback: blob URL in current tab
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.location.href = url;
}