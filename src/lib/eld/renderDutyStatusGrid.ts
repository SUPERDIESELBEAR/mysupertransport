import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { BOOTSTRAP_CARRIER } from './constants';
import { readCachedCarrier, type CachedCarrier } from './carrierIdentity';
import {
  GRID_W, GRID_X, MARGIN, PAGE_H, PAGE_W, ROW_H, STATUS_LABEL_LINES,
  hourLabel, hourWidth, isMajorHour, rowCenterOffset,
} from './rodsGridGeometry';

/**
 * Blank paper record-of-duty-status sheets, per 49 CFR 395.8(g).
 * Used only while a driver's ELD is malfunctioning.
 *
 * `segments` is accepted now and left empty in Stage 1 so the same renderer can
 * draw filled duty-status lines in a later stage.
 */
export type DutyStatusSegment = {
  /** 1 = off duty, 2 = sleeper, 3 = driving, 4 = on duty (not driving) */
  line: 1 | 2 | 3 | 4;
  startHour: number;
  endHour: number;
};

export const FORM_REVISION = 'Form rev. 2026.1';

function drawSheet(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  segments: DutyStatusSegment[],
  carrier: CachedCarrier,
) {
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.45, 0.45, 0.45);
  const gold = rgb(0.788, 0.659, 0.298);

  let y = PAGE_H - MARGIN;

  page.drawText("DRIVER'S DAILY LOG", { x: MARGIN, y: y - 12, size: 14, font: bold, color: ink });
  page.drawText('(one calendar day — 24 hours)', { x: MARGIN + 172, y: y - 12, size: 9, font: regular, color: muted });
  y -= 26;
  page.drawText(
    `${carrier.legal_name}  ·  USDOT ${carrier.usdot_number}  ·  MC ${carrier.mc_number}`,
    { x: MARGIN, y: y - 10, size: 9, font: regular, color: muted },
  );
  y -= 24;
  page.drawRectangle({ x: MARGIN, y, width: PAGE_W - MARGIN * 2, height: 1.5, color: gold });
  y -= 22;

  // Blank header fields — dates are intentionally left empty. The two carrier
  // addresses are pre-printed: they are the same on every sheet and a driver
  // filling these in by hand at the roadside gets them wrong.
  const fields: Array<[string, number, string?]> = [
    ['Date (mo/day/yr)', 150],
    ['Truck / tractor no.', 150],
    ['Trailer no.', 120],
    ['Total miles driving today', 150],
    ['Total mileage today', 150],
    ['Driver name (print)', 200],
    ['Co-driver name', 150],
    ['Main office address', 240, carrier.main_office_address],
    ['Home terminal address', 240, carrier.home_terminal_address],
    ['24-hour period begins', 240],
    ['From', 180],
    ['To', 180],
    ['Shipping document no.', 180],
  ];
  let fx = MARGIN;
  for (const [label, w, prefilled] of fields) {
    if (fx + w > PAGE_W - MARGIN) { fx = MARGIN; y -= 30; }
    page.drawText(label, { x: fx, y, size: 7, font: regular, color: muted });
    if (prefilled) {
      page.drawText(prefilled.slice(0, 44), { x: fx, y: y - 10, size: 8, font: regular, color: ink });
    }
    page.drawLine({ start: { x: fx, y: y - 12 }, end: { x: fx + w - 10, y: y - 12 }, thickness: 0.6, color: muted });
    fx += w;
  }
  y -= 40;

  // Grid
  const gridTop = y;
  const gridBottom = gridTop - ROW_H * 4;
  const hourW = hourWidth();

  // Hour labels
  for (let h = 0; h <= 24; h += 1) {
    const x = GRID_X + hourW * h;
    const label = hourLabel(h);
    page.drawText(label, { x: x - 2.5, y: gridTop + 6, size: 6, font: regular, color: muted });
    page.drawLine({
      start: { x, y: gridTop }, end: { x, y: gridBottom },
      thickness: isMajorHour(h) ? 0.9 : 0.4,
      color: isMajorHour(h) ? ink : muted,
    });
    // quarter-hour ticks
    if (h < 24) {
      for (let q = 1; q < 4; q += 1) {
        const qx = x + (hourW / 4) * q;
        page.drawLine({ start: { x: qx, y: gridBottom }, end: { x: qx, y: gridBottom + 4 }, thickness: 0.3, color: muted });
      }
    }
  }
  page.drawText('Midnight', { x: GRID_X - 4, y: gridTop + 16, size: 6, font: regular, color: muted });
  page.drawText('Noon', { x: GRID_X + GRID_W / 2 - 8, y: gridTop + 16, size: 6, font: regular, color: muted });

  for (let i = 0; i <= 4; i += 1) {
    const ly = gridTop - ROW_H * i;
    page.drawLine({ start: { x: GRID_X, y: ly }, end: { x: GRID_X + GRID_W + 54, y: ly }, thickness: 0.6, color: ink });
    if (i < 4) {
      const labelLines = STATUS_LABEL_LINES[i];
      const centre = ly - ROW_H / 2;
      labelLines.forEach((line, li) => {
        page.drawText(line, {
          x: MARGIN,
          y: centre - 3 + (labelLines.length - 1) * 4.5 - li * 9,
          size: 8,
          font: regular,
          color: ink,
        });
      });
    }
  }
  // Totals column
  page.drawLine({ start: { x: GRID_X + GRID_W, y: gridTop }, end: { x: GRID_X + GRID_W, y: gridBottom }, thickness: 0.9, color: ink });
  page.drawText('Total hours', { x: GRID_X + GRID_W + 4, y: gridTop + 6, size: 6, font: regular, color: muted });

  // Optional pre-filled duty lines (unused in Stage 1)
  for (const seg of segments) {
    const ly = gridTop - rowCenterOffset(seg.line);
    page.drawLine({
      start: { x: GRID_X + hourW * seg.startHour, y: ly },
      end: { x: GRID_X + hourW * seg.endHour, y: ly },
      thickness: 1.6,
      color: ink,
    });
  }

  y = gridBottom - 22;
  page.drawText('REMARKS  (city/state of each change of duty status, shipping document numbers)', {
    x: MARGIN, y, size: 7, font: bold, color: ink,
  });
  y -= 10;
  for (let i = 0; i < 5; i += 1) {
    page.drawLine({ start: { x: MARGIN, y: y - i * 14 }, end: { x: PAGE_W - MARGIN, y: y - i * 14 }, thickness: 0.4, color: muted });
  }
  y -= 5 * 14 + 14;

  // RECAP
  page.drawRectangle({ x: MARGIN, y: y - 92, width: PAGE_W - MARGIN * 2, height: 92, borderColor: muted, borderWidth: 0.6 });
  page.drawText('RECAP — hours worked', { x: MARGIN + 8, y: y - 14, size: 8, font: bold, color: ink });
  const recap = [
    'A. Total hours on duty today (lines 3 + 4)',
    'B. Total hours on duty last 7 days including today',
    'C. Total hours available tomorrow (70 hr / 8 day)',
    'D. Total hours on duty last 8 days including today',
  ];
  recap.forEach((label, i) => {
    const ry = y - 32 - i * 15;
    page.drawText(label, { x: MARGIN + 8, y: ry, size: 7, font: regular, color: ink });
    page.drawLine({ start: { x: PAGE_W - MARGIN - 90, y: ry - 2 }, end: { x: PAGE_W - MARGIN - 12, y: ry - 2 }, thickness: 0.5, color: muted });
  });

  page.drawText(
    `${FORM_REVISION}  ·  Use only while your ELD is malfunctioning (49 CFR 395.34). SUPERDRIVE is not an electronic logging device.`,
    { x: MARGIN, y: 24, size: 6.5, font: regular, color: muted },
  );
}

