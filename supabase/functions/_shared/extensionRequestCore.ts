/**
 * Isomorphic 49 CFR 395.34(d)(2) repair-extension request renderer.
 *
 * The pdf-lib namespace is injected so this exact file runs unchanged in the
 * browser (`import * as pdfLib from 'pdf-lib'`) and in Deno
 * (`import * as pdfLib from 'npm:pdf-lib@1.17.1'`). Do not import pdf-lib here.
 *
 * EVERY field on `ExtensionRequestData` is read off the frozen
 * `eld_extension_requests` row — never off `carrier_profile` or `eld_devices`.
 * A filing is a federal record: re-rendering it two months later must produce
 * what was filed, not what the fleet looks like today.
 */

import { drawDemoWatermark } from './demoWatermark.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PdfLibLike {
  PDFDocument: any;
  StandardFonts: any;
  rgb: (r: number, g: number, b: number) => any;
  degrees: (d: number) => any;
}

export interface ExtensionRequestData {
  /** 395.34(d)(2)(i) — the carrier representative filing the record. */
  filerName: string;
  filerTitle: string;
  filerPhone: string;
  filerEmail: string;
  /** Carrier identity, frozen at draft time. */
  carrierLegalName: string;
  carrierUsdot: string;
  carrierMc: string | null;
  carrierMainOfficeAddress: string;
  /** State whose FMCSA Division Administrator this filing is addressed to. */
  fmcsaDivisionState: string;
  /** Driver and vehicle the malfunction was reported against. */
  driverName: string;
  driverLicenseNumber: string | null;
  driverLicenseState: string | null;
  vehicleUnitNumber: string | null;
  vehicleVin: string | null;
  /** 395.34(d)(2)(ii) — make, model and serial of the ELD. */
  deviceProvider: string | null;
  deviceMake: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  eldRegistrationId: string | null;
  /** 395.34(d)(2)(iii) — date and location of the failure as reported. */
  malfunctionCode: string;
  malfunctionCodeLabel: string;
  malfunctionDescription: string;
  discoveredAtDisplay: string;
  discoveredLocation: string;
  reportedAtDisplay: string;
  repairDeadlineDisplay: string;
  /** 395.34(d)(2)(iv) — what the carrier has done about it. */
  actionsTaken: string;
  whyExtensionNeeded: string;
  requestedThroughDisplay: string;
  /** Filing metadata. */
  filedOnDisplay: string | null;
  /** FMCSA's answer, once recorded. */
  responseStatus?: 'granted' | 'denied' | null;
  responseDateDisplay?: string | null;
  responseReference?: string | null;
  responseNotes?: string | null;
  grantedThroughDisplay?: string | null;
  /** Copied off the request row, so a demo filing stays watermarked forever. */
  isDemo?: boolean;
}

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

