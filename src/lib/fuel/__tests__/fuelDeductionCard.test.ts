/**
 * THE TOTAL LABELLED "DEDUCTED" IS THE DEDUCTION — 2026-09-11.
 *
 * Driver Fuel Detail headed a card "Not yet deducted" and printed $1,960.56 for
 * Ali Mohamed — the NET, what MultiService billed the company. He is on
 * pass-through OFF, so $1,970.72 leaves his pay and the printed figure appears
 * on no settlement of his. These fixtures are his three real purchases.
 *
 * The per-transaction table is UNCHANGED — net per row, Discount column — and
 * the driver-facing PDF is UNCHANGED. Both are asserted below.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDriverRows, summarizeDriverRows, type FuelDriverTransaction,
} from '../fuelDriverDetail';
import { buildDeductionCard, passthroughLabel } from '../fuelDeductionCard';
import { resolveDiscountPassthrough } from '../discountPassthrough';
import { buildFuelPdfDocument } from '../fuelDriverPdf';

const DOW_WEDNESDAY = 3;

/** Ali Mohamed's three real purchases, exactly as stored. */
const ALI: FuelDriverTransaction[] = [
  {
    id: 'a', invoice_no: '5533430', invoice_date: '2026-09-01',
    merchant_name: 'Flying J #733', city: 'Lubbock', state: 'TX',
    total_amount: 505.96, fuel_discount_amount: -8.12,
    diesel_amount: 462.91, diesel_gallons: 81.23,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 462.91 },
      { line_type: 'def', amount: 51.17 },
      { line_type: 'fuel_discount', amount: -8.12 },
    ],
  },
  {
    id: 'b', invoice_no: '1333199', invoice_date: '2026-09-01',
    merchant_name: 'Pilot Travel Center #1033', city: 'Midland', state: 'TX',
    total_amount: 625.26, fuel_discount_amount: -2.04,
    diesel_amount: 122.30, diesel_gallons: 20.39,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 122.30 },
      { line_type: 'cash_advance_emoney', amount: 500 },
      { line_type: 'fees', amount: 5 },
      { line_type: 'fuel_discount', amount: -2.04 },
    ],
  },
  {
    id: 'c', invoice_no: '50895', invoice_date: '2026-08-29',
    merchant_name: 'Loves #822', city: 'Clarksville', state: 'AR',
    total_amount: 829.34, fuel_discount_amount: 0,
    diesel_amount: 777.69, diesel_gallons: 132.06,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 777.69 },
      { line_type: 'def', amount: 51.65 },
    ],
  },
];

const rows = buildDriverRows(ALI, {}, DOW_WEDNESDAY);
const pending = summarizeDriverRows(rows).pending;

describe('pass-through OFF: the deduction is the gross, the discount is retained', () => {
  const card = buildDeductionCard(pending, false);

  it('the headline is what leaves his pay, not what the company was billed', () => {
    expect(card.headline).toBe(1970.72);
    expect(card.headline).not.toBe(1960.56);
  });

  it('shows the discount as kept by the company, with the billed amount beneath', () => {
    expect(card.discountLine?.amount).toBe(-10.16);
    expect(card.discountLine?.label).toBe('Discount retained by company');
    expect(card.discountLine?.credit).toBeUndefined();
    expect(card.netLine).toEqual({ label: 'Billed to the company', amount: 1960.56 });
    expect(card.stateNote).toMatch(/deducted the gross/i);
  });
});

describe('pass-through ON: the same deduction, credited back', () => {
  const card = buildDeductionCard(pending, true);

  it('deducts the same gross and nets out to the billed amount', () => {
    expect(card.headline).toBe(1970.72);
    expect(card.discountLine).toEqual({
      label: 'Discount credited to driver', amount: -10.16, credit: true,
    });
    expect(card.netLine).toEqual({ label: 'Net deduction', amount: 1960.56 });
  });

  it('the two states are told apart by their own words', () => {
    expect(buildDeductionCard(pending, true).stateNote)
      .not.toBe(buildDeductionCard(pending, false).stateNote);
  });
});

describe('a driver with no discount gets no extra lines in either state', () => {
  const noDiscount = summarizeDriverRows(
    buildDriverRows([ALI[2]], {}, DOW_WEDNESDAY),
  ).pending;

  it('prints one figure and stops', () => {
    for (const on of [true, false]) {
      const card = buildDeductionCard(noDiscount, on);
      expect(card.headline).toBe(829.34);
      expect(card.discountLine).toBeNull();
      expect(card.netLine).toBeNull();
    }
  });
});

describe('the per-transaction table is unchanged in both states', () => {
  it('every row still carries the NET total and its own discount', () => {
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.a.total).toBe(505.96);
    expect(byId.b.total).toBe(625.26);
    expect(byId.c.total).toBe(829.34);
    expect(byId.a.discount).toBe(-8.12);
    expect(byId.b.discount).toBe(-2.04);
    expect(pending.total).toBe(1960.56);
    // The rows are state-independent: the card is the only thing that branches.
    expect(buildDriverRows(ALI, {}, DOW_WEDNESDAY)).toEqual(rows);
  });
});

describe('the state shown is the state the engine would resolve', () => {
  it('label follows override-first, company-fallback resolution', () => {
    expect(passthroughLabel(resolveDiscountPassthrough(null, false)))
      .toBe('Fuel discount: not passed through');
    expect(passthroughLabel(resolveDiscountPassthrough(null, true)))
      .toBe('Fuel discount: passed through to this driver');
    expect(passthroughLabel(resolveDiscountPassthrough(true, false)))
      .toBe('Fuel discount: passed through to this driver');
    expect(passthroughLabel(resolveDiscountPassthrough(false, true)))
      .toBe('Fuel discount: not passed through');
  });
});

describe('the driver-facing document is untouched by this pass', () => {
  it("Ali's PDF still prints the gross $1,970.72 in both states", () => {
    for (const showDiscount of [true, false]) {
      const doc = buildFuelPdfDocument({
        driverName: 'Ali Mohamed', unitNumber: '260', rows,
        generatedAt: new Date('2026-09-11T12:00:00'), showDiscount,
      });
      expect(doc.pending.amount).toBe('$1,970.72');
    }
  });
});
