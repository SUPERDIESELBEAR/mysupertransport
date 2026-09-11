import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveDiscountPassthrough } from '@/lib/fuel/discountPassthrough';
import { shapeMyFuel } from '@/lib/fuel/myFuel';
import { buildFuelPdfDocument, FUEL_PDF_COLUMNS, TABLE_LAYOUT } from '@/lib/fuel/fuelDriverPdf';
import { buildDriverRows } from '@/lib/fuel/fuelDriverDetail';
import { exceptionCount, toChoice, toValue } from '@/components/management/FuelDiscountPassthroughSettings';

const DOW_WEDNESDAY = 3;

const txn = {
  id: 't1',
  invoice_no: '1',
  invoice_date: '2026-09-01',
  merchant_name: 'Loves',
  city: 'Joplin',
  state: 'MO',
  total_amount: 500,
  fuel_discount_amount: 10.16,
  diesel_amount: 500,
  diesel_gallons: 150,
  reconciliation_ok: true,
  reconciliation_delta: 0,
  fuel_transaction_lines: [{ line_type: 'fuel', amount: 500 }],
};

const rows = buildDriverRows([txn as never], {}, DOW_WEDNESDAY);

const pdf = (showDiscount: boolean) => buildFuelPdfDocument({
  driverName: 'Ali Mohamed', unitNumber: '260', rows,
  generatedAt: new Date('2026-09-09T12:00:00Z'), showDiscount,
});

describe('the setting resolves the same way everywhere', () => {
  it('an unset driver follows the company value', () => {
    expect(resolveDiscountPassthrough(null, true)).toBe(true);
    expect(resolveDiscountPassthrough(undefined, false)).toBe(false);
  });

  it('an explicit driver setting beats the company value both ways', () => {
    expect(resolveDiscountPassthrough(true, false)).toBe(true);
    expect(resolveDiscountPassthrough(false, true)).toBe(false);
  });
});

describe("the driver's own read carries the answer", () => {
  it('reads the resolved flag off the rows', () => {
    expect(shapeMyFuel([{ ...txn, lines: [], settlement_id: null, period_start: null,
      period_end: null, payday: null, settlement_status: null, work_week_start_dow: 3,
      discount_passthrough: true } as never]).discountPassthrough).toBe(true);
  });

  it('treats a missing answer as OFF rather than inventing a discount', () => {
    expect(shapeMyFuel([{ ...txn, lines: [], settlement_id: null, period_start: null,
      period_end: null, payday: null, settlement_status: null, work_week_start_dow: 3,
    } as never]).discountPassthrough).toBe(false);
  });
});

describe('an OFF driver sees no discount on the document he keeps', () => {
  it('drops the column, the cell and the totals line', () => {
    const off = pdf(false);
    expect(off.columns).not.toContain('Discount');
    expect(off.columns).not.toContain('After discount');
    expect(off.columns).toHaveLength(FUEL_PDF_COLUMNS.length - 2);
    expect(off.rows[0]).toHaveLength(FUEL_PDF_COLUMNS.length - 2);
    expect(off.settled.breakdown.map(b => b.label)).not.toContain('Discount');
    expect(off.pending.breakdown.map(b => b.label)).not.toContain('Discount');
    expect(JSON.stringify(off)).not.toMatch(/discount/i);
  });

  it('still fits the page, with the freed width given to the merchant', () => {
    const off = pdf(false);
    expect(off.widths).toHaveLength(off.columns.length);
    const sum = off.widths.reduce((t, w) => t + w, 0);
    expect(sum).toBe(TABLE_LAYOUT.widths.reduce((t, w) => t + w, 0));
    expect(sum).toBeLessThanOrEqual(TABLE_LAYOUT.printable);
  });

  it('an ON driver keeps every column, and the totals are identical either way', () => {
    const on = pdf(true);
    expect(on.columns).toEqual(FUEL_PDF_COLUMNS);
    expect(on.settled.amount).toBe(pdf(false).settled.amount);
    expect(on.pending.amount).toBe(pdf(false).pending.amount);
  });

  it('defaults to showing it when the caller says nothing', () => {
    const doc = buildFuelPdfDocument({
      driverName: 'Ali', unitNumber: null, rows, generatedAt: new Date('2026-09-09T12:00:00Z'),
    });
    expect(doc.columns).toContain('Discount');
  });
});

describe('the control lives in Settlement Settings and nowhere else', () => {
  it('the driver page no longer carries a pass-through control', () => {
    const src = readFileSync('src/pages/staff/OperatorDetailPanel.tsx', 'utf8');
    expect(src).not.toContain('FuelDiscountPassthroughCard');
    expect(src).not.toContain('set_operator_fuel_discount_passthrough');
  });

  it('Settlement Settings renders both controls', () => {
    const src = readFileSync('src/pages/management/SettlementSettingsPage.tsx', 'utf8');
    expect(src).toContain('<FuelDiscountPassthroughSettings />');
  });
});

describe('the exceptions count says how many drivers differ from the rule', () => {
  it('counts only deliberate settings', () => {
    expect(exceptionCount({ a: 'inherit', b: 'on', c: 'off', d: 'inherit' })).toBe(2);
    expect(exceptionCount({})).toBe(0);
  });

  it('round-trips the three states', () => {
    expect(toChoice(null)).toBe('inherit');
    expect(toValue(toChoice(true))).toBe(true);
    expect(toValue(toChoice(false))).toBe(false);
    expect(toValue('inherit')).toBeNull();
  });
});