export async function buildExtensionRequest(
  pdfLib: PdfLibLike,
  data: ExtensionRequestData,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = pdfLib;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.42, 0.42, 0.42);
  const gold = rgb(0.788, 0.659, 0.298);

  const pages: any[] = [];
  let page = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = PAGE_H - MARGIN;

  const need = (space: number) => {
    if (y - space > MARGIN + 40) return;
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - MARGIN;
  };

  const text = (s: string, opts: { size?: number; font?: any; color?: any; x?: number } = {}) => {
    const size = opts.size ?? 10;
    page.drawText(s, {
      x: opts.x ?? MARGIN, y, size, font: opts.font ?? regular, color: opts.color ?? ink,
    });
  };

  const para = (s: string, size = 9, font: any = regular, color: any = ink) => {
    for (const line of wrap(s, font, size, CONTENT_W)) {
      need(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + 3;
    }
  };

  const rowsSection = (title: string, rows: Array<[string, string]>) => {
    need(30);
    text(title, { size: 11, font: bold });
    y -= 15;
    for (const [label, value] of rows) {
      const valueLines = wrap(value || '—', regular, 10, CONTENT_W - 175);
      need(valueLines.length * 13 + 6);
      page.drawText(label, { x: MARGIN, y, size: 9, font: bold, color: muted });
      valueLines.forEach((line, i) => {
        page.drawText(line, { x: MARGIN + 175, y: y - i * 13, size: 10, font: regular, color: ink });
      });
      y -= valueLines.length * 13 + 3;
    }
    y -= 10;
  };

  // Header
  text('ELD REPAIR EXTENSION REQUEST', { size: 15, font: bold });
  y -= 18;
  text('49 CFR 395.34(d) — request for an extension of the 8-day repair period', {
    size: 9, color: muted,
  });
  y -= 14;
  text(`To: FMCSA Division Administrator — ${data.fmcsaDivisionState}`, { size: 10, font: bold });
  y -= 16;
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: gold });
  y -= 22;

  // (i) filing representative
  rowsSection('Motor carrier — 395.34(d)(2)(i)', [
    ['Carrier legal name', data.carrierLegalName],
    ['USDOT number', data.carrierUsdot],
    ['MC number', data.carrierMc || '—'],
    ['Principal place of business', data.carrierMainOfficeAddress],
    ['Representative filing', `${data.filerName} — ${data.filerTitle}`],
    ['Representative address', data.carrierMainOfficeAddress],
    ['Representative telephone', data.filerPhone],
    ['Representative email', data.filerEmail],
  ]);

  rowsSection('Driver and vehicle', [
    ['Driver', data.driverName],
    ['CDL number / state', [data.driverLicenseNumber, data.driverLicenseState].filter(Boolean).join(' / ') || '—'],
    ['Unit number', data.vehicleUnitNumber || '—'],
    ['VIN', data.vehicleVin || '—'],
  ]);

  // (ii) device identity
  rowsSection('Electronic logging device — 395.34(d)(2)(ii)', [
    ['Provider', data.deviceProvider || '—'],
    ['Make', data.deviceMake || '—'],
    ['Model', data.deviceModel || '—'],
    ['Serial number', data.deviceSerial || '—'],
    ['FMCSA registration ID', data.eldRegistrationId || '—'],
  ]);

  // (iii) failure date and location as reported by the driver
  rowsSection('ELD failure as reported by the driver — 395.34(d)(2)(iii)', [
    ['Date & time of failure', data.discoveredAtDisplay],
    ['Location of failure', data.discoveredLocation],
    ['Driver notified carrier', data.reportedAtDisplay],
    ['Malfunction code', `${data.malfunctionCode} — ${data.malfunctionCodeLabel}`],
    ['Description', data.malfunctionDescription],
    ['8-day repair deadline', data.repairDeadlineDisplay],
  ]);

  // (iv) corrective action
  need(40);
  text("Motor carrier's actions to correct the failure — 395.34(d)(2)(iv)", { size: 11, font: bold });
  y -= 15;
  para(data.actionsTaken);
  y -= 8;

  need(40);
  text('Why more than eight days are required', { size: 11, font: bold });
  y -= 15;
  para(data.whyExtensionNeeded);
  y -= 8;

  rowsSection('Relief requested', [
    ['Extension requested through', data.requestedThroughDisplay],
    ['Filed with FMCSA on', data.filedOnDisplay || 'Not yet filed'],
  ]);

  need(70);
  para(
    'The driver is preparing a record of duty status on paper graph-grid sheets for the current 24-hour '
      + 'period and for each 24-hour period thereafter until the ELD is serviced and back in compliance, '
      + 'in accordance with 49 CFR 395.34(a)(3).',
  );
  y -= 14;

  need(60);
  text('Signature of carrier representative', { size: 11, font: bold });
  y -= 34;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 240, y }, thickness: 0.75, color: muted });
  y -= 12;
  text(`${data.filerName}, ${data.filerTitle} — ${data.carrierLegalName}`, { size: 9, color: muted });
  y -= 24;

  if (data.responseStatus) {
    need(96);
    const boxHeight = 86;
    page.drawRectangle({
      x: MARGIN, y: y - boxHeight, width: CONTENT_W, height: boxHeight,
      borderColor: gold, borderWidth: 1,
    });
    page.drawText('FMCSA response', { x: MARGIN + 12, y: y - 20, size: 10, font: bold, color: ink });
    page.drawText(
      `${data.responseStatus === 'granted' ? 'Granted' : 'Denied'} ${data.responseDateDisplay || ''}`
        + (data.responseReference ? ` · ref ${data.responseReference}` : '')
        + (data.responseStatus === 'granted' && data.grantedThroughDisplay
          ? ` · relief through ${data.grantedThroughDisplay}` : ''),
      { x: MARGIN + 12, y: y - 38, size: 9, font: regular, color: ink },
    );
    wrap(data.responseNotes || '', regular, 8, CONTENT_W - 24).slice(0, 4).forEach((line, i) => {
      page.drawText(line, { x: MARGIN + 12, y: y - 54 - i * 10, size: 8, font: regular, color: muted });
    });
    y -= boxHeight + 12;
  }

  for (const p of pages) {
    p.drawText(
      'Generated by SUPERDRIVE — recordkeeping support only. SUPERDRIVE is not an electronic logging device.',
      { x: MARGIN, y: 34, size: 7, font: regular, color: muted },
    );
    if (data.isDemo) drawDemoWatermark(p, bold, rgb, degrees);
  }

  return await doc.save();
}