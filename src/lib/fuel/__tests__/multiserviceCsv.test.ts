import { describe, expect, it } from 'vitest';
import {
  FuelCsvFormatError, MULTISERVICE_HEADER, deriveLines, fileDateRange,
  parseInvoiceDate, parseMoney, parseMultiserviceCsv, reconcile, splitCsvLine,
} from '../multiserviceCsv';

/**
 * These assertions are written against the LIVE 297-row export, not against a
 * specification. Each one encodes a trap that file actually contains: the
 * exact header, "$0.00" beside a bare `50` in the same column, a discount that
 * is negative and already subtracted, and rows carrying two categories.
 */

const HEADER = MULTISERVICE_HEADER.map((h) => `"${h}"`).join(',');

/** A row in the file's own shape: 23 columns, quoted, in header order. */
function row(over: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    'Unit No': '104', 'Card No': '7083320012345', 'Driver Name': 'PRATT JOHNATHAN',
    'City': 'JOPLIN', 'State': 'MO', 'Invoice No': '55231', 'Invoice Date': '8/14/2026',
    'Diesel2 Cost': '$612.40', 'Diesel2 Gallons': '164.320', 'Reefer Cost': '$0.00',
    'Additive Amt': '$0.00', 'Minor Repairs': '$0.00', 'Misc Amt': '$0.00', 'Tires': '$0.00',
    'Daycode': '4', '12 Digit Money': '$0.00', 'E-Money': '$0.00', 'Insta Money®': '$0.00',
    'Bulk DEF Amount': '$0.00', 'Bulk DEF Quantity': '0.000', 'Fees': '$2.50',
    'Fuel Disc Amt': '-$24.65', 'Total Amount': '$590.25',
  };
  const merged = { ...base, ...over };
  return MULTISERVICE_HEADER.map((h) => `"${merged[h] ?? ''}"`).join(',');
}

describe('MultiService header is a contract', () => {
  it('accepts the header of the live export verbatim', () => {
    expect(() => parseMultiserviceCsv(`${HEADER}\n${row()}`)).not.toThrow();
  });

  it('refuses a file whose columns were renamed rather than shifting values', () => {
    const renamed = HEADER.replace('"Diesel2 Cost"', '"Diesel Cost"');
    expect(() => parseMultiserviceCsv(`${renamed}\n${row()}`)).toThrow(FuelCsvFormatError);
  });

  it('refuses a file with a column added or removed', () => {
    const short = HEADER.replace(',"Fees"', '');
    expect(() => parseMultiserviceCsv(`${short}\n${row()}`)).toThrow(/23/);
  });

  it('tolerates a UTF-8 BOM ahead of the first column name', () => {
    expect(() => parseMultiserviceCsv(`\uFEFF${HEADER}\n${row()}`)).not.toThrow();
  });
});

describe('money formats on the same column', () => {
  it('reads the two forms Bulk DEF Amount arrives in identically', () => {
    expect(parseMoney('$0.00')).toBe(0);
    expect(parseMoney('50')).toBe(50);
  });

  it('reads thousands separators, negatives and parenthesised negatives', () => {
    expect(parseMoney('$1,234.56')).toBe(1234.56);
    expect(parseMoney('-$24.65')).toBe(-24.65);
    expect(parseMoney('($3.10)')).toBe(-3.1);
  });

  it('treats an empty cell as zero but refuses text', () => {
    expect(parseMoney('')).toBe(0);
    expect(() => parseMoney('N/A', 'Fees')).toThrow(/Fees/);
  });

  it('normalises the date forms the export prints', () => {
    expect(parseInvoiceDate('8/14/2026')).toBe('2026-08-14');
    expect(parseInvoiceDate('08/04/26')).toBe('2026-08-04');
    expect(parseInvoiceDate('2026-08-14')).toBe('2026-08-14');
    expect(() => parseInvoiceDate('Aug 14')).toThrow(FuelCsvFormatError);
  });

  it('splits quoted fields containing commas', () => {
    expect(splitCsvLine('"A","B, Inc","C"')).toEqual(['A', 'B, Inc', 'C']);
  });
});

