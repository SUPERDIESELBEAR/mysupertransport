import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_FUEL_PAGE_SIZE, FUEL_MONEY_COLUMNS, buildDisplayRows, filterRows, fuelSortValue,
  pageCount, pageRangeLabel, paginateRows, splitParsedRow, visibleMoneyColumns,
  type FuelDisplayRow,
} from '../fuelImportView';
import { compareValues } from '@/lib/listSorting';
import { FUEL_LINE_TYPE_BUCKET, fuelBucketLines } from '../fuelBuckets';
import { deriveLines, type ParsedFuelRow } from '../multiserviceCsv';
import type { FuelPreviewRow } from '../fuelImport';

/**
 * MODULE 6 — THE IMPORT SCREEN, on fixture evidence.
 *
 * `fuel_transactions` is empty and the 2026-09-05 export was never committed,
 * so every figure here is reconstructed from the numbers recorded under "THE
 * REAL 2026-09-05 EXPORT": 69 rows, $31,913.66, 64 matched / 3 unmatched / 2
 * disagreements, the card-224 advance, the four misc rows and the eleven DEF
 * rows. The assertion that matters is the one the screen exists to make
 * verifiable: Fuel + Advances + Repairs + Other + Unexplained = Total, on
 * EVERY row.
 */

const EMPTY: Omit<ParsedFuelRow, 'lines'> = {
  unit_no: '', card_no: '', driver_name: '', city: '', state: '',
  invoice_no: '', invoice_date: '2026-09-01', daycode: '',
  diesel_amount: 0, diesel_gallons: 0, reefer_amount: 0, additive_amount: 0,
  minor_repairs_amount: 0, misc_amount: 0, tires_amount: 0,
  cash_advance_12digit_amount: 0, cash_advance_emoney_amount: 0,
  cash_advance_insta_amount: 0, def_amount: 0, def_quantity: 0, fees_amount: 0,
  fuel_discount_amount: 0, total_amount: 0,
  extra_amounts: {}, extra_quantities: {},
  reconciliation_ok: true, reconciliation_delta: 0,
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A parsed row with its lines derived by the PARSER, not by this test. */
function row(patch: Partial<ParsedFuelRow>): ParsedFuelRow {
  const base = { ...EMPTY, ...patch, lines: [] } as ParsedFuelRow;
  base.total_amount = r2(base.total_amount);
  base.lines = deriveLines(base);
  return base;
}

function preview(r: ParsedFuelRow, patch: Partial<FuelPreviewRow> = {}): FuelPreviewRow {
  return {
    invoice_no: r.invoice_no,
    invoice_date: r.invoice_date,
    card_no: r.card_no,
    unit_no: r.unit_no || null,
    driver_name: r.driver_name || null,
    total_amount: r.total_amount,
    duplicate: false,
    operator_id: 'op-1',
    match_status: 'matched',
    disagreement_fields: [],
    reconciliation_ok: r.reconciliation_ok,
    reconciliation_delta: r.reconciliation_delta,
    ...patch,
  };
}

/* ------------------------------------------------------------------ */
/* The 2026-09-05 export, reconstructed                                */
/* ------------------------------------------------------------------ */

const CARD_224 = row({
  card_no: '224', driver_name: 'CARD 224', invoice_no: '771030',
  invoice_date: '2026-09-01',
  cash_advance_emoney_amount: 500, fees_amount: 5,
  diesel_amount: 120.26, diesel_gallons: 32.5,
  total_amount: 625.26,
});

/** The other two unmatched rows on the same card. */
const CARD_224_OTHERS = [
  row({ card_no: '224', invoice_no: '771031', invoice_date: '2026-08-31', diesel_amount: 402.11, diesel_gallons: 110.4, total_amount: 402.11 }),
  row({ card_no: '224', invoice_no: '771032', invoice_date: '2026-08-30', diesel_amount: 318.4, diesel_gallons: 88.2, total_amount: 318.4 }),
];

/** The two rows on card 205 where the printed unit disagreed with ours. */
const CARD_205 = [
  row({ card_no: '205', unit_no: '9901', driver_name: 'A DRIVER', invoice_no: '770901', invoice_date: '2026-08-29', diesel_amount: 511.03, diesel_gallons: 140.1, total_amount: 511.03 }),
  row({ card_no: '205', unit_no: '9901', driver_name: 'A DRIVER', invoice_no: '770902', invoice_date: '2026-08-30', diesel_amount: 466.77, diesel_gallons: 128.9, total_amount: 466.77 }),
];

/** The four rows carrying a Misc Amt alongside diesel. */
const MISC_AMOUNTS = [15.91, 16.23, 25.07, 34.92];
const MISC_ROWS = MISC_AMOUNTS.map((m, i) => row({
  card_no: `30${i}`, invoice_no: `7710${40 + i}`, invoice_date: '2026-08-28',
  diesel_amount: 300, diesel_gallons: 82.5, misc_amount: m, total_amount: 300 + m,
}));

/** The eleven rows carrying DEF. DEF is FUEL — it gets no column of its own. */
const DEF_ROWS = Array.from({ length: 11 }, (_, i) => row({
  card_no: `40${i}`, invoice_no: `7711${10 + i}`, invoice_date: '2026-08-29',
  diesel_amount: 350, diesel_gallons: 96.2, def_amount: 22.5, def_quantity: 5,
  total_amount: 372.5,
}));

const NAMED = [CARD_224, ...CARD_224_OTHERS, ...CARD_205, ...MISC_ROWS, ...DEF_ROWS];
const EXPORT_TOTAL = 31913.66;
const NAMED_TOTAL = r2(NAMED.reduce((t, r) => t + r.total_amount, 0));
const FILLER_COUNT = 69 - NAMED.length;
/** Plain diesel rows carrying the balance of the file to the recorded cent. */
const FILLER = Array.from({ length: FILLER_COUNT }, (_, i) => {
  const each = Math.floor(((EXPORT_TOTAL - NAMED_TOTAL) / FILLER_COUNT) * 100) / 100;
  const amount = i === FILLER_COUNT - 1
    ? r2(EXPORT_TOTAL - NAMED_TOTAL - each * (FILLER_COUNT - 1))
    : each;
  return row({
    card_no: `50${i}`, invoice_no: `7712${String(i).padStart(2, '0')}`,
    invoice_date: '2026-08-28', diesel_amount: amount, diesel_gallons: r2(amount / 3.65),
    total_amount: amount,
  });
});

const PARSED = [...NAMED, ...FILLER];
const PREVIEW: FuelPreviewRow[] = PARSED.map((p) => {
  if (p.card_no === '224') return preview(p, { match_status: 'unmatched', operator_id: null });
  if (p.card_no === '205') {
    return preview(p, {
      match_status: 'matched_with_disagreement',
      disagreement_fields: [{ field: 'unit_no', csv_value: '9901', system_value: '112' }],
    });
  }
  return preview(p);
});

const DISPLAY = buildDisplayRows(PREVIEW, PARSED);
const find = (invoice: string) => DISPLAY.find((d) => d.invoice_no === invoice)!;
const rowSum = (d: FuelDisplayRow) =>
  r2(d.split.fuel + d.split.cash_advance + d.split.repair + d.split.other
    + d.split.discount + d.split.discrepancy);

describe('the reconstructed 2026-09-05 export', () => {
  it('is 69 rows totalling $31,913.66, 64 matched / 3 unmatched / 2 disagreements', () => {
    expect(DISPLAY).toHaveLength(69);
    expect(r2(DISPLAY.reduce((t, d) => t + d.total_amount, 0))).toBe(EXPORT_TOTAL);
    expect(DISPLAY.filter((d) => d.match_status === 'matched')).toHaveLength(64);
    expect(DISPLAY.filter((d) => d.match_status === 'unmatched')).toHaveLength(3);
    expect(DISPLAY.filter((d) => d.match_status === 'matched_with_disagreement')).toHaveLength(2);
  });

  it('THE INVARIANT — the four columns plus the unexplained one equal Total on every row', () => {
    for (const d of DISPLAY) expect(rowSum(d), `row ${d.invoice_no}`).toBe(d.total_amount);
  });

  it('raises no unexplained balance anywhere in a healthy file', () => {
    expect(DISPLAY.filter((d) => d.split.discrepancy !== 0)).toEqual([]);
  });
});

describe('card 224, 09/01/2026 — the row as rendered', () => {
  const d = find('771030');

  it('splits $625.26 into $120.26 fuel and $505.00 advances, nothing else', () => {
    expect(d.split).toEqual({
      fuel: 120.26, cash_advance: 505, repair: 0, other: 0, discount: 0, discrepancy: 0,
    });
    expect(d.total_amount).toBe(625.26);
    expect(rowSum(d)).toBe(625.26);
  });

  it('keeps the invoice number out of the columns and in the expandable detail', () => {
    expect(d.invoice_no).toBe('771030');
    expect(d.card_no).toBe('224');
  });

  it('shows the gallons and the cost per gallon', () => {
    expect(d.diesel_gallons).toBe(32.5);
    expect(d.cost_per_gallon).toBe(3.7); // 120.26 ÷ 32.5 = 3.7003, to the mill
  });
});

describe('the categories land in the columns the record names', () => {
  it('puts each misc amount in Other, alongside its fuel', () => {
    for (const [i, m] of MISC_AMOUNTS.entries()) {
      const d = find(`7710${40 + i}`);
      expect(d.split.other).toBe(m);
      expect(d.split.fuel).toBe(300);
      expect(rowSum(d)).toBe(d.total_amount);
    }
  });

  it('folds DEF into Fuel rather than giving it a column', () => {
    const d = find('771110');
    expect(d.split.fuel).toBe(372.5);
    expect(d.split.other).toBe(0);
    expect(d.def_quantity).toBe(5);
  });

  it('gives a repair its own column instead of hiding it in Other', () => {
    const repair = row({
      card_no: '601', invoice_no: '900001', diesel_amount: 200, diesel_gallons: 55,
      minor_repairs_amount: 145.5, total_amount: 345.5,
    });
    const split = splitParsedRow(repair);
    expect(split.repair).toBe(145.5);
    expect(split.other).toBe(0);
    expect(r2(split.fuel + split.repair)).toBe(345.5);
  });

  it('shows an unexplained balance in its own column, never folded into Other', () => {
    const broken = row({
      card_no: '602', invoice_no: '900002', diesel_amount: 400, diesel_gallons: 110,
      total_amount: 600, reconciliation_ok: false, reconciliation_delta: -200,
    });
    const split = splitParsedRow(broken);
    expect(split.other).toBe(0);
    expect(split.discrepancy).toBe(200);
    expect(r2(split.fuel + split.discrepancy)).toBe(600);
  });

  it('shows an over-itemised row as a negative unexplained balance, not a credit', () => {
    const over = row({
      card_no: '603', invoice_no: '900003', diesel_amount: 500, diesel_gallons: 130,
      total_amount: 400, reconciliation_ok: false, reconciliation_delta: 100,
    });
    expect(splitParsedRow(over).discrepancy).toBe(-100);
  });
});

describe('the tiles filter the table', () => {
  it('clicking Unmatched shows exactly those three rows', () => {
    const filtered = filterRows(DISPLAY, 'unmatched');
    expect(filtered).toHaveLength(3);
    expect(filtered.every((d) => d.card_no === '224')).toBe(true);
  });

  it('clears back to the whole file with no filter', () => {
    expect(filterRows(DISPLAY, null)).toHaveLength(69);
  });

  it('filters disagreements, duplicates and importable rows too', () => {
    expect(filterRows(DISPLAY, 'disagreement')).toHaveLength(2);
    expect(filterRows(DISPLAY, 'duplicate')).toHaveLength(0);
    expect(filterRows(DISPLAY, 'importable')).toHaveLength(69);
    expect(filterRows(DISPLAY, 'matched')).toHaveLength(64);
  });
});

describe('the columns sort', () => {
  const by = (c: string) => DISPLAY.map((d) => fuelSortValue(d, c));

  it('sorts by driver name, date and total', () => {
    expect(by('total')).toContain(625.26);
    expect(fuelSortValue(find('771030'), 'date')).toBe('2026-09-01');
    expect(fuelSortValue(find('770901'), 'driver')).toBe('9901 · A DRIVER');
  });
});

describe('the screen does not own a second categorisation', () => {
  const src = readFileSync('src/lib/fuel/fuelImportView.ts', 'utf8');

  it('takes its buckets from the shared assembler', () => {
    expect(src).toMatch(/fuelBucketLines/);
    expect(src).toMatch(/from '\.\/fuelBuckets'/);
  });

  it('names no fuel line type of its own', () => {
    const hits = Object.keys(FUEL_LINE_TYPE_BUCKET).filter((t) => src.includes(`'${t}'`));
    expect(hits, `the view module names ${hits.join(', ')} directly`).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* THE DISCOUNT IS NOT A DISCREPANCY                                   */
/* ------------------------------------------------------------------ */

/**
 * The four rows observed live on the 2026-09-05 export, each of which reported
 * its discount as an "Unexplained" balance because the buckets were reconciled
 * against the NET total while the assembler reconciles against the GROSS.
 */
const DISCOUNTED = [
  { fuel: 367.3, discount: -1.41, total: 365.89 },
  { fuel: 642.87, discount: -11.48, total: 631.39 },
  { fuel: 500.01, discount: -1.85, total: 498.16 },
  { fuel: 338.8, discount: -24.14, total: 314.66 },
];

describe('a discount is a named reduction, never an unexplained balance', () => {
  it('leaves Unexplained at zero on every discounted row', () => {
    for (const d of DISCOUNTED) {
      const split = splitParsedRow(row({
        card_no: '700', invoice_no: '910001', diesel_amount: d.fuel, diesel_gallons: 100,
        fuel_discount_amount: d.discount, total_amount: d.total,
      }));
      expect(split.discrepancy, `discount ${d.discount}`).toBe(0);
      expect(split.fuel).toBe(d.fuel);
      expect(split.discount).toBe(d.discount);
      expect(r2(split.fuel + split.discount)).toBe(d.total);
    }
  });

  it('keeps a GENUINE discrepancy distinguishable from a discount', () => {
    const both = splitParsedRow(row({
      card_no: '701', invoice_no: '910002', diesel_amount: 400, diesel_gallons: 110,
      fuel_discount_amount: -10, total_amount: 500,
      reconciliation_ok: false, reconciliation_delta: -100,
    }));
    expect(both.discount).toBe(-10);
    expect(both.discrepancy).toBe(110); // gross 510 − 400 itemised
    expect(r2(both.fuel + both.discount + both.discrepancy)).toBe(500);
  });
});

describe('the settlement still reconciles against the GROSS', () => {
  it('is unchanged by the screen: buckets sum to total minus the discount', () => {
    const r = row({
      card_no: '702', invoice_no: '910003', diesel_amount: 367.3, diesel_gallons: 100,
      fuel_discount_amount: -1.41, total_amount: 365.89,
    });
    const gross = r2(r.total_amount - r.fuel_discount_amount);
    const lines = fuelBucketLines({ grossAmount: gross, lines: r.lines });
    expect(r2(lines.reduce((t, l) => t + l.amount, 0))).toBe(gross);
    expect(lines.some((l) => l.isDiscrepancy)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* PAGING AND COLUMN PRESENCE — Pass 10                                */
/* ------------------------------------------------------------------ */

describe('page size', () => {
  it('defaults to 25 and cuts the page from the whole result set', () => {
    expect(DEFAULT_FUEL_PAGE_SIZE).toBe(25);
    expect(paginateRows(DISPLAY, 25, 1)).toHaveLength(25);
    expect(paginateRows(DISPLAY, 25, 3)).toHaveLength(19);
  });

  it('page size 10 shows ten rows and All shows all sixty-nine', () => {
    expect(paginateRows(DISPLAY, 10, 1)).toHaveLength(10);
    expect(paginateRows(DISPLAY, 'all', 1)).toHaveLength(69);
    expect(pageCount(69, 10)).toBe(7);
    expect(pageCount(69, 'all')).toBe(1);
  });

  it('states the range in context', () => {
    expect(pageRangeLabel(69, 25, 1)).toBe('Showing 1-25 of 69');
    expect(pageRangeLabel(69, 25, 3)).toBe('Showing 51-69 of 69');
    expect(pageRangeLabel(69, 'all', 1)).toBe('Showing 1-69 of 69');
    expect(pageRangeLabel(0, 25, 1)).toBe('Showing 0 of 0');
  });

  it('SORTS ALL 69 THEN PAGINATES — page 1 carries the global first row', () => {
    // The heaviest row is deliberately placed OFF page 1 of the unsorted order,
    // so sorting the visible page instead of the file could not produce it.
    const unsorted = [...DISPLAY].sort((a, b) =>
      compareValues(fuelSortValue(a, 'total'), fuelSortValue(b, 'total'), 'asc'));
    const sorted = [...unsorted].sort((a, b) =>
      compareValues(fuelSortValue(a, 'total'), fuelSortValue(b, 'total'), 'desc'));
    const globalTop = sorted[0];
    expect(paginateRows(sorted, 10, 1)).toEqual(sorted.slice(0, 10));
    expect(paginateRows(sorted, 10, 1)[0].key).toBe(globalTop.key);

    const pageLocal = [...paginateRows(unsorted, 10, 1)].sort((a, b) =>
      compareValues(fuelSortValue(a, 'total'), fuelSortValue(b, 'total'), 'desc'))[0];
    expect(pageLocal.key).not.toBe(globalTop.key);
    expect(globalTop.total_amount).toBeGreaterThan(pageLocal.total_amount);
    expect(paginateRows(sorted, 10, 7)).toHaveLength(9);
    expect(paginateRows(sorted, 10, 7)[8].key).toBe(sorted[68].key);
  });

  it('filtering by a tile then sorting works across the whole filtered set', () => {
    const filtered = filterRows(DISPLAY, 'unmatched');
    expect(filtered).toHaveLength(3);
    const sorted = [...filtered].sort((a, b) =>
      compareValues(fuelSortValue(a, 'total'), fuelSortValue(b, 'total'), 'asc'));
    expect(sorted.map((d) => d.invoice_no)).toEqual(['771032', '771031', '771030']);
    expect(paginateRows(sorted, 10, 1)).toHaveLength(3);
  });
});

describe('empty money columns are hidden', () => {
  it('hides the columns that are zero on every row of the real file', () => {
    const cols = visibleMoneyColumns(DISPLAY);
    expect([...cols].sort()).toEqual(['advances', 'fuel', 'other']);
    expect(cols.has('repairs')).toBe(false);
    expect(cols.has('discount')).toBe(false);
    expect(cols.has('unexplained')).toBe(false);
  });

  it('shows the same column again as soon as ONE row carries a value', () => {
    const discounted = row({
      card_no: '600', invoice_no: '779001', invoice_date: '2026-09-01',
      diesel_amount: 100, diesel_gallons: 27, fuel_discount_amount: -1.41,
      total_amount: 98.59,
    });
    const withDiscount = buildDisplayRows(
      [...PREVIEW, preview(discounted)], [...PARSED, discounted],
    );
    expect(visibleMoneyColumns(withDiscount).has('discount')).toBe(true);
    const repair = row({
      card_no: '601', invoice_no: '779002', invoice_date: '2026-09-01',
      minor_repairs_amount: 240, total_amount: 240,
    });
    const withRepair = buildDisplayRows([...PREVIEW, preview(repair)], [...PARSED, repair]);
    expect(visibleMoneyColumns(withRepair).has('repairs')).toBe(true);
  });

  /**
   * THE FIXTURE PROBLEM, NAMED. Every other fixture in this file carries
   * POSITIVE money, and `discount` is the only money column that is always
   * negative. A visibility check written `> 0` instead of `!== 0` would pass
   * every other test here and silently hide a column carrying real money — on
   * the real 2026-09-05 export, 39 of 69 rows and -$533.63 of it. Reported once
   * as hidden on 2026-09-08; it was a reporting error, not a defect, and this is
   * what keeps it that way.
   */
  it('RENDERS A COLUMN WHOSE ONLY VALUES ARE NEGATIVE', () => {
    const discounts = [-1.41, -11.48, -1.85, -24.14];
    const negativeOnly = discounts.map((d, i) => row({
      card_no: `70${i}`, invoice_no: `78900${i}`, invoice_date: '2026-09-01',
      diesel_amount: 400, diesel_gallons: 100,
      fuel_discount_amount: d, total_amount: r2(400 + d),
    }));
    const rows = buildDisplayRows(negativeOnly.map((r) => preview(r)), negativeOnly);

    // every discount value is strictly negative — nothing here is > 0
    expect(rows.every((r) => r.split.discount < 0)).toBe(true);
    expect(r2(rows.reduce((t, r) => t + r.split.discount, 0))).toBe(-38.88);

    const cols = visibleMoneyColumns(rows);
    expect(cols.has('discount')).toBe(true);
    // and the negative column still brings each row down to the printed Total
    for (const r of rows) {
      const shown = FUEL_MONEY_COLUMNS
        .filter((c) => cols.has(c.key))
        .reduce((t, c) => t + r.split[c.field], 0);
      expect(r2(shown)).toBe(r.total_amount);
    }
  });


  it('COMPUTES OVER THE WHOLE FILE, not the filtered subset', () => {
    // Advances live only on card 224. Filtering them away must NOT hide the column.
    const filtered = filterRows(DISPLAY, 'matched');
    expect(filtered.some((d) => d.split.cash_advance !== 0)).toBe(false);
    expect(visibleMoneyColumns(DISPLAY).has('advances')).toBe(true);
  });

  it('THE SUM-CHECK SURVIVES HIDING — visible columns still equal Total on every row', () => {
    const cols = visibleMoneyColumns(DISPLAY);
    for (const d of DISPLAY) {
      const shown = FUEL_MONEY_COLUMNS
        .filter((c) => cols.has(c.key))
        .reduce((t, c) => t + d.split[c.field], 0);
      expect(r2(shown)).toBe(d.total_amount);
      // a hidden column is empty BY DEFINITION — that is why the sum holds
      for (const c of FUEL_MONEY_COLUMNS) {
        if (!cols.has(c.key)) expect(d.split[c.field]).toBe(0);
      }
    }
  });
});
