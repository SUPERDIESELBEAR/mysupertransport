/**
 * Isomorphic ELD Malfunction Notice renderer.
 *
 * The pdf-lib namespace is injected so this exact file runs unchanged in the
 * browser (`import * as pdfLib from 'pdf-lib'`) and in Deno
 * (`import * as pdfLib from 'npm:pdf-lib@1.17.1'`). Do not import pdf-lib here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PdfLibLike {
  PDFDocument: any;
  StandardFonts: any;
  rgb: (r: number, g: number, b: number) => any;
}

export interface MalfunctionNoticeData {
  driverName: string;
  driverId: string;
  truckNumber: string | null;
  discoveredAtDisplay: string;
  discoveredLocation: string;
  deviceProvider: string | null;
  deviceMake: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  eldRegistrationId: string | null;
  malfunctionCode: string;
  malfunctionCodeLabel: string;
  malfunctionDescription: string;
  hindersHosRecording: boolean;
  repairDeadlineDisplay: string;
  submittedAtDisplay: string;
  signatureDataUrl?: string | null;
  /** Filled in when management acknowledges; regenerated server-side. */
  acknowledgedByName?: string | null;
  acknowledgedAtDisplay?: string | null;
}

const CARRIER_LEGAL_NAME = 'SUPERTRANSPORT, LLC';
const CARRIER_USDOT = '2309365';
const CARRIER_MC = '788425';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function buildMalfunctionNotice(
  pdfLib: PdfLibLike,
  data: MalfunctionNoticeData,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.42, 0.42, 0.42);
  const gold = rgb(0.788, 0.659, 0.298);

  let y = PAGE_H - MARGIN;

  const text = (s: string, opts: { size?: number; font?: any; color?: any; x?: number } = {}) => {
    const size = opts.size ?? 10;
    page.drawText(s, { x: opts.x ?? MARGIN, y, size, font: opts.font ?? regular, color: opts.color ?? ink });
  };

  const para = (s: string, size = 10, font: any = regular, color: any = ink) => {
    for (const line of wrap(s, font, size, CONTENT_W)) {
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + 3;
    }
  };

  // Header
  text('ELD MALFUNCTION NOTICE', { size: 16, font: bold });
  y -= 20;
  text(`${CARRIER_LEGAL_NAME}  ·  USDOT ${CARRIER_USDOT}  ·  MC ${CARRIER_MC}`, { size: 9, color: muted });
  y -= 12;
  text('Written notice of ELD malfunction under 49 CFR 395.34(a)(1)', { size: 9, color: muted });
  y -= 16;
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: gold });
  y -= 22;

  const rowsSection = (title: string, rows: Array<[string, string]>) => {
    text(title, { size: 11, font: bold });
    y -= 15;
    for (const [label, value] of rows) {
      page.drawText(label, { x: MARGIN, y, size: 9, font: bold, color: muted });
      const valueLines = wrap(value || '—', regular, 10, CONTENT_W - 170);
      valueLines.forEach((line, i) => {
        page.drawText(line, { x: MARGIN + 170, y: y - i * 13, size: 10, font: regular, color: ink });
      });
      y -= Math.max(1, valueLines.length) * 13 + 3;
    }
    y -= 10;
  };

  rowsSection('Driver', [
    ['Driver name', data.driverName],
    ['Driver ID', data.driverId],
    ['Truck / unit number', data.truckNumber || '—'],
  ]);

  rowsSection('Discovery', [
    ['Date & time discovered', data.discoveredAtDisplay],
    ['Location', data.discoveredLocation],
  ]);

  rowsSection('Electronic logging device', [
    ['Provider', data.deviceProvider || '—'],
    ['Make', data.deviceMake || '—'],
    ['Model', data.deviceModel || '—'],
    ['Serial number', data.deviceSerial || '—'],
    ['FMCSA registration ID', data.eldRegistrationId || '—'],
  ]);

  rowsSection('Malfunction', [
    ['Malfunction code', `${data.malfunctionCode} — ${data.malfunctionCodeLabel}`],
    ['Description', data.malfunctionDescription],
    ['Prevents accurate HOS recording', data.hindersHosRecording ? 'Yes' : 'No'],
    ['Repair deadline (8 days)', data.repairDeadlineDisplay],
  ]);

  text('Regulatory statements', { size: 11, font: bold });
  y -= 15;
  para(
    '49 CFR 395.34(a)(1): The driver has provided the motor carrier with written notice of the malfunction '
      + 'within 24 hours of discovering it.',
    9, regular, ink,
  );
  y -= 4;
  if (data.hindersHosRecording) {
    para(
      '49 CFR 395.34(a)(2): The driver is reconstructing the record of duty status for the current 24-hour period '
        + 'and the past 7 consecutive days, excluding any days for which the driver has records.',
      9, regular, ink,
    );
    y -= 4;
    para(
      '49 CFR 395.34(a)(3): The driver is continuing to manually prepare a record of duty status on paper graph-grid '
        + 'sheets until the ELD is serviced and back in compliance.',
      9, regular, ink,
    );
  }
  y -= 14;

  // Signature
  text('Driver signature', { size: 11, font: bold });
  y -= 8;
  if (data.signatureDataUrl) {
    try {
      const base64 = data.signatureDataUrl.split(',')[1] ?? '';
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const png = await doc.embedPng(bytes);
      const scale = Math.min(200 / png.width, 54 / png.height);
      y -= png.height * scale;
      page.drawImage(png, { x: MARGIN, y, width: png.width * scale, height: png.height * scale });
      y -= 6;
    } catch {
      y -= 20;
    }
  } else {
    y -= 24;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 240, y }, thickness: 0.75, color: muted });
  y -= 12;
  text(`${data.driverName} — submitted ${data.submittedAtDisplay}`, { size: 9, color: muted });
  y -= 26;

  // Carrier acknowledgment block
  const boxHeight = 76;
  page.drawRectangle({
    x: MARGIN, y: y - boxHeight, width: CONTENT_W, height: boxHeight,
    borderColor: gold, borderWidth: 1,
  });
  page.drawText('Carrier acknowledgment', { x: MARGIN + 12, y: y - 20, size: 10, font: bold, color: ink });
  page.drawText(
    data.acknowledgedAtDisplay
      ? `Acknowledged by ${data.acknowledgedByName || 'Carrier Safety'} on ${data.acknowledgedAtDisplay}`
      : 'Pending carrier acknowledgment',
    { x: MARGIN + 12, y: y - 38, size: 9, font: regular, color: data.acknowledgedAtDisplay ? ink : muted },
  );
  page.drawText(
    'The motor carrier must repair, replace, or service the ELD within 8 days of this notice.',
    { x: MARGIN + 12, y: y - 56, size: 8, font: regular, color: muted },
  );

  page.drawText(
    'Generated by SUPERDRIVE — recordkeeping support only. SUPERDRIVE is not an electronic logging device.',
    { x: MARGIN, y: 34, size: 7, font: regular, color: muted },
  );

  return await doc.save();
}