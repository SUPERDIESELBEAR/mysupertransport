/**
 * MODULE 4 (dispatch), PASS 5 — the screen reads STORED rows.
 *
 * The screen exists so a wrong stored figure can be SEEN. A screen that
 * recomputes for display can only ever agree with itself, so the assertions
 * here are mostly negative: the display path never calls the engine, never
 * touches `loads`, `load_charges` or `pay_policies`, and never invents a
 * writer of its own. Everything it prints is derived from the real persisted
 * August 2026 rows in `src/test/fixtures/augustDispatchSettlement.ts`, which
 * were exported from the live tables — the reader is tested against what the
 * Pass 4 writer actually stored, not against a hand-authored shape.
 *
 * The rendered React tree is deliberately NOT mounted here: this project's
 * jsdom + act environment does not settle the page's async read reliably, and
 * a flaky screen test is worse than none. The reader that feeds every figure
 * on the screen is exercised directly instead, and the page file is read as
 * source for the structural guarantees.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AUGUST_STORED } from '@/test/fixtures/augustDispatchSettlement';
import { readStoredDispatchMonth } from '@/lib/dispatchSettlementRun';

const PAGE = 'src/pages/management/DispatchSettlementPage.tsx';
const pageSource = readFileSync(PAGE, 'utf8');

const touchedTables: string[] = [];

/** A query builder that serves the exported rows and records the table read. */
function storedClient() {
  return {
    from(name: string) {
      touchedTables.push(name);
      const rows = (): unknown => {
        switch (name) {
          case 'dispatch_settlements': return AUGUST_STORED.settlement;
          case 'dispatch_settlement_line_items': return AUGUST_STORED.lines;
          case 'dispatch_settlement_load_contributions': return AUGUST_STORED.contribs;
          case 'dispatch_settlement_rates': return AUGUST_STORED.rates;
          case 'profiles': return AUGUST_STORED.profiles;
          default: return [];
        }
      };
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: rows(), error: null }),
        then: (resolve: any) => resolve({ data: rows(), error: null }),
      };
      return b;
    },
    rpc: vi.fn(),
  } as any;
}

async function readAugust() {
  touchedTables.length = 0;
  const stored = await readStoredDispatchMonth(storedClient(), '2026-08');
  if (!stored) throw new Error('the stored August month did not read back');
  return stored;
}

describe('the dispatch settlement screen reads the stored August 2026 month', () => {
  it('reads back the persisted arithmetic chain unchanged', async () => {
    const { settlement: s } = await readAugust();
    expect(s.status).toBe('draft');
    expect(s.eligible_base).toBe(16080.47);
    expect(s.factoring_pct).toBe(2);
    expect(s.factoring_reduction).toBe(321.61);
    expect(s.reduced_base).toBe(15758.86);
    expect(s.dispatch_pct).toBe(5);
    expect(s.dispatch_fee).toBe(787.94);
    expect(s.deductions_amount).toBe(0);
    expect(s.net_amount).toBe(787.94);
    expect(s.computed_by_name).toBe('Marcus Mueller');
  });

  it('re-adds the stored lines and agrees with the stored totals', async () => {
    const stored = await readAugust();
    expect(stored.totalsCheck.ok).toBe(true);
    expect(stored.totalsCheck.problems).toEqual([]);
    expect(stored.attributionCheck.ok).toBe(true);
  });

  it('shows every stored contribution, with the excluded charges and their reason', async () => {
    const stored = await readAugust();
    expect(stored.contributions.map(c => c.load_number)).toEqual([
      'ST-TEST-003', 'ST-TEST-005', 'ST26056', 'ST26058', 'ST26059', 'ST26060', 'ST26063',
    ]);

    const lumperLoad = stored.contributions.find(c => c.load_number === 'ST26063')!;
    const lumper = lumperLoad.verdicts.find(v => v.charge_type === 'lumper')!;
    expect(lumper.excluded).toBe(true);
    expect(lumper.exclusion_reason).toBe('pct_100');
    expect(lumper.resolved_pct).toBe(100);
    expect(lumper.pct_column).toBe('lumper_reimbursement_pct');

    const tonu = lumperLoad.verdicts.find(v => v.charge_type === 'tonu')!;
    expect(tonu.excluded).toBe(false);
    expect(tonu.resolved_pct).toBe(72);

    const detentionLoad = stored.contributions.find(c => c.load_number === 'ST26056')!;
    expect(detentionLoad.charges_excluded_count).toBe(1);
    expect(detentionLoad.verdicts[0].pct_column).toBe('detention_pct');
  });

  it('builds the frozen dispatcher breakdown with an unattributed bucket that totals the base', async () => {
    const { byDispatcher, byDispatcherTotal, settlement } = await readAugust();
    const named = Object.fromEntries(byDispatcher.map(b => [b.name, b]));
    expect(named['Jack Barney'].base).toBe(9050);
    expect(named['Jack Barney'].loads).toBe(2);
    expect(named['Daniel Brown'].base).toBe(4550);
    expect(named['Daniel Brown'].loads).toBe(2);
    expect(named['Unattributed'].base).toBe(2480.47);
    expect(named['Unattributed'].loads).toBe(3);
    // The unattributed bucket is always present, even when it is empty.
    expect(byDispatcher.some(b => b.dispatcherId === null)).toBe(true);
    // Attribution is presentational: the buckets must sum to the paid base.
    expect(byDispatcherTotal).toBe(settlement.eligible_base);
  });

  it('never recomputes: no read of loads, charges or pay policies', async () => {
    await readAugust();
    expect(touchedTables).toContain('dispatch_settlements');
    expect(touchedTables).not.toContain('loads');
    expect(touchedTables).not.toContain('load_charges');
    expect(touchedTables).not.toContain('pay_policies');
    // The display path imports no engine.
    expect(pageSource).not.toMatch(/computeDispatchSettlement/);
  });

  it('adds no writer of its own and never sends an actor id from the browser', () => {
    // The only RPC the page may reach is the Pass 4 writer, and only through
    // the run layer — the page calls no RPC by name itself.
    expect([...pageSource.matchAll(/\.rpc\(\s*['"]([a-z_]+)['"]/g)].map(m => m[1])).toEqual([]);
    expect(pageSource).not.toMatch(/\b(approved_by|paid_by|voided_by|created_by|updated_by)\s*:/);
  });

  it('offers no recompute on a paid settlement and requires a reason to void', () => {
    expect(pageSource).toMatch(/isPaid\s*=\s*s\?\.status === 'paid'/);
    expect(pageSource).toMatch(/\{!isPaid && \(/);
    expect(pageSource).toMatch(/disabled=\{!voidReason\.trim\(\)/);
  });
});

/**
 * MODULE 4 (dispatch), Pass 5b — actor attribution.
 *
 * The August row predates actor stamping: `approved_by`, `paid_by` and
 * `voided_by` are NULL on it. The reader must return nulls rather than throw,
 * and the page must print an honest placeholder rather than an empty cell.
 */
describe('actor attribution on a row that predates stamping', () => {
  it('reads NULL actors back as null without breaking', async () => {
    const { settlement: s } = await readAugust();
    expect(s.approved_by_name).toBeNull();
    expect(s.paid_by_name).toBeNull();
    expect(s.voided_by_name).toBeNull();
  });

  it('the page prints an honest placeholder for a missing actor', () => {
    expect(pageSource).toContain('actor not recorded (predates actor stamping)');
    expect(pageSource).toContain('paid_by_name');
    expect(pageSource).toContain('voided_by_name');
  });
});
