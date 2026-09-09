/**
 * COST PER GALLON BY LOCATION — the invariants.
 *
 * The assertions that matter: the average is WEIGHTED, a cash advance brings no
 * gallons into it, an unclassifiable merchant is visible rather than dropped,
 * and the three groupings are three views of one set of purchases.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  UNRECOGNISED_CHAIN, buildFuelLocationReport, chainOf, defaultDateRange,
  type FuelLocationTransaction,
} from '../fuelLocationReport';

function txn(over: Partial<FuelLocationTransaction> & { id: string }): FuelLocationTransaction {
  return {
    invoice_no: '1', invoice_date: '2026-08-28', merchant_name: 'Pilot Travel Center #1',
    city: 'Midland', state: 'TX', total_amount: 100, fuel_discount_amount: 0,
    diesel_gallons: 20, reconciliation_ok: true,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 100 }],
    ...over,
  };
}

const RANGE = ['2026-08-01', '2026-09-30'] as const;
const report = (rows: FuelLocationTransaction[]) =>
  buildFuelLocationReport(rows, RANGE[0], RANGE[1]);

describe('the average cost per gallon is weighted, not a mean of rates', () => {
  it('differs from the unweighted mean when purchase sizes differ', () => {
    // 10 gal at $6.00 and 100 gal at $5.00: weighted $5.09, mean of rates $5.50.
    const r = report([
      txn({
        id: 'a', diesel_gallons: 10, total_amount: 60,
        fuel_transaction_lines: [{ line_type: 'diesel', amount: 60 }],
      }),
      txn({
        id: 'b', diesel_gallons: 100, total_amount: 500,
        fuel_transaction_lines: [{ line_type: 'diesel', amount: 500 }],
      }),
    ]);
    const chain = r.byChain.find((g) => g.key === 'Pilot')!;
    expect(chain.costPerGallon).toBe(5.091);
    expect(chain.meanOfRates).toBe(5.5);
    expect(chain.costPerGallon).not.toBe(chain.meanOfRates);
    expect(r.costPerGallon).toBe(5.091);
  });
});

describe('a cash advance has no gallons and no price', () => {
  it('contributes neither spend nor gallons to any average', () => {
    const withoutAdvance = report([txn({ id: 'a' })]);
    const withAdvance = report([
      txn({
        id: 'a', total_amount: 605,
        fuel_transaction_lines: [
          { line_type: 'diesel', amount: 100 },
          { line_type: 'cash_advance_emoney', amount: 500 },
          { line_type: 'fees', amount: 5 },
        ],
      }),
    ]);
    expect(withAdvance.fuelSpend).toBe(withoutAdvance.fuelSpend);
    expect(withAdvance.costPerGallon).toBe(withoutAdvance.costPerGallon);
    expect(withAdvance.byState[0].costPerGallon).toBe(5);
  });

  it('keeps a gallon-less purchase out of the rate list entirely', () => {
    const r = report([
      txn({
        id: 'a', diesel_gallons: 0, total_amount: 500,
        fuel_transaction_lines: [{ line_type: 'cash_advance_emoney', amount: 500 }],
      }),
    ]);
    expect(r.byChain[0].purchases).toBe(1);
    expect(r.byChain[0].costPerGallon).toBeNull();
    expect(r.byChain[0].meanOfRates).toBeNull();
  });
});

describe('a merchant the derivation cannot classify is visible', () => {
  it('groups under Unrecognised rather than being dropped or guessed', () => {
    const r = report([
      txn({ id: 'a' }),
      txn({ id: 'b', merchant_name: 'Frog City Travel Plaza & Casino', city: 'Rayne', state: 'LA' }),
    ]);
    const unknown = r.byChain.find((g) => g.key === UNRECOGNISED_CHAIN)!;
    expect(unknown.purchases).toBe(1);
    expect(unknown.isUnrecognised).toBe(true);
    expect(r.unrecognisedChainPurchases).toBe(1);
    expect(r.byChain.reduce((t, g) => t + g.purchases, 0)).toBe(2);
  });

  it('reads the chain off the names the file actually uses', () => {
    expect(chainOf('Loves Country Stores #852')).toBe("Love's");
    expect(chainOf('Pilot Travel Ctr #035')).toBe('Pilot');
    expect(chainOf('One 9 #265')).toBe('One9');
    expect(chainOf('Thortons #615')).toBe('Thorntons');
    expect(chainOf('TA Express Kilgore #281')).toBe('TA');
    expect(chainOf('Westville Truck Stop')).toBe(UNRECOGNISED_CHAIN);
    expect(chainOf(null)).toBe(UNRECOGNISED_CHAIN);
  });
});

describe('the three groupings describe the same purchases', () => {
  it('each sums to the number of transactions in range', () => {
    const rows = [
      txn({ id: 'a' }),
      txn({ id: 'b', merchant_name: 'Loves #822', city: 'Clarksville', state: 'AR' }),
      txn({ id: 'c', merchant_name: 'Tiger Truck Stop', city: 'Grosse Tete', state: 'LA' }),
      txn({ id: 'd', invoice_date: '2026-12-01' }),
    ];
    const r = report(rows);
    expect(r.purchases).toBe(3);
    for (const groups of [r.byTruckStop, r.byState, r.byChain]) {
      expect(groups.reduce((t, g) => t + g.purchases, 0)).toBe(3);
    }
  });

  it('defaults the range to the thirty days ending on the newest purchase', () => {
    const range = defaultDateRange([txn({ id: 'a', invoice_date: '2026-09-01' })], '2026-12-25');
    expect(range).toEqual({ from: '2026-08-03', to: '2026-09-01' });
  });
});

describe('the report defines no bucket mapping of its own', () => {
  it('goes through the shared assembler', () => {
    const src = readFileSync('src/lib/fuel/fuelLocationReport.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).toContain('fuelBucketLines(');
    expect(/Record<\s*FuelLineType/.test(src)).toBe(false);
    for (const lineType of ['cash_advance_emoney', 'minor_repairs', 'diesel1', 'reefer_cng']) {
      expect(src.includes(lineType)).toBe(false);
    }
  });
});
