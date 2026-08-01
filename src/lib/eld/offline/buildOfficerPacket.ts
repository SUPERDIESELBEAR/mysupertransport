/**
 * Officer email merge (Pass B §8).
 *
 * Assembles the eight-day window into ONE PDF entirely from IndexedDB: no
 * network call, no session, no auth refresh. A driver builds this at the
 * roadside, frequently in a dead zone, and a merge that needs the server is a
 * merge that fails exactly when it is needed.
 *
 * The printability rules are NOT re-derived here. `manifestBuild` already
 * decided, day by day, whether the device holds a record an officer can be
 * shown; this module reads that decision and embeds or substitutes
 * accordingly. Two implementations of "is this day printable" would eventually
 * disagree, and the disagreement would surface as a packet that omits a day
 * the roadside screen says is there.
 *
 * Must not import the Supabase client — see roadsideImportGraph.test.ts.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { drawDemoWatermark } from '../../../../supabase/functions/_shared/demoWatermark';
import {
  roadsideDb, readLocalMeta, readManifest,
  type LocalMeta, type ManifestDay, type RoadsideManifest,
} from './db';
import { formatRoadsideDate } from './roadsideManifest';

/** Raw-byte ceiling for the assembled packet. */
export const PACKET_CEILING_BYTES = 12 * 1024 * 1024;

/**
 * Why 12 MB and not 15.
 *
 * `sendResendDirect` refuses above MAX_TOTAL_ATTACHMENT_BYTES = 20 MB measured
 * base64, and base64 inflates by 4/3 — so ~15 MB of raw PDF is the hard app
 * limit, well below Resend's own ~40 MB request cap. 12 MB leaves headroom for
 * the HTML body, the headers and the base64 padding, and it is measured on the
 * assembled bytes rather than estimated from the parts.
 */

/** Photo re-encode passes, applied in order, until the packet fits. */
export interface DownsamplePass {
  quality: number;
  maxEdge: number;
}

export const DOWNSAMPLE_PASSES: readonly DownsamplePass[] = [
  { quality: 0.70, maxEdge: 2400 },
  { quality: 0.55, maxEdge: 2400 },
  { quality: 0.70, maxEdge: 2000 },
  { quality: 0.70, maxEdge: 1400 },
];

export type DayStatus = 'embedded' | 'placeholder';

export interface DayDisposition {
  log_date: string;
  kind: 'keyed' | 'eld_document';
  status: DayStatus;
  /** Officer-readable reason, present only on a placeholder. */
  reason: string | null;
}

export interface OfficerPacket {
  bytes: ArrayBuffer;
  mime: 'application/pdf';
  /**
   * Dates whose actual record was embedded. Never names a date that appears as
   * a placeholder — the officer reads this list as "these are in here".
   */
  included_dates: string[];
  dispositions: DayDisposition[];
  /** Index of the pass that was used, or null when no reduction was needed. */
  downsampled_pass: number | null;
  /**
   * True when even the last pass left the packet above the ceiling. The caller
   * sends a token-gated link instead of an attachment.
   */
  over_ceiling: boolean;
  size: number;
  window_start: string;
  window_end: string;
}

/** Re-encode a decoded photo. Injected so the merge is testable off-browser. */
export type Reencoder = (
  bytes: ArrayBuffer, mime: string, pass: DownsamplePass,
) => Promise<{ bytes: ArrayBuffer; mime: string } | null>;

export interface BuildOfficerPacketOptions {
  manifest?: RoadsideManifest;
  meta?: LocalMeta | null;
  ceilingBytes?: number;
  reencode?: Reencoder;
  now?: Date;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const GOLD = rgb(0.788, 0.659, 0.298);
const INK = rgb(0.051, 0.051, 0.051);
const GREY = rgb(0.42, 0.42, 0.42);

/**
 * The standard fonts encode WinAnsi only, and `drawText` THROWS on anything
 * outside it — an arrow, a CJK character in a carrier name, a smart quote
 * pasted into a truck number. That throw would abort the whole merge at the
 * roadside. Every string that reaches the page goes through here first:
 * a degraded glyph is always better than no packet.
 */
function wa(text: string): string {
  return text
    .replace(/[\u2192\u2794]/g, '->')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00B7\u2022]/g, '-')
    .replace(/\u2026/g, '...')
    // Anything still outside Latin-1 printable becomes '?' rather than throwing.
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