/**
 * A blank sheet is the one surface allowed to fall back to BOOTSTRAP_CARRIER.
 * It carries no signature and no compliance weight, and a driver printing an
 * emergency packet on a device that has never hydrated is better served by
 * pre-printed addresses than by empty lines. Every path that produces a
 * *record* blocks instead — see carrierIdentity.ts.
 */
export async function renderDutyStatusGrid(options: {
  pages?: number;
  segmentsByPage?: DutyStatusSegment[][];
} = {}): Promise<Blob> {
  const pages = options.pages ?? 8;
  const carrier = (await readCachedCarrier()) ?? {
    legal_name: BOOTSTRAP_CARRIER.legal_name,
    usdot_number: BOOTSTRAP_CARRIER.usdot_number,
    mc_number: BOOTSTRAP_CARRIER.mc_number,
    main_office_address: BOOTSTRAP_CARRIER.main_office_address,
    home_terminal_address: BOOTSTRAP_CARRIER.home_terminal_address,
    home_terminal_timezone: BOOTSTRAP_CARRIER.home_terminal_timezone,
    fmcsa_division_state: BOOTSTRAP_CARRIER.fmcsa_division_state,
  };
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawSheet(page, regular, bold, options.segmentsByPage?.[i] ?? [], carrier);
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}