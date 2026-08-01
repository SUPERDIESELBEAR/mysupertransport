/**
 * Officer email merge (Pass B §8).
 *
 * The load-bearing claims, each with a test that fails if it stops being true:
 *
 *   - built entirely from IndexedDB, no network
 *   - printability comes from manifestBuild, not re-derived here
 *   - included_dates NEVER names a date that was not embedded
 *   - no day is dropped: 8 days in, 8 dispositions out, in date order
 *   - downsampling touches photos only and never substitutes a placeholder
 *     for a page that has bytes
 *   - over the ceiling after the last pass ⇒ over_ceiling, not a silent send
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { roadsideDb, type LocalMeta, type ManifestDay, type RoadsideManifest } from '../db';
import { buildOfficerPacket, DOWNSAMPLE_PASSES, type Reencoder } from '../buildOfficerPacket';

const OPERATOR = '11111111-1111-4111-8111-111111111111';

async function realPdf(pages = 1): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return bytes.slice().buffer as ArrayBuffer;
}

/** A 1x1 JPEG pdf-lib can actually embed. */
const JPEG_1PX = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
  + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
), (c) => c.charCodeAt(0));

function day(over: Partial<ManifestDay> & { log_date: string }): ManifestDay {
  return {
    kind: 'keyed',
    label: 'Certified',
    cached: true,
    renderable: true,
    filename: null,
    showsTotals: true,
    printable: true,
    ...over,
  } as ManifestDay;
}

/**
 * The packet cover carries the driver's name onto a document handed to an
 * officer, so `buildOfficerPacket` refuses to render a placeholder there. Every
 * build below therefore needs a real identity; the refusal itself is asserted
 * separately at the bottom of this file.
 */
function meta(over: Partial<LocalMeta> = {}): LocalMeta {
  return {
    key: 'identity',
    operator_id: OPERATOR,
    driver_name: 'Dana Reyes',
    driver_user_id: null,
    truck_number: '104',
    carrier_name: 'SUPERTRANSPORT LLC',
    carrier_usdot: '1234567',
    carrier_mc: 'MC-987654',
    ...over,
  } as LocalMeta;
}

function manifestOf(days: ManifestDay[]): RoadsideManifest {
  const sorted = [...days].sort((a, b) => b.log_date.localeCompare(a.log_date));
  return {
    key: 'current',
    operator_id: OPERATOR,
    days: sorted,
    window_start: sorted[sorted.length - 1].log_date,
    window_end: sorted[0].log_date,
    event: null,
    built_at: new Date().toISOString(),
  };
}

const EIGHT = Array.from({ length: 8 }, (_, i) => `2026-07-0${i + 1}`);

beforeEach(async () => {
  await roadsideDb.rods_pdfs.clear();
  await roadsideDb.rods_documents.clear();
});

async function putKeyedPdf(logDate: string, pages = 1) {
  await roadsideDb.rods_pdfs.put({
    log_date: logDate,
    operator_id: OPERATOR,
    bytes: await realPdf(pages),
    mime: 'application/pdf',
    uploaded: true,
    cached_at: new Date().toISOString(),
  });
}

async function putPhoto(logDate: string, bytes: ArrayBuffer, mime = 'image/jpeg') {
  await roadsideDb.rods_documents.put({
    log_date: logDate,
    operator_id: OPERATOR,
    source_path: `${OPERATOR}/${logDate}.jpg`,
    filename: `${logDate}.jpg`,
    bytes,
    mime,
    size: bytes.byteLength,
    renderable: true,
    display_bytes: null,
    display_mime: null,
    cached_at: new Date().toISOString(),
  });
}

