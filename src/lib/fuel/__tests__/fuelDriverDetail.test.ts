/**
 * THE PER-DRIVER FUEL DETAIL VIEW.
 *
 * What is asserted here is not layout. It is the three things that can move
 * money in a reader's head: the order the rows come in, whether a row says it
 * was deducted, and whether deducted and not-yet-deducted money is ever added
 * together. The fourth — that the buckets on a row add up to that row's total —
 * is the same invariant `fuelBuckets.test.ts` holds, checked again here because
 * this view prints the columns and a reader adds them up by eye.
 */
import { describe, expect, it } from 'vitest';
import {
  NOT_YET_DEDUCTED_LABEL, buildDriverRows, filterByPeriod, periodOptions, summarizeDriverRows,
  type FuelDriverTransaction, type SettledFuelIndex,
} from '../fuelDriverDetail';

const DOW_WEDNESDAY = 3;

function txn(over: Partial<FuelDriverTransaction> & { id: string }): FuelDriverTransaction {
  return {
    invoice_no: '770000',
    invoice_date: '2026-08-28',
    merchant_name: 'LOVES 0392',
    city: 'OKLAHOMA CITY',
    state: 'OK',
    total_amount: 500,
    fuel_discount_amount: 0,
    diesel_amount: 500,
    diesel_gallons: 125,
    reconciliation_ok: true,
    reconciliation_delta: 0,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 500 }],
    ...over,
  };
}

