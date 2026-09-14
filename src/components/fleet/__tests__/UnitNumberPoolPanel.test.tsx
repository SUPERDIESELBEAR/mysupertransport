/**
 * The panel is a window onto the pool — it must show recycled numbers before
 * gaps before the next number, and it must reuse the shared holder wording.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UnitNumberPoolPanel from '../UnitNumberPoolPanel';
import type { UnitPoolEntry, UnitHolder } from '@/lib/unitNumberPool';

const pool: UnitPoolEntry[] = [
  { unit: 231, kind: 'recycled', freedAt: '2026-04-01T00:00:00Z', note: 'Freed' },
  { unit: 190, kind: 'gap', freedAt: null, note: 'Never issued' },
  { unit: 272, kind: 'next', freedAt: null, note: 'Next in sequence' },
];

const holders: UnitHolder[] = [
  { operatorId: 'op1', driverName: 'Willie Westbrook', isActive: true, goLiveDate: '2026-06-16', deactivatedAt: null, state: 'live' },
];

vi.mock('@/lib/unitNumberPool', async () => {
  const actual = await vi.importActual<typeof import('@/lib/unitNumberPool')>('@/lib/unitNumberPool');
  return {
    ...actual,
    fetchUnitNumberPool: vi.fn(async () => pool),
    fetchUnitHolders: vi.fn(async () => holders),
  };
});

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

describe('UnitNumberPoolPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups the pool recycled, then gaps, then next', async () => {
    render(<UnitNumberPoolPanel open onOpenChange={() => {}} />);

    await waitFor(() => expect(screen.getByText('231')).toBeInTheDocument());

    const body = document.body.textContent ?? '';
    const recycled = body.indexOf('Recycled');
    const gaps = body.indexOf('Never issued');
    const next = body.indexOf('Next in sequence');
    expect(recycled).toBeGreaterThan(-1);
    expect(recycled).toBeLessThan(gaps);
    expect(gaps).toBeLessThan(next);
  });

  it('summarises how many are free and what comes next', async () => {
    render(<UnitNumberPoolPanel open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/2 numbers free · next in sequence 272/)).toBeInTheDocument());
  });
});
