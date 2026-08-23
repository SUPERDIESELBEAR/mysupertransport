import { describe, expect, it } from 'vitest';
import { verifyVerbatim } from '@/lib/verbatimVerify';
import { withRepairedCapture, type VerbatimCheck } from '@/lib/verbatimCheck';
import { parserContractWarning, EXPECTED_PARSER_CONTRACT, type ParsedRateConfirmation } from '@/lib/rateConfirmation';

/**
 * The regression this file exists for: a printed trailer dimension (53' 102")
 * came back from the model as a pilcrow, because the PDF's text layer renders
 * that span as one. The layer matched, so the check said "verified" — a
 * corrupted capture passing the check whose whole purpose is to catch it.
 */

const LAYER = [
  'SPECIAL INSTRUCTIONS',
  'REQUIRED ¶ SWING DOOR REEFER TRAILER',
  'NO TOUCH FREIGHT',
].join('\n');

const field = 'special_instructions_verbatim';

describe('transcription damage', () => {
  it('rejects a capture carrying the layer’s pilcrow even when the layer agrees', () => {
    const v = verifyVerbatim(field, 'REQUIRED ¶ SWING DOOR REEFER TRAILER', LAYER, { log: false });
    expect(v.verdict).toBe('transcription_damaged');
    expect(v.transcriptionDamage?.[0].kind).toBe('pilcrow');
  });

  it('does not call it verified just because similarity is perfect', () => {
    const v = verifyVerbatim(field, 'REQUIRED ¶ SWING DOOR REEFER TRAILER', LAYER, { log: false });
    expect(v.verdict).not.toBe('verified');
  });

  it('flags replacement and control characters as damage too', () => {
    expect(verifyVerbatim(field, 'REQUIRED \uFFFD TRAILER', LAYER, { log: false }).verdict)
      .toBe('transcription_damaged');
    expect(verifyVerbatim(field, 'REQUIRED \u0007 TRAILER', LAYER, { log: false }).verdict)
      .toBe('transcription_damaged');
  });

  it('leaves a clean capture alone', () => {
    const v = verifyVerbatim(field, 'NO TOUCH FREIGHT', LAYER, { log: false });
    expect(v.verdict).not.toBe('transcription_damaged');
    expect(v.transcriptionDamage ?? []).toHaveLength(0);
  });

  it('never scores a hand-repaired span against the layer it disagrees with', () => {
    const v = verifyVerbatim(field, 'REQUIRED 53\' 102" SWING DOOR REEFER TRAILER', LAYER, {
      log: false, source: 'manual_repair',
    });
    expect(v.source).toBe('manual_repair');
    expect(v.verdict).not.toBe('unverified');
  });
});

describe('repairing a capture', () => {
  const parsed = {
    verbatim: {
      special_instructions: { value: 'REQUIRED ¶ SWING DOOR REEFER TRAILER', confidence: 'high' },
      broker_terms: { value: 'Detention $40/hr', confidence: 'high' },
    },
    stops: [{ notes_verbatim: { value: 'DOCK ¶ 12', confidence: 'high' } }],
  } as unknown as ParsedRateConfirmation;

  const check = (f: string, i: number | null): VerbatimCheck =>
    ({ field: f, parsedStopIndex: i } as VerbatimCheck);

  it('replaces the load-level capture without touching the other block', () => {
    const next = withRepairedCapture(parsed, check(field, null), 'REQUIRED 53\' 102" TRAILER');
    expect(next.verbatim?.special_instructions?.value).toBe('REQUIRED 53\' 102" TRAILER');
    expect(next.verbatim?.broker_terms?.value).toBe('Detention $40/hr');
  });

  it('replaces a stop capture and leaves the original parse untouched', () => {
    const next = withRepairedCapture(parsed, check('stop_notes_verbatim', 0), 'DOCK 12');
    expect(next.stops?.[0]?.notes_verbatim?.value).toBe('DOCK 12');
    expect(parsed.stops?.[0]?.notes_verbatim?.value).toBe('DOCK ¶ 12');
  });
});

describe('parser build identity', () => {
  it('says nothing when the deployed contract is the expected one', () => {
    expect(parserContractWarning({
      parser_build: { contract: EXPECTED_PARSER_CONTRACT, built_at: '', notes: '' },
    } as ParsedRateConfirmation)).toBeNull();
  });

  it('warns when a stale deploy answers with an older contract', () => {
    const msg = parserContractWarning({
      parser_build: { contract: 2, built_at: '', notes: '' },
    } as ParsedRateConfirmation);
    expect(msg).toContain('contract 2');
  });

  it('stays quiet when the parser reports no build at all', () => {
    expect(parserContractWarning({} as ParsedRateConfirmation)).toBeNull();
  });
});
