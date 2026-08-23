import { describe, it } from 'vitest';
import { verifyVerbatim, unknownWords, normalizeForVerbatim } from '@/lib/verbatimVerify';
import {
  BG_SPECIAL_INSTRUCTIONS_LAYER, BG_SPECIAL_INSTRUCTIONS_VERBATIM,
  BG_BROKER_TERMS_LAYER,
} from '@/test/fixtures/blueGraceRateCon';

const layer = [
  'Special Instructions',
  BG_SPECIAL_INSTRUCTIONS_LAYER,
  '',
  BG_BROKER_TERMS_LAYER,
  '',
].join('\n');

const terms = BG_BROKER_TERMS_LAYER.replace(/\n/g, ' ');
const typo = terms.replace('detention charges unless reported', 'detentention charges unless reported');

describe('measure', () => {
  it('reports', () => {
    const rows: any[] = [];
    const push = (name: string, f: string, v: string) => {
      const r = verifyVerbatim(f, v, layer, { log: false });
      rows.push({ name, verdict: r.verdict, sim: r.similarity?.toFixed(4), dmg: r.layerDegradation?.toFixed(4),
        tokenPass: r.tokenPass, unknown: r.unknownWords, region: r.regionSource, anchor: r.anchorId });
    };
    push('SI faithful', 'special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM);
    push('SI faithful (revised doc, same block)', 'special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM);
    push('BT faithful', 'broker_terms_verbatim', terms);
    push('BT typo run', 'broker_terms_verbatim', typo);
    // raw, no damaged-span skip:
    const nSI = normalizeForVerbatim(BG_SPECIAL_INSTRUCTIONS_LAYER).text;
    rows.push({ name: 'SI no-skip raw list',
      unknown: unknownWords(normalizeForVerbatim(BG_SPECIAL_INSTRUCTIONS_VERBATIM).text, nSI) });
    rows.push({ name: 'SI with-skip raw list',
      unknown: unknownWords(normalizeForVerbatim(BG_SPECIAL_INSTRUCTIONS_VERBATIM).text, nSI, BG_SPECIAL_INSTRUCTIONS_LAYER) });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(rows, null, 1));
  });
});
