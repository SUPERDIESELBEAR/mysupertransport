/**
 * MODULE 4 (dispatch), PASS 5 — the screen reads STORED rows.
 *
 * The screen exists to show that a stored figure is wrong. A screen that
 * recomputes for display can only agree with itself, so the central assertion
 * here is negative: the render path never reaches `computeDispatchSettlement`,
 * `gatherDispatchMonth` or the `loads` table. Every figure it prints comes off
 * the real persisted August 2026 rows in `src/test/fixtures/`.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { AUGUST_STORED } from '@/test/fixtures/augustDispatchSettlement';

const touchedTables: string[] = [];
const { computeSpy } = vi.hoisted(() => ({ computeSpy: vi.fn() }));

/** A query builder that serves the exported rows and records the table read. */
function makeClient() {
  const table = (name: string) => {
    touchedTables.push(name);
    const rowsFor = (): unknown => {
      switch (name) {
        case 'dispatch_settlements': return AUGUST_STORED.settlement;
        case 'dispatch_settlement_line_items': return AUGUST_STORED.lines;
        case 'dispatch_settlement_load_contributions': return AUGUST_STORED.contribs;
        case 'dispatch_settlement_rates': return AUGUST_STORED.rates;
        case 'profiles': return AUGUST_STORED.profiles;
        default: return [];
      }
    };
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rowsFor(), error: null }),
      update: () => builder,
      then: (resolve: any) => resolve({ data: rowsFor(), error: null }),
    };
    return builder;
  };
  return { from: table, rpc: vi.fn() };
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: makeClient() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/dispatchSettlement', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, computeDispatchSettlement: computeSpy };
});

import DispatchSettlementPage from '@/pages/management/DispatchSettlementPage';

describe('the dispatch settlement screen shows stored figures', () => {
  beforeEach(() => {
    touchedTables.length = 0;
    computeSpy.mockClear();
  });

  // This project does not auto-clean between tests; without it each render
  // stacks on the last and a wait can be satisfied by the PREVIOUS screen.
  afterEach(() => cleanup());

  /** Render, then poll until the stored month has painted. */
  async function renderScreen() {
    const view = render(<DispatchSettlementPage />);
    for (let i = 0; i < 200; i++) {
      if ((document.body.textContent ?? '').includes('Net payable')) return view;
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error(`screen never painted: ${document.body.textContent}`);
  }

  it('renders the arithmetic chain from the persisted August 2026 row', async () => {
    await renderScreen();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Eligible base$16,080.47');
    expect(text).toContain('Less factoring at 2.00%-$321.61');
    expect(text).toContain('Reduced base$15,758.86');
    expect(text).toContain('Dispatch fee at 5.00%$787.94');
    expect(text).toContain('Net payable$787.94');
    expect(text).toContain('DRAFT');
    expect(text).toContain('Marcus Mueller');
  });

  it('says the rates shown are the ones stored on the settlement', async () => {
    await renderScreen();
    expect(document.body.textContent).toContain(
      'the rates AS STORED ON THIS SETTLEMENT',
    );
  });

  it('shows every stored contribution, and the excluded charges with their reason', async () => {
    await renderScreen();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Loads in the base (7)');
    for (const c of AUGUST_STORED.contribs) expect(text).toContain(c.load_number);

    fireEvent.click(screen.getByText('ST26063').closest('button')!);
    await new Promise(r => setTimeout(r, 100));
    const open = document.body.textContent ?? '';
    expect(open).toContain('lumper');
    expect(open).toContain('lumper_reimbursement_pct');
    expect(open).toContain('tonu');
    expect(open).toContain('72%');
  });

  it('shows the frozen per-dispatcher breakdown, an unattributed bucket, and a total', async () => {
    await renderScreen();
    const table = screen.getByText('By dispatcher — who booked it')
      .parentElement!.querySelector('table')!;
    const t = table.textContent ?? '';
    expect(t).toContain('Jack Barney2$9,050.00');
    expect(t).toContain('Daniel Brown2$4,550.00');
    expect(t).toContain('Unattributed3$2,480.47');
    // The breakdown total  must equal the stored eligible base.
    expect(t).toContain('Total7$16,080.47');
  });

  it('never recomputes: no engine call, and no read of loads or pay policies', async () => {
    await renderScreen();
    expect(computeSpy).not.toHaveBeenCalled();
    expect(touchedTables).not.toContain('loads');
    expect(touchedTables).not.toContain('load_charges');
    expect(touchedTables).not.toContain('pay_policies');
    expect(touchedTables).toContain('dispatch_settlements');
  });

  it('adds no writer of its own, and never sends an actor id from the browser', () => {
    const src = readFileSync('src/pages/management/DispatchSettlementPage.tsx', 'utf8');
    expect([...src.matchAll(/\.rpc\(\s*['"]([a-z_]+)['"]/g)].map(m => m[1])).toEqual([]);
    expect(src).not.toMatch(/\b(approved_by|paid_by|voided_by|created_by|updated_by)\s*:/);
  });
});
