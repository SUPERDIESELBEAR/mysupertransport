import { describe, expect, it } from 'vitest';
import {
  AmendmentChainCycleError, orderVersions, orderVersionsByDate, purgeLeaves,
} from '../../../../supabase/functions/_shared/eld/amendmentChain';

const day = (id: string, supersedes: string | null, log_date = '2026-07-30') =>
  ({ id, log_date, supersedes_day_id: supersedes });

describe('orderVersions', () => {
  it('orders a three-deep chain original first regardless of input order', () => {
    const rows = [day('a2', 'a1'), day('orig', null), day('a1', 'orig')];
    expect(orderVersions(rows).map((r) => r.id)).toEqual(['orig', 'a1', 'a2']);
  });

  it('emits every version of a chain — the defect a one-level walk has', () => {
    const rows = [day('orig', null), day('a1', 'orig'), day('a2', 'a1')];
    const oneLevel = new Map(rows.filter((r) => r.supersedes_day_id).map((r) => [r.supersedes_day_id, r]));
    // What the old reverse-map produced for the current version: only A1's
    // parent resolves, so `orig` is shown under A2 and A1 disappears.
    expect(oneLevel.get('orig')?.id).toBe('a1');
    expect(orderVersions(rows)).toHaveLength(3);
  });

  it('treats a row whose parent is outside the loaded range as a root', () => {
    const rows = [day('a2', 'a1'), day('a1', 'outside-the-range')];
    expect(orderVersions(rows).map((r) => r.id)).toEqual(['a1', 'a2']);
  });

  it('keeps every version on a branch, deterministically', () => {
    const rows = [day('orig', null), day('b', 'orig'), day('a', 'orig')];
    expect(orderVersions(rows).map((r) => r.id)).toEqual(['orig', 'a', 'b']);
  });

  it('throws on a cycle rather than returning a silently short chain', () => {
    const rows = [day('x', 'y'), day('y', 'x')];
    expect(() => orderVersions(rows)).toThrow(AmendmentChainCycleError);
  });

  it('returns an empty list for no rows', () => {
    expect(orderVersions([])).toEqual([]);
  });
});

describe('orderVersionsByDate', () => {
  it('groups by date, ascending, each group original first', () => {
    const rows = [
      day('b1', null, '2026-07-31'),
      day('a2', 'a1', '2026-07-30'),
      day('a1', 'a0', '2026-07-30'),
      day('a0', null, '2026-07-30'),
    ];
    expect(orderVersionsByDate(rows).map((g) => [g.log_date, g.versions.map((v) => v.id)]))
      .toEqual([
        ['2026-07-30', ['a0', 'a1', 'a2']],
        ['2026-07-31', ['b1']],
      ]);
  });
});

describe('purgeLeaves', () => {
  it('returns only the newest version of a three-deep chain', () => {
    const rows = [day('orig', null), day('a1', 'orig'), day('a2', 'a1')];
    expect(purgeLeaves(rows).map((r) => r.id)).toEqual(['a2']);
  });

  it('refuses a cycle instead of looping forever', () => {
    expect(() => purgeLeaves([day('x', 'y'), day('y', 'x')])).toThrow(AmendmentChainCycleError);
  });
});
