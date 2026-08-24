import {
  BG_BROKER_TERMS_LAYER,
  BG_SPECIAL_INSTRUCTIONS_LAYER,
} from '@/test/fixtures/blueGraceRateCon';

/**
 * The Blue Grace tender as a whole page, not as isolated blocks.
 *
 * The block fixtures next door are enough to test one region in isolation, and
 * that is exactly why they could not catch an anchor resolving against the
 * wrong part of the document. Verification cuts its region from the printed
 * page: headings, the References table, the stop headings and the comment lines
 * all decide where a region starts and stops. So the end-to-end test needs the
 * page, with those structures in the order the layer emits them.
 *
 * The two damage artefacts (`¶` for `53' 102"`, the escaped `OS&D`) are carried
 * in from the block fixture unchanged — they are why the Special Instructions
 * capture falls back to the model while the terms paragraph is adopted from the
 * page, which is the outcome this document is here to pin.
 */

export const BG_LOAD_NUMBER = 'BG969676425';

export function blueGracePageText(opts: { revised?: boolean } = {}): string {
  const lines: string[] = [
    'BlueGrace Logistics',
    opts.revised ? 'REVISED RATE CONFIRMATION' : 'RATE CONFIRMATION',
    'Page 1 / 2',
    '',
    'Bill To:',
    'BlueGrace Logistics, 2846 S Falkenburg Rd, Riverview, FL 33578',
    '',
    ...BG_BROKER_TERMS_LAYER.split('\n'),
    '',
    'Comments',
    'Special Instructions',
    ...BG_SPECIAL_INSTRUCTIONS_LAYER.split('\n'),
    '',
    'References',
    `BOL                      ${BG_LOAD_NUMBER}`,
    'Mode                     TL',
    ...(opts.revised ? [] : ['Pickup Number            562117']),
    'Pickup Number            IX00286060',
    'PO Number                001000562117',
    ...(opts.revised ? [`PRO                      ${BG_LOAD_NUMBER}`] : []),
    '',
    'Stop 1 (pickup)',
    '06/18/2025 08:00AM - 06/18/2025 12:00PM',
    'CALAVO GROWERS',
    '1141 Cummings Rd',
    'Santa Paula, CA 93060',
    'Comments: PU# IX00286060',
    '',
    'Stop 2 (delivery)',
    opts.revised
      ? '06/21/2025 06:00AM - 06/21/2025 10:00AM'
      : '06/20/2025 06:00AM - 06/20/2025 10:00AM',
    'KROGER DISTRIBUTION CENTER',
    '2400 Vine St',
    'Cincinnati, OH 45214',
    'Comments: DEL# 001000562117',
    '',
  ];
  return lines.join('\n');
}

/** The shape `textLayerFor` returns, so the real region code reads real lines. */
export function blueGraceTextLayer(opts: { revised?: boolean } = {}) {
  const text = blueGracePageText(opts);
  const lineCount = text.split('\n').length;
  return {
    text,
    pageCount: 1,
    available: true,
    pageLineRanges: [{ page: 1, startLine: 0, endLine: lineCount - 1 }],
  };
}
