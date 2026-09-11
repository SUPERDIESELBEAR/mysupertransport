/**
 * THE DRIVER'S FUEL DETAIL, AS A DOCUMENT HE KEEPS.
 *
 * ONE ARITHMETIC, THREE SURFACES. This module receives `FuelDriverRow[]` —
 * already built by `buildDriverRows` in `./fuelDriverDetail`, off the same
 * `fuelBucketLines` assembler the management screen, the operator screen and
 * the settlement engine use. It computes NO money: it formats rows it was
 * handed and totals them with `summarizeDriverRows`, the same function both
 * screens call. If the PDF and a screen could ever print different figures,
 * that would be a defect, and the only way to introduce one here would be to
 * add arithmetic — so there is none.
 *
 * WHY NO EMAILING. Decided with the owner 2026-09-09: sending a driver his fuel
 * report is occasional and conversational — a few times a month, in reply to a
 * question. A send pipeline (recipient resolution, send log, bounce and
 * delivery handling) is work that then has to be maintained forever to serve a
 * handful of messages. The owner downloads the file and sends it himself; the
 * driver downloads his own. If it ever becomes weekly for a dozen drivers, THAT
 * is when emailing earns its place. Do not add it by reflex.
 *
 * WHAT IS DELIBERATELY ABSENT: any other driver, any average, comparison or
 * ranking; and any match status, unmatched reason, disagreement field or
 * reconciliation warning. The last group describes the quality of OUR records,
 * not his purchases — the operator screen already excludes them, and the PDF
 * must not reintroduce them by taking a different path. `FuelDriverRow`
 * carries `reconciliationOk`; this module never reads it.
 */
import jsPDF from 'jspdf';
import { formatCurrency } from '@/lib/loadFormat';
import { formatFuelDate } from './fuelBuckets';
import {
  NOT_YET_DEDUCTED_LABEL, summarizeDriverRows,
  type FuelDriverRow, type FuelDriverTotals,
} from './fuelDriverDetail';

export const FUEL_PDF_CARRIER = 'SUPERTRANSPORT';
export const FUEL_PDF_TITLE = 'Fuel Detail';
export const FUEL_PDF_EMPTY_MESSAGE = 'No fuel purchases are recorded on your fuel card for this period.';

export interface FuelPdfInput {
  driverName: string;
  unitNumber: string | null;
  rows: FuelDriverRow[];
  /** Injected so the document is deterministic under test. */
  generatedAt: Date;
  /**
   * Whether the discount is passed through to THIS driver. When it is not, the
   * document says nothing about a discount at all — no column, no total line —
   * because a driver who does not receive it must not learn from his own
   * paperwork that it exists. Defaults to true so an unsaid caller cannot
   * silently hide money a driver IS receiving.
   */
  showDiscount?: boolean;
}

export interface FuelPdfTotalsBlock {
  title: string;
  note: string;
  countLabel: string;
  amount: string;
  breakdown: { label: string; value: string }[];
}

export interface FuelPdfDocument {
  carrier: string;
  title: string;
  driverLine: string;
  periodLine: string;
  generatedLine: string;
  columns: string[];
  /** Column widths for exactly the columns above, in points. */
  widths: number[];
  /** Formatted cells, in the SAME order the screens show. */
  rows: string[][];
  /** Parallel to `rows`: true where the purchase has not been deducted. */
  pendingFlags: boolean[];
  settled: FuelPdfTotalsBlock;
  pending: FuelPdfTotalsBlock;
  emptyMessage: string | null;
  filename: string;
}

export const FUEL_PDF_COLUMNS = [
  'Date', 'Merchant', 'Location', 'Fuel', 'Cash advance', 'Repairs', 'Other',
  'Total', 'Discount', 'After discount', 'Gallons', '$/gal', 'Deducted on',
];

/**
 * THE TOTAL IS THE GROSS, IN BOTH STATES — decided with the owner 2026-09-11.
 *
 * The gross is what is DEDUCTED from the driver's pay, it is what the four
 * bucket columns already sum to (they are built from it), and — the owner
 * having established that pump receipts carry no discount, which is applied
 * only when the purchase clears the MultiService account — it is what his own
 * receipt says. The net matches nothing he holds.
 *
 * So there is no branch over which total to print. When the discount IS his,
 * two further columns follow it: the discount itself and what the card was
 * charged after it, so the reduction explains its own difference. When it is
 * not his, both columns are dropped whole and the gross stands alone.
 */
const DISCOUNT_COLUMNS = ['Discount', 'After discount']
  .map((c) => FUEL_PDF_COLUMNS.indexOf(c));

