import { describe, expect, it } from 'vitest';
import { adoptVerbatim, truncationSignals } from '@/lib/verbatimAdopt';
import {
  BG_BROKER_TERMS_LAYER,
  BG_SPECIAL_INSTRUCTIONS_LAYER,
  BG_SPECIAL_INSTRUCTIONS_VERBATIM,
} from '@/test/fixtures/blueGraceRateCon';

/**
 * Source selection: the page's own text layer is the better source where it is
 * clean, and the worse source where it is not. Blue Grace is the counterexample
 * that has to keep passing — its Special Instructions block renders `53' 102"`
 * as a pilcrow, so adopting the layer there would store the exact corruption the
 * damage verdict exists to catch.
 */

const layerOf = (parts: string[]) => parts.join('\n');

const BG_LAYER = layerOf([
  'SPECIAL INSTRUCTIONS',
  BG_SPECIAL_INSTRUCTIONS_LAYER,
  'References',
  'BOL BG969676425',
  '',
  BG_BROKER_TERMS_LAYER,
  '',
  'Items',
]);

describe('Blue Grace — the layer is worse', () => {
  it('does NOT adopt the layer for the block the layer renders as a pilcrow', () => {
    const a = adoptVerbatim(
      'special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, BG_LAYER,
    );
    expect(a.origin).toBe('model');
    expect(a.reason).toBe('layer_damaged');
    expect(a.value).toBe(BG_SPECIAL_INSTRUCTIONS_VERBATIM);
    expect(a.value).not.toContain('¶');
  });

  it('adopts the layer for the terms paragraph, which the layer prints cleanly', () => {
    const a = adoptVerbatim('broker_terms_verbatim', BG_BROKER_TERMS_LAYER, BG_LAYER);
    expect(a.origin).toBe('text_layer');
    expect(a.reason).toBe('layer_clean');
    expect(a.value).toContain('TLInvoices@bluegracegroup.com');
  });

  it('recovers a phone number the model dropped, because the page still prints it', () => {
    // The observed paraphrase failure: the layer holds it, so the layer wins.
    const lossy = BG_SPECIAL_INSTRUCTIONS_VERBATIM.replace('(800) 697-4477 ', '');
    const clean = BG_LAYER.replace(/¶/g, "53' 102\"").replace(/&(?:amp;)+/g, '&');
    const a = adoptVerbatim('special_instructions_verbatim', lossy, clean);
    expect(a.origin).toBe('text_layer');
    expect(a.value).toContain('(800) 697-4477');
  });
});

describe('a region cut short never becomes the stored value', () => {
  const model = BG_BROKER_TERMS_LAYER;

  it('refuses a region missing its last two lines', () => {
    const short = BG_BROKER_TERMS_LAYER.split('\n').slice(0, -2).join('\n');
    const cut = layerOf([short, 'Items', 'Charge Details']);
    const a = adoptVerbatim('broker_terms_verbatim', model, cut);
    expect(a.origin).toBe('model');
    expect(a.reason).toBe('region_truncated');
    expect(a.truncationSignals).toContain('shorter_than_model');
    expect(a.truncationSignals).toContain('model_continues_past_region');
  });

  it('names a mid-sentence break on its own', () => {
    expect(truncationSignals('BGLF will reimburse Carrier for approved lumper costs, and', 'x'))
      .toContain('ends_mid_sentence');
  });

  it('is not fooled by a region that merely reflows whitespace', () => {
    const padded = BG_BROKER_TERMS_LAYER.split('\n').map(l => `   ${l}   `).join('\n');
    const a = adoptVerbatim('broker_terms_verbatim', model, layerOf([padded, 'Items']));
    expect(a.origin).toBe('text_layer');
    expect(a.truncationSignals).toBeNull();
  });
});

describe('fallbacks', () => {
  it('keeps the model when no anchor resolves', () => {
    const a = adoptVerbatim('special_instructions_verbatim', 'DO NOT STACK', 'RATE CONFIRMATION\nItems');
    expect(a.origin).toBe('model');
    expect(a.reason).toBe('region_unresolved');
  });

  it('keeps the model when there is no layer at all (a scanned tender)', () => {
    const a = adoptVerbatim('special_instructions_verbatim', 'DO NOT STACK', '');
    expect(a.reason).toBe('no_layer');
  });

  it('never overrules a hand repair', () => {
    const a = adoptVerbatim('broker_terms_verbatim', 'typed by a person', BG_LAYER, {
      source: 'manual_repair',
    });
    expect(a.origin).toBe('model');
    expect(a.reason).toBe('manual_repair');
    expect(a.value).toBe('typed by a person');
  });
});
