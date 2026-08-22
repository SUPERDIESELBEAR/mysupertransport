import { readFileSync } from 'fs';
import { verifyVerbatim } from '/dev-server/src/lib/verbatimVerify';
import { resolveFieldRegion, stopSlices } from '/dev-server/src/lib/verbatimRegions';
import { BG_SPECIAL_INSTRUCTIONS_VERBATIM, BG_SPECIAL_INSTRUCTIONS_PARAPHRASE, BG_STOP1_COMMENT } from '/dev-server/src/test/fixtures/blueGraceRateCon';

const layer = readFileSync('/tmp/bg/orig.txt', 'utf8');
console.log('stopSlices', [...stopSlices(layer).entries()]);
for (const f of ['special_instructions_verbatim','broker_terms_verbatim'] as const) {
  const r = resolveFieldRegion(layer, f);
  console.log(f, r.ok ? { anchor: r.region.anchorId, lines: [r.region.startLine, r.region.endLine] } : r);
  if (r.ok) console.log('---REGION---\n' + r.region.text + '\n---END---');
}
const sn = resolveFieldRegion(layer, 'stop_notes_verbatim', { stopNumber: 1 });
console.log('stop1', sn.ok ? JSON.stringify(sn.region.text) : sn);
const sn2 = resolveFieldRegion(layer, 'stop_notes_verbatim', { stopNumber: 2 });
console.log('stop2', sn2.ok ? JSON.stringify(sn2.region.text) : sn2);
const sn9 = resolveFieldRegion(layer, 'stop_notes_verbatim', { stopNumber: 9 });
console.log('stop9', sn9);

const show = (l: string, v: any) => console.log(l, JSON.stringify({v: v.verdict, sim: v.similarity?.toFixed(4), dmg: v.layerDegradation != null ? (v.layerDegradation*100).toFixed(2)+'%' : null, simPass: v.similarityPass, tokPass: v.tokenPass, missing: v.missingTokens, anchor: v.anchorId}));
show('faithful  ', verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_VERBATIM, layer));
show('paraphrase', verifyVerbatim('special_instructions_verbatim', BG_SPECIAL_INSTRUCTIONS_PARAPHRASE, layer));
show('stop1     ', verifyVerbatim('stop_notes_verbatim', BG_STOP1_COMMENT, layer, { stopNumber: 1 }));
