import { describe, expect, it } from 'vitest';
import { verifyVerbatim } from '@/lib/verbatimVerify';
import { collectParserDiagnostics } from '@/lib/parserDiagnostics';
import { takeAnchorMisses } from '@/lib/verbatimRegions';

/**
 * The Rolling River parse produced three unresolved regions on screen and zero
 * rows in `parser_diagnostics`. This asserts the chain the panel depends on:
 * a failed region records a miss, and draining the buffer yields a row shaped
 * the way the table accepts — so a future zero is a runtime fact, not this.
 */
describe('an unresolved region reaches the diagnostics rows', () => {
  it('records the failure code and the headings the document did print', () => {
    takeAnchorMisses();
    const layer = 'ROLLING RIVER LOGISTICS\nTRAILER RELOCATION AGREEMENT\nRate: 150.00\n';
    const v = verifyVerbatim('broker_terms_verbatim', 'Some terms text', layer);
    expect(v.verdict).toBe('region_unresolved');

    const rows = collectParserDiagnostics({ anchorMisses: takeAnchorMisses(), classified: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('anchor_miss');
    expect(rows[0].failure).toBe(v.regionFailure);
    expect(rows[0].headings).toContain('TRAILER RELOCATION AGREEMENT');
  });

  it('drains the buffer, so one parse never files another parse\u2019s misses', () => {
    expect(collectParserDiagnostics({ anchorMisses: takeAnchorMisses(), classified: null })).toEqual([]);
  });
});
