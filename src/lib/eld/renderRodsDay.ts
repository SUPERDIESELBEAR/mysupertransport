/**
 * One certified day, rendered to a printable driver's daily log page.
 *
 * Client-side only. The grid geometry comes from rodsGridGeometry so this page
 * lines up exactly with the blank paper packet and the on-screen grid.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { CARRIER_LEGAL_NAME, CARRIER_MC, CARRIER_USDOT } from './constants';
import {
  GRID_W, GRID_X, MARGIN, PAGE_H, PAGE_W, ROW_H, STATUS_LINES,
  formatMinutes, hourLabel, hourWidth, isMajorHour, minuteToX, rowCenterOffset,
} from './rodsGridGeometry';
import { FORM_REVISION } from './renderDutyStatusGrid';
import { statusTotals } from './rodsValidation';
import { formatLogDate, type RodsDay, type RodsEvent } from './rodsTypes';
import { formatClock } from './rodsGridGeometry';

const FOOTER_CITATION =
  '79 FR 39342  ·  Kept under 49 CFR 395.8 while the driver\u2019s ELD is malfunctioning (49 CFR 395.34).';

function drawDay(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  day: RodsDay,
  events: RodsEvent[],
  driverName: string,
  originalCertifiedAt: string | null,
  signature: { image: unknown; width: number; height: number } | null,
) {
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.45, 0.45, 0.45);
  const gold = rgb(0.788, 0.659, 0.298);
  const red = rgb(0.753, 0.224, 0.169);

  let y = PAGE_H - MARGIN;
  page.drawText("DRIVER'S DAILY LOG", { x: MARGIN, y: y - 12, size: 14, font: bold, color: ink });
  page.drawText(formatLogDate(day.log_date), { x: MARGIN + 172, y: y - 12, size: 10, font: bold, color: ink });
  y -= 26;
  page.drawText(`${CARRIER_LEGAL_NAME}  ·  USDOT ${CARRIER_USDOT}  ·  MC ${CARRIER_MC}`, {
    x: MARGIN, y: y - 10, size: 9, font: regular, color: muted,
  });
  y -= 24;
  page.drawRectangle({ x: MARGIN, y, width: PAGE_W - MARGIN * 2, height: 1.5, color: gold });
  y -= 16;

  const annotations: string[] = [];
  if (day.is_reconstructed) annotations.push('RECONSTRUCTED — 49 CFR 395.34(a)(2)');
  if (day.supersedes_day_id) {
    annotations.push(
      originalCertifiedAt
        ? `AMENDED — original certified ${new Date(originalCertifiedAt).toLocaleString()}`
        : 'AMENDED',
    );
  }
  for (const note of annotations) {
    page.drawText(note, { x: MARGIN, y: y - 8, size: 8, font: bold, color: red });
    y -= 14;
  }
  y -= 8;

  const fields: Array<[string, string, number]> = [
    ['Date (mo/day/yr)', new Date(`${day.log_date}T12:00:00`).toLocaleDateString('en-US'), 150],
    ['Truck / tractor no.', day.truck_number ?? '', 150],
    ['Trailer no.', day.trailer_numbers ?? '', 120],
    ['Total miles driving today', day.total_miles_driving_today?.toString() ?? '', 150],
    ['Driver name (print)', driverName, 200],
    ['Co-driver name', day.co_driver_name ?? '', 150],
    ['Home terminal address', day.home_terminal_address ?? '', 240],
    ['From', day.from_location ?? '', 180],
    ['To', day.to_location ?? '', 180],
    ['Shipping document no.', day.shipping_document_no ?? '', 180],
  ];
  let fx = MARGIN;
  for (const [label, value, w] of fields) {
    if (fx + w > PAGE_W - MARGIN) { fx = MARGIN; y -= 30; }
    page.drawText(label, { x: fx, y, size: 7, font: regular, color: muted });
    page.drawText(value.slice(0, 44), { x: fx, y: y - 10, size: 8, font: regular, color: ink });
    page.drawLine({ start: { x: fx, y: y - 12 }, end: { x: fx + w - 10, y: y - 12 }, thickness: 0.6, color: muted });
    fx += w;
  }
  y -= 40;

  // ---- grid ----
  const gridTop = y;
  const gridBottom = gridTop - ROW_H * 4;
  const hourW = hourWidth();

  for (let h = 0; h <= 24; h += 1) {
    const x = GRID_X + hourW * h;
    page.drawText(hourLabel(h), { x: x - 2.5, y: gridTop + 6, size: 6, font: regular, color: muted });
    page.drawLine({
      start: { x, y: gridTop }, end: { x, y: gridBottom },
      thickness: isMajorHour(h) ? 0.9 : 0.4,
      color: isMajorHour(h) ? ink : muted,
    });
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
    if (i < 4) page.drawText(STATUS_LINES[i], { x: MARGIN, y: ly - ROW_H / 2 - 3, size: 8, font: regular, color: ink });
  }
  page.drawLine({ start: { x: GRID_X + GRID_W, y: gridTop }, end: { x: GRID_X + GRID_W, y: gridBottom }, thickness: 0.9, color: ink });
  page.drawText('Total hours', { x: GRID_X + GRID_W + 4, y: gridTop + 6, size: 6, font: regular, color: muted });

  // duty lines with vertical connectors
  const sorted = [...events].sort((a, b) => a.start_minute - b.start_minute);
  let prev: RodsEvent | null = null;
  for (const e of sorted) {
    const ly = gridTop - rowCenterOffset(e.duty_status);
    page.drawLine({
      start: { x: GRID_X + minuteToX(e.start_minute), y: ly },
      end: { x: GRID_X + minuteToX(e.end_minute), y: ly },
      thickness: 1.6,
      color: ink,
    });
    if (prev) {
      const py = gridTop - rowCenterOffset(prev.duty_status);
      page.drawLine({
        start: { x: GRID_X + minuteToX(e.start_minute), y: py },
        end: { x: GRID_X + minuteToX(e.start_minute), y: ly },
        thickness: 1.6,
        color: ink,
      });
    }
    prev = e;
  }

  const totals = statusTotals(sorted);
  const totalsByLine = [totals.off, totals.sleeper, totals.driving, totals.onDuty];
  totalsByLine.forEach((mins, i) => {
    page.drawText(formatMinutes(mins), {
      x: GRID_X + GRID_W + 8, y: gridTop - rowCenterOffset((i + 1) as 1 | 2 | 3 | 4) - 3,
      size: 7, font: bold, color: ink,
    });
  });

  // ---- remarks ----
  y = gridBottom - 22;
  page.drawText('REMARKS  (city/state of each change of duty status, shipping document numbers)', {
    x: MARGIN, y, size: 7, font: bold, color: ink,
  });
  y -= 12;
  const lines: string[] = sorted.map(
    (e) => `${formatClock(e.start_minute)} — ${STATUS_LINES[e.duty_status - 1].slice(3)} — ${e.city}, ${e.state}${e.remarks ? ` — ${e.remarks}` : ''}`,
  );
  for (const e of sorted.filter((s) => s.is_short_period)) {
    lines.push(
      `Short period: ${formatClock(e.start_minute)}–${formatClock(e.end_minute)} (${e.end_minute - e.start_minute} min) at ${e.city}, ${e.state}`,
    );
  }
  for (const line of lines.slice(0, 12)) {
    page.drawText(line.slice(0, 118), { x: MARGIN, y, size: 6.5, font: regular, color: ink });
    y -= 10;
  }
  y -= 6;

  // ---- RECAP ----
  page.drawRectangle({ x: MARGIN, y: y - 92, width: PAGE_W - MARGIN * 2, height: 92, borderColor: muted, borderWidth: 0.6 });
  page.drawText('RECAP — hours worked (entered by the driver)', { x: MARGIN + 8, y: y - 14, size: 8, font: bold, color: ink });
  const recap: Array<[string, string]> = [
    ['A. Total hours on duty today (lines 3 + 4)', day.recap_on_duty_today ?? ''],
    ['B. Total hours on duty last 7 days including today', day.recap_last_7_days ?? ''],
    ['C. Total hours available tomorrow (70 hr / 8 day)', day.recap_available_tomorrow ?? ''],
    ['D. Total hours on duty last 8 days including today', day.recap_last_8_days ?? ''],
  ];
  recap.forEach(([label, value], i) => {
    const ry = y - 32 - i * 15;
    page.drawText(label, { x: MARGIN + 8, y: ry, size: 7, font: regular, color: ink });
    page.drawText(value, { x: PAGE_W - MARGIN - 86, y: ry, size: 7, font: bold, color: ink });
    page.drawLine({ start: { x: PAGE_W - MARGIN - 90, y: ry - 2 }, end: { x: PAGE_W - MARGIN - 12, y: ry - 2 }, thickness: 0.5, color: muted });
  });
  y -= 104;

  // ---- certification ----
  page.drawText("Driver's certification of these records", { x: MARGIN, y, size: 8, font: bold, color: ink });
  y -= 12;
  page.drawText(
    'I certify that these entries are true and correct.',
    { x: MARGIN, y, size: 7, font: regular, color: ink },
  );
  if (signature?.image) {
    page.drawImage(signature.image as never, {
      x: MARGIN, y: y - 44, width: signature.width, height: signature.height,
    });
  }
  page.drawLine({ start: { x: MARGIN, y: y - 48 }, end: { x: MARGIN + 220, y: y - 48 }, thickness: 0.6, color: muted });
  page.drawText(day.certification_legal_name ?? driverName, { x: MARGIN, y: y - 58, size: 8, font: regular, color: ink });
  if (day.certified_at) {
    page.drawText(`Certified ${new Date(day.certified_at).toLocaleString()}`, {
      x: MARGIN + 240, y: y - 58, size: 7, font: regular, color: muted,
    });
  }

  page.drawText(`${FORM_REVISION}  ·  ${FOOTER_CITATION}`, {
    x: MARGIN, y: 24, size: 6, font: regular, color: muted,
  });
}

export async function renderRodsDay(options: {
  day: RodsDay;
  events: RodsEvent[];
  driverName: string;
  originalCertifiedAt?: string | null;
  /** PNG data URL of the certification signature. */
  signatureDataUrl?: string | null;
}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  let signature: { image: unknown; width: number; height: number } | null = null;
  if (options.signatureDataUrl?.startsWith('data:image/png')) {
    try {
      const png = await doc.embedPng(options.signatureDataUrl);
      const scaled = png.scaleToFit(200, 40);
      signature = { image: png, width: scaled.width, height: scaled.height };
    } catch {
      signature = null;
    }
  }

  drawDay(
    page, regular, bold,
    options.day, options.events, options.driverName,
    options.originalCertifiedAt ?? null,
    signature,
  );

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}