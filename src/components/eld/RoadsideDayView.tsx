import { useEffect, useMemo, useState } from 'react';
import { roadsideDb, type ManifestDay } from '@/lib/eld/offline/db';
import { formatRoadsideDateLong } from '@/lib/eld/offline/roadsideManifest';

type Payload =
  | { kind: 'pdf'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'file'; filename: string; url: string }
  | { kind: 'missing' };

/**
 * One day of the packet. An undecodable file (HEIC on Chrome) is never shown
 * as a broken image — it becomes a named card with an Open action that hands
 * off to the OS viewer.
 */
export default function RoadsideDayView({ day }: { day: ManifestDay }) {
  const [payload, setPayload] = useState<Payload>({ kind: 'missing' });

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    void (async () => {
      if (!day.cached) { setPayload({ kind: 'missing' }); return; }

      if (day.kind === 'keyed') {
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

      <div className="min-h-0 flex-1 px-4 pb-4">
        {payload.kind === 'pdf' && (
          <object data={payload.url} type="application/pdf" className="h-full min-h-[45vh] w-full rounded border" style={{ borderColor: '#DCDCDC' }}>
            <FileCard
              filename={day.filename ?? 'Daily log'}
              date={heading}
              recordType={day.label}
              url={payload.url}
            />
          </object>
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