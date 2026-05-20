import type { EquipmentItem, DeviceType } from '@/components/equipment/EquipmentInventory';

export type ExportScope = 'eld' | 'dash_cam' | 'eld_dash_cam' | 'fuel_card' | 'drivers_equipment';

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
  drivers_equipment: 'Drivers + Equipment',
};

const SCOPE_SLUG: Record<ExportScope, string> = {
  eld: 'elds',
  dash_cam: 'dash-cams',
  eld_dash_cam: 'elds-and-dash-cams',
  fuel_card: 'fuel-cards',
  drivers_equipment: 'drivers-and-equipment',
};

const TYPE_ORDER: Record<string, number> = { eld: 0, dash_cam: 1, bestpass: 2, fuel_card: 3 };

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
      if (a.device_type !== b.device_type) return (TYPE_ORDER[a.device_type] ?? 99) - (TYPE_ORDER[b.device_type] ?? 99);
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

// ============================================================
// Drivers + Equipment report
// ============================================================

export interface DriverEquipmentRow {
  driver: string;
  eld_serial: string;
  eld_status: string;
  cam_serial: string;
  cam_status: string;
  assignment_state: string;
}

export interface DriverEquipmentReport {
  driverRows: DriverEquipmentRow[];
  unassigned: ExportRow[];
}

export interface OperatorLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export function buildDriverEquipmentRows(
  items: EquipmentItem[],
  operators: OperatorLite[],
): DriverEquipmentReport {
  // Index assigned items by operator id, by type
  const byOpEld = new Map<string, EquipmentItem>();
  const byOpCam = new Map<string, EquipmentItem>();
  for (const i of items) {
    if (!i.current_assignment_id) continue;
    // current_operator_name is set; we need operator_id linkage via assignments
    // Items carry current_operator_id-like info via assignment map only — caller
    // passes items already enriched with current_operator_id.
    const opId = (i as any).current_operator_id as string | null | undefined;
    if (!opId) continue;
    if (i.device_type === 'eld' && !byOpEld.has(opId)) byOpEld.set(opId, i);
    if (i.device_type === 'dash_cam' && !byOpCam.has(opId)) byOpCam.set(opId, i);
  }

  const driverRows: DriverEquipmentRow[] = operators
    .map((o) => {
      const first = (o.first_name ?? '').trim();
      const last = (o.last_name ?? '').trim();
      const name = [last, first].filter(Boolean).join(', ') || 'Unknown Driver';
      const eld = byOpEld.get(o.id);
      const cam = byOpCam.get(o.id);
      return {
        driver: name,
        eld_serial: eld?.serial_number ?? '',
        eld_status: eld ? (STATUS_LABEL[eld.status] ?? eld.status) : '',
        cam_serial: cam?.serial_number ?? '',
        cam_status: cam ? (STATUS_LABEL[cam.status] ?? cam.status) : '',
        assignment_state: !eld && !cam
          ? 'Unassigned'
          : (!eld ? 'No ELD' : (!cam ? 'No Dash Cam' : 'Assigned')),
      };
    })
    .sort((a, b) => a.driver.localeCompare(b.driver));

  const unassigned: ExportRow[] = items
    .filter((i) => (i.device_type === 'eld' || i.device_type === 'dash_cam') && !i.current_assignment_id)
    .sort((a, b) => {
      if (a.device_type !== b.device_type) return (TYPE_ORDER[a.device_type] ?? 99) - (TYPE_ORDER[b.device_type] ?? 99);
      return a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true });
    })
    .map((i) => ({
      device_type: TYPE_LABEL[i.device_type] ?? i.device_type,
      serial_number: i.serial_number,
      status: STATUS_LABEL[i.status] ?? i.status,
      operator: 'Unassigned',
      notes: i.notes ?? '',
      created: fmtDate(i.created_at),
      updated: fmtDate(i.updated_at),
    }));

  return { driverRows, unassigned };
}

const DRIVER_HEADERS: Array<[keyof DriverEquipmentRow, string]> = [
  ['driver', 'Driver'],
  ['assignment_state', 'Assignment'],
  ['eld_serial', 'ELD Serial'],
  ['eld_status', 'ELD Status'],
  ['cam_serial', 'Dash Cam Serial'],
  ['cam_status', 'Dash Cam Status'],
];