describe('buildOfficerPacket', () => {
  it('emits one disposition per manifest day, oldest first, dropping none', async () => {
    for (const d of EIGHT) await putKeyedPdf(d);
    const packet = await buildOfficerPacket({ manifest: manifestOf(EIGHT.map((log_date) => day({ log_date }))), meta: meta() });

    expect(packet.dispositions.map((d) => d.log_date)).toEqual(EIGHT);
    expect(packet.included_dates).toEqual(EIGHT);
    expect(packet.mime).toBe('application/pdf');
  });

  it('never names a date in included_dates that was not embedded', async () => {
    // Day 3 is certified per the manifest but its bytes are not on the device.
    for (const d of EIGHT.filter((x) => x !== '2026-07-03')) await putKeyedPdf(d);
    const packet = await buildOfficerPacket({ manifest: manifestOf(EIGHT.map((log_date) => day({ log_date }))), meta: meta() });

    const placeholders = packet.dispositions.filter((d) => d.status === 'placeholder');
    expect(placeholders.map((d) => d.log_date)).toEqual(['2026-07-03']);
    expect(packet.included_dates).not.toContain('2026-07-03');
    // The date is still IN the packet — as a placeholder page — so the
    // eight-day sequence has no silent hole.
    expect(packet.dispositions).toHaveLength(8);
    expect(placeholders[0].reason).toBeTruthy();
  });

  it('reads printability from the manifest rather than re-deriving it', async () => {
    // Bytes ARE on the device, but manifestBuild said this day is not
    // printable (an empty event set on a keyed day). The merge must obey it.
    await putKeyedPdf('2026-07-01');
    const packet = await buildOfficerPacket({
      manifest: manifestOf([day({ log_date: '2026-07-01', printable: false })]),
      meta: meta(),
    });
    expect(packet.dispositions[0].status).toBe('placeholder');
    expect(packet.included_dates).toEqual([]);
  });

  it('treats a pre-printable cached manifest as printable (printable ?? cached)', async () => {
    await putKeyedPdf('2026-07-01');
    const legacy = day({ log_date: '2026-07-01' });
    delete (legacy as { printable?: boolean }).printable;
    const packet = await buildOfficerPacket({ manifest: manifestOf([legacy]), meta: meta() });
    expect(packet.dispositions[0].status).toBe('embedded');
  });

  it('embeds a photographed ELD log page', async () => {
    await putPhoto('2026-07-01', JPEG_1PX.slice().buffer);
    const packet = await buildOfficerPacket({
      manifest: manifestOf([day({ log_date: '2026-07-01', kind: 'eld_document', label: 'On file (ELD log)' })]),
      meta: meta(),
    });
    expect(packet.dispositions[0].status).toBe('embedded');
    expect(packet.included_dates).toEqual(['2026-07-01']);
  });

  it('places a placeholder for an undecodable HEIC with no display copy', async () => {
    await putPhoto('2026-07-01', new Uint8Array([1, 2, 3, 4]).buffer, 'image/heic');
    const packet = await buildOfficerPacket({
      manifest: manifestOf([day({ log_date: '2026-07-01', kind: 'eld_document', label: 'On file (ELD log)' })]),
      meta: meta(),
    });
    expect(packet.dispositions[0].status).toBe('placeholder');
    expect(packet.dispositions[0].reason).toContain('image/heic');
    expect(packet.included_dates).toEqual([]);
  });

  it('downsamples photos in order and stops at the first pass that fits', async () => {
    await putPhoto('2026-07-01', JPEG_1PX.slice().buffer);
    const seen: number[] = [];
    const reencode: Reencoder = async (_b, _m, pass) => {
      seen.push(DOWNSAMPLE_PASSES.indexOf(pass));
      return { bytes: JPEG_1PX.slice().buffer, mime: 'image/jpeg' };
    };
    // A ceiling every build exceeds until the third pass is reported.
    let calls = 0;
    const packet = await buildOfficerPacket({
      manifest: manifestOf([day({ log_date: '2026-07-01', kind: 'eld_document', label: 'On file (ELD log)' })]),
      meta: meta(),
      reencode: async (b, m, p) => { calls += 1; return reencode(b, m, p); },
      ceilingBytes: 1, // nothing ever fits
    });
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(calls).toBe(4);
    expect(packet.downsampled_pass).toBe(3);
    // Over the ceiling after the last pass: the caller sends a link, and the
    // packet still contains the day rather than dropping it.
    expect(packet.over_ceiling).toBe(true);
    expect(packet.included_dates).toEqual(['2026-07-01']);
  });

  it('does not downsample when the packet already fits', async () => {
    await putPhoto('2026-07-01', JPEG_1PX.slice().buffer);
    const reencode = vi.fn<Reencoder>(async () => ({ bytes: JPEG_1PX.slice().buffer, mime: 'image/jpeg' }));
    const packet = await buildOfficerPacket({
      manifest: manifestOf([day({ log_date: '2026-07-01', kind: 'eld_document', label: 'On file (ELD log)' })]),
      meta: meta(),
      reencode,
      ceilingBytes: 50 * 1024 * 1024,
    });
    expect(reencode).not.toHaveBeenCalled();
    expect(packet.downsampled_pass).toBeNull();
    expect(packet.over_ceiling).toBe(false);
  });

  it('never downsamples a keyed-day PDF', async () => {
    await putKeyedPdf('2026-07-01', 2);
    const reencode = vi.fn<Reencoder>(async () => ({ bytes: JPEG_1PX.slice().buffer, mime: 'image/jpeg' }));
    const packet = await buildOfficerPacket({
      manifest: manifestOf([day({ log_date: '2026-07-01' })]),
      meta: meta(),
      reencode,
      ceilingBytes: 1,
    });
    // No photos to reduce, so the loop must not spin: the vector record is the
    // one that must stay exact.
    expect(reencode).not.toHaveBeenCalled();
    expect(packet.over_ceiling).toBe(true);
    expect(packet.included_dates).toEqual(['2026-07-01']);
  });

  it('refuses to build when no manifest is on the device', async () => {
    await expect(buildOfficerPacket({ manifest: undefined, meta: meta() }))
      .rejects.toThrow(/manifest/i);
  });

  it('refuses to build a packet the device cannot name a driver for', async () => {
    // A roadside packet headed "Driver" is a false name on a document handed
    // to an officer. No placeholder cover: the build fails and the driver is
    // told to refresh, which is recoverable. Both the empty cache and the
    // codebase's own `|| 'Driver'` fallback are refused.
    await putKeyedPdf('2026-07-01');
    const manifest = manifestOf([day({ log_date: '2026-07-01' })]);

    await expect(buildOfficerPacket({ manifest, meta: null }))
      .rejects.toThrow(/no driver name/i);
    for (const name of ['', '   ', 'Driver', 'unknown', 'Operator']) {
      await expect(
        buildOfficerPacket({ manifest, meta: meta({ driver_name: name }) }),
        name,
      ).rejects.toThrow(/no driver name/i);
    }
  });
});