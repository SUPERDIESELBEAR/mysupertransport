import { beforeEach, describe, expect, it } from 'vitest';
import {
  bestWindow, diceSimilarity, normalizeForVerbatim, verifyVerbatim,
} from '@/lib/verbatimVerify';
import {
  anchorMisses, clearAnchorMisses, resolveFieldRegion, stopSlices,
} from '@/lib/verbatimRegions';
import {
  classifyReferenceLabel, classifyReferences, referenceKey,
} from '@/lib/referenceClasses';
import { buildRevisionDiff, initialDecisions } from '@/lib/revisedRateCon';
import { loadFormDefaults, emptyStop, type LoadFormValues } from '@/pages/dispatch/loadFormSchema';
import type { Confidence, ParsedRateConfirmation, ParsedStop } from '@/lib/rateConfirmation';
import {
  BG_BROKER_TERMS_LAYER,
  BG_REFERENCES_ORIGINAL,
  BG_REFERENCES_REVISED,
  BG_SPECIAL_INSTRUCTIONS_LAYER,
  BG_SPECIAL_INSTRUCTIONS_PARAPHRASE,
  BG_SPECIAL_INSTRUCTIONS_VERBATIM,
  BG_STOP1_COMMENT,
} from '@/test/fixtures/blueGraceRateCon';

/**
 * The Blue Grace tender BG969676425, original and revised, is the document these
 * behaviours were specified against, so it is the document they are tested on.
 */

const LAYER = [
  'Blue Grace Logistics Rate Confirmation BG969676425',
  BG_BROKER_TERMS_LAYER,
  'Comments',
  'Contact Information: Sean Grogan 813-591-3771 sgrogan@bluegracegroup.com',
  'Special Instructions',
  BG_SPECIAL_INSTRUCTIONS_LAYER,
  'Stop 1 (pickup)',
  BG_STOP1_COMMENT,
  'Stop 2 (drop)',
  'Comments: PO# 001000562117',
].join('\n');

/* ------------------------------------------------------------------ */
/* 1. Golden text — fidelity, not just stability                        */
/* ------------------------------------------------------------------ */

describe('golden text from the printed page', () => {
  it('keeps the double asterisks the broker printed', () => {
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM).toContain('**CAN GET NEED TIH.**');
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM).toContain('**ELECTRONIC TRACKING IS REQUIRED**');
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM.endsWith('NO DETENTION ON PRODUCE.**')).toBe(true);
  });

  it('keeps the contact details the paraphrase dropped', () => {
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM).toContain('(800) 697-4477');
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM).toContain('CALAVO@BLUEGRACEGROUP.COM');
    expect(BG_SPECIAL_INSTRUCTIONS_PARAPHRASE).not.toContain('697-4477');
  });

  it('keeps the ALL ORDER#S sentence neither parse pass captured', () => {
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM)
      .toContain('ALL ORDER#S MUST BE USED TO **CAN GET NEED TIH.**');
  });

  it('keeps the terms paragraph out of the instructions block', () => {
    expect(BG_SPECIAL_INSTRUCTIONS_VERBATIM).not.toContain('BGLF');
    expect(BG_BROKER_TERMS_LAYER).toContain('BGLF');
  });
});

/* ------------------------------------------------------------------ */
/* 2. Verification against the PDF text layer                           */
/* ------------------------------------------------------------------ */

