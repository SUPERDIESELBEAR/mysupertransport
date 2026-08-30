/**
 * Renders an ApplicationDocument to a real, text-selectable PDF.
 *
 * Not a screenshot and not an HTML print: every glyph is drawn as text, so the
 * result is searchable, copyable, and survives being re-read by an auditor's
 * software years from now.
 *
 * Layout rules that exist for a reason:
 *  - Letter, 0.75in margins, repeating footer with "Page N of M".
 *  - A section heading never lands as the last thing on a page.
 *  - A question and its answer never split across a page break — a printed
 *    "Yes" whose question is on the previous sheet is a compliance hazard.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';
import type { ApplicationDocument, DocBlock } from './documentModel.ts';
import { type CompanyIdentity, identityRegistrationLine } from './identity.ts';
import { companyLogoBytes, COMPANY_LOGO_ASPECT } from './logo.ts';

const PAGE_W = 612; // 8.5in
const PAGE_H = 792; // 11in
const MARGIN_X = 54; // 0.75in
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 60;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.36, 0.36, 0.36);
const RULE = rgb(0.78, 0.78, 0.78);
const GOLD = rgb(0.788, 0.659, 0.298); // #C9A84C

/**
 * The standard PDF fonts speak WinAnsi, not Unicode. Typographic characters
 * that arrive from the copy module (curly quotes, em dashes, the middot) have
 * WinAnsi equivalents; anything else would throw mid-render, so it is folded
 * down rather than allowed to abort a document.
 */
export function toWinAnsi(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    // Em dash, en dash and bullet all exist in WinAnsi, so they survive intact.
    .replace(/[^\x20-\x7E\u00A1-\u00FF\u2013\u2014\u2022]/g, '');
}

interface Ctx {
  doc: PDFDocument;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = toWinAnsi(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single token longer than the column (a URL, a long ID) is hard-split
    // rather than allowed to bleed past the margin.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(ctx.page);
  ctx.y = PAGE_H - MARGIN_TOP;
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN_BOTTOM) newPage(ctx);
}

function drawLines(
  ctx: Ctx,
  lines: string[],
  opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; leading?: number; x?: number },
) {
  const leading = opts.leading ?? opts.size * 1.4;
  for (const line of lines) {
    ensure(ctx, leading);
    ctx.page.drawText(line, {
      x: opts.x ?? MARGIN_X,
      y: ctx.y - opts.size,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? INK,
    });
    ctx.y -= leading;
  }
}

/** Height a run of text will occupy — used to keep related lines together. */
function measure(lines: string[], size: number, leading?: number): number {
  return lines.length * (leading ?? size * 1.4);
}

function drawLetterhead(
  ctx: Ctx,
  identity: CompanyIdentity,
  title: string,
  subtitle: string,
  logoImage: { width: number; height: number } | null,
  logoRef: unknown,
) {
  const logoH = 46;
  const logoW = logoH * COMPANY_LOGO_ASPECT;
  if (logoRef && logoImage) {
    ctx.page.drawImage(logoRef as never, {
      x: MARGIN_X,
      y: ctx.y - logoH,
      width: logoW,
      height: logoH,
    });
  }

  const textX = MARGIN_X + (logoRef ? logoW + 14 : 0);
  let ty = ctx.y - 10;
  ctx.page.drawText(toWinAnsi(identity.legalName), {
    x: textX, y: ty - 11, size: 12.5, font: ctx.bold, color: INK,
  });
  ty -= 17;
  ctx.page.drawText(toWinAnsi(identity.locality), {
    x: textX, y: ty - 9, size: 9.5, font: ctx.regular, color: MUTED,
  });
  ty -= 13;
  ctx.page.drawText(toWinAnsi(identityRegistrationLine(identity)), {
    x: textX, y: ty - 9, size: 9.5, font: ctx.regular, color: MUTED,
  });

  ctx.y -= logoH + 10;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_W - MARGIN_X, y: ctx.y },
    thickness: 1.5,
    color: GOLD,
  });
  ctx.y -= 22;

  drawLines(ctx, wrap(title, ctx.bold, 16, CONTENT_W), { font: ctx.bold, size: 16, leading: 20 });
  if (subtitle) {
    drawLines(ctx, wrap(subtitle, ctx.regular, 10, CONTENT_W), {
      font: ctx.regular, size: 10, color: MUTED, leading: 14,
    });
  }
  ctx.y -= 10;
}

