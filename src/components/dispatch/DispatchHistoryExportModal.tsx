import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Printer, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toPng } from 'html-to-image';

type DailyStatus = 'dispatched' | 'home' | 'truck_down' | 'not_dispatched';

export interface DispatchDriverLite {
  operator_id: string;
  first_name: string | null;
  last_name: string | null;
  unit_number: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  drivers: DispatchDriverLite[];
}

const STATUS_META: Record<DailyStatus, { label: string; bg: string; text: string; short: string }> = {
  dispatched:     { label: 'Dispatched',     bg: '#DCFCE7', text: '#166534', short: 'D' },
  home:           { label: 'Home',           bg: '#FEF3C7', text: '#92400E', short: 'H' },
  truck_down:     { label: 'Truck Down',     bg: '#FEE2E2', text: '#991B1B', short: 'T' },
  not_dispatched: { label: 'Not Dispatched', bg: '#E5E7EB', text: '#374151', short: 'N' },
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function formatShortDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLongDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DispatchHistoryExportModal({ open, onClose, drivers }: Props) {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState(daysAgoISO(30));
  const [toDate, setToDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const rangeSize = useMemo(() => {
    if (!fromDate || !toDate || fromDate > toDate) return 0;
    return enumerateDates(fromDate, toDate).length;
  }, [fromDate, toDate]);

  async function loadData() {
    if (!fromDate || !toDate) return;
    if (fromDate > toDate) {
      toast({ title: 'Invalid range', description: 'Start date must be on or before end date.', variant: 'destructive' });
      return null;
    }
    if (drivers.length === 0) {
      toast({ title: 'No drivers', description: 'There are no active drivers to export.', variant: 'destructive' });
      return null;
    }
    const operatorIds = drivers.map(d => d.operator_id);
    const { data, error } = await supabase
      .from('dispatch_daily_log')
      .select('operator_id, log_date, status')
      .in('operator_id', operatorIds)
      .gte('log_date', fromDate)
      .lte('log_date', toDate);
    if (error) throw error;
    const logMap: Record<string, Record<string, DailyStatus>> = {};
    for (const r of (data ?? []) as any[]) {
      (logMap[r.operator_id] ||= {})[r.log_date] = r.status as DailyStatus;
    }
    const dates = enumerateDates(fromDate, toDate);
    const sortedDrivers = [...drivers].sort((a, b) => {
      const an = `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim().toLowerCase();
      const bn = `${b.last_name ?? ''} ${b.first_name ?? ''}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });
    return { sortedDrivers, dates, logMap };
  }

  async function handleExport() {
    setBusy(true);
    try {
      const result = await loadData();
      if (!result) return;
      openPrintableWindow(result.sortedDrivers, result.dates, result.logMap, fromDate, toDate);
      onClose();
    } catch (e: any) {
      toast({ title: 'Export failed', description: e?.message ?? 'Unable to load dispatch history.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleScreenshot() {
    setCapturing(true);
    try {
      const result = await loadData();
      if (!result) return;
      await captureCardsAsImage(result.sortedDrivers, result.dates, result.logMap, fromDate, toDate);
      toast({ title: 'Screenshot saved', description: 'PNG downloaded to your device.' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Screenshot failed', description: e?.message ?? 'Unable to capture image.', variant: 'destructive' });
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download Dispatch History</DialogTitle>
          <DialogDescription>
            Exports a printable snapshot with one card per driver, showing their daily
            dispatch status across the selected date range.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={todayISO()}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {rangeSize > 0
              ? `${rangeSize} day${rangeSize !== 1 ? 's' : ''} × ${drivers.length} driver${drivers.length !== 1 ? 's' : ''}`
              : 'Pick a valid date range.'}
          </div>
          <div className="text-xs text-muted-foreground">
            A new tab will open with a printable view — use your browser's
            "Save as PDF" option from the print dialog.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy || capturing}>Cancel</Button>
          <Button
            variant="outline"
            onClick={handleScreenshot}
            disabled={busy || capturing || rangeSize === 0}
            className="gap-2"
          >
            {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Screenshot (PNG)
          </Button>
          <Button onClick={handleExport} disabled={busy || capturing || rangeSize === 0} className="gap-2 bg-gold text-surface-dark hover:bg-gold-light">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function captureCardsAsImage(
  drivers: DispatchDriverLite[],
  dates: string[],
  logMap: Record<string, Record<string, DailyStatus>>,
  fromDate: string,
  toDate: string,
) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1400px;background:#ffffff;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:#0F0F0F;';
  container.innerHTML = buildCardsMarkup(drivers, dates, logMap, fromDate, toDate);
  document.body.appendChild(container);
  try {
    const dataUrl = await toPng(container, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `dispatch-history-${fromDate}_to_${toDate}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    container.remove();
  }
}

function buildCardsMarkup(
  drivers: DispatchDriverLite[],
  dates: string[],
  logMap: Record<string, Record<string, DailyStatus>>,
  fromDate: string,
  toDate: string,
): string {
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const legend = (Object.keys(STATUS_META) as DailyStatus[]).map(s => `
    <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#444">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-weight:700;font-size:11px;background:${STATUS_META[s].bg};color:${STATUS_META[s].text}">${STATUS_META[s].short}</span>
      ${STATUS_META[s].label}
    </span>`).join('');
  const cards = drivers.map(driver => {
    const fullName = `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || '—';
    const unit = driver.unit_number ? `Unit ${escapeHtml(driver.unit_number)}` : '';
    const perDriver = logMap[driver.operator_id] ?? {};
    const counts = { dispatched: 0, home: 0, truck_down: 0, not_dispatched: 0, unlogged: 0 };
    const cells = dates.map(d => {
      const s = perDriver[d];
      if (!s) {
        counts.unlogged++;
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px;border-radius:4px;background:#fafafa">
          <div style="font-size:9px;color:#52525b;white-space:nowrap">${escapeHtml(formatShortDate(d))}</div>
          <div style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;font-weight:700;font-size:11px;background:#f4f4f5;color:#a1a1aa">—</div>
        </div>`;
      }
      counts[s]++;
      const meta = STATUS_META[s];
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px;border-radius:4px;background:#fafafa">
        <div style="font-size:9px;color:#52525b;white-space:nowrap">${escapeHtml(formatShortDate(d))}</div>
        <div style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;font-weight:700;font-size:11px;background:${meta.bg};color:${meta.text}">${meta.short}</div>
      </div>`;
    }).join('');
    return `<section style="border:1px solid #d4d4d8;border-radius:8px;padding:12px;margin-bottom:12px;background:#fff">
      <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
        <div>
          <h2 style="margin:0;font-size:14px;font-weight:700">${escapeHtml(fullName)}</h2>
          ${unit ? `<p style="margin:2px 0 0;font-size:11px;color:#666">${unit}</p>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;font-weight:600">
          <span style="padding:2px 6px;border-radius:4px;background:#f4f4f5;color:${STATUS_META.dispatched.text}">${counts.dispatched} D</span>
          <span style="padding:2px 6px;border-radius:4px;background:#f4f4f5;color:${STATUS_META.home.text}">${counts.home} H</span>
          <span style="padding:2px 6px;border-radius:4px;background:#f4f4f5;color:${STATUS_META.truck_down.text}">${counts.truck_down} T</span>
          <span style="padding:2px 6px;border-radius:4px;background:#f4f4f5;color:${STATUS_META.not_dispatched.text}">${counts.not_dispatched} N</span>
          ${counts.unlogged > 0 ? `<span style="padding:2px 6px;border-radius:4px;background:#f4f4f5;color:#71717a">${counts.unlogged} —</span>` : ''}
        </div>
      </header>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:4px">${cells}</div>
    </section>`;
  }).join('');
  return `
    <div style="border-bottom:2px solid #0F0F0F;padding-bottom:12px;margin-bottom:16px">
      <h1 style="margin:0 0 4px;font-size:20px">Dispatch History</h1>
      <div style="font-size:12px;color:#555">${escapeHtml(formatLongDate(fromDate))} — ${escapeHtml(formatLongDate(toDate))} · ${drivers.length} driver${drivers.length !== 1 ? 's' : ''} · ${dates.length} day${dates.length !== 1 ? 's' : ''} · Generated ${escapeHtml(generatedAt)}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 16px">${legend}
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#444"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-weight:700;font-size:11px;background:#f4f4f5;color:#a1a1aa">—</span> No entry</span>
    </div>
    ${cards || '<p style="color:#666;font-size:13px">No drivers to display.</p>'}
  `;
}

function openPrintableWindow(
  drivers: DispatchDriverLite[],
  dates: string[],
  logMap: Record<string, Record<string, DailyStatus>>,
  fromDate: string,
  toDate: string,
) {
  const generatedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  const legendHtml = (Object.keys(STATUS_META) as DailyStatus[])
    .map(s => `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${STATUS_META[s].bg};color:${STATUS_META[s].text}">${STATUS_META[s].short}</span>
        ${STATUS_META[s].label}
      </span>
    `).join('');

  const cardsHtml = drivers.map(driver => {
    const fullName = `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || '—';
    const unit = driver.unit_number ? `Unit ${escapeHtml(driver.unit_number)}` : '';
    const perDriver = logMap[driver.operator_id] ?? {};

    const counts = { dispatched: 0, home: 0, truck_down: 0, not_dispatched: 0, unlogged: 0 };
    const dayCells = dates.map(d => {
      const s = perDriver[d];
      if (!s) {
        counts.unlogged++;
        return `<div class="day">
          <div class="day-date">${escapeHtml(formatShortDate(d))}</div>
          <div class="day-badge unlogged">—</div>
        </div>`;
      }
      counts[s]++;
      const meta = STATUS_META[s];
      return `<div class="day">
        <div class="day-date">${escapeHtml(formatShortDate(d))}</div>
        <div class="day-badge" style="background:${meta.bg};color:${meta.text}" title="${meta.label}">${meta.short}</div>
      </div>`;
    }).join('');

    return `
      <section class="driver-card">
        <header class="driver-header">
          <div>
            <h2>${escapeHtml(fullName)}</h2>
            ${unit ? `<p class="unit">${unit}</p>` : ''}
          </div>
          <div class="totals">
            <span class="total" style="color:${STATUS_META.dispatched.text}">${counts.dispatched} D</span>
            <span class="total" style="color:${STATUS_META.home.text}">${counts.home} H</span>
            <span class="total" style="color:${STATUS_META.truck_down.text}">${counts.truck_down} T</span>
            <span class="total" style="color:${STATUS_META.not_dispatched.text}">${counts.not_dispatched} N</span>
            ${counts.unlogged > 0 ? `<span class="total muted">${counts.unlogged} —</span>` : ''}
          </div>
        </header>
        <div class="days">${dayCells}</div>
      </section>
    `;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Dispatch History ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif; color: #0F0F0F; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .actions {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 8px; justify-content: center;
    padding: 10px; background: #0F0F0F; color: #fff;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .actions button {
    appearance: none; border: 0; cursor: pointer;
    background: #C9A84C; color: #0F0F0F; font-weight: 700;
    padding: 8px 16px; border-radius: 6px; font-size: 14px;
  }
  .actions button.secondary { background: transparent; color: #fff; border: 1px solid #555; }
  .page { max-width: 10.5in; margin: 0 auto; padding: 24px; background: #fff; }
  .doc-header { border-bottom: 2px solid #0F0F0F; padding-bottom: 12px; margin-bottom: 16px; }
  .doc-header h1 { margin: 0 0 4px; font-size: 20px; }
  .doc-header .meta { font-size: 12px; color: #555; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 16px; font-size: 11px; color: #444; }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .legend-swatch {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 4px; font-weight: 700; font-size: 11px;
  }
  .driver-card { border: 1px solid #d4d4d8; border-radius: 8px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; background: #fff; }
  .driver-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
  .driver-header h2 { margin: 0; font-size: 14px; font-weight: 700; }
  .driver-header .unit { margin: 2px 0 0; font-size: 11px; color: #666; }
  .totals { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; font-weight: 600; }
  .total { padding: 2px 6px; border-radius: 4px; background: #f4f4f5; }
  .total.muted { color: #71717a; }
  .days { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 4px; }
  .day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 2px; border-radius: 4px; background: #fafafa; }
  .day-date { font-size: 9px; color: #52525b; white-space: nowrap; }
  .day-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 4px; font-weight: 700; font-size: 11px;
  }
  .day-badge.unlogged { background: #f4f4f5; color: #a1a1aa; }
  @media print {
    body { background: #fff; }
    .actions { display: none !important; }
    .page { max-width: none; margin: 0; padding: 12px; }
    @page { size: letter landscape; margin: 0.4in; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Save as PDF / Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="page">
    <div class="doc-header">
      <h1>Dispatch History</h1>
      <div class="meta">
        ${escapeHtml(formatLongDate(fromDate))} &mdash; ${escapeHtml(formatLongDate(toDate))}
        &nbsp;·&nbsp; ${drivers.length} driver${drivers.length !== 1 ? 's' : ''}
        &nbsp;·&nbsp; ${dates.length} day${dates.length !== 1 ? 's' : ''}
        &nbsp;·&nbsp; Generated ${escapeHtml(generatedAt)}
      </div>
    </div>
    <div class="legend">${legendHtml}
      <span class="legend-item"><span class="legend-swatch" style="background:#f4f4f5;color:#a1a1aa">—</span> No entry</span>
    </div>
    ${cardsHtml || '<p style="color:#666;font-size:13px">No drivers to display.</p>'}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }
  // Popup blocked — fallback to blob URL in same tab (rare on desktop).
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.location.href = url;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