interface DaySource {
  day: ManifestDay;
  /** PDF bytes to merge, image bytes to draw, or null for a placeholder. */
  pdf: ArrayBuffer | null;
  image: { bytes: ArrayBuffer; mime: string } | null;
  reason: string | null;
}

/** manifestBuild's decision, read the way every consumer must read it. */
function isPrintable(day: ManifestDay): boolean {
  return day.printable ?? day.cached;
}

function placeholderReason(day: ManifestDay): string {
  if (!day.cached && day.label === 'Not certified') return 'Not certified — no record on file for this date.';
  if (day.kind === 'keyed' && !isPrintable(day)) {
    return day.cached
      ? 'Certified, but the printable copy is not on this device.'
      : 'Certified, but this device holds no renderable record for the date.';
  }
  return 'Record unavailable on this device.';
}

/**
 * pdf-lib type-checks its input by constructor identity, which fails for an
 * ArrayBuffer that came back from IndexedDB in a different realm — it reports
 * the type as NaN and refuses bytes that are perfectly good. Copy into a local
 * Uint8Array before handing anything to pdf-lib.
 */
function toBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf.slice(0));
}

function embeddableImageMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png';
}

/** Gather bytes for one manifest day. Never decides printability itself. */
async function sourceFor(day: ManifestDay): Promise<DaySource> {
  if (!isPrintable(day)) {
    return { day, pdf: null, image: null, reason: placeholderReason(day) };
  }

  if (day.kind === 'keyed') {
    const entry = await roadsideDb.rods_pdfs.get(day.log_date);
    if (!entry) {
      return { day, pdf: null, image: null, reason: 'Certified, but the printable copy is not on this device.' };
    }
    return { day, pdf: entry.bytes, image: null, reason: null };
  }

  const doc = await roadsideDb.rods_documents.get(day.log_date);
  if (!doc) {
    return { day, pdf: null, image: null, reason: 'ELD log on file, but the file is not on this device.' };
  }

  const mime = doc.display_mime ?? doc.mime;
  const bytes = doc.display_bytes ?? doc.bytes;

  if (mime === 'application/pdf') return { day, pdf: bytes, image: null, reason: null };
  if (embeddableImageMime(mime)) return { day, pdf: null, image: { bytes, mime }, reason: null };

  // HEIC with no display copy: the bytes are the record and are kept, but this
  // device could not convert them, so there is nothing embeddable.
  return {
    day,
    pdf: null,
    image: null,
    reason: `ELD log photo is in a format this device cannot embed (${mime}). The original is on file.`,
  };
}

function drawHeaderRule(page: ReturnType<PDFDocument['addPage']>): void {
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: 0, y: height - 6, width, height: 6, color: GOLD,
  });
}

async function addCoverPage(
  pdf: PDFDocument,
  meta: LocalMeta | null,
  manifest: RoadsideManifest,
  dispositions: DayDisposition[],
  reducedPass: number | null,
  now: Date,
): Promise<void> {
  const page = pdf.addPage(A4);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  drawHeaderRule(page);

  let y = height - MARGIN - 18;
  const line = (text: string, size = 10, f = font, color = INK, gap = 15) => {
    page.drawText(wa(text), { x: MARGIN, y, size, font: f, color });
    y -= gap;
  };

  line('RECORD OF DUTY STATUS — 8 DAY PACKET', 14, bold, INK, 24);
  // No placeholder on a roadside packet cover — the caller resolves the name
  // or the packet is not built.
  line(requireDriverName(meta?.driver_name), 12, bold, INK, 16);
  line(
    [meta?.carrier_name, meta?.carrier_usdot ? `USDOT ${meta.carrier_usdot}` : null,
      meta?.carrier_mc ? `MC ${meta.carrier_mc}` : null].filter(Boolean).join(' · '),
    10, font, GREY, 14,
  );
  line(`Truck ${meta?.truck_number ?? '—'}`, 10, font, GREY, 14);
  line(`Window ${manifest.window_start} → ${manifest.window_end}`, 10, font, GREY, 14);
  line(`Generated ${now.toLocaleString('en-US')}`, 10, font, GREY, 22);

  if (manifest.event) {
    line(
      `ELD malfunction reported ${new Date(manifest.event.discovered_at).toLocaleDateString('en-US')}`
      + ` — code ${manifest.event.malfunction_code}.`,
      10, bold, INK, 14,
    );
    line('Paper records kept under 49 CFR 395.8 while the ELD is malfunctioning (49 CFR 395.34).', 9, font, GREY, 20);
  } else {
    line('Records kept under 49 CFR 395.8.', 10, font, GREY, 20);
  }

  line('CONTENTS', 11, bold, INK, 18);
  for (const d of dispositions) {
    const label = d.status === 'embedded'
      ? 'included'
      : `NOT INCLUDED — ${d.reason ?? 'unavailable'}`;
    line(`${formatRoadsideDate(d.log_date)} — ${label}`, 9, font, d.status === 'embedded' ? INK : GREY, 13);
  }

  if (reducedPass !== null) {
    y -= 8;
    line(
      'Photographed log pages in this packet were reduced in resolution so the file could be'
      + ' transmitted by email. No day was omitted and no page was replaced.',
      9, font, GREY, 12,
    );
  }
}

