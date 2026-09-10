/**
 * SORTING THE LOCATION REPORT — it reorders rows and changes no figure.
 *
 * The comparator is the shared one in `src/lib/listSorting.ts`; these tests
 * assert the ordering that reaches the screen, over the WHOLE grouping.
 */
import { describe, expect, it } from 'vitest';
import { compareValues } from '@/lib/listSorting';
import { formatFuelDate } from '../fuelBuckets';
import {
  buildFuelLocationReport, locationSortValue,
  type FuelLocationGroup, type FuelLocationTransaction,
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

const rows: FuelLocationTransaction[] = [
  txn({
    id: 'a', merchant_name: 'Loves #822', city: 'Clarksville', state: 'AR',
    diesel_gallons: 100, total_amount: 500,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 500 }],
  }),
  txn({
    id: 'b', merchant_name: 'Flying J #733', city: 'Lubbock', state: 'TX',
    diesel_gallons: 50, total_amount: 350,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 350 }],
  }),
  txn({
    id: 'c', merchant_name: 'TA Express Kilgore #281', city: 'Kilgore', state: 'TX',
    diesel_gallons: 10, total_amount: 52,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 52 }],
  }),
  txn({
    id: 'd', merchant_name: 'Tiger Truck Stop', city: 'Grosse Tete', state: 'LA',
    diesel_gallons: 0, total_amount: 500,
    fuel_transaction_lines: [{ line_type: 'cash_advance_emoney', amount: 500 }],
  }),
];

const report = buildFuelLocationReport(rows, '2026-08-01', '2026-09-30');

const sorted = (groups: FuelLocationGroup[], column: string, direction: 'asc' | 'desc') =>
  [...groups].sort((a, b) =>
    compareValues(locationSortValue(a, column), locationSortValue(b, column), direction));

describe('the summary line prints dates the way the app prints dates', () => {
  it('renders the range MM/DD/YYYY, not ISO', () => {
    expect(formatFuelDate(report.from)).toBe('08/01/2026');
    expect(formatFuelDate(report.to)).toBe('09/30/2026');
  });
});

describe('every column sorts the whole grouping both ways', () => {
  for (const column of ['location', 'purchases', 'gallons', 'fuelSpend', 'costPerGallon']) {
    it(`orders by ${column} ascending and descending`, () => {
      for (const groups of [report.byChain, report.byState, report.byTruckStop]) {
        const asc = sorted(groups, column, 'asc');
        const desc = sorted(groups, column, 'desc');
        expect(asc).toHaveLength(groups.length);
        // Nulls last in BOTH directions, so compare only the non-null prefix.
        const present = (list: FuelLocationGroup[]) =>
          list.map((g) => locationSortValue(g, column)).filter((v) => v !== null);
        expect([...present(desc)].reverse()).toEqual(present(asc));
        const values = present(asc);
        for (let i = 1; i < values.length; i += 1) {
          expect(compareValues(values[i - 1], values[i], 'asc')).toBeLessThanOrEqual(0);
        }
      }
    });
  }
});

describe('cheapest and dearest sit at the ends', () => {
  it('puts the lowest price first ascending and the highest first descending', () => {
    const asc = sorted(report.byChain, 'costPerGallon', 'asc');
    const desc = sorted(report.byChain, 'costPerGallon', 'desc');
    expect(asc[0].key).toBe("Love's");        // $5.000
    expect(asc[0].costPerGallon).toBe(5);
    expect(desc[0].key).toBe('Pilot Flying J'); // $7.000
    expect(desc[0].costPerGallon).toBe(7);
    // A group that bought no gallons has no price and sorts last either way.
    expect(asc[asc.length - 1].costPerGallon).toBeNull();
    expect(desc[desc.length - 1].costPerGallon).toBeNull();
  });
});

describe('sorting alters no figure', () => {
  it('returns the same rows with the same numbers in every order', () => {
    const before = JSON.stringify([...report.byChain].sort((a, b) => a.key.localeCompare(b.key)));
    for (const column of ['location', 'purchases', 'gallons', 'fuelSpend', 'costPerGallon']) {
      for (const direction of ['asc', 'desc'] as const) {
        const after = JSON.stringify(
          sorted(report.byChain, column, direction).sort((a, b) => a.key.localeCompare(b.key)));
        expect(after).toBe(before);
      }
    }
  });

  it('leaves the weighted report totals untouched', () => {
    sorted(report.byChain, 'costPerGallon', 'desc');
    expect(report.purchases).toBe(4);
    expect(report.gallons).toBe(160);
    expect(report.fuelSpend).toBe(902);
  });
});