const money = (n: number) => (n ? formatCurrency(n) : '—');

function totalsBlock(
  title: string, note: string, totals: FuelDriverTotals, showDiscount: boolean,
): FuelPdfTotalsBlock {
  return {
    title,
    note,
    countLabel: `${totals.count} purchase${totals.count === 1 ? '' : 's'}`,
    amount: formatCurrency(totals.grossTotal),
    breakdown: [
      { label: 'Fuel', value: money(totals.fuel) },
      { label: 'Cash advance', value: money(totals.cashAdvance) },
      { label: 'Repairs', value: money(totals.repair) },
      { label: 'Other', value: money(totals.other) },
      ...(showDiscount
        ? [
          { label: 'Discount', value: money(totals.discount) },
          { label: 'After discount', value: money(totals.total) },
        ]
        : []),
      { label: 'Gallons', value: totals.gallons ? String(totals.gallons) : '—' },
    ],
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'driver';
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The oldest and newest purchase on the document, ascending. */
export function coveredRange(rows: FuelDriverRow[]): { first: string; last: string } | null {
  if (rows.length === 0) return null;
  const dates = rows.map((r) => r.invoiceDate).sort();
  return { first: dates[0], last: dates[dates.length - 1] };
}

/**
 * The whole document as data. Rendering reads this and adds nothing to it, so
 * every figure in the file can be asserted without opening a PDF.
 */
export function buildFuelPdfDocument(input: FuelPdfInput): FuelPdfDocument {
  const { driverName, unitNumber, rows, generatedAt } = input;
  const showDiscount = input.showDiscount !== false;
  const summary = summarizeDriverRows(rows);
  const range = coveredRange(rows);
  // Dropping the discount columns widens the merchant name rather than leaving
  // a gap, so the table still fills the page it is printed on.
  const dropped = DISCOUNT_COLUMNS.reduce((sum, i) => sum + TABLE_LAYOUT.widths[i], 0);
  const widths = showDiscount
    ? TABLE_LAYOUT.widths
    : TABLE_LAYOUT.widths
      .map((w, i) => (i === 1 ? w + dropped : w))
      .filter((_, i) => !DISCOUNT_COLUMNS.includes(i));
  const drop = <T,>(arr: T[]) => (
    showDiscount ? arr : arr.filter((_, i) => !DISCOUNT_COLUMNS.includes(i))
  );

  return {
    carrier: FUEL_PDF_CARRIER,
    title: FUEL_PDF_TITLE,
    driverLine: unitNumber ? `${driverName} · Unit ${unitNumber}` : driverName,
    periodLine: range
      ? `Purchases ${formatFuelDate(range.first)} – ${formatFuelDate(range.last)}`
      : 'No purchases in this period',
    generatedLine: `Generated ${formatFuelDate(isoDay(generatedAt))}`,
    columns: drop(FUEL_PDF_COLUMNS),
    widths,
    rows: rows.map((r) => drop([
      r.dateLabel,
      r.merchantName ?? '—',
      r.location ?? '—',
      money(r.fuel),
      money(r.cashAdvance),
      money(r.repair),
      money(r.other),
      formatCurrency(r.grossTotal),
      money(r.discount),
      formatCurrency(r.total),
      r.gallons ? String(r.gallons) : '—',
      r.costPerGallon ? `$${r.costPerGallon.toFixed(3)}` : '—',
      // Pending says so in words, exactly as the screens say it. There is no
      // blank cell a reader could take for "already deducted".
      r.deducted ? r.periodLabel : NOT_YET_DEDUCTED_LABEL,
    ])),
    pendingFlags: rows.map((r) => !r.deducted),
    settled: totalsBlock(
      'Taken out of your settlements',
      'Already deducted from a check.',
      summary.settled,
      showDiscount,
    ),
    pending: totalsBlock(
      NOT_YET_DEDUCTED_LABEL,
      'Bought, but not taken out of any check yet.',
      summary.pending,
      showDiscount,
    ),
    emptyMessage: rows.length === 0 ? FUEL_PDF_EMPTY_MESSAGE : null,
    filename: range
      ? `fuel-${slug(driverName)}-${range.first}-to-${range.last}.pdf`
      : `fuel-${slug(driverName)}-no-purchases-${isoDay(generatedAt)}.pdf`,
  };
}

// ---------------------------------------------------------------------------
// Rendering. Presentation only — it reads the document above and prints it.
// ---------------------------------------------------------------------------

const GOLD: [number, number, number] = [201, 168, 76];
const INK: [number, number, number] = [13, 13, 13];
const MUTED: [number, number, number] = [110, 110, 110];
const PENDING_BG: [number, number, number] = [253, 243, 219];
const MARGIN = 32;
/** Column widths in points, summing to the printable width of letter landscape. */
const WIDTHS = [50, 104, 74, 44, 56, 40, 38, 46, 50, 36, 36, 154];
/** Letter landscape, minus both margins. The widths must not exceed it. */
const PRINTABLE = 792 - MARGIN * 2;
const ROW_HEIGHT = 18;
/**
 * Exported so a test can hold the invariant that no column is pushed off the
 * page: a clipped settlement period or merchant is a document that says
 * something other than what the screen says.
 */
export const TABLE_LAYOUT = { widths: WIDTHS, printable: PRINTABLE };

function drawTotals(doc: jsPDF, block: FuelPdfTotalsBlock, x: number, y: number, w: number, pending: boolean) {
  const h = 74;
  if (pending) {
    doc.setFillColor(...PENDING_BG);
    doc.rect(x, y, w, h, 'F');
  }
  doc.setDrawColor(pending ? 201 : 225, pending ? 168 : 225, pending ? 76 : 225);
  doc.rect(x, y, w, h);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(block.title, x + 8, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(block.amount, x + 8, y + 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${block.countLabel} · ${block.note}`, x + 8, y + 46);

  doc.setTextColor(...INK);
  doc.setFontSize(8);
  block.breakdown.forEach((b, i) => {
    const col = i % 3;
    const rowY = y + 58 + Math.floor(i / 3) * 11;
    doc.text(`${b.label}: ${b.value}`, x + 8 + col * (w - 16) / 3, rowY);
  });
}

export function renderFuelPdf(model: FuelPdfDocument): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageWidth, 5, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(model.carrier, MARGIN, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(model.title, pageWidth - MARGIN, 30, { align: 'right' });

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(model.driverLine, MARGIN, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${model.periodLine} · ${model.generatedLine}`, MARGIN, 66);

  const half = (contentWidth - 12) / 2;
  drawTotals(doc, model.settled, MARGIN, 78, half, false);
  drawTotals(doc, model.pending, MARGIN + half + 12, 78, half, true);

  let y = 176;
  const header = () => {
    doc.setFillColor(246, 244, 238);
    doc.rect(MARGIN, y - 12, contentWidth, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    let x = MARGIN + 4;
    model.columns.forEach((c, i) => { doc.text(c, x, y); x += model.widths[i]; });
    y += 14;
  };

  if (model.emptyMessage) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(model.emptyMessage, MARGIN, y);
    return doc;
  }

  header();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  model.rows.forEach((cells, ri) => {
    if (y > pageHeight - MARGIN - 20) {
      doc.addPage();
      // A later page can be read on its own; it must still say whose it is.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(`${model.driverLine} · continued`, MARGIN, MARGIN + 4);
      y = MARGIN + 32;
      header();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    if (model.pendingFlags[ri]) {
      doc.setFillColor(...PENDING_BG);
      doc.rect(MARGIN, y - 9, contentWidth, ROW_HEIGHT - 2, 'F');
    }
    doc.setTextColor(...INK);
    let x = MARGIN + 4;
    cells.forEach((cell, ci) => {
      // The settlement label is the one long cell; it wraps rather than being
      // silently cut off at the page edge — a truncated period on a document a
      // driver keeps is exactly the ambiguity this report exists to remove.
      const last = ci === cells.length - 1;
      doc.setFontSize(last ? 7 : 8);
      const lines = doc.splitTextToSize(cell, model.widths[ci] - 6) as string[];
      if (last) {
        lines.slice(0, 2).forEach((l, li) => doc.text(l, x, y + li * 8));
      } else {
        // Anything too wide is ellipsised, never silently shortened into
        // something that reads like a different merchant.
        doc.text(lines.length > 1 ? `${(lines[0] ?? '').trimEnd()}…` : (lines[0] ?? ''), x, y);
      }
      x += model.widths[ci];
    });
    doc.setFontSize(8);
    doc.setDrawColor(238);
    doc.line(MARGIN, y + 8, pageWidth - MARGIN, y + 8);
    y += ROW_HEIGHT;
  });

  return doc;
}

/** Build, render and save. The only entry point either screen calls. */
export function downloadFuelPdf(input: FuelPdfInput): FuelPdfDocument {
  const model = buildFuelPdfDocument(input);
  renderFuelPdf(model).save(model.filename);
  return model;
}