function drawSectionHeading(ctx: Ctx, title: string) {
  // Reserve the heading plus one line of whatever follows, so a heading is
  // never orphaned at the foot of a page.
  ensure(ctx, 46);
  ctx.y -= 6;
  ctx.page.drawRectangle({
    x: MARGIN_X, y: ctx.y - 17, width: CONTENT_W, height: 20, color: rgb(0.96, 0.96, 0.96),
  });
  ctx.page.drawRectangle({
    x: MARGIN_X, y: ctx.y - 17, width: 3, height: 20, color: GOLD,
  });
  ctx.page.drawText(toWinAnsi(title.toUpperCase()), {
    x: MARGIN_X + 10, y: ctx.y - 12, size: 9.5, font: ctx.bold, color: INK,
  });
  ctx.y -= 30;
}

function drawBlock(ctx: Ctx, block: DocBlock, signatureRef: unknown, sigDims: { width: number; height: number } | null) {
  switch (block.kind) {
    case 'paragraph': {
      const lines = wrap(block.text, ctx.regular, 9.5, CONTENT_W);
      drawLines(ctx, lines, { font: ctx.regular, size: 9.5, leading: 13.5 });
      ctx.y -= 6;
      break;
    }
    case 'notice': {
      const lines = wrap(block.text, ctx.italic, 9, CONTENT_W - 20);
      const h = measure(lines, 9, 13) + 16;
      ensure(ctx, h);
      ctx.page.drawRectangle({
        x: MARGIN_X, y: ctx.y - h + 6, width: CONTENT_W, height: h,
        color: rgb(0.98, 0.96, 0.90), borderColor: rgb(0.90, 0.85, 0.70), borderWidth: 0.7,
      });
      ctx.y -= 8;
      drawLines(ctx, lines, { font: ctx.italic, size: 9, leading: 13, x: MARGIN_X + 10 });
      ctx.y -= 12;
      break;
    }
    case 'subheading': {
      ensure(ctx, 30);
      ctx.y -= 4;
      drawLines(ctx, wrap(block.text, ctx.bold, 10.5, CONTENT_W), {
        font: ctx.bold, size: 10.5, leading: 15,
      });
      ctx.y -= 2;
      break;
    }
    case 'field': {
      const labelLines = wrap(block.label, ctx.regular, 8, CONTENT_W);
      const valueLines = wrap(block.value, ctx.bold, 10, CONTENT_W);
      ensure(ctx, measure(labelLines, 8, 11) + measure(valueLines, 10, 13.5) + 8);
      drawLines(ctx, labelLines, { font: ctx.regular, size: 8, color: MUTED, leading: 11 });
      drawLines(ctx, valueLines, { font: ctx.bold, size: 10, leading: 13.5 });
      ctx.y -= 5;
      break;
    }
    case 'qa': {
      const qLines = wrap(block.question, ctx.regular, 9.5, CONTENT_W);
      const aLines = wrap(block.answer, ctx.bold, 10, CONTENT_W);
      // Question + answer are atomic.
      ensure(ctx, measure(qLines, 9.5, 13) + measure(aLines, 10, 13.5) + 12);
      drawLines(ctx, qLines, { font: ctx.regular, size: 9.5, leading: 13 });
      ctx.y -= 2;
      drawLines(ctx, aLines, { font: ctx.bold, size: 10, leading: 13.5, x: MARGIN_X + 12 });
      ctx.y -= 8;
      break;
    }
    case 'record': {
      const rows = block.fields.map((f) => ({
        label: f.label,
        lines: wrap(f.value, ctx.regular, 9.5, CONTENT_W - 170),
      }));
      const h = 20 + rows.reduce((sum, r) => sum + Math.max(13, measure(r.lines, 9.5, 13)), 0) + 12;
      // Whole employer record on one page when it can fit on one at all.
      if (h < PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) ensure(ctx, h);
      const top = ctx.y;
      ctx.page.drawText(toWinAnsi(block.title), {
        x: MARGIN_X + 8, y: top - 12, size: 9, font: ctx.bold, color: INK,
      });
      ctx.y -= 22;
      for (const row of rows) {
        const rowH = Math.max(13, measure(row.lines, 9.5, 13));
        ensure(ctx, rowH);
        ctx.page.drawText(toWinAnsi(row.label), {
          x: MARGIN_X + 8, y: ctx.y - 9, size: 8.5, font: ctx.regular, color: MUTED,
        });
        drawLines(ctx, row.lines, { font: ctx.regular, size: 9.5, leading: 13, x: MARGIN_X + 170 });
      }
      ctx.y -= 8;
      ctx.page.drawLine({
        start: { x: MARGIN_X, y: ctx.y },
        end: { x: PAGE_W - MARGIN_X, y: ctx.y },
        thickness: 0.5,
        color: RULE,
      });
      ctx.y -= 10;
      break;
    }
    case 'signature': {
      const blockH = sigDims ? 92 : 74;
      ensure(ctx, blockH);
      ctx.y -= 10;
      const baselineY = ctx.y - (sigDims ? 52 : 34);
      if (signatureRef && sigDims) {
        const maxW = 200;
        const maxH = 44;
        const scale = Math.min(maxW / sigDims.width, maxH / sigDims.height, 1);
        ctx.page.drawImage(signatureRef as never, {
          x: MARGIN_X,
          y: baselineY + 6,
          width: sigDims.width * scale,
          height: sigDims.height * scale,
        });
      }
      const colW = (CONTENT_W - 40) / 3;
      const cols: [string, string][] = [
        ['Applicant Signature', ''],
        ['Printed Name', block.printedName],
        ['Date', block.date],
      ];
      cols.forEach(([caption, value], i) => {
        const x = MARGIN_X + i * (colW + 20);
        if (value) {
          ctx.page.drawText(toWinAnsi(value), {
            x, y: baselineY + 6, size: 10, font: ctx.bold, color: INK,
          });
        }
        ctx.page.drawLine({
          start: { x, y: baselineY }, end: { x: x + colW, y: baselineY }, thickness: 0.8, color: INK,
        });
        ctx.page.drawText(toWinAnsi(caption), {
          x, y: baselineY - 11, size: 8, font: ctx.regular, color: MUTED,
        });
      });
      ctx.y = baselineY - 24;
      break;
    }
  }
}

