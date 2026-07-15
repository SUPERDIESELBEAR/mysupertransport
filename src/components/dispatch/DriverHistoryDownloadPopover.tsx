import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download, Loader2, Printer, Camera, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toPng } from 'html-to-image';

type DailyStatus = 'dispatched' | 'home' | 'truck_down' | 'not_dispatched';

interface Props {
  operatorId: string;
  firstName: string | null;
  lastName: string | null;
  unitNumber: string | null;
}

const STATUS_META: Record<DailyStatus, { label: string; bg: string; text: string; short: string }> = {
  dispatched:     { label: 'Dispatched',     bg: '#DCFCE7', text: '#166534', short: 'D' },
  home:           { label: 'Home',           bg: '#FEF3C7', text: '#92400E', short: 'H' },
  truck_down:     { label: 'Truck Down',     bg: '#FEE2E2', text: '#991B1B', short: 'T' },
  not_dispatched: { label: 'Not Dispatched', bg: '#E5E7EB', text: '#374151', short: 'N' },
};

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO() { return isoDate(new Date()); }
function daysAgoISO(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); }

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) { out.push(isoDate(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}
function formatShortDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatLongDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function safeSlug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'driver';
}

export default function DriverHistoryDownloadPopover({ operatorId, firstName, lastName, unitNumber }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgoISO(30));
  const [toDate, setToDate] = useState(todayISO());
  const [busyPng, setBusyPng] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);

  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Driver';
  const fileBase = `dispatch-history-${safeSlug(`${lastName ?? ''}-${firstName ?? ''}`)}-${fromDate}_to_${toDate}`;

  async function loadLog(): Promise<Record<string, DailyStatus> | null> {
    if (!fromDate || !toDate) return null;
    if (fromDate > toDate) {
      toast({ title: 'Invalid range', description: 'Start date must be on or before end date.', variant: 'destructive' });
      return null;
    }
    const { data, error } = await supabase
      .from('dispatch_daily_log')
      .select('log_date, status')
      .eq('operator_id', operatorId)
      .gte('log_date', fromDate)
      .lte('log_date', toDate);
    if (error) throw error;
    const map: Record<string, DailyStatus> = {};
    for (const r of (data ?? []) as any[]) map[r.log_date] = r.status as DailyStatus;
    return map;
  }

  function buildCardHtml(perDriver: Record<string, DailyStatus>, dates: string[]): string {
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
    const unit = unitNumber ? `Unit ${escapeHtml(unitNumber)}` : '';
    return `<section style="border:1px solid #d4d4d8;border-radius:8px;padding:12px;background:#fff">
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
  }

  function buildDocHtml(perDriver: Record<string, DailyStatus>, dates: string[]): string {
    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const legend = (Object.keys(STATUS_META) as DailyStatus[]).map(s => `
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#444">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-weight:700;font-size:11px;background:${STATUS_META[s].bg};color:${STATUS_META[s].text}">${STATUS_META[s].short}</span>
        ${STATUS_META[s].label}
      </span>`).join('');
    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0F0F0F;background:#fff;padding:24px;">
      <div style="border-bottom:2px solid #0F0F0F;padding-bottom:12px;margin-bottom:16px">
        <h1 style="margin:0 0 4px;font-size:20px">Dispatch History — ${escapeHtml(fullName)}</h1>
        <div style="font-size:12px;color:#555">${escapeHtml(formatLongDate(fromDate))} — ${escapeHtml(formatLongDate(toDate))} · ${dates.length} day${dates.length !== 1 ? 's' : ''} · Generated ${escapeHtml(generatedAt)}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 16px">${legend}
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#444"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-weight:700;font-size:11px;background:#f4f4f5;color:#a1a1aa">—</span> No entry</span>
      </div>
      ${buildCardHtml(perDriver, dates)}
    </div>`;
  }

  async function handlePng() {
    setBusyPng(true);
    try {
      const map = await loadLog();
      if (!map) return;
      const dates = enumerateDates(fromDate, toDate);
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;background:#fff;';
      container.innerHTML = buildDocHtml(map, dates);
      document.body.appendChild(container);
      try {
        const dataUrl = await toPng(container, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${fileBase}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        container.remove();
      }
      toast({ title: 'Screenshot saved', description: 'PNG downloaded to your device.' });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Screenshot failed', description: e?.message ?? 'Unable to capture image.', variant: 'destructive' });
    } finally {
      setBusyPng(false);
    }
  }

  async function handlePdf() {
    setBusyPdf(true);
    try {
      const map = await loadLog();
      if (!map) return;
      const dates = enumerateDates(fromDate, toDate);
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileBase)}</title>
        <style>@page { size: letter portrait; margin: 0.4in; } body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style>
        </head><body>${buildDocHtml(map, dates)}</body></html>`;
      // Use a hidden iframe so we don't rely on window.open (pop-up blockers, PWA).
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      if (!doc) throw new Error('Unable to create print frame.');
      doc.open();
      doc.write(html);
      doc.close();
      // Give the frame a tick to render before printing.
      await new Promise(res => setTimeout(res, 250));
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        // Remove after the print dialog is dismissed. Delay so browsers don't cancel print.
        setTimeout(() => iframe.remove(), 1000);
      }
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'PDF failed', description: e?.message ?? 'Unable to prepare PDF.', variant: 'destructive' });
    } finally {
      setBusyPdf(false);
    }
  }

  const busy = busyPng || busyPdf;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-gold hover:bg-gold/10"
          title="Download dispatch history"
        >
          <History className="h-3 w-3" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 pointer-events-auto">
        <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5 text-gold" />
          Dispatch history for {fullName}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">From</Label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={e => setFromDate(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">To</Label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              max={todayISO()}
              onChange={e => setToDate(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePng}
            disabled={busy}
            className="flex-1 h-8 text-xs gap-1.5"
          >
            {busyPng ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            PNG
          </Button>
          <Button
            size="sm"
            onClick={handlePdf}
            disabled={busy}
            className="flex-1 h-8 text-xs gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
          >
            {busyPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            PDF
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
          PDF opens the browser's print dialog — choose "Save as PDF".
        </p>
      </PopoverContent>
    </Popover>
  );
}