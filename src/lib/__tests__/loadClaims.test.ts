import { describe, expect, it } from 'vitest';
import { summarizeActiveClaims } from '@/lib/loadClaims';

describe('summarizeActiveClaims', () => {
  it('returns null for an empty list', () => {
    expect(summarizeActiveClaims([])).toBeNull();
  });

  it('prefers hold severity over watch', () => {
    const summary = summarizeActiveClaims([
      { flag_level: 'watch', claim_type: 'late_delivery' },
      { flag_level: 'hold', claim_type: 'damaged_goods' },
    ]);
    expect(summary?.level).toBe('hold');
    expect(summary?.claimType).toBe('damaged_goods');
    expect(summary?.title).toContain('Hold');
  });

  it('falls back to watch when no hold is present', () => {
    const summary = summarizeActiveClaims([
      { flag_level: 'watch', claim_type: 'documentation_issue' },
      { flag_level: 'watch', claim_type: 'rate_dispute' },
    ]);
    expect(summary?.level).toBe('watch');
    expect(summary?.claimType).toBe('other');
    expect(summary?.title).toContain('2 claim types');
  });
});