describe('the rows come in the order he bought the fuel', () => {
  it('puts the most recent purchase first', () => {
    const rows = buildDriverRows([
      txn({ id: 'a', invoice_date: '2026-08-28' }),
      txn({ id: 'c', invoice_date: '2026-09-01' }),
      txn({ id: 'b', invoice_date: '2026-08-30' }),
    ], {}, DOW_WEDNESDAY);
    expect(rows.map(r => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('breaks a same-day tie by invoice number, never at random', () => {
    const rows = buildDriverRows([
      txn({ id: 'a', invoice_no: '770001' }),
      txn({ id: 'b', invoice_no: '770009' }),
    ], {}, DOW_WEDNESDAY);
    expect(rows.map(r => r.invoiceNo)).toEqual(['770009', '770001']);
  });
});

describe('every row says which check it came out of', () => {
  const settled: SettledFuelIndex = {
    a: {
      settlementId: 's1', periodStart: '2026-08-26', periodEnd: '2026-09-01',
      payday: '2026-09-15', status: 'paid',
    },
  };

  it('names the period and the payday on a settled row', () => {
    const [row] = buildDriverRows([txn({ id: 'a' })], settled, DOW_WEDNESDAY);
    expect(row.deducted).toBe(true);
    expect(row.periodLabel).toBe('Week of 08/26/2026 – 09/01/2026 · paid 09/15/2026');
    expect(row.settlementId).toBe('s1');
  });

  it('says not yet deducted on a pending row, and says nothing else', () => {
    const [row] = buildDriverRows([txn({ id: 'z' })], settled, DOW_WEDNESDAY);
    expect(row.deducted).toBe(false);
    expect(row.periodLabel).toBe(NOT_YET_DEDUCTED_LABEL);
    expect(row.settlementId).toBeNull();
    expect(row.payday).toBeNull();
  });

  it('still attributes a pending row to the week it will land in', () => {
    // 09/01 is a Tuesday: the LAST day of the week that began Wednesday 08/26.
    const [tue] = buildDriverRows([txn({ id: 'a', invoice_date: '2026-09-01' })], {}, DOW_WEDNESDAY);
    // 09/02 is the Wednesday after — the following week, a different check.
    const [wed] = buildDriverRows([txn({ id: 'b', invoice_date: '2026-09-02' })], {}, DOW_WEDNESDAY);
    expect(tue.periodStart).toBe('2026-08-26');
    expect(wed.periodStart).toBe('2026-09-02');
    expect(tue.periodLabel).toBe(NOT_YET_DEDUCTED_LABEL);
  });
});

describe('deducted and not-yet-deducted money never meet', () => {
  const settled: SettledFuelIndex = {
    a: {
      settlementId: 's1', periodStart: '2026-08-26', periodEnd: '2026-09-01',
      payday: '2026-09-15', status: 'paid',
    },
  };

  it('totals them apart, and offers no combined figure', () => {
    const rows = buildDriverRows([
      txn({ id: 'a', total_amount: 500 }),
      txn({ id: 'b', total_amount: 300, invoice_date: '2026-09-03' }),
      txn({ id: 'c', total_amount: 200, invoice_date: '2026-09-04' }),
    ], settled, DOW_WEDNESDAY);
    const summary = summarizeDriverRows(rows);

    expect(summary.settled.total).toBe(500);
    expect(summary.settled.count).toBe(1);
    expect(summary.pending.total).toBe(500);
    expect(summary.pending.count).toBe(2);
    // The shape itself refuses a combined figure.
    expect(Object.keys(summary).sort()).toEqual(['pending', 'settled']);
    expect(Object.values(summary).some(t => (t as { total: number }).total === 1000)).toBe(false);
  });

  it('totals only what is on screen when a period is filtered', () => {
    const rows = buildDriverRows([
      txn({ id: 'a', total_amount: 500 }),
      txn({ id: 'b', total_amount: 300, invoice_date: '2026-09-03' }),
    ], {}, DOW_WEDNESDAY);
    const filtered = filterByPeriod(rows, '2026-09-02');
    expect(filtered.map(r => r.id)).toEqual(['b']);
    expect(summarizeDriverRows(filtered).pending.total).toBe(300);
    expect(periodOptions(rows).map(o => o.value)).toEqual(['2026-09-02', '2026-08-26']);
  });
});

describe('a row adds up the way the reader will add it up', () => {
  it('has its four buckets plus discount equal to the printed total', () => {
    const [row] = buildDriverRows([txn({
      id: 'a',
      total_amount: 680,
      fuel_discount_amount: -20,
      fuel_transaction_lines: [
        { line_type: 'diesel', amount: 500 },
        { line_type: 'cash_advance_emoney', amount: 100 },
        { line_type: 'fees', amount: 5 },
        { line_type: 'minor_repairs', amount: 75 },
        { line_type: 'oil', amount: 20 },
      ],
    })], {}, DOW_WEDNESDAY);

    expect(row.fuel).toBe(500);
    expect(row.cashAdvance).toBe(105);
    expect(row.repair).toBe(75);
    expect(row.other).toBe(20);
    expect(row.discrepancy).toBe(0);
    const sum = row.fuel + row.cashAdvance + row.repair + row.other + row.discount;
    expect(Math.round(sum * 100) / 100).toBe(row.total);
  });

  it('carries an unexplained balance rather than hiding it in Other', () => {
    const [row] = buildDriverRows([txn({
      id: 'a', total_amount: 600, fuel_discount_amount: 0,
      fuel_transaction_lines: [{ line_type: 'diesel', amount: 400 }],
    })], {}, DOW_WEDNESDAY);
    expect(row.other).toBe(0);
    expect(row.discrepancy).toBe(200);
  });

  it('prints the merchant, the location and the cost per gallon', () => {
    const [row] = buildDriverRows([txn({ id: 'a' })], {}, DOW_WEDNESDAY);
    expect(row.merchantName).toBe('LOVES 0392');
    expect(row.location).toBe('OKLAHOMA CITY, OK');
    expect(row.costPerGallon).toBe(4);
  });
});

describe('a driver with no fuel', () => {
  it('produces an empty list and zero totals, not an error', () => {
    const rows = buildDriverRows([], {}, DOW_WEDNESDAY);
    expect(rows).toEqual([]);
    const summary = summarizeDriverRows(rows);
    expect(summary.settled.count).toBe(0);
    expect(summary.pending.count).toBe(0);
    expect(summary.pending.total).toBe(0);
    expect(periodOptions(rows)).toEqual([]);
  });
});
