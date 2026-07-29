import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { CARRIER_LEGAL_NAME, CARRIER_MC, CARRIER_USDOT } from './constants';

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

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const GRID_X = MARGIN + 96;
const GRID_W = PAGE_W - MARGIN * 2 - 96 - 54; // leave a totals column
const ROW_H = 26;

const STATUS_LINES = ['1. Off duty', '2. Sleeper berth', '3. Driving', '4. On duty (not driving)'];

function drawSheet(page: PDFPage, regular: PDFFont, bold: PDFFont, segments: DutyStatusSegment[]) {
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.45, 0.45, 0.45);
  const gold = rgb(0.788, 0.659, 0.298);

  let y = PAGE_H - MARGIN;

  page.drawText("DRIVER'S DAILY LOG", { x: MARGIN, y: y - 12, size: 14, font: bold, color: ink });
  page.drawText('(one calendar day — 24 hours)', { x: MARGIN + 172, y: y - 12, size: 9, font: regular, color: muted });
  y -= 26;
  page.drawText(`${CARRIER_LEGAL_NAME}  ·  USDOT ${CARRIER_USDOT}  ·  MC ${CARRIER_MC}`, {
    x: MARGIN, y: y - 10, size: 9, font: regular, color: muted,
  });
  y -= 24;
  page.drawRectangle({ x: MARGIN, y, width: PAGE_W - MARGIN * 2, height: 1.5, color: gold });
  y -= 22;

  // Blank header fields — dates are intentionally left empty.
  const fields: Array<[string, number]> = [
    ['Date (mo/day/yr)', 150],
    ['Truck / tractor no.', 150],
    ['Trailer no.', 120],
    ['Total miles driving today', 150],
    ['Driver name (print)', 200],
    ['Co-driver name', 150],
    ['Home terminal address', 240],
  ];
  let fx = MARGIN;
  for (const [label, w] of fields) {
    if (fx + w > PAGE_W - MARGIN) { fx = MARGIN; y -= 30; }
    page.drawText(label, { x: fx, y, size: 7, font: regular, color: muted });
    page.drawLine({ start: { x: fx, y: y - 12 }, end: { x: fx + w - 10, y: y - 12 }, thickness: 0.6, color: muted });
    fx += w;
  }
  y -= 40;

  // Grid
  const gridTop = y;
  const gridBottom = gridTop - ROW_H * 4;
  const hourW = GRID_W / 24;

  // Hour labels
  for (let h = 0; h <= 24; h += 1) {
    const x = GRID_X + hourW * h;
    const label = h === 0 || h === 24 ? 'M' : h === 12 ? 'N' : String(h % 12 === 0 ? 12 : h % 12);
    page.drawText(label, { x: x - 2.5, y: gridTop + 6, size: 6, font: regular, color: muted });
    page.drawLine({
      start: { x, y: gridTop }, end: { x, y: gridBottom },
      thickness: h % 6 === 0 ? 0.9 : 0.4,
      color: h % 6 === 0 ? ink : muted,
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
      page.drawText(STATUS_LINES[i], { x: MARGIN, y: ly - ROW_H / 2 - 3, size: 8, font: regular, color: ink });
    }
  }
  // Totals column
  page.drawLine({ start: { x: GRID_X + GRID_W, y: gridTop }, end: { x: GRID_X + GRID_W, y: gridBottom }, thickness: 0.9, color: ink });
  page.drawText('Total hours', { x: GRID_X + GRID_W + 4, y: gridTop + 6, size: 6, font: regular, color: muted });

  // Optional pre-filled duty lines (unused in Stage 1)
  for (const seg of segments) {
    const ly = gridTop - ROW_H * (seg.line - 1) - ROW_H / 2;
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

export async function renderDutyStatusGrid(options: {
  pages?: number;
  segmentsByPage?: DutyStatusSegment[][];
} = {}): Promise<Blob> {
  const pages = options.pages ?? 8;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawSheet(page, regular, bold, options.segmentsByPage?.[i] ?? []);
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}