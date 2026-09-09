/**
 * THE DOCUMENT A DRIVER KEEPS.
 *
 * The PDF is a THIRD surface over figures two screens already print, so the
 * only failure worth asserting is divergence: the document must be built from
 * the same rows, in the same order, with the same two totals kept apart — and
 * it must not reintroduce the staff diagnostics the operator screen excludes.
 */
import { TABLE_LAYOUT } from '../fuelDriverPdf';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FUEL_PDF_EMPTY_MESSAGE, buildFuelPdfDocument, coveredRange,
} from '../fuelDriverPdf';
import { buildDriverRows, summarizeDriverRows, type FuelDriverTransaction, type SettledFuelIndex } from '../fuelDriverDetail';
import { shapeMyFuel } from '../myFuel';

const DOW_WEDNESDAY = 3;
const GENERATED = new Date('2026-09-09T12:00:00');

/** Ali Mohamed's three real purchases, as the management screen selects them. */
const managementTxns: FuelDriverTransaction[] = [
  {
    id: 'a', invoice_no: '770001', invoice_date: '2026-09-01',
    merchant_name: 'Flying J #733', city: 'LUBBOCK', state: 'TX',
    total_amount: 505.96, fuel_discount_amount: -8.12,
    diesel_amount: 514.08, diesel_gallons: 81.23,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 514.08 }],
  },
  {
    id: 'b', invoice_no: '770002', invoice_date: '2026-09-01',
    merchant_name: 'Pilot Travel Center #1033', city: 'MIDLAND', state: 'TX',
    total_amount: 625.26, fuel_discount_amount: -2.04,
    diesel_amount: 122.30, diesel_gallons: 20.39,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 122.30 },
      { line_type: 'cash_advance_emoney', amount: 500 },
      { line_type: 'fees', amount: 5 },
    ],
  },
  {
    id: 'c', invoice_no: '770003', invoice_date: '2026-08-29',
    merchant_name: 'Loves #822', city: 'CLARKSVILLE', state: 'AR',
    total_amount: 829.34, fuel_discount_amount: 0,
    diesel_amount: 829.34, diesel_gallons: 132.06,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [{ line_type: 'diesel', amount: 829.34 }],
  },
];

/** The SAME three, as `my_fuel_transactions()` hands them to the driver. */
const rpcRows = managementTxns.map((t) => ({
  id: t.id, invoice_no: t.invoice_no, invoice_date: t.invoice_date,
  merchant_name: t.merchant_name, city: t.city, state: t.state,
  total_amount: t.total_amount, fuel_discount_amount: t.fuel_discount_amount,
  diesel_amount: t.diesel_amount, diesel_gallons: t.diesel_gallons,
  lines: t.fuel_transaction_lines ?? [],
  settlement_id: null, period_start: null, period_end: null,
  payday: null, settlement_status: null, work_week_start_dow: DOW_WEDNESDAY,
}));

const input = (rows: ReturnType<typeof buildDriverRows>) => ({
  driverName: 'Ali Mohamed', unitNumber: '260', rows, generatedAt: GENERATED,
});

describe('the PDF cannot print different money from the screens', () => {
  it('matches the management screen for the same driver and period', () => {
    const rows = buildDriverRows(managementTxns, {}, DOW_WEDNESDAY);
    const doc = buildFuelPdfDocument(input(rows));
    const screen = summarizeDriverRows(rows);

    // Same rows, same order.
    expect(doc.rows.map((r) => r[0])).toEqual(rows.map((r) => r.dateLabel));
    expect(doc.rows).toHaveLength(3);
    // Same money, to the cent.
    expect(doc.pending.amount).toBe('$1,960.56');
    expect(screen.pending.total).toBe(1960.56);
    expect(doc.pending.breakdown).toEqual([
      { label: 'Fuel', value: '$1,465.72' },
      { label: 'Cash advance', value: '$505.00' },
      { label: 'Repairs', value: '—' },
      { label: 'Other', value: '—' },
      { label: 'Discount', value: '-$10.16' },
      { label: 'Gallons', value: '233.68' },
    ]);
  });

  it('matches the operator screen for the same driver', () => {
    const mine = shapeMyFuel(rpcRows);
    const driverDoc = buildFuelPdfDocument(input(
      buildDriverRows(mine.transactions, mine.settled, mine.workWeekStartDow),
    ));
    const officeDoc = buildFuelPdfDocument(input(
      buildDriverRows(managementTxns, {}, DOW_WEDNESDAY),
    ));
    expect(driverDoc).toEqual(officeDoc);
  });
});

