import { useEffect, useMemo, useState } from 'react';
import { roadsideDb, readLocalMeta, readManifest, type LocalMeta, type RoadsideManifest } from '@/lib/eld/offline/db';
import { formatRoadsideDate } from '@/lib/eld/offline/roadsideManifest';
import RoadsideDayView from './RoadsideDayView';

const GOLD = '#C9A84C';
const INK = '#0D0D0D';
const CHARCOAL = '#1A1A1A';

/**
 * Officer-facing packet. Renders entirely from IndexedDB: no network call, no
 * session, no auth refresh, no sync warning. If it cannot render, it says so
 * plainly rather than showing a blank screen.
 */
export default function RoadsidePacket() {
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [meta, setMeta] = useState<LocalMeta | null>(null);
  const [manifest, setManifest] = useState<RoadsideManifest | null>(null);
  const [index, setIndex] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    void (async () => {
      const [m, mf] = await Promise.all([readLocalMeta(), readManifest()]);
      setMeta(m ?? null);
      setManifest(mf ?? null);
      setState(mf && mf.days.length ? 'ready' : 'empty');
    })();
  }, []);

  useEffect(() => {
    // Unsupported on iOS Safari, where it rejects — the layout below stays
    // usable in landscape regardless, and manifest `orientation` only binds
    // the installed PWA anyway.
    const anyOrientation = screen.orientation as (ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    }) | undefined;
    try {
      void anyOrientation?.lock?.('portrait')?.catch(() => undefined);
    } catch {
      /* not supported */
    }
    let sentinel: { release: () => Promise<void> } | null = null;
    void (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } })
      .wakeLock?.request('screen').then((s) => { sentinel = s; }).catch(() => undefined);
    return () => { void sentinel?.release?.().catch(() => undefined); };
  }, []);

  const days = manifest?.days ?? [];
  const active = days[index];

  const order = useMemo(
    () => days.map((d) => `${formatRoadsideDate(d.log_date)} — ${d.label}`).join(' · '),
    [days],
  );

  async function printPacket() {
    if (!active) return;
    const url = await urlForDay(active.log_date, active.kind);
    if (!url) return;
    const w = window.open(url, '_blank', 'noopener');
    if (w) setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 800);
  }

  if (state === 'loading') {
    return <Shell><p className="p-6 text-sm" style={{ color: '#6B6B6B' }}>Opening records…</p></Shell>;
  }

  if (state === 'empty' || !manifest) {
    return (
      <Shell>
        <div className="p-6">
          <h1 className="text-lg font-bold" style={{ color: INK }}>No records stored on this device</h1>
          <p className="mt-2 text-sm" style={{ color: '#6B6B6B' }}>
            This device has not saved a roadside packet yet. Sign in to SUPERDRIVE while connected to
            download the last eight days of records, then reopen this screen.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Header — wraps rather than scrolls horizontally in landscape */}
      <header className="shrink-0" style={{ background: CHARCOAL }}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3 short:py-1.5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] short:hidden" style={{ color: GOLD }}>
              Record of duty status
            </p>
            <p className="truncate text-base font-bold text-white">{meta?.driver_name ?? 'Driver'}</p>
            <p className="text-xs" style={{ color: '#B8B8B8' }}>
              {meta?.carrier_name ?? ''}
              {meta?.carrier_usdot ? ` · USDOT ${meta.carrier_usdot}` : ''}
              {meta?.carrier_mc ? ` · MC ${meta.carrier_mc}` : ''}
            </p>
          </div>
          <div className="text-right text-xs" style={{ color: '#B8B8B8' }}>
            <p>Truck {meta?.truck_number ?? '—'}</p>
            <p>{manifest.window_start} → {manifest.window_end}</p>
          </div>
        </div>
        <div style={{ height: 2, background: GOLD }} />
      </header>

      {/* Cover facts. On a short viewport (landscape phone) the citation and the
          order list collapse behind a summary so the log itself keeps the space. */}
      <details
        open={!isShort}
        className="group shrink-0 border-b px-4 py-2 short:py-1"
        style={{ borderColor: '#DCDCDC', background: '#FFFDF6' }}
      >
        <summary className="cursor-pointer list-none text-xs font-bold marker:hidden" style={{ color: INK }}>
          {manifest.event
            ? `ELD malfunction reported ${new Date(manifest.event.discovered_at).toLocaleDateString()}`
            : 'Paper records of duty status'}
          <span className="ml-2 font-normal underline" style={{ color: '#6B6B6B' }}>
            <span className="group-open:hidden">Show details</span>
            <span className="hidden group-open:inline">Hide details</span>
          </span>
        </summary>
        <p className="mt-1 text-xs" style={{ color: INK }}>
          {manifest.event ? (
            <>
              {manifest.event.device_label ? `${manifest.event.device_label} · ` : ''}
              code {manifest.event.malfunction_code}. Paper records kept under 49 CFR 395.8 while the ELD is
              malfunctioning (49 CFR 395.34); 79 FR 39342.
            </>
          ) : (
            <>Records kept under 49 CFR 395.8. 79 FR 39342.</>
          )}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: '#6B6B6B' }}>Order: {order}</p>
      </details>

      {/* Day strip — the only horizontally scrolling element, by design */}
      <nav className="shrink-0 overflow-x-auto border-b px-2 py-2" style={{ borderColor: '#DCDCDC' }}>
        <ul className="flex gap-2">
          {days.map((d, i) => (
            <li key={d.log_date}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className="rounded border px-3 py-1.5 text-left"
                style={{
                  borderColor: i === index ? GOLD : '#DCDCDC',
                  background: i === index ? '#FFF8E4' : '#FFFFFF',
                  minWidth: 104,
                }}
              >
                <span className="block text-xs font-bold" style={{ color: INK }}>
                  {formatRoadsideDate(d.log_date)}
                </span>
                <span className="block text-[10px]" style={{ color: d.cached ? '#2E7D4F' : '#C0392B' }}>
                  {d.cached ? d.label : 'Not certified'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active ? <RoadsideDayView day={active} /> : null}
      </div>

      {/* Actions — wrap in landscape, never require horizontal scrolling */}
      <footer className="shrink-0 border-t px-3 py-2" style={{ borderColor: '#DCDCDC', background: '#FFFFFF' }}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={printPacket}
            className="flex-1 rounded px-4 py-2 text-sm font-bold"
            style={{ background: GOLD, color: INK, minWidth: 120 }}
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => alert('Emailing this packet to an officer is not available yet on this device.')}
            className="flex-1 rounded border px-4 py-2 text-sm font-bold"
            style={{ borderColor: '#DCDCDC', color: INK, minWidth: 120 }}
          >
            Email to officer
          </button>
          <button
            type="button"
            onClick={() => setExiting(true)}
            className="flex-1 rounded border px-4 py-2 text-sm font-bold"
            style={{ borderColor: '#DCDCDC', color: INK, minWidth: 120 }}
          >
            Exit
          </button>
        </div>
      </footer>

      {exiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-sm rounded bg-white p-5">
            <p className="text-sm font-bold" style={{ color: INK }}>Exit roadside mode?</p>
            <p className="mt-1 text-xs" style={{ color: '#6B6B6B' }}>
              This closes the officer view and returns to SUPERDRIVE.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setExiting(false)}
                className="flex-1 rounded border px-3 py-2 text-sm font-bold"
                style={{ borderColor: '#DCDCDC', color: INK }}
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/dashboard'; }}
                className="flex-1 rounded px-3 py-2 text-sm font-bold"
                style={{ background: GOLD, color: INK }}
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-x-hidden" style={{ background: '#FFFFFF' }}>
      {children}
    </div>
  );
}

async function urlForDay(logDate: string, kind: 'keyed' | 'eld_document'): Promise<string | null> {
  if (kind === 'keyed') {
    const entry = await roadsideDb.rods_pdfs.get(logDate);
    if (!entry) return null;
    return URL.createObjectURL(new Blob([entry.bytes], { type: 'application/pdf' }));
  }
  const doc = await roadsideDb.rods_documents.get(logDate);
  if (!doc) return null;
  const bytes = doc.display_bytes ?? doc.bytes;
  const mime = doc.display_mime ?? doc.mime;
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}