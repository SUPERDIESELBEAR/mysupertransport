import { useEffect, useMemo, useState } from 'react';
import { roadsideDb, readLocalMeta, type ManifestDay } from '@/lib/eld/offline/db';
import { formatRoadsideDateLong } from '@/lib/eld/offline/roadsideManifest';
import { signatureKeyForDay } from '@/lib/eld/offline/prune';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import RoadsideDayRender from './RoadsideDayRender';
import DemoWatermarkOverlay from './DemoWatermarkOverlay';

type Payload =
  | {
      kind: 'native';
      day: RodsDay;
      events: RodsEvent[];
      driverName: string;
      signatureDataUrl: string | null;
    }
  | { kind: 'pdf'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'file'; filename: string; url: string }
  | { kind: 'missing' };

/**
 * One day of the packet.
 *
 * A certified keyed day is drawn natively from the structured cache — no PDF
 * viewer is involved at all. Only an uploaded ELD document, whose bytes exist
 * solely as a file, is embedded; that embed always carries a visible "Open
 * file" action so a blank frame is recoverable without the app detecting it.
 */
export default function RoadsideDayView({ day }: { day: ManifestDay }) {
  const [payload, setPayload] = useState<Payload>({ kind: 'missing' });
  // Demo drivers get the wash on every roadside surface, not just the native
  // render — a photographed paper log shown on a demo device is still a demo
  // artifact in an officer's hand.
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readLocalMeta().then((m) => { if (!cancelled) setIsDemo(m?.is_demo === true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    void (async () => {
      if (!day.cached) { setPayload({ kind: 'missing' }); return; }

      if (day.kind === 'keyed') {
        // Structured render requires both rows AND at least one segment. A
        // header with no segments would draw an empty grid, which reads as
        // "no duty recorded" — the one failure an officer cannot recover from.
        const [dayRow, meta] = await Promise.all([
          roadsideDb.rods_days_cache.get(day.log_date),
          readLocalMeta(),
        ]);
        const eventRow = dayRow
          ? await roadsideDb.rods_events_cache.get(dayRow.day.id)
          : undefined;
        if (cancelled) return;

        if (dayRow && eventRow && eventRow.events.length > 0) {
          const sig = await roadsideDb.signature_images
            .get(signatureKeyForDay(dayRow.operator_id, day.log_date))
            .catch(() => undefined);
          if (cancelled) return;
          setPayload({
            kind: 'native',
            day: dayRow.day,
            events: eventRow.events,
            driverName: meta?.driver_name ?? dayRow.day.certification_legal_name ?? 'Driver',
            signatureDataUrl: sig?.data_url ?? null,
          });
          return;
        }

        // An event row that is PRESENT and EMPTY is not a missing cache — it is
        // hydration having written an authoritative-looking empty set. The PDF
        // for that date is no more trustworthy than the rows, and on iOS Safari
        // the embed is the blank-frame path this native renderer exists to
        // avoid. Show the honest "not available here" state instead: a day the
        // driver cannot produce is recoverable, a blank certified log is not.
        if (eventRow) {
          logNativeFallback(day.log_date, 'empty_event_set');
          setPayload({ kind: 'missing' });
          return;
        }

        // No event row at all: device hydrated before the structured cache
        // existed. Fall back to the PDF silently — the officer screen never
        // explains cache formats.
        logNativeFallback(day.log_date, 'no_event_row');
        const entry = await roadsideDb.rods_pdfs.get(day.log_date);
        if (!entry || cancelled) return;
        const url = URL.createObjectURL(new Blob([entry.bytes], { type: 'application/pdf' }));
        revoke = url;
        setPayload({ kind: 'pdf', url });
        return;
      }

      const doc = await roadsideDb.rods_documents.get(day.log_date);
      if (!doc || cancelled) return;
      const bytes = doc.display_bytes ?? doc.bytes;
      const mime = doc.display_mime ?? doc.mime;
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      revoke = url;
      if (doc.mime === 'application/pdf') setPayload({ kind: 'pdf', url });
      else if (doc.renderable) setPayload({ kind: 'image', url });
      else setPayload({ kind: 'file', filename: doc.filename, url });
    })();

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [day]);

  const heading = useMemo(() => formatRoadsideDateLong(day.log_date), [day.log_date]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
        <h2 className="text-base font-bold" style={{ color: '#0D0D0D' }}>{heading}</h2>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6B6B6B' }}>
          {day.label}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 px-4 pb-4">
        {isDemo && payload.kind !== 'native' && <DemoWatermarkOverlay />}
        {payload.kind === 'native' && (
          <RoadsideDayRender
            day={payload.day}
            events={payload.events}
            driverName={payload.driverName}
            signatureDataUrl={payload.signatureDataUrl}
          />
        )}

        {payload.kind === 'pdf' && (
          <div className="flex h-full min-h-[45vh] flex-col gap-2">
            {/* Always offered, not only when the embed is detected to fail. */}
            <OpenFileAction url={payload.url} />
            <object
              data={payload.url}
              type="application/pdf"
              className="min-h-[40vh] w-full flex-1 rounded border"
              style={{ borderColor: '#DCDCDC' }}
            >
              <FileCard
                filename={day.filename ?? 'Daily log'}
                date={heading}
                recordType={day.label}
                url={payload.url}
              />
            </object>
          </div>
        )}

        {payload.kind === 'image' && (
          <div className="flex h-full min-h-[45vh] items-center justify-center rounded border" style={{ borderColor: '#DCDCDC' }}>
            <img src={payload.url} alt={`Log for ${heading}`} className="max-h-full max-w-full object-contain" />
          </div>
        )}

        {payload.kind === 'file' && (
          <FileCard filename={payload.filename} date={heading} recordType={day.label} url={payload.url} />
        )}

        {payload.kind === 'missing' && (
          <div className="rounded border p-4 text-sm" style={{ borderColor: '#DCDCDC', color: '#6B6B6B' }}>
            No certified record is stored on this device for {heading}.
          </div>
        )}
      </div>
    </section>
  );
}

function FileCard({ filename, date, recordType, url }: {
  filename: string; date: string; recordType: string; url: string;
}) {
  return (
    <div className="rounded border p-4" style={{ borderColor: '#DCDCDC', background: '#FAFAFA' }}>
      <p className="text-sm font-bold" style={{ color: '#0D0D0D' }}>{filename}</p>
      <p className="mt-1 text-xs" style={{ color: '#6B6B6B' }}>{date} · {recordType}</p>
      <p className="mt-2 text-xs" style={{ color: '#6B6B6B' }}>
        This file is stored on the device but cannot be displayed inside the app.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="mt-3 inline-block rounded px-4 py-2 text-sm font-bold"
        style={{ background: '#C9A84C', color: '#0D0D0D' }}
      >
        Open file
      </a>
    </div>
  );
}

/**
 * Shown above every embed at all times. If the frame comes up blank the driver
 * can still hand the officer the file, without the app having to notice.
 */
function OpenFileAction({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="shrink-0 self-start rounded px-4 py-2 text-sm font-bold"
      style={{ background: '#C9A84C', color: '#0D0D0D' }}
    >
      Open file
    </a>
  );
}

/**
 * Recorded for the driver-side dashboard only. The officer screen never shows
 * a cache-format explanation.
 */
function logNativeFallback(logDate: string, reason: 'no_event_row' | 'empty_event_set') {
  try {
    const key = reason === 'empty_event_set'
      ? 'roadside_empty_event_set'
      : 'roadside_native_fallback';
    const prev = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
    if (!prev.includes(logDate)) {
      localStorage.setItem(key, JSON.stringify([...prev, logDate].slice(-16)));
    }
  } catch {
    /* diagnostics only — never block the render */
  }
}

