/**
 * Ingest ↔ manual verbatim equivalence — the permanent guard the user asked for.
 *
 * The email-ingest path runs `judgeParsedVerbatimServer` (Deno, pdfjs-extracted
 * layer) where the manual upload path runs `judgeParsedVerbatimWithLayer`
 * (browser, pdfjs-extracted layer). Both drivers sit over the SAME shared
 * verbatim primitives; this test proves the drivers themselves — field
 * selection, stop numbering, page placement, adoption replacement — produce
 * identical verdicts, origins, and stored values on the same document.
 *
 * The fixture is Blue Grace BG969676425: the Special Instructions capture is
 * damaged (`¶` for `53' 102"`, escaped `OS&D`) and must fall back to the model
 * while the broker-terms paragraph is adopted from the page — the exact split
 * where the two paths drifting apart would corrupt a stored load. The
 * Nationwide document (the 40%-dropped block) has no fixture in this repo;
 * when one lands, add it here alongside Blue Grace.
 */
import { describe, expect, it } from 'vitest';
import { judgeParsedVerbatimWithLayer } from '@/lib/verbatimCheck';
import { judgeParsedVerbatimServer } from '../../../supabase/functions/_shared/verbatimIngest';
import { blueGraceParse, blueGraceRevisedParse } from '@/test/fixtures/blueGraceParseResult';
import { blueGraceTextLayer } from '@/test/fixtures/blueGracePage';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';

/** The check fields that define what the load stores and why. */
function decisionProjection(checks: {
  field: string;
  verdict: string;
  valueOrigin: string;
  originReason: string;
  value: string;
  modelValue: string;
  page: number | null;
  parsedStopIndex: number | null;
  layerLengthRatio: number | null;
  truncationSignals: string[] | null;
  regionFailure: unknown;
}[]) {
  return checks.map(c => ({
    field: c.field,
    verdict: c.verdict,
    valueOrigin: c.valueOrigin,
    originReason: c.originReason,
    value: c.value,
    modelValue: c.modelValue,
    page: c.page,
    parsedStopIndex: c.parsedStopIndex,
    layerLengthRatio: c.layerLengthRatio,
    truncationSignals: c.truncationSignals,
    regionFailure: c.regionFailure,
  }));
}

function assertParity(parse: ParsedRateConfirmation, revised: boolean) {
  const layer = blueGraceTextLayer({ revised });
  const browser = judgeParsedVerbatimWithLayer(parse, layer);
  const server = judgeParsedVerbatimServer(parse, layer);

  // Same fields judged, in the same order.
  expect(server.checks.length).toBeGreaterThan(0);
  expect(server.checks.length).toBe(browser.checks.length);

  // Same verdicts, same origins, same stored values — the full decision.
  expect(decisionProjection(server.checks)).toEqual(decisionProjection(browser.checks));

  // Same adopted parse — the value the load will actually hold.
  expect(server.adopted).toEqual(browser.adopted);

  // The layer existed, so no_layer on every field is impossible here by
  // construction; pin that the two paths agree on layer availability too.
  expect(server.layerAvailable).toBe(true);

  return { browser, server };
}

describe('ingest ↔ manual verbatim equivalence', () => {
  it('produces identical checks and stored values for the Blue Grace tender', () => {
    const { browser } = assertParity(blueGraceParse(), false);

    // The split this document exists to pin: terms adopted from the page,
    // damaged Special Instructions kept from the model. If ingest returned
    // no_layer where the manual path adopts, this is where it shows.
    const terms = browser.checks.find(c => c.field === 'broker_terms_verbatim');
    const instructions = browser.checks.find(c => c.field === 'special_instructions_verbatim');
    expect(terms?.valueOrigin).toBe('text_layer');
    expect(instructions?.valueOrigin).toBe('model');
  });

  it('agrees on the revised tender as well', () => {
    assertParity(blueGraceRevisedParse(), true);
  });

  it('both paths report no_layer identically when the layer is absent', () => {
    const parse = blueGraceParse();
    const browser = judgeParsedVerbatimWithLayer(parse, null);
    const server = judgeParsedVerbatimServer(parse, null);

    expect(server.layerAvailable).toBe(false);
    expect(decisionProjection(server.checks)).toEqual(decisionProjection(browser.checks));
    expect(browser.checks.every(c => c.verdict === 'no_layer')).toBe(true);
    expect(server.adopted).toEqual(browser.adopted);
  });
});