describe('one row is not one charge', () => {
  it('splits a diesel-plus-DEF row into a line per non-zero category', () => {
    const { rows } = parseMultiserviceCsv(`${HEADER}\n${row({
      'Bulk DEF Amount': '50', 'Bulk DEF Quantity': '12.500', 'Total Amount': '$640.25',
    })}`);
    const types = rows[0].lines.map((l) => l.line_type);
    expect(types).toEqual(['diesel', 'def', 'fees', 'fuel_discount']);
    expect(rows[0].lines.find((l) => l.line_type === 'def')).toMatchObject({
      amount: 50, quantity: 12.5,
    });
  });

  it('never emits a line for a zero category', () => {
    const { rows } = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    expect(rows[0].lines.map((l) => l.line_type)).not.toContain('tires');
  });

  it('keeps the discount as its own negative line rather than folding it into fuel', () => {
    const { rows } = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    const discount = rows[0].lines.find((l) => l.line_type === 'fuel_discount');
    expect(discount?.amount).toBe(-24.65);
    expect(rows[0].lines.find((l) => l.line_type === 'diesel')?.amount).toBe(612.4);
  });

  it('carries gallons on the diesel line and null quantity on amount-only lines', () => {
    const { rows } = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    expect(rows[0].lines.find((l) => l.line_type === 'diesel')?.quantity).toBe(164.32);
    expect(rows[0].lines.find((l) => l.line_type === 'fees')?.quantity).toBeNull();
  });

  it('emits a diesel line for a fuel row that has gallons but no cost', () => {
    const lines = deriveLines({
      ...parseMultiserviceCsv(`${HEADER}\n${row({ 'Diesel2 Cost': '$0.00' })}`).rows[0],
    });
    expect(lines.map((l) => l.line_type)).toContain('diesel');
  });
});

describe('reconciliation flags rather than drops', () => {
  it('accepts the live row where categories equal the printed total', () => {
    const { rows, flaggedCount } = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    expect(rows[0].reconciliation_ok).toBe(true);
    expect(rows[0].reconciliation_delta).toBe(0);
    expect(flaggedCount).toBe(0);
  });

  it('flags a row that does not add up and still imports it', () => {
    const { rows, flaggedCount } = parseMultiserviceCsv(
      `${HEADER}\n${row({ 'Total Amount': '$600.00' })}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reconciliation_ok).toBe(false);
    expect(rows[0].reconciliation_delta).toBeCloseTo(-9.75, 2);
    expect(flaggedCount).toBe(1);
  });

  it('adds the discount like any other category — subtracting would double-count it', () => {
    const { rows } = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    const { ok } = reconcile(rows[0]);
    expect(ok).toBe(true);
    expect(rows[0].fuel_discount_amount).toBeLessThan(0);
  });
});

describe('file-level facts', () => {
  it('reports the date range the file covers', () => {
    const { rows } = parseMultiserviceCsv([
      HEADER,
      row({ 'Invoice Date': '8/14/2026' }),
      row({ 'Invoice Date': '7/29/2026', 'Invoice No': '55100' }),
      row({ 'Invoice Date': '8/02/2026', 'Invoice No': '55150' }),
    ].join('\n'));
    expect(fileDateRange(rows)).toEqual({ start: '2026-07-29', end: '2026-08-14' });
    expect(fileDateRange([])).toEqual({ start: null, end: null });
  });

  it('refuses an empty file', () => {
    expect(() => parseMultiserviceCsv('')).toThrow(FuelCsvFormatError);
  });

  it('keeps the merchant invoice number as printed — it is not globally unique', () => {
    const { rows } = parseMultiserviceCsv([
      HEADER,
      row({ 'Invoice No': '55231', 'Card No': '7083320012345' }),
      row({ 'Invoice No': '55231', 'Card No': '7083320099999' }),
    ].join('\n'));
    // Same number, different card: two distinct transactions, not a duplicate.
    expect(rows.map((r) => r.invoice_no)).toEqual(['55231', '55231']);
    expect(new Set(rows.map((r) => `${r.invoice_no}|${r.invoice_date}|${r.card_no}`)).size).toBe(2);
  });
});