describe('settled and pending never meet in print', () => {
  const settled: SettledFuelIndex = {
    c: {
      settlementId: 's1', periodStart: '2026-08-26', periodEnd: '2026-09-01',
      payday: '2026-09-15', status: 'paid',
    },
  };

  it('totals them in two blocks and offers no combined figure', () => {
    const rows = buildDriverRows(managementTxns, settled, DOW_WEDNESDAY);
    const doc = buildFuelPdfDocument(input(rows));
    expect(doc.settled.amount).toBe('$829.34');
    expect(doc.settled.countLabel).toBe('1 purchase');
    expect(doc.pending.amount).toBe('$1,131.22');
    expect(doc.pending.countLabel).toBe('2 purchases');
    // 1960.56 is the sum of the two; it appears nowhere in the document.
    expect(JSON.stringify(doc)).not.toContain('1,960.56');
  });

  it('says "Not yet deducted" in words on every pending row', () => {
    const rows = buildDriverRows(managementTxns, settled, DOW_WEDNESDAY);
    const doc = buildFuelPdfDocument(input(rows));
    const last = (cells: string[]) => cells[cells.length - 1];
    expect(doc.rows.filter((_, i) => doc.pendingFlags[i]).map(last))
      .toEqual(['Not yet deducted', 'Not yet deducted']);
    expect(doc.rows.filter((_, i) => !doc.pendingFlags[i]).map(last))
      .toEqual(['Week of 08/26/2026 – 09/01/2026 · paid 09/15/2026']);
  });
});

describe('nothing about our own records reaches the driver', () => {
  it('prints no match status, diagnosis or reconciliation field', () => {
    const flagged = managementTxns.map((t) => ({
      ...t, reconciliation_ok: false, reconciliation_delta: 42,
    }));
    const doc = buildFuelPdfDocument(input(buildDriverRows(flagged, {}, DOW_WEDNESDAY)));
    const text = JSON.stringify(doc).toLowerCase();
    for (const word of ['reconcil', 'match', 'unmatched', 'disagree', 'flagged', '42']) {
      expect(text).not.toContain(word);
    }
  });

  it('never reads the importer verdict off the row', () => {
    const src = readFileSync('src/lib/fuel/fuelDriverPdf.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('reconciliationOk');
  });

  it('computes no money of its own and reaches no database', () => {
    const src = readFileSync('src/lib/fuel/fuelDriverPdf.ts', 'utf8');
    expect(src).not.toContain('supabase');
    expect(src).not.toContain('line_type');
    expect(src).toContain("from './fuelDriverDetail'");
  });
});

describe('the driver download cannot reach another driver', () => {
  it('takes no operator id on the operator path', () => {
    const src = readFileSync('src/components/operator/MyFuel/index.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // The only read is the no-argument, self-scoped function.
    expect(code).toContain('fetchMyFuel');
    expect(code).not.toMatch(/operator_?[Ii]d/);
    expect(code).not.toContain('from(');
  });

  it('offers the PDF no parameterised read to substitute an id into', () => {
    const src = readFileSync('src/lib/fuel/myFuel.ts', 'utf8');
    expect(src).toContain("rpc('my_fuel_transactions')");
    expect(src).not.toMatch(/rpc\(\s*'my_fuel_transactions'\s*,/);
  });
});

describe('a driver with no fuel', () => {
  it('produces an empty-state document, not an error', () => {
    const doc = buildFuelPdfDocument(input(buildDriverRows([], {}, DOW_WEDNESDAY)));
    expect(doc.emptyMessage).toBe(FUEL_PDF_EMPTY_MESSAGE);
    expect(doc.rows).toEqual([]);
    expect(doc.settled.amount).toBe('$0.00');
    expect(doc.pending.amount).toBe('$0.00');
    expect(doc.periodLine).toBe('No purchases in this period');
    expect(doc.filename).toBe('fuel-ali-mohamed-no-purchases-2026-09-09.pdf');
    expect(coveredRange([])).toBeNull();
  });
});

describe('the file says who and when without being opened', () => {
  it('names the driver and the period in the filename and the header', () => {
    const doc = buildFuelPdfDocument(input(buildDriverRows(managementTxns, {}, DOW_WEDNESDAY)));
    expect(doc.filename).toBe('fuel-ali-mohamed-2026-08-29-to-2026-09-01.pdf');
    expect(doc.carrier).toBe('SUPERTRANSPORT');
    expect(doc.driverLine).toBe('Ali Mohamed · Unit 260');
    expect(doc.periodLine).toBe('Purchases 08/29/2026 – 09/01/2026');
    expect(doc.generatedLine).toBe('Generated 09/09/2026');
  });
});


describe('the table fits the page it is printed on', () => {
  it('never lays out columns wider than the printable width', () => {
    const sum = TABLE_LAYOUT.widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(TABLE_LAYOUT.printable);
  });
});
