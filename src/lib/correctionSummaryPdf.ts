import jsPDF from 'jspdf';
import { formatValue, getFieldDef } from '@/lib/applicationCorrections';
import { diffEmployers } from '@/lib/applicationDiff';
import type { EmployerRecord } from '@/components/application/types';

export interface CorrectionFieldLite {
  field_path: string;
  field_label: string;
  old_value: unknown;
  new_value: unknown;
}

export interface CorrectionSummaryInput {
  applicantName: string;
  staffName: string | null;
  reason: string;
  courtesyMessage?: string | null;
  sentAt?: string | null;
  fields: CorrectionFieldLite[];
}

const PAGE_MARGIN = 48;
const LINE = 14;
const GOLD: [number, number, number] = [201, 168, 76];
const INK: [number, number, number] = [13, 13, 13];
const MUTED: [number, number, number] = [110, 110, 110];

function fmtEmp(e: EmployerRecord): string {
  const where = [e.city, e.state].filter(Boolean).join(', ');
  const dates = `${e.start_date || '?'} – ${e.end_date || '?'}`;
  return `${e.name || '(unnamed)'}${where ? ' · ' + where : ''} · ${e.position || ''} · ${dates}`;
}

/**
 * Build a printable PDF that mirrors the on-screen "Summary of changes" panel,
 * including section counts, per-field was/will-become diff lines, and a special
 * breakdown of the employer history changes. Triggers a browser download.
 */
export function downloadCorrectionSummaryPdf(input: CorrectionSummaryInput): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const writeWrapped = (text: string, fontSize: number, color: [number, number, number], bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text || '', contentWidth);
    for (const ln of lines) {
      ensureSpace(LINE);
      doc.text(ln, PAGE_MARGIN, y);
      y += LINE;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text('Proposed application corrections', PAGE_MARGIN, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const headerLine = `Applicant: ${input.applicantName || '—'}   ·   Prepared by: ${input.staffName || 'SUPERTRANSPORT staff'}`;
  doc.text(headerLine, PAGE_MARGIN, y);
  y += LINE;
  if (input.sentAt) {
    doc.text(`Sent: ${new Date(input.sentAt).toLocaleString()}`, PAGE_MARGIN, y);
    y += LINE;
  }
  y += 6;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
  y += 14;

  // Reason block
  writeWrapped('REASON FOR CHANGES', 9, GOLD, true);
  writeWrapped(input.reason || '(no reason provided)', 11, INK);
  if (input.courtesyMessage) {
    y += 4;
    writeWrapped('Note from staff', 9, MUTED, true);
    writeWrapped(input.courtesyMessage, 10, MUTED);
  }
  y += 8;

  // Section summary
  type Bucket = { count: number; details: string[] };
  const sections = new Map<string, Bucket>();
  for (const f of input.fields) {
    const section = getFieldDef(f.field_path)?.section || 'Other';
    const b = sections.get(section) || { count: 0, details: [] };
    if (f.field_path === 'employers') {
      const oldList = Array.isArray(f.old_value) ? (f.old_value as EmployerRecord[]) : [];
      const newList = Array.isArray(f.new_value) ? (f.new_value as EmployerRecord[]) : [];
      const rows = diffEmployers(oldList, newList);
      const added = rows.filter((r) => r.kind === 'added').length;
      const removed = rows.filter((r) => r.kind === 'removed').length;
      const edited = rows.filter((r) => r.kind === 'edited').length;
      b.count += added + removed + edited;
      const bits: string[] = [];
      if (added) bits.push(`${added} added`);
      if (edited) bits.push(`${edited} edited`);
      if (removed) bits.push(`${removed} removed`);
      if (bits.length) b.details.push(`Employment: ${bits.join(', ')}`);
    } else {
      b.count += 1;
      b.details.push(f.field_label);
    }
    sections.set(section, b);
  }
  const total = Array.from(sections.values()).reduce((s, v) => s + v.count, 0);

  writeWrapped('SUMMARY', 9, GOLD, true);
  writeWrapped(
    `${total} ${total === 1 ? 'field' : 'fields'} across ${sections.size} ${sections.size === 1 ? 'section' : 'sections'}`,
    11, INK, true,
  );
  y += 2;
  for (const [section, b] of sections.entries()) {
    writeWrapped(`• ${section} (${b.count}) — ${b.details.join(' · ')}`, 10, INK);
  }
  y += 10;

  // Detailed diff per section
  writeWrapped('DETAILED CHANGES', 9, GOLD, true);
  y += 2;

  const grouped = new Map<string, CorrectionFieldLite[]>();
  for (const f of input.fields) {
    const s = getFieldDef(f.field_path)?.section || 'Other';
    const arr = grouped.get(s) || [];
    arr.push(f);
    grouped.set(s, arr);
  }

  for (const [section, items] of grouped.entries()) {
    ensureSpace(LINE * 2);
    writeWrapped(section.toUpperCase(), 11, GOLD, true);
    for (const f of items) {
      if (f.field_path === 'employers') {
        const oldList = Array.isArray(f.old_value) ? (f.old_value as EmployerRecord[]) : [];
        const newList = Array.isArray(f.new_value) ? (f.new_value as EmployerRecord[]) : [];
        const rows = diffEmployers(oldList, newList);
        for (const r of rows) {
          if (r.kind === 'added' && r.next) {
            writeWrapped(`[ADDED] ${fmtEmp(r.next)}`, 10, INK);
          } else if (r.kind === 'removed' && r.old) {
            writeWrapped(`[REMOVED] ${fmtEmp(r.old)}`, 10, INK);
          } else if (r.kind === 'edited' && r.old && r.next) {
            writeWrapped(`[EDITED] ${r.next.name || '(unnamed)'}`, 10, INK, true);
            for (const cf of r.changedFields) {
              writeWrapped(
                `    ${String(cf)}: "${r.old?.[cf] ?? ''}" → "${r.next?.[cf] ?? ''}"`,
                9, MUTED,
              );
            }
          }
        }
      } else {
        const def = getFieldDef(f.field_path);
        writeWrapped(f.field_label, 10, INK, true);
        writeWrapped(`    Was: ${formatValue(f.old_value, def?.kind)}`, 9, MUTED);
        writeWrapped(`    Will become: ${formatValue(f.new_value, def?.kind)}`, 9, INK);
        y += 2;
      }
    }
    y += 6;
  }

  // Footer disclaimer on last page
  ensureSpace(LINE * 3);
  y += 6;
  doc.setDrawColor(...GOLD);
  doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
  y += 12;
  writeWrapped(
    'This document is a preview only. The corrections are not applied until you e-sign the approval form online.',
    9, MUTED,
  );

  const safeName = (input.applicantName || 'applicant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  doc.save(`proposed-corrections-${safeName || 'summary'}.pdf`);
}