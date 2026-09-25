/**
 * Draws an InvoiceDocument onto one Letter page with pdf-lib. Every value
 * comes from the model; this file only places text. No logo, no footer.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';
import type { InvoiceDocument } from './model.ts';

const W = 612;
const H = 792;
const M = 48;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.33, 0.33, 0.33);
const RULE = rgb(0.75, 0.75, 0.75);
const SHADE = rgb(0.95, 0.95, 0.95);

const winAnsi = (s: string) =>
  s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

function fit(text: string, font: PDFFont, size: number, max: number): string {
  let t = winAnsi(text);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
  return t;
}

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${doc.meta[0][1]}`);
  pdf.setProducer('');
  pdf.setCreator('');
  const page: PDFPage = pdf.addPage([W, H]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const text = (t: string, x: number, y: number, size = 9, font = reg, color = INK, max = 260) =>
    page.drawText(fit(t, font, size, max), { x, y, size, font, color });
  const right = (t: string, xr: number, y: number, size = 9, font = reg) => {
    const s = winAnsi(t);
    page.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y, size, font, color: INK });
  };

  // Top left: remit-to header.
  let y = H - M;
  doc.remitHeader.forEach((line, i) => {
    text(line, M, y, i === 0 ? 13 : 9, i === 0 ? bold : reg, i === 0 ? INK : MUTED);
    y -= i === 0 ? 16 : 12;
  });

  // Top right: INVOICE + meta block.
  const metaX = 360;
  let my = H - M;
  text('INVOICE', metaX, my, 16, bold);
  my -= 20;
  for (const [k, v] of doc.meta) {
    text(k, metaX, my, 9, bold, MUTED, 90);
    right(v, W - M, my, 9);
    my -= 13;
  }

  // Bill to.
  y = Math.min(y, my) - 18;
  text('Bill to', M, y, 10, bold);
  y -= 14;
  for (const line of doc.billTo) { text(line, M, y); y -= 12; }

  // Stops.
  y -= 10;
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: RULE });
  y -= 10;
  for (const s of doc.stops) {
    text(s.label, M, y, 9, bold, INK, 70);
    text(s.facility, M + 75, y, 9, reg, INK, 180);
    text(s.place, M + 260, y, 9, reg, INK, 130);
    text(s.reference, M + 395, y, 9, reg, MUTED, 120);
    y -= 13;
  }

  // Charges table.
  y -= 14;
  const cols = { desc: M + 6, rate: 360, units: 420, uom: 470, amt: W - M - 6 };
  page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: SHADE });
  text('Description', cols.desc, y, 9, bold);
  right('Rate', cols.rate, y, 9, bold);
  right('Units', cols.units, y, 9, bold);
  text('UOM', cols.uom - 20, y, 9, bold);
  right('Amount', cols.amt, y, 9, bold);
  y -= 18;
  for (const c of doc.charges) {
    text(c.description, cols.desc, y, 9, reg, INK, 240);
    right(c.rate, cols.rate, y);
    right(c.units, cols.units, y);
    text(c.uom, cols.uom - 20, y, 9, reg, INK, 60);
    right(c.amount, cols.amt, y);
    y -= 14;
  }
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: RULE });
  y -= 10;
  text('Total Charges', 400, y, 10, bold);
  right(doc.totalCharges, cols.amt, y, 10, bold);
  y -= 16;
  text('BALANCE DUE', 400, y, 11, bold);
  right(doc.balanceDue, cols.amt, y, 11, bold);

  // Remit to.
  y -= 36;
  text('REMIT TO', M, y, 10, bold);
  y -= 14;
  for (const line of doc.remitTo) { text(line, M, y); y -= 12; }

  const bytes = await pdf.save();
  return { bytes, pageCount: pdf.getPageCount() };
}