async function addPlaceholderPage(
  pdf: PDFDocument, day: ManifestDay, reason: string,
): Promise<void> {
  const page = pdf.addPage(A4);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  drawHeaderRule(page);

  page.drawText(wa(formatRoadsideDate(day.log_date)), {
    x: MARGIN, y: height - MARGIN - 24, size: 16, font: bold, color: INK,
  });
  page.drawText('RECORD NOT INCLUDED', {
    x: MARGIN, y: height - MARGIN - 50, size: 12, font: bold, color: INK,
  });
  page.drawText(wa(reason), {
    x: MARGIN, y: height - MARGIN - 74, size: 10, font, color: GREY, maxWidth: A4[0] - MARGIN * 2, lineHeight: 14,
  });
  page.drawText(
    'This page stands in for the date above so the eight-day sequence is complete and no date is silently absent.',
    { x: MARGIN, y: height - MARGIN - 120, size: 9, font, color: GREY, maxWidth: A4[0] - MARGIN * 2, lineHeight: 12 },
  );
}

async function addImagePage(
  pdf: PDFDocument, day: ManifestDay, image: { bytes: ArrayBuffer; mime: string },
): Promise<boolean> {
  let embedded;
  try {
    embedded = image.mime === 'image/png'
      ? await pdf.embedPng(toBytes(image.bytes))
      : await pdf.embedJpg(toBytes(image.bytes));
  } catch {
    return false;
  }
  const page = pdf.addPage(A4);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  drawHeaderRule(page);
  page.drawText(wa(`${formatRoadsideDate(day.log_date)} — ELD log (photographed)`), {
    x: MARGIN, y: height - MARGIN - 8, size: 11, font: bold, color: INK,
  });

  const boxW = width - MARGIN * 2;
  const boxH = height - MARGIN * 2 - 40;
  const scale = Math.min(boxW / embedded.width, boxH / embedded.height, 1);
  const w = embedded.width * scale;
  const h = embedded.height * scale;
  page.drawImage(embedded, {
    x: (width - w) / 2,
    y: (height - MARGIN - 40 - h),
    width: w,
    height: h,
  });
  return true;
}

/** The browser re-encoder. Same canvas path as renderability's display copy. */
export const canvasReencoder: Reencoder = async (bytes, mime, pass) => {
  if (typeof document === 'undefined') return null;
  try {
    const blob = new Blob([bytes], { type: mime });
    const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : null;
    if (!bitmap || !bitmap.width || !bitmap.height) return null;
    const scale = Math.min(1, pass.maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', pass.quality);
    });
    if (!out) return null;
    return { bytes: await out.arrayBuffer(), mime: 'image/jpeg' };
  } catch {
    return null;
  }
};