describe('verbatim verification against the text layer', () => {
  it('normalizes layer damage without collapsing casing', () => {
    const n = normalizeForVerbatim(BG_SPECIAL_INSTRUCTIONS_LAYER);
    expect(n.text).toContain('OS&D');
    expect(n.text).not.toContain('¶');
    expect(n.text).toContain('MANDATORY ON SITE AT SHIPPER');
    expect(n.text).not.toContain('mandatory on site at shipper');
  });

  it('verifies a faithful transcription against a clean layer', () => {
    const clean = LAYER.replace(BG_SPECIAL_INSTRUCTIONS_LAYER, BG_SPECIAL_INSTRUCTIONS_VERBATIM);
    const r = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, clean);
    expect(r.similarity).toBe(1);
    expect(r.missingTokens).toEqual([]);
    expect(r.layerDegradation).toBe(0);
    expect(r.verdict).toBe('verified');
  });

  /**
   * The point of the fix: damage is a property of the document, so the same
   * field on the same PDF reports one figure no matter what the transcription
   * says. Before regions were cut from the page, the faithful transcription
   * scored 5.57% and the paraphrase 0.98% on this same layer, because each was
   * scored against whichever window it happened to select.
   */
  it('reports one damage figure per field per document', () => {
    const faithful = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, LAYER);
    const paraphrase = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_PARAPHRASE, LAYER);
    expect(faithful.layerDegradation).toBeGreaterThan(0.02);
    expect(paraphrase.layerDegradation).toBe(faithful.layerDegradation);
    expect(faithful.anchorId).toBe('special_instructions');
    expect(paraphrase.anchorId).toBe('special_instructions');
  });

  it('verifies the faithful transcription of the mangled block', () => {
    const r = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, LAYER);
    expect(r.regionSource).toBe('anchor');
    expect(r.similarityPass).toBe(true);
    expect(r.tokenPass).toBe(true);
    expect(r.missingTokens).toEqual([]);
    expect(r.verdict).toBe('verified');
  });

  /**
   * The case the check was built for. Scored against the region it actually
   * corresponds to, the paraphrase fails on both signals — and the two tokens
   * it dropped are the ones now demanded, rather than an unrelated address from
   * a window a page away.
   */
  it('rejects the condensed rewrite and names the tokens it dropped', () => {
    const r = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_PARAPHRASE, LAYER);
    expect(r.verdict).toBe('layer_unreliable');
    expect(r.similarityPass).toBe(false);
    expect(r.tokenPass).toBe(false);
    expect(r.missingTokens).toContain('(800) 697-4477');
    expect(r.missingTokens).toContain('CALAVO@BLUEGRACEGROUP.COM');
  });

  /** A damaged region no longer hides the other two signals behind its headline. */
  it('reports all three signals even when the headline is layer_unreliable', () => {
    const r = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_PARAPHRASE, LAYER);
    expect(r.verdict).toBe('layer_unreliable');
    expect(typeof r.similarity).toBe('number');
    expect(r.similarityPass).not.toBeNull();
    expect(r.tokenPass).not.toBeNull();
    expect(r.layerDegradation).not.toBeNull();
  });

  it('catches a lossy transcription that still scores well', () => {
    const lossy = BG_SPECIAL_INSTRUCTIONS_VERBATIM
      .replace('CALL (800) 697-4477 AND/ OR', 'CALL AND/ OR')
      .replace('EMAIL CALAVO@BLUEGRACEGROUP.COM FOR ASSISTANCE.', 'EMAIL FOR ASSISTANCE.');
    const r = verifyVerbatim('special_instructions_verbatim', lossy, LAYER);
    expect(r.tokenPass).toBe(false);
    expect(r.missingTokens?.length).toBeGreaterThan(0);
    expect(r.verdict).not.toBe('verified');
  });

  it('verifies the broker terms paragraph as its own field', () => {
    const r = verifyVerbatim('broker_terms_verbatim', BG_BROKER_TERMS_LAYER, LAYER);
    expect(r.anchorId).toBe('terms_paragraph_opener');
    expect(r.verdict).toBe('verified');
    expect(r.similarity).toBe(1);
  });

  it('reports no_layer rather than blaming the model when there is no text layer', () => {
    const r = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, '');
    expect(r.verdict).toBe('no_layer');
    expect(r.similarity).toBeNull();
  });

  it('scores the entity chain and the pilcrow as damage, not as difference', () => {
    const a = normalizeForVerbatim(BG_SPECIAL_INSTRUCTIONS_LAYER).text;
    const b = normalizeForVerbatim(BG_SPECIAL_INSTRUCTIONS_VERBATIM).text;
    expect(diceSimilarity(a, b)).toBeGreaterThan(0.95);
    expect(bestWindow(a, b).score).toBeGreaterThan(0.95);
  });
});

/* ------------------------------------------------------------------ */
/* 2b. Regions come from the document, never from the transcription     */
/* ------------------------------------------------------------------ */

describe('document-determined field regions', () => {
  beforeEach(() => clearAnchorMisses());

  it('cuts stop slices from the printed Stop headings', () => {
    const slices = stopSlices(LAYER);
    expect([...slices.keys()]).toEqual([1, 2]);
    expect(slices.get(1)!.end).toBeLessThan(slices.get(2)!.start);
  });

  /**
   * Blue Grace prints a bare `Comments` heading at load level and `Comments:`
   * inside each stop. A broker who prints the load-level one *with* a colon
   * would shift every stop by one under occurrence counting — each stop then
   * verifying against its neighbour's text, silently.
   */
  it('is not shifted by a load-level Comments: heading', () => {
    const layer = [
      'Carrier Load Tender',
      'Comments: General note to carrier about this tender.',
      'Stop 1 (pickup)',
      'Comments: PU# IX00286060',
      'Stop 2 (drop)',
      'Comments: PO# 001000562117',
    ].join('\n');
    expect(resolveFieldRegion(layer, 'stop_notes_verbatim', { stopNumber: 1 }).region?.text)
      .toBe('Comments: PU# IX00286060');
    expect(resolveFieldRegion(layer, 'stop_notes_verbatim', { stopNumber: 2 }).region?.text)
      .toBe('Comments: PO# 001000562117');
  });

  it('fails as stop_not_found rather than falling through to a neighbour', () => {
    const r = resolveFieldRegion(LAYER, 'stop_notes_verbatim', { stopNumber: 9 });
    expect(r.region).toBeNull();
    expect(r.failure).toBe('stop_not_found');
  });

  it('keeps the first slice when a stop number is printed twice', () => {
    const layer = ['Stop 2 (pickup)', 'Comments: FIRST', 'Stop 2 (drop)', 'Comments: SECOND'].join('\n');
    expect(resolveFieldRegion(layer, 'stop_notes_verbatim', { stopNumber: 2 }).region?.text)
      .toBe('Comments: FIRST');
  });

  it('refuses to guess when a heading appears twice with a body', () => {
    const layer = [
      'Special Instructions',
      'FIRST BLOCK OF INSTRUCTIONS.',
      '',
      'Special Instructions',
      'SECOND BLOCK OF INSTRUCTIONS.',
    ].join('\n');
    const r = resolveFieldRegion(layer, 'special_instructions_verbatim');
    expect(r.region).toBeNull();
    expect(r.failure).toBe('anchor_ambiguous');
    expect(r.occurrences).toBe(2);
  });

  it('reports region_unresolved with nothing computed, and logs the miss', () => {
    const layer = ['Load Tender', 'Rate: $1400.00', 'Stop 1 (pickup)'].join('\n');
    const r = verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, layer);
    expect(r.verdict).toBe('region_unresolved');
    expect(r.regionSource).toBe('none');
    expect(r.similarity).toBeNull();
    expect(r.missingTokens).toBeNull();
    expect(r.layerDegradation).toBeNull();
    expect(r.similarityPass).toBeNull();
    expect(r.tokenPass).toBeNull();

    const logged = anchorMisses();
    expect(logged).toHaveLength(1);
    expect(logged[0].field).toBe('special_instructions_verbatim');
    expect(logged[0].failure).toBe('anchor_not_found');
    expect(logged[0].headings).toContain('Load Tender');
  });
});


/* ------------------------------------------------------------------ */
/* 3. Reference classification                                          */
/* ------------------------------------------------------------------ */

describe('reference classification', () => {
  it('resolves PU# and Pickup Number to one class', () => {
    expect(classifyReferenceLabel('PU#')).toBe('pickup');
    expect(classifyReferenceLabel('Pickup Number')).toBe('pickup');
    expect(classifyReferenceLabel('pu number:')).toBe('pickup');
  });

  it('keeps one value under two labels as two references', () => {
    const { references } = classifyReferences(BG_REFERENCES_REVISED.map(r => ({ ...r, stopSequence: null })));
    const keys = references.map(r => referenceKey(r.clazz, r.value));
    expect(keys).toContain('bol:BG969676425');
    expect(keys).toContain('pro:BG969676425');
  });

  it('routes Mode to the load, never to references', () => {
    const out = classifyReferences(BG_REFERENCES_REVISED.map(r => ({ ...r, stopSequence: null })));
    expect(out.references.some(r => r.clazz === 'mode')).toBe(false);
    expect(out.routed).toContainEqual({ clazz: 'mode', value: 'TL', routeTo: 'loads.mode' });
  });

  it('keeps a number printed on several stops as one reference with citations', () => {
    const out = classifyReferences([
      { label: 'Pickup Number', value: 'IX00286060', stopSequence: 1 },
      { label: 'PU#', value: 'IX00286060', stopSequence: 2 },
    ]);
    expect(out.references).toHaveLength(1);
    expect(out.references[0].citations).toEqual([1, 2]);
  });

  it('does not merge two different pickup numbers', () => {
    const out = classifyReferences([
      { label: 'Pickup Number', value: '562117', stopSequence: null },
      { label: 'Pickup Number', value: 'IX00286060', stopSequence: null },
    ]);
    expect(out.references).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Diff behaviour                                                    */
/* ------------------------------------------------------------------ */

const f = <T,>(value: T | null, confidence: Confidence = 'high') => ({ value, confidence });

function parsedStop(over: Partial<Record<string, unknown>> = {}): ParsedStop {
  return {
    sequence: 1,
    stop_type: 'pickup',
    facility_name: f<string>(null),
    address_line1: f<string>(null),
    address_line2: f<string>(null),
    city: f<string>(null),
    state: f<string>(null),
    zip: f<string>(null),
    contact_name: f<string>(null),
    contact_phone: f<string>(null),
    appointment_start: f<string>(null),
    appointment_end: f<string>(null),
    notes: f<string>(null),
    notes_verbatim: f<string>(null),
    references: [],
    ...over,
  } as unknown as ParsedStop;
}

function doc(refs: { label: string; value: string }[]): ParsedRateConfirmation {
  return {
    broker: {
      company_name: f('Blue Grace Logistics'), mc_number: f('347042'),
      contact_name: f<string>(null), contact_phone: f<string>(null), contact_email: f<string>(null),
    },
    load: {
      broker_load_number: f('BG969676425'), bol_number: f<string>(null), po_number: f<string>(null),
      equipment_type: f(null), handling_type: f(null), commodity: f<string>(null),
      weight_lbs: f<number>(null), loaded_miles: f<number>(null),
      is_hazmat: f<boolean>(null), is_team_load: f<boolean>(null), mode: f<string>(null),
    },
    reefer: {
      temp_f: f<number>(null), temp_min_f: f<number>(null), temp_max_f: f<number>(null),
      precool_required: f<boolean>(null), continuous_run: f<boolean>(null), notes: f<string>(null),
    },
    rate: { linehaul: f<number>(null), fsc_amount: f<number>(null), total: f<number>(null), line_items: [] },
    stops: [
      parsedStop({
        sequence: 1, stop_type: 'pickup', address_line1: f('8901 San Mateo Dr.'),
        zip: f('78045'), city: f('Laredo'), state: f('TX'),
        notes_verbatim: f(BG_STOP1_COMMENT),
        references: [{ label: 'PU#', value: 'IX00286060', confidence: 'high' as Confidence }],
      }),
      parsedStop({
        sequence: 2, stop_type: 'delivery', address_line1: f('1 Produce Way'),
        zip: f('30303'), city: f('Atlanta'), state: f('GA'),
      }),
    ],
    special_instructions: f<string>(null),
    verbatim: {
      broker_terms: f(BG_BROKER_TERMS_LAYER),
      special_instructions: f(BG_SPECIAL_INSTRUCTIONS_VERBATIM),
    },
    references: refs.map(r => ({ ...r, confidence: 'high' as Confidence })),
    loadout_signals: {
      no_bol_mentioned: false, photo_pod_required: false, multi_day_use_period: false,
      trailer_relocation_language: false, no_commodity: false, trailer_number: f<string>(null),
      trailer_owner: f<string>(null), use_period_days: f<number>(null), relocation_fee: f<number>(null),
    },
  } as unknown as ParsedRateConfirmation;
}

/** The load as it stands after the ORIGINAL document was applied. */
function loadFromOriginal(): LoadFormValues {
  const original = doc(BG_REFERENCES_ORIGINAL);
  const classified = classifyReferences([
    ...original.references.map(r => ({ label: r.label, value: r.value, stopSequence: null })),
    ...original.stops.flatMap(s =>
      (s.references ?? []).map(r => ({ label: r.label, value: r.value, stopSequence: s.sequence }))),
  ]);
  return {
    ...loadFormDefaults(),
    load_number: 'ST-2001',
    broker_reference_number: 'BG969676425',
    special_instructions_verbatim: BG_SPECIAL_INSTRUCTIONS_VERBATIM,
    broker_terms_verbatim: BG_BROKER_TERMS_LAYER,
    mode: 'TL',
    references: classified.references.map(r => ({
      reference_class: r.clazz, label: r.label, value: r.value, citations: r.citations,
    })),
    stops: [
      {
        // Stored as the form normalized it on the original apply: the street
        // suffix period is dropped, so the re-parse must not read as a change.
        ...emptyStop('pickup'), id: 'stop-a', address_line1: '8901 San Mateo Dr',

        zip: '78045', city: 'Laredo', state: 'TX', stop_notes_verbatim: BG_STOP1_COMMENT,
      },
      {
        ...emptyStop('delivery'), id: 'stop-b', address_line1: '1 Produce Way',
        zip: '30303', city: 'Atlanta', state: 'GA',
      },
    ],
  };
}

describe('re-parsing an unchanged document', () => {
  it('reports zero changes', () => {
    const diff = buildRevisionDiff(loadFromOriginal(), doc(BG_REFERENCES_ORIGINAL));
    expect(diff.nonFinancial.map(d => d.label)).toEqual([]);
    expect(diff.financial).toEqual([]);
    expect(diff.unresolved).toEqual([]);
  });
});

describe('reference diffing on the revised document', () => {
  const diff = buildRevisionDiff(loadFromOriginal(), doc(BG_REFERENCES_REVISED));

  it('surfaces the added PRO row that shares the BOL value', () => {
    const added = diff.nonFinancial.filter(d => d.reference?.op === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].reference).toMatchObject({ reference_class: 'pro', value: 'BG969676425' });
  });

  it('does not report the unchanged references as changes', () => {
    expect(diff.nonFinancial.filter(d => d.reference).length).toBe(1);
  });

  it('reports a reference the revised document dropped', () => {
    const dropped = buildRevisionDiff(
      loadFromOriginal(),
      doc(BG_REFERENCES_REVISED.filter(r => r.value !== '001000562117')),
    );
    const removed = dropped.nonFinancial.filter(d => d.reference?.op === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].reference).toMatchObject({ reference_class: 'po', value: '001000562117' });
  });
});

describe('accept defaults', () => {
  it('leaves broker prose unchecked and keeps structured changes checked', () => {
    const current = loadFromOriginal();
    const revised = doc(BG_REFERENCES_REVISED);
    revised.verbatim.special_instructions = f('REQUIRED SWING DOOR REEFER TRAILER. NEW TERMS.');
    (revised.load as { commodity: unknown }).commodity = f('Mixed Products');

    const diff = buildRevisionDiff({ ...current, commodity: 'Produce' }, revised);
    const decisions = initialDecisions(diff);

    const prose = diff.nonFinancial.find(d => d.path === 'special_instructions_verbatim');
    expect(prose).toBeDefined();
    expect(prose?.freeText).toBe(true);
    expect(decisions.accepted[prose!.id]).toBe(false);

    const commodity = diff.nonFinancial.find(d => d.path === 'commodity');
    expect(decisions.accepted[commodity!.id]).toBe(true);

    const addedRef = diff.nonFinancial.find(d => d.reference?.op === 'added');
    expect(decisions.accepted[addedRef!.id]).toBe(true);
  });
});
