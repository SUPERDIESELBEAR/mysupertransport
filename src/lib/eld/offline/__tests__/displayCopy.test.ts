/**
 * HEIC upload path (Pass B §6).
 *
 * pdf-lib cannot embed HEIC and HEIC is the iPhone camera default, so a
 * photographed ELD screen would break the officer email merge. The device
 * converts to JPEG at upload and stores BOTH files; a file it cannot decode is
 * stored anyway and flagged.
 *
 * The load-bearing rule tested here: `renderable` means "THIS device can draw
 * it". The display JPEG was encoded somewhere else, and truncation, a partial
 * upload and transit corruption all happen after that encode — so provenance
 * is never a substitute for a decode.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { roadsideDb } = await import('../db');
const { buildManifest } = await import('../manifestBuild');
const { convertForDisplay, canDecode, DISPLAY_MIME, PROBE_TIMEOUT_MS } = await import('../renderability');

const DATE = '2026-07-02';

/**
 * jsdom's canvas Blob has no arrayBuffer(); browsers do. The stub below hands
 * back one that does, so the encode step is exercised rather than failing for
 * an environment reason — which would make the flagged assertions further down
 * pass for the wrong reason.
 */
function jpegBlob(): Blob {
  const buf = new Uint8Array([1, 2, 3, 4]).buffer;
  const blob = new Blob([buf], { type: DISPLAY_MIME });
  if (typeof blob.arrayBuffer !== 'function') {
    (blob as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () => Promise.resolve(buf);
  }
  return blob;
}

/** A decode that succeeds, with a canvas that encodes to recognisable bytes. */
function stubDecodable() {
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 100, height: 50 }));
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (cb: (b: Blob | null) => void) => cb(jpegBlob()),
    };
  }) as never);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await roadsideDb.open();
  await Promise.all([
    roadsideDb.rods_documents.clear(),
    roadsideDb.rods_days_cache.clear(),
    roadsideDb.rods_events_cache.clear(),
    roadsideDb.roadside_manifest.clear(),
  ]);
});

describe('convertForDisplay — one implementation, both paths', () => {
  it('re-encodes a decodable image to JPEG', async () => {
    stubDecodable();
    const out = await convertForDisplay(new ArrayBuffer(8), 'image/jpeg');
    expect(out).not.toBeNull();
    expect(out!.byteLength).toBe(4);
  });

  it('returns null for HEIC the device cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    expect(await convertForDisplay(new ArrayBuffer(8), 'image/heic')).toBeNull();
  });

  it('returns null when the decode never settles, inside the timeout', async () => {
    vi.stubGlobal('createImageBitmap', () => new Promise(() => { /* hangs */ }));
    const started = Date.now();
    expect(await convertForDisplay(new ArrayBuffer(8), 'image/heic')).toBeNull();
    expect(Date.now() - started).toBeLessThan(PROBE_TIMEOUT_MS + 750);
  }, 10_000);

  it('does not attempt a non-image', async () => {
    expect(await convertForDisplay(new ArrayBuffer(8), 'application/pdf')).toBeNull();
  });
});

describe('canDecode — the reading device decides', () => {
  it('accepts an intact JPEG', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 10, height: 10 }));
    expect(await canDecode(new ArrayBuffer(8), DISPLAY_MIME)).toBe(true);
  });

  it('rejects a truncated JPEG even though some device once encoded it', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('truncated')));
    expect(await canDecode(new ArrayBuffer(8), DISPLAY_MIME)).toBe(false);
  });
});

async function manifestDay() {
  const m = await buildManifest({
    mode: 'full',
    operatorId: 'op-1',
    dates: [DATE],
    serverDays: [{ log_date: DATE, kind: 'eld_document', label: 'On file (ELD log)', showsTotals: false }],
  });
  return m.days[0];
}

async function putDoc(over: Partial<Parameters<typeof roadsideDb.rods_documents.put>[0]>) {
  await roadsideDb.rods_documents.put({
    log_date: DATE,
    operator_id: 'op-1',
    source_path: `op-1/${DATE}/eld-log-1.heic`,
    filename: 'eld-log-1.heic',
    bytes: new ArrayBuffer(64),
    mime: 'image/heic',
    size: 64,
    day_id: 'day-1',
    certified_at: '2026-08-01T14:07:16.000Z',
    renderable: false,
    display_bytes: null,
    display_mime: null,
    display_conversion_failed: false,
    cached_at: '2026-08-01T14:08:00.000Z',
    ...over,
  });
}

describe('manifest — converted vs flagged', () => {
  it('converted, display bytes decode here: renderable and printable', async () => {
    await putDoc({ renderable: true, display_bytes: new ArrayBuffer(16), display_mime: DISPLAY_MIME });
    const d = await manifestDay();
    expect(d.cached).toBe(true);
    expect(d.renderable).toBe(true);
    expect(d.printable).toBe(true);
  });

  it('display bytes corrupt but the original decodes: still renderable and printable', async () => {
    // What hydration writes after discarding an undecodable display copy.
    await putDoc({ mime: 'image/jpeg', renderable: true, display_bytes: new ArrayBuffer(16), display_mime: DISPLAY_MIME });
    const d = await manifestDay();
    expect(d.renderable).toBe(true);
    expect(d.printable).toBe(true);
  });

  it('flagged, bytes present: NOT renderable but still PRINTABLE', async () => {
    // The whole point of the flagged path. The app cannot embed it, but the
    // bytes exist, so print / download / email-merge stay available and an
    // officer can open the file. The screen shows a named card, not a broken
    // image.
    await putDoc({ display_conversion_failed: true, renderable: false });
    const d = await manifestDay();
    expect(d.cached).toBe(true);
    expect(d.renderable).toBe(false);
    expect(d.printable).toBe(true);
    expect(d.filename).toBe('eld-log-1.heic');
  });

  it('no bytes on the device: neither', async () => {
    const d = await manifestDay();
    expect(d.cached).toBe(false);
    expect(d.renderable).toBe(false);
    expect(d.printable).toBe(false);
  });
});
