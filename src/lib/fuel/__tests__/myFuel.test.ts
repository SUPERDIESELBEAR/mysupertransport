/**
 * THE DRIVER'S VIEW AND THE OFFICE'S VIEW ARE THE SAME NUMBERS.
 *
 * The two screens read through different doors — the office queries
 * `fuel_transactions` directly, the driver calls a self-scoped function — and
 * that is exactly how they could come to disagree. What is asserted here is
 * that once the rows arrive, the SAME builder produces IDENTICAL figures, and
 * that the operator's door hands back nothing about the record's quality.
 */
import { describe, expect, it } from 'vitest';
import { shapeMyFuel, toDriverTransaction, toSettledIndex } from '../myFuel';
import {
  buildDriverRows, summarizeDriverRows, type FuelDriverTransaction, type SettledFuelIndex,
} from '../fuelDriverDetail';

const DOW_WEDNESDAY = 3;

/** One transaction as the FUNCTION returns it to the driver. */
const rpcRows = [
  {
    id: 'a', invoice_no: '770001', invoice_date: '2026-08-28',
    merchant_name: 'LOVES 0392', city: 'OKLAHOMA CITY', state: 'OK',
    total_amount: 680, fuel_discount_amount: -20, diesel_amount: 500, diesel_gallons: 125,
    lines: [
      { line_type: 'diesel', amount: 500 },
      { line_type: 'cash_advance_emoney', amount: 100 },
      { line_type: 'fees', amount: 5 },
      { line_type: 'minor_repairs', amount: 75 },
      { line_type: 'oil', amount: 20 },
    ],
    settlement_id: null, period_start: null, period_end: null,
    payday: null, settlement_status: null, work_week_start_dow: DOW_WEDNESDAY,
  },
  {
    id: 'b', invoice_no: '770009', invoice_date: '2026-09-01',
    merchant_name: 'PILOT 1033', city: 'MIDLAND', state: 'TX',
    total_amount: 300, fuel_discount_amount: 0, diesel_amount: 300, diesel_gallons: 60,
    lines: [{ line_type: 'diesel', amount: 300 }],
    settlement_id: 's1', period_start: '2026-08-26', period_end: '2026-09-01',
    payday: '2026-09-15', settlement_status: 'paid', work_week_start_dow: DOW_WEDNESDAY,
  },
];

/** The SAME two transactions as the MANAGEMENT screen selects them. */
const managementTxns: FuelDriverTransaction[] = [
  {
    id: 'a', invoice_no: '770001', invoice_date: '2026-08-28',
    merchant_name: 'LOVES 0392', city: 'OKLAHOMA CITY', state: 'OK',
    total_amount: 680, fuel_discount_amount: -20, diesel_amount: 500, diesel_gallons: 125,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: rpcRows[0].lines,
  },
  {
    id: 'b', invoice_no: '770009', invoice_date: '2026-09-01',
    merchant_name: 'PILOT 1033', city: 'MIDLAND', state: 'TX',
    total_amount: 300, fuel_discount_amount: 0, diesel_amount: 300, diesel_gallons: 60,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: rpcRows[1].lines,
  },
];

const managementSettled: SettledFuelIndex = {
  b: {
    settlementId: 's1', periodStart: '2026-08-26', periodEnd: '2026-09-01',
    payday: '2026-09-15', status: 'paid',
  },
};

describe('the operator view cannot show different money from the management view', () => {
  it('produces byte-identical rows for the same driver and period', () => {
    const mine = shapeMyFuel(rpcRows);
    const driverRows = buildDriverRows(mine.transactions, mine.settled, mine.workWeekStartDow);
    const officeRows = buildDriverRows(managementTxns, managementSettled, DOW_WEDNESDAY);
    expect(driverRows).toEqual(officeRows);
  });

  it('produces identical settled and pending totals', () => {
    const mine = shapeMyFuel(rpcRows);
    const driver = summarizeDriverRows(
      buildDriverRows(mine.transactions, mine.settled, mine.workWeekStartDow),
    );
    const office = summarizeDriverRows(buildDriverRows(managementTxns, managementSettled, DOW_WEDNESDAY));
    expect(driver).toEqual(office);
    // And they are apart, not combined: 300 taken, 680 not yet.
    expect(driver.settled.total).toBe(300);
    expect(driver.pending.total).toBe(680);
  });

  it('takes the work week from the function, never from a local default', () => {
    const monday = rpcRows.map((r) => ({ ...r, work_week_start_dow: 1 }));
    expect(shapeMyFuel(monday).workWeekStartDow).toBe(1);
  });
});

describe('the driver is handed his purchases and nothing about our records', () => {
  it('carries no importer verdict that could move a figure', () => {
    const txn = toDriverTransaction(rpcRows[0]);
    expect(txn.reconciliation_ok).toBe(true);
    expect(txn.reconciliation_delta).toBe(0);
  });

  it('marks a transaction deducted only when a settlement is attached', () => {
    const settled = toSettledIndex(rpcRows);
    expect(Object.keys(settled)).toEqual(['b']);
  });
});

describe('a driver with no fuel', () => {
  it('shapes into an empty view, not an error', () => {
    const mine = shapeMyFuel([]);
    expect(mine.transactions).toEqual([]);
    expect(mine.settled).toEqual({});
    const rows = buildDriverRows(mine.transactions, mine.settled, mine.workWeekStartDow);
    expect(rows).toEqual([]);
    expect(summarizeDriverRows(rows).pending.total).toBe(0);
  });
});
