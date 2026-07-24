import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { DEVICE_CONFIG_LABELS } from '@/components/equipment/equipmentUtils';

const GOLD: [number, number, number] = [201, 168, 76];
const INK: [number, number, number] = [13, 13, 13];
const MUTED: [number, number, number] = [110, 110, 110];
const MARGIN = 48;
const LINE = 14;

export interface ReturnedItem {
  deviceType: string;         // 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card' | ...
  serialNumber: string;
  assignedAt?: string | null;
  returnedAt: string;
  returnCondition?: string | null;
  notes?: string | null;
  shippingCarrier?: string | null;
  trackingNumber?: string | null;
  shipDate?: string | null;
  assignedByName?: string | null;
}

export interface ReturnReceiptInput {
  operatorName: string;
  items: ReturnedItem[];
  generatedBy?: string | null;
  title?: string;
}

const CONDITION_LABEL: Record<string, string> = {
  available: 'Returned in good condition',
  damaged: 'Damaged / Needs repair',
  lost: 'Lost / Not returned',
};

function fmtDate(d?: string | null, withTime = false): string {
  if (!d) return '—';
  try {
    const iso = d.length === 10 ? `${d}T12:00:00` : d;
    return format(parseISO(iso), withTime ? 'MMM d, yyyy · h:mm a' : 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function deviceLabel(key: string): string {
  return (DEVICE_CONFIG_LABELS as Record<string, string>)[key] ?? key;
}

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageWidth, 6, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SUPERTRANSPORT', MARGIN, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Equipment Return Receipt', pageWidth - MARGIN, 34, { align: 'right' });
  doc.setDrawColor(230);
  doc.line(MARGIN, 44, pageWidth - MARGIN, 44);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, 66);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, MARGIN, 82);
}

function drawItem(doc: jsPDF, item: ReturnedItem, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = startY;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  ensure(70);
  // Card box
  const boxTop = y;
  doc.setDrawColor(220);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(MARGIN, boxTop, contentWidth, 0.1, 4, 4, 'S'); // placeholder; redrawn below

  // Title row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(deviceLabel(item.deviceType), MARGIN + 12, y + 18);

  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text(`Serial: ${item.serialNumber || '—'}`, MARGIN + 12, y + 34);

  const condition = item.returnCondition
    ? (CONDITION_LABEL[item.returnCondition] ?? item.returnCondition)
    : 'Return recorded';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const condColor: [number, number, number] =
    item.returnCondition === 'damaged' ? [180, 120, 20] :
    item.returnCondition === 'lost' ? [180, 40, 40] :
    [40, 130, 70];
  doc.setTextColor(...condColor);
  doc.text(condition.toUpperCase(), pageWidth - MARGIN - 12, y + 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const rows: Array<[string, string]> = [
    ['Assigned', fmtDate(item.assignedAt)],
    ['Returned', fmtDate(item.returnedAt, true)],
    ['Assigned by', item.assignedByName || '—'],
  ];
  if (item.shippingCarrier || item.trackingNumber) {
    rows.push([
      'Shipment',
      [item.shippingCarrier, item.trackingNumber, fmtDate(item.shipDate)]
        .filter(Boolean).join(' · ') || '—',
    ]);
  }

  let ry = y + 50;
  for (const [k, v] of rows) {
    doc.setTextColor(...MUTED);
    doc.text(k, MARGIN + 12, ry);
    doc.setTextColor(...INK);
    doc.text(v, MARGIN + 110, ry);
    ry += LINE;
  }

  if (item.notes) {
    ensure(30);
    doc.setTextColor(...MUTED);
    doc.text('Notes', MARGIN + 12, ry);
    doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(item.notes, contentWidth - 130);
    doc.text(wrapped, MARGIN + 110, ry);
    ry += LINE * wrapped.length;
  }

  const boxBottom = ry + 10;
  doc.setDrawColor(220);
  doc.setFillColor(255, 255, 255);
  // Redraw the outer box now that height is known
  doc.roundedRect(MARGIN, boxTop, contentWidth, boxBottom - boxTop, 4, 4, 'S');

  return boxBottom + 12;
}

function drawFooter(doc: jsPDF, generatedBy?: string | null) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const stamp = `Generated ${format(new Date(), 'MMM d, yyyy · h:mm a')}${generatedBy ? ` by ${generatedBy}` : ''}`;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(stamp, MARGIN, pageHeight - 24);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 24, { align: 'right' });
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'operator';
}

/** Single returned item — one-page receipt. */
export function downloadReturnReceiptPdf(input: ReturnReceiptInput): void {
  if (input.items.length !== 1) {
    downloadOperatorReturnsPdf(input);
    return;
  }
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const item = input.items[0];
  drawHeader(
    doc,
    `${deviceLabel(item.deviceType)} — ${item.serialNumber}`,
    `Operator: ${input.operatorName}`,
  );
  drawItem(doc, item, 100);
  drawFooter(doc, input.generatedBy);
  const fname = `return-receipt_${slug(input.operatorName)}_${item.deviceType}_${slug(item.serialNumber)}.pdf`;
  doc.save(fname);
}

/** Consolidated receipt covering every returned item for the operator. */
export function downloadOperatorReturnsPdf(input: ReturnReceiptInput): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  drawHeader(
    doc,
    `Return Receipts — ${input.operatorName}`,
    `${input.items.length} returned item${input.items.length === 1 ? '' : 's'}`,
  );
  let y = 100;
  if (input.items.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No returned equipment on record for this operator.', MARGIN, y);
  } else {
    for (const item of input.items) {
      y = drawItem(doc, item, y);
    }
  }
  drawFooter(doc, input.generatedBy);
  doc.save(`return-receipts_${slug(input.operatorName)}.pdf`);
}

export interface BuiltReturnReceiptPdf {
  blob: Blob;
  blobUrl: string;
  filename: string;
}

function buildSingleItemPdf(input: ReturnReceiptInput): BuiltReturnReceiptPdf {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const item = input.items[0];
  drawHeader(
    doc,
    `${deviceLabel(item.deviceType)} — ${item.serialNumber}`,
    `Operator: ${input.operatorName}`,
  );
  drawItem(doc, item, 100);
  drawFooter(doc, input.generatedBy);
  const blob = doc.output('blob');
  return {
    blob,
    blobUrl: URL.createObjectURL(blob),
    filename: `return-receipt_${slug(input.operatorName)}_${item.deviceType}_${slug(item.serialNumber)}.pdf`,
  };
}

function buildConsolidatedPdf(input: ReturnReceiptInput): BuiltReturnReceiptPdf {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  drawHeader(
    doc,
    `Return Receipts — ${input.operatorName}`,
    `${input.items.length} returned item${input.items.length === 1 ? '' : 's'}`,
  );
  let y = 100;
  if (input.items.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No returned equipment on record for this operator.', MARGIN, y);
  } else {
    for (const item of input.items) {
      y = drawItem(doc, item, y);
    }
  }
  drawFooter(doc, input.generatedBy);
  const blob = doc.output('blob');
  return {
    blob,
    blobUrl: URL.createObjectURL(blob),
    filename: `return-receipts_${slug(input.operatorName)}.pdf`,
  };
}

/**
 * Build a return-receipt PDF as a blob URL for in-app preview.
 * Callers are responsible for revoking `blobUrl` when done.
 */
export function buildReturnReceiptPdf(input: ReturnReceiptInput): BuiltReturnReceiptPdf {
  return input.items.length === 1 ? buildSingleItemPdf(input) : buildConsolidatedPdf(input);
}