const UNASSIGNED_HEADERS: Array<[keyof ExportRow, string]> = [
  ['device_type', 'Device Type'],
  ['serial_number', 'Serial Number'],
  ['status', 'Status'],
  ['operator', 'Assignment'],
  ['notes', 'Notes'],
  ['created', 'Created'],
  ['updated', 'Last Updated'],
];

export function downloadDriverEquipmentCsv(report: DriverEquipmentReport) {
  const lines: string[] = [];
  lines.push('Drivers + Equipment');
  lines.push(DRIVER_HEADERS.map(([, l]) => csvCell(l)).join(','));
  for (const r of report.driverRows) {
    lines.push(DRIVER_HEADERS.map(([k]) => csvCell(r[k] ?? '')).join(','));
  }
  lines.push('');
  lines.push('Unassigned ELDs & Dash Cams');
  lines.push(UNASSIGNED_HEADERS.map(([, l]) => csvCell(l)).join(','));
  for (const r of report.unassigned) {
    lines.push(UNASSIGNED_HEADERS.map(([k]) => csvCell(r[k] ?? '')).join(','));
  }
  const csv = lines.join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename('drivers_equipment', 'csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openDriverEquipmentPdf(report: DriverEquipmentReport) {
  const title = 'Equipment by Driver';
  const generated = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  const driverCount = report.driverRows.length;
  const eldAssigned = report.driverRows.filter((r) => r.eld_serial).length;
  const camAssigned = report.driverRows.filter((r) => r.cam_serial).length;

  const driverTable = `
    <table>
      <thead>
        <tr>
          <th style="width:24%">Driver</th>
          <th style="width:12%">Assignment</th>
          <th style="width:16%">ELD Serial</th>
          <th style="width:16%">ELD Status</th>
          <th style="width:16%">Dash Cam Serial</th>
          <th style="width:16%">Dash Cam Status</th>
        </tr>
      </thead>
      <tbody>
        ${report.driverRows.map((r) => `
          <tr>
            <td>${esc(r.driver)}</td>
            <td>${r.assignment_state === 'Assigned'
              ? '<span class="pill pill-ok">Assigned</span>'
              : `<span class="pill pill-warn">${esc(r.assignment_state)}</span>`}</td>
            <td class="mono">${esc(r.eld_serial) || '<span class="muted">—</span>'}</td>
            <td>${esc(r.eld_status) || '<span class="muted">—</span>'}</td>
            <td class="mono">${esc(r.cam_serial) || '<span class="muted">—</span>'}</td>
            <td>${esc(r.cam_status) || '<span class="muted">—</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const unassignedSection = report.unassigned.length === 0 ? `
    <h2>Unassigned ELDs &amp; Dash Cams <span class="count">(0)</span></h2>
    <p class="empty">All ELDs and Dash Cams are currently assigned.</p>
  ` : `
    <h2>Unassigned ELDs &amp; Dash Cams <span class="count">(${report.unassigned.length})</span></h2>
    <table>
      <thead>
        <tr>
          <th style="width:12%">Device Type</th>
          <th style="width:18%">Serial Number</th>
          <th style="width:14%">Status</th>
          <th style="width:12%">Assignment</th>
          <th>Notes</th>
          <th style="width:10%">Created</th>
          <th style="width:10%">Updated</th>
        </tr>
      </thead>
      <tbody>
        ${report.unassigned.map((r) => `
          <tr>
            <td>${esc(r.device_type)}</td>
            <td class="mono">${esc(r.serial_number)}</td>
            <td>${esc(r.status)}</td>
            <td><span class="pill pill-warn">Unassigned</span></td>
            <td>${esc(r.notes)}</td>
            <td>${esc(r.created)}</td>
            <td>${esc(r.updated)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

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
  h2 { font-size: 13px; margin: 22px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h2 .count { color:#888; font-weight: 500; font-size: 11px; margin-left: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background:#F6F4EE; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color:#555; }
  tr:nth-child(even) td { background: #fafafa; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; }
  .muted { color:#bbb; }
  .empty { color:#666; font-style: italic; margin-top: 8px; }
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
  <div class="meta">Generated ${esc(generated)} · ${driverCount} active driver${driverCount === 1 ? '' : 's'} · ${eldAssigned} ELD${eldAssigned === 1 ? '' : 's'} assigned · ${camAssigned} Dash Cam${camAssigned === 1 ? '' : 's'} assigned</div>
  ${driverTable}
  ${unassignedSection}
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
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.location.href = url;
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