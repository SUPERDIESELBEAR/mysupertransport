import { describe, expect, it } from 'vitest';
import {
  FuelCsvFormatError, MULTISERVICE_HEADER, REQUIRED_COLUMNS, columnDriftNotice,
  deriveLines, fileDateRange, parseInvoiceDate, parseMoney, parseMultiserviceCsv,
  reconcile, reconciliationWarning, splitCsvLine, unrecognizedColumnsNotice,
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

  /**
   * Pass 2 retired the positional contract. A renamed category no longer
   * shifts values — it is simply unrecognised, and the MONEY is what shows the
   * money went missing: the categories left no longer reach Total Amount.
   */
  it('does not shift values when a column is renamed — it reports and does not add up', () => {
    const renamed = HEADER.replace('"Diesel2 Cost"', '"Diesel Cost"');
    const parsed = parseMultiserviceCsv(`${renamed}\n${row()}`);
    expect(parsed.columns.unrecognized).toEqual(['Diesel Cost']);
    expect(parsed.rows[0].diesel_amount).toBe(0);
    expect(parsed.rows[0].reconciliation_ok).toBe(false);
  });

  it('refuses a row whose width does not match the header', () => {
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

/* ==================================================================== */
/* Pass 2 — columns are found by NAME                                    */
/* ==================================================================== */

/** Build a header/row pair from an explicit column list. */
function file(cols: string[], values: Record<string, string>[]): string {
  const head = cols.map((c) => `"${c}"`).join(',');
  const body = values.map((v) => cols.map((c) => `"${v[c] ?? ''}"`).join(','));
  return [head, ...body].join('\n');
}

const LIVE_VALUES: Record<string, string> = {
  'Unit No': '104', 'Card No': '7083320012345', 'Driver Name': 'PRATT JOHNATHAN',
  'City': 'JOPLIN', 'State': 'MO', 'Invoice No': '55231', 'Invoice Date': '8/14/2026',
  'Diesel2 Cost': '$612.40', 'Diesel2 Gallons': '164.320', 'Reefer Cost': '$0.00',
  'Additive Amt': '$0.00', 'Minor Repairs': '$0.00', 'Misc Amt': '$0.00', 'Tires': '$0.00',
  'Daycode': '4', '12 Digit Money': '$0.00', 'E-Money': '$0.00', 'Insta Money®': '$0.00',
  'Bulk DEF Amount': '$0.00', 'Bulk DEF Quantity': '0.000', 'Fees': '$2.50',
  'Fuel Disc Amt': '-$24.65', 'Total Amount': '$590.25',
};

describe('columns are located by name, not by position', () => {
  it('parses a reordered file identically to the live order', () => {
    const inOrder = parseMultiserviceCsv(`${HEADER}\n${row()}`).rows[0];
    const shuffled = [...MULTISERVICE_HEADER].reverse();
    const other = parseMultiserviceCsv(file(shuffled, [LIVE_VALUES])).rows[0];
    expect({ ...other, lines: other.lines }).toEqual({ ...inOrder, lines: inOrder.lines });
  });

  it('fails naming the required column that is missing', () => {
    const cols = MULTISERVICE_HEADER.filter((c) => c !== 'Invoice Date');
    expect(() => parseMultiserviceCsv(file([...cols], [LIVE_VALUES])))
      .toThrow(/Required column missing: "Invoice Date"/);
  });

  it('treats a missing OPTIONAL column as zero and says it is absent', () => {
    const cols = MULTISERVICE_HEADER.filter((c) => c !== 'Minor Repairs');
    const parsed = parseMultiserviceCsv(file([...cols], [LIVE_VALUES]));
    expect(parsed.rows[0].minor_repairs_amount).toBe(0);
    expect(parsed.columns.missing_optional).toContain('Minor Repairs');
  });

  it('ignores an unrecognised column and reports it by name', () => {
    const parsed = parseMultiserviceCsv(
      file([...MULTISERVICE_HEADER, 'Merchant City', 'VIN'], [{ ...LIVE_VALUES, VIN: '1XK' }]),
    );
    expect(parsed.columns.unrecognized).toEqual(['Merchant City', 'VIN']);
    expect(unrecognizedColumnsNotice(parsed.columns))
      .toBe('2 columns not recognised: Merchant City, VIN.');
    expect(parsed.rows[0].total_amount).toBe(590.25);
  });

  it('refuses a header that names the same column twice', () => {
    expect(() => parseMultiserviceCsv(file([...MULTISERVICE_HEADER, 'Fees'], [LIVE_VALUES])))
      .toThrow(/Duplicate column name/);
  });

  it('parses a carrier who exports CNG and Diesel 1 — categories nobody here uses', () => {
    const cols = [...REQUIRED_COLUMNS, 'CNG Amount', 'CNG Quantity', 'Diesel 1 Amount'];
    const parsed = parseMultiserviceCsv(file([...cols], [{
      'Card No': '70833200999', 'Invoice No': '900', 'Invoice Date': '8/14/2026',
      'CNG Amount': '$120.00', 'CNG Quantity': '30.000', 'Diesel 1 Amount': '$80.00',
      'Total Amount': '$200.00',
    }]));
    expect(parsed.rows[0].lines).toEqual([
      { line_type: 'diesel1', amount: 80, quantity: 0 },
      { line_type: 'cng', amount: 120, quantity: 30 },
    ]);
    expect(parsed.rows[0].reconciliation_ok).toBe(true);
  });
});

describe('the money is what catches a forgotten checkbox', () => {
  it('warns with the shortfall and the row count, and names the likely cause', () => {
    const short = { ...LIVE_VALUES, 'Total Amount': '$902.65' }; // $312.40 unaccounted
    const parsed = parseMultiserviceCsv(file([...MULTISERVICE_HEADER], [short]));
    expect(parsed.flaggedCount).toBe(1);
    expect(reconciliationWarning(parsed)).toBe(
      'Categories present do not sum to Total Amount on 1 row, short by $312.40. '
      + 'A category column may be missing from this export.',
    );
  });

  it('says nothing when every row adds up', () => {
    expect(reconciliationWarning(parseMultiserviceCsv(`${HEADER}\n${row()}`))).toBeNull();
  });

  it('names the column the last import had and this one does not', () => {
    const cols = MULTISERVICE_HEADER.filter((c) => c !== 'Minor Repairs');
    const parsed = parseMultiserviceCsv(file([...cols], [LIVE_VALUES]));
    expect(columnDriftNotice(parsed.columns, [...MULTISERVICE_HEADER])).toBe(
      'This file has 22 columns. The last import had 23. `Minor Repairs` is absent.',
    );
  });

  it('says nothing when the column set is unchanged', () => {
    const parsed = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    expect(columnDriftNotice(parsed.columns, [...MULTISERVICE_HEADER])).toBeNull();
  });
});

describe('REGRESSION — the live 23-column file is unchanged', () => {
  it('produces the same row it always did', () => {
    const { rows, flaggedCount, columns } = parseMultiserviceCsv(`${HEADER}\n${row()}`);
    expect(flaggedCount).toBe(0);
    expect(columns.unrecognized).toEqual([]);
    expect(columns.recognized).toHaveLength(23);
    expect(rows[0]).toMatchObject({
      unit_no: '104', card_no: '7083320012345', driver_name: 'PRATT JOHNATHAN',
      city: 'JOPLIN', state: 'MO', invoice_no: '55231', invoice_date: '2026-08-14',
      daycode: '4', diesel_amount: 612.4, diesel_gallons: 164.32, fees_amount: 2.5,
      fuel_discount_amount: -24.65, total_amount: 590.25,
      reconciliation_ok: true, reconciliation_delta: 0,
    });
    expect(rows[0].lines).toEqual([
      { line_type: 'diesel', amount: 612.4, quantity: 164.32 },
      { line_type: 'fees', amount: 2.5, quantity: null },
      { line_type: 'fuel_discount', amount: -24.65, quantity: null },
    ]);
  });
});