async function assemble(
  sources: DaySource[],
  meta: LocalMeta | null,
  manifest: RoadsideManifest,
  reducedPass: number | null,
  now: Date,
  isDemo: boolean,
): Promise<{ bytes: Uint8Array; dispositions: DayDisposition[]; included: string[] }> {
  const pdf = await PDFDocument.create();
  const dispositions: DayDisposition[] = [];
  const included: string[] = [];

  // Two passes: the cover lists what follows, so the dispositions have to be
  // known before it is drawn, and a page that fails to embed must be able to
  // change its own disposition to a placeholder.
  const rendered: Array<{ source: DaySource; ok: boolean }> = [];
  const body = await PDFDocument.create();

  for (const source of sources) {
    let ok = false;
    if (source.pdf) {
      try {
        const donor = await PDFDocument.load(toBytes(source.pdf), { ignoreEncryption: true });
        const pages = await body.copyPages(donor, donor.getPageIndices());
        pages.forEach((p) => body.addPage(p));
        ok = pages.length > 0;
      } catch (err) {
        // Keep the real reason: "could not be read" with no cause is the kind
        // of placeholder nobody can act on after the inspection.
        ok = false;
        source.reason = `The stored record could not be read on this device (${
          err instanceof Error ? err.message : String(err)}).`;
      }
    } else if (source.image) {
      ok = await addImagePage(body, source.day, source.image);
    }

    if (!ok && !source.reason) {
      source.reason = 'The stored record could not be read on this device.';
    }
    if (!ok) await addPlaceholderPage(body, source.day, source.reason as string);

    rendered.push({ source, ok });
    dispositions.push({
      log_date: source.day.log_date,
      kind: source.day.kind,
      status: ok ? 'embedded' : 'placeholder',
      reason: ok ? null : source.reason,
    });
    if (ok) included.push(source.day.log_date);
  }

  await addCoverPage(pdf, meta, manifest, dispositions, reducedPass, now);
  const bodyPages = await pdf.copyPages(body, body.getPageIndices());
  bodyPages.forEach((p) => pdf.addPage(p));

  // Stamped here, after every page exists, so the mark covers the cover page,
  // the placeholders, the photographed pages, and the merged donor pages from a
  // certified day's own PDF alike. Stamping earlier would miss the copies.
  if (isDemo) {
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.getPages().forEach((p) => drawDemoWatermark(p, font, rgb, degrees));
  }

  void rendered;
  return { bytes: await pdf.save(), dispositions, included };
}

/**
 * Build the packet.
 *
 * Downsampling touches PHOTO PAGES ONLY. Keyed-day PDFs are vector and small,
 * and re-rastering them would degrade the one record type that is exact. No
 * day is ever dropped and no placeholder ever replaces a page that has bytes:
 * only fidelity is reduced, and the cover page says so.
 */
export async function buildOfficerPacket(
  options: BuildOfficerPacketOptions = {},
): Promise<OfficerPacket> {
  const manifest = options.manifest ?? await readManifest();
  if (!manifest) throw new Error('No roadside manifest on this device.');
  const meta = options.meta !== undefined ? options.meta : (await readLocalMeta()) ?? null;
  const ceiling = options.ceilingBytes ?? PACKET_CEILING_BYTES;
  const reencode = options.reencode ?? canvasReencoder;
  const now = options.now ?? new Date();

  const sources: DaySource[] = [];
  // The manifest is newest-first for the roadside screen; an officer reads a
  // packet oldest-first.
  const ordered = [...manifest.days].sort((a, b) => a.log_date.localeCompare(b.log_date));
  for (const day of ordered) {
    // eslint-disable-next-line no-await-in-loop
    sources.push(await sourceFor(day));
  }

  const originals = sources.map((s) => (s.image ? { ...s.image } : null));

  // Fail safe: cached identity says demo, or any cached day carries the flag.
  // A day row wins even if identity was never hydrated on this device.
  const cachedDays = await roadsideDb.rods_days_cache.toArray();
  const isDemo = meta?.is_demo === true
    || cachedDays.some((entry) => entry.day?.is_demo === true);

  let result = await assemble(sources, meta, manifest, null, now, isDemo);
  let usedPass: number | null = null;

  const hasPhotos = originals.some(Boolean);
  for (let i = 0; i < DOWNSAMPLE_PASSES.length && result.bytes.byteLength > ceiling && hasPhotos; i += 1) {
    const pass = DOWNSAMPLE_PASSES[i];
    let anyReduced = false;
    for (let s = 0; s < sources.length; s += 1) {
      const original = originals[s];
      if (!original) continue;
      // eslint-disable-next-line no-await-in-loop
      const reduced = await reencode(original.bytes, original.mime, pass);
      if (reduced) {
        sources[s].image = reduced;
        anyReduced = true;
      }
    }
    if (!anyReduced) break;
    // eslint-disable-next-line no-await-in-loop
    result = await assemble(sources, meta, manifest, i, now, isDemo);
    usedPass = i;
  }

  const bytes = result.bytes.slice().buffer as ArrayBuffer;
  return {
    bytes,
    mime: 'application/pdf',
    included_dates: result.included,
    dispositions: result.dispositions,
    downsampled_pass: usedPass,
    over_ceiling: bytes.byteLength > ceiling,
    size: bytes.byteLength,
    window_start: manifest.window_start,
    window_end: manifest.window_end,
  };
}