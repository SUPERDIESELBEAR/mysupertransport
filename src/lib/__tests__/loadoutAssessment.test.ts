import { describe, expect, it } from 'vitest';
import { assessLoadout, parserContractWarning, EXPECTED_PARSER_CONTRACT, type ParsedRateConfirmation } from '@/lib/rateConfirmation';
import { collectParserDiagnostics } from '@/lib/parserDiagnostics';

/**
 * The banner vanishing on a document that had shown it three times was not a
 * UI bug: the block was gated on `suspected`, and `suspected` was a pure
 * function of one non-deterministic model answer. These tests hold the two
 * properties that make the feature exist independently of that answer.
 */

function base(signals: Partial<ParsedRateConfirmation['loadout_signals']> = {}): ParsedRateConfirmation {
  return {
    loadout_signals: {
      trailer_relocation_language: false,
      no_bol_mentioned: false,
      photo_pod_required: false,
      multi_day_use_period: false,
      no_commodity: false,
      trailer_number: { value: null, confidence: 'low' },
      ...signals,
    },
  } as unknown as ParsedRateConfirmation;
}

const LOADOUT_TEXT = `TRAILER RELOCATION AGREEMENT
Relocate trailer #TR-88421 from Kansas City to Dallas.
Carrier may keep the trailer for 7 calendar days of trailer use.
Photos at pickup and delivery serve as proof of delivery.
`;

describe('assessLoadout', () => {
  it('fires from the printed page when the model reports nothing', () => {
    const a = assessLoadout(base(), LOADOUT_TEXT);
    expect(a.suspected).toBe(true);
    expect(a.documentRead).toBe(true);
    expect(a.signals.find(s => s.key === 'trailer_relocation_language')?.source).toBe('document');
  });

  it('fires from the model when no text layer is available', () => {
    const a = assessLoadout(base({ trailer_relocation_language: true, photo_pod_required: true }), null);
    expect(a.score).toBe(5);
    expect(a.suspected).toBe(true);
    expect(a.documentRead).toBe(false);
    expect(a.signals.every(s => s.document === null)).toBe(true);
  });

  it('records disagreement instead of letting one source win', () => {
    const a = assessLoadout(base({ photo_pod_required: true }), 'Standard dry van load. Bill of lading required. Commodity: paper');
    expect(a.disagreements.map(d => d.key)).toContain('photo_pod_required');
    expect(a.signals.find(s => s.key === 'no_bol_mentioned')?.fired).toBe(false);
  });

  it('never throws when the parser returned no signals', () => {
    const a = assessLoadout({} as ParsedRateConfirmation, LOADOUT_TEXT);
    expect(a.suspected).toBe(true);
    expect(a.reasons.some(r => r.includes('no loadout signals'))).toBe(true);
  });

  it('always produces a diagnostic row, fired or not', () => {
    const not = assessLoadout(base(), 'Bill of lading required. Commodity: steel coils');
    const rows = collectParserDiagnostics({ anchorMisses: [], classified: null, loadout: not });
    const row = rows.find(r => r.kind === 'loadout_assessment');
    expect(row).toBeDefined();
    expect(row?.failure).toBe('loadout_not_suspected');
    expect(row?.occurrences).toBe(not.score);
  });
});

describe('parserContractWarning', () => {
  it('warns when the contract matches but the run envelope is missing', () => {
    const warning = parserContractWarning({
      parser_build: { contract: EXPECTED_PARSER_CONTRACT, built_at: 'x', notes: 'x' },
    } as ParsedRateConfirmation);
    expect(warning).toMatch(/no run envelope/);
  });

  it('is silent when the deploy is current', () => {
    const warning = parserContractWarning({
      parser_build: { contract: EXPECTED_PARSER_CONTRACT, built_at: 'x', notes: 'x' },
      run: { model: 'google/gemini-3-flash-preview', seed: 1, seed_echoed: false },
    } as ParsedRateConfirmation);
    expect(warning).toBeNull();
  });
});