function drawFooters(ctx: Ctx, identity: CompanyIdentity, applicantName: string, generatedAt: Date) {
  const total = ctx.pages.length;
  const left = toWinAnsi(`${identity.legalName} · ${identity.locality} · ${identityRegistrationLine(identity)}`);
  const mid = toWinAnsi(
    `${applicantName} · Generated ${generatedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  );
  ctx.pages.forEach((page, i) => {
    page.drawLine({
      start: { x: MARGIN_X, y: MARGIN_BOTTOM - 16 },
      end: { x: PAGE_W - MARGIN_X, y: MARGIN_BOTTOM - 16 },
      thickness: 0.5,
      color: RULE,
    });
    page.drawText(left, { x: MARGIN_X, y: MARGIN_BOTTOM - 28, size: 7.5, font: ctx.regular, color: MUTED });
    page.drawText(mid, { x: MARGIN_X, y: MARGIN_BOTTOM - 38, size: 7.5, font: ctx.regular, color: MUTED });
    const pageLabel = `Page ${i + 1} of ${total}`;
    const w = ctx.regular.widthOfTextAtSize(pageLabel, 7.5);
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN_X - w, y: MARGIN_BOTTOM - 28, size: 7.5, font: ctx.regular, color: MUTED,
    });
  });
}

export interface RenderOptions {
  identity: CompanyIdentity;
  /** PNG or JPEG bytes of the applicant's drawn signature, when available. */
  signatureBytes?: Uint8Array | null;
  signatureMime?: string | null;
  generatedAt?: Date;
}

export async function renderApplicationPdf(
  model: ApplicationDocument,
  opts: RenderOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} — ${model.applicantName}`);
  doc.setAuthor(opts.identity.legalName);
  doc.setSubject('FMCSA 49 CFR 391.21 Driver Application for Employment');
  doc.setProducer('SUPERDRIVE');

  const ctx: Ctx = {
    doc,
    pages: [],
    page: null as unknown as PDFPage,
    y: 0,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  newPage(ctx);

  let logoRef: unknown = null;
  try {
    logoRef = await doc.embedPng(companyLogoBytes());
  } catch {
    logoRef = null; // Letterhead degrades to the text block; it never blocks the document.
  }

  let signatureRef: unknown = null;
  let sigDims: { width: number; height: number } | null = null;
  if (opts.signatureBytes && opts.signatureBytes.byteLength > 0) {
    try {
      const img = (opts.signatureMime || '').includes('jpeg') || (opts.signatureMime || '').includes('jpg')
        ? await doc.embedJpg(opts.signatureBytes)
        : await doc.embedPng(opts.signatureBytes);
      signatureRef = img;
      sigDims = { width: (img as { width: number }).width, height: (img as { height: number }).height };
    } catch {
      signatureRef = null;
      sigDims = null;
    }
  }

  drawLetterhead(
    ctx,
    opts.identity,
    model.title,
    `Applicant: ${model.applicantName}`,
    logoRef ? { width: 300, height: 207 } : null,
    logoRef,
  );

  for (const section of model.sections) {
    drawSectionHeading(ctx, section.title);
    for (const block of section.blocks) {
      drawBlock(ctx, block, signatureRef, sigDims);
    }
    ctx.y -= 6;
  }

  drawFooters(ctx, opts.identity, model.applicantName, opts.generatedAt ?? new Date());
  return await doc.save();
}
