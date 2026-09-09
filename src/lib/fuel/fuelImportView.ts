/**
 * MODULE 6 — WHAT THE IMPORT SCREEN SHOWS, derived and nothing else.
 *
 * This module is DISPLAY ONLY. It reads a parsed row and the preview verdict
 * the RPC returned for it, and produces the figures the table prints. It
 * computes no money: every amount it emits comes out of `fuelBucketLines`, the
 * SAME assembler the settlement uses. There is deliberately no second
 * categorisation here — a `line_type` is mapped to a bucket in exactly one
 * place, `src/lib/fuel/fuelBuckets.ts`, and the screen inherits it.
 *
 * FOUR BUCKET COLUMNS, NOT THREE. The columns must visibly add up to the total
 * on screen: Fuel + Advances + Repairs + Other = Total. Folding repairs into
 * Other would hide the one category the record says must stay visible, and
 * would make the row's own arithmetic unverifiable by eye. An unexplained
 * balance gets its own column too, for the same reason it gets its own line on
 * the settlement: it is not a category of spending.
 */
import {
  FUEL_DISCREPANCY, fuelBucketLines, type FuelBucket,
} from './fuelBuckets';
import type { ParsedFuelRow } from './multiserviceCsv';
import type { FuelDisagreement, FuelPreviewRow } from './fuelImport';

export interface FuelRowSplit {
  fuel: number;
  cash_advance: number;
  repair: number;
  other: number;
  /**
   * The price reduction already netted into `Total`. Always ≤ 0, shown as its
   * own negative column so the row reads down to the printed Total. It is a
   * KNOWN and NAMED reduction, so it must never appear as a discrepancy.
   */
  discount: number;
  /** Signed. Non-zero only when the itemisation and the total disagree. */
  discrepancy: number;
}


export interface FuelDisplayRow {
  key: string;
  invoice_no: string;
  /** ISO, as stored. Format for display with `formatFuelDate`. */
  invoice_date: string;
  card_no: string;
  unit_no: string | null;
  driver_name: string | null;
  /**
   * The truck stop. Null on any file that did not carry `Merchant Name`, and on
   * every row imported before 2026-09-09. Shown in the expandable row only —
   * the table already carries eleven columns.
   */
  merchant_name: string | null;
  total_amount: number;
  duplicate: boolean;
  match_status: FuelPreviewRow['match_status'];
  /**
   * WHAT THE DIAGNOSIS NEEDS, CARRIED THROUGH. The preview verdict already
   * knows which operator the card resolved to and which fields disagreed; the
   * display row simply stopped carrying them. Passing them along is what makes
   * the SAME `diagnoseUnmatched` / `disagreementMessages` reachable before
   * commit. Nothing is re-derived here.
   */
  operator_id: string | null;
  disagreement_fields: FuelDisagreement[];
  reconciliation_ok: boolean;
  reconciliation_delta: number;
  split: FuelRowSplit;
  /** Diesel gallons off the export, when the column was present. */
  diesel_gallons: number;
  /** Bulk DEF quantity off the export, when the column was present. */
  def_quantity: number;
  /** Diesel cost ÷ diesel gallons. Null unless BOTH are present. */
  cost_per_gallon: number | null;
  /** The discount, already subtracted from the total. Always ≤ 0. */
  fuel_discount_amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const dedupeKey = (r: { invoice_no: string; invoice_date: string; card_no: string }) =>
  `${r.invoice_no}|${r.invoice_date}|${r.card_no}`;

/**
 * The four buckets, the discount and the discrepancy for one parsed row, taken
 * straight off `fuelBucketLines`.
 *
 * THE TWO TOTALS, RECONCILED. `fuelBucketLines` reconciles its buckets against
 * the GROSS — what the card was charged before the price reduction — while the
 * screen prints the NET `Total Amount`. Reconciling the buckets against the net
 * made the discount surface as an over-itemisation, i.e. an "Unexplained"
 * balance for money that is both known and named. The gross is therefore
 * rebuilt here exactly as the settlement defines it (`total − discount`, the
 * discount being negative), and the discount is carried as its own negative
 * column that brings the row back down to Total. `Unexplained` is left meaning
 * only what it was built to mean: a genuine discrepancy.
 */
export function splitParsedRow(row: ParsedFuelRow): FuelRowSplit {
  const discount = round2(row.fuel_discount_amount ?? 0);
  const split: FuelRowSplit = {
    fuel: 0, cash_advance: 0, repair: 0, other: 0, discount, discrepancy: 0,
  };
  for (const line of fuelBucketLines({
    grossAmount: round2(row.total_amount - discount),
    lines: row.lines,
    invoiceDate: row.invoice_date,
    invoiceNo: row.invoice_no,
    reconciliationOk: row.reconciliation_ok,
    reconciliationDelta: row.reconciliation_delta,
  })) {
    if (line.bucket === FUEL_DISCREPANCY) split.discrepancy = round2(split.discrepancy + line.amount);
    else split[line.bucket as FuelBucket] = round2(split[line.bucket as FuelBucket] + line.amount);
  }
  return split;
}


/**
 * Joins the RPC's verdict for each row to the parsed row it came from, by the
 * dedupe key `(invoice_no, invoice_date, card_no)`. A preview row with no
 * parsed twin still renders — with an empty split rather than a wrong one.
 */
export function buildDisplayRows(
  previewRows: FuelPreviewRow[],
  parsedRows: ParsedFuelRow[],
): FuelDisplayRow[] {
  const parsedByKey = new Map<string, ParsedFuelRow>();
  for (const p of parsedRows) if (!parsedByKey.has(dedupeKey(p))) parsedByKey.set(dedupeKey(p), p);

  return previewRows.map((r, i) => {
    const parsed = parsedByKey.get(dedupeKey(r));
    const split = parsed
      ? splitParsedRow(parsed)
      : { fuel: round2(r.total_amount), cash_advance: 0, repair: 0, other: 0, discount: 0, discrepancy: 0 };
    const gallons = parsed?.diesel_gallons ?? 0;
    return {
      key: `${dedupeKey(r)}|${i}`,
      invoice_no: r.invoice_no,
      invoice_date: r.invoice_date,
      card_no: r.card_no,
      unit_no: r.unit_no,
      driver_name: r.driver_name,
      total_amount: round2(r.total_amount),
      duplicate: r.duplicate,
      match_status: r.match_status,
      operator_id: r.operator_id ?? null,
      disagreement_fields: Array.isArray(r.disagreement_fields) ? r.disagreement_fields : [],
      reconciliation_ok: r.reconciliation_ok,
      reconciliation_delta: r.reconciliation_delta,
      split,
      diesel_gallons: gallons,
      def_quantity: parsed?.def_quantity ?? 0,
      cost_per_gallon:
        parsed && gallons > 0 && parsed.diesel_amount > 0
          ? Math.round((parsed.diesel_amount / gallons) * 1000) / 1000
          : null,
      fuel_discount_amount: parsed?.fuel_discount_amount ?? 0,
    };
  });
}

/** The tiles that represent a subset of the table, and what each one keeps. */
export type FuelTileFilter =
  | 'importable' | 'duplicate' | 'matched' | 'unmatched' | 'disagreement' | 'flagged';

export function rowMatchesFilter(row: FuelDisplayRow, filter: FuelTileFilter | null): boolean {
  switch (filter) {
    case null: case undefined: return true;
    case 'importable': return !row.duplicate;
    case 'duplicate': return row.duplicate;
    case 'matched': return row.match_status === 'matched';
    case 'unmatched': return row.match_status === 'unmatched';
    case 'disagreement': return row.match_status === 'matched_with_disagreement';
    case 'flagged': return !row.reconciliation_ok;
    default: return true;
  }
}

export function filterRows(rows: FuelDisplayRow[], filter: FuelTileFilter | null): FuelDisplayRow[] {
  return filter ? rows.filter((r) => rowMatchesFilter(r, filter)) : rows;
}

/** Sort values for the sortable columns. Anything else sorts by nothing. */
export function fuelSortValue(row: FuelDisplayRow, column: string): string | number | null {
  switch (column) {
    case 'driver': return [row.unit_no, row.driver_name].filter(Boolean).join(' · ') || null;
    case 'date': return row.invoice_date;
    case 'card': return row.card_no;
    case 'total': return row.total_amount;
    case 'fuel': return row.split.fuel;
    case 'advances': return row.split.cash_advance;
    case 'repairs': return row.split.repair;
    case 'other': return row.split.other;
    case 'discount': return row.split.discount;
    case 'unexplained': return row.split.discrepancy;

    case 'gallons': return row.diesel_gallons || null;
    case 'cpg': return row.cost_per_gallon;
    default: return null;
  }
}

/* ------------------------------------------------------------------ *
 * PAGE SIZE AND COLUMN PRESENCE — both computed over the WHOLE FILE.
 * ------------------------------------------------------------------ */

export type FuelPageSize = 10 | 25 | 50 | 'all';

/** Default 25: enough to see the shape of a file without scrolling all 69. */
export const DEFAULT_FUEL_PAGE_SIZE: FuelPageSize = 25;
export const FUEL_PAGE_SIZES: FuelPageSize[] = [10, 25, 50, 'all'];

export function paginateRows<T>(rows: T[], pageSize: FuelPageSize, page: number): T[] {
  if (pageSize === 'all') return rows;
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function pageCount(total: number, pageSize: FuelPageSize): number {
  if (pageSize === 'all') return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "Showing 1-25 of 69". Zero rows says so rather than printing "1-0". */
export function pageRangeLabel(total: number, pageSize: FuelPageSize, page: number): string {
  if (total === 0) return 'Showing 0 of 0';
  if (pageSize === 'all') return `Showing 1-${total} of ${total}`;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `Showing ${start}-${end} of ${total}`;
}

/**
 * THE MONEY COLUMNS THAT CAN VANISH. `Total` is not here: it always shows, and
 * neither are Date, Unit / name, Gallons, $/gal or Status.
 *
 * A hidden column is EMPTY ON EVERY ROW OF THE FILE by definition, so the
 * visible money columns still sum to `Total` on every row — dropping a column
 * of zeros cannot change a sum. `fuelImportView.test.ts` asserts exactly that.
 */
export const FUEL_MONEY_COLUMNS = [
  { key: 'fuel', field: 'fuel' },
  { key: 'advances', field: 'cash_advance' },
  { key: 'repairs', field: 'repair' },
  { key: 'other', field: 'other' },
  { key: 'discount', field: 'discount' },
  { key: 'unexplained', field: 'discrepancy' },
] as const satisfies readonly { key: string; field: keyof FuelRowSplit }[];

export type FuelMoneyColumnKey = typeof FUEL_MONEY_COLUMNS[number]['key'];

/**
 * A money column appears only if ANY row in the WHOLE FILE carries a non-zero
 * value for it. Never the current page and never the current tile filter: a
 * column that disappears when you filter to three rows is worse than one that
 * is always there, and the reader would have no way to tell an empty column
 * from a filtered-away one.
 *
 * `Unexplained` earns its place under this rule rather than in spite of it. It
 * has already caught two real defects: the fuel discount reconciled against net
 * while the buckets were computed against gross (the negative amounts seen on
 * 2026-09-07), and — through the same mechanism on the settlement side — a
 * repair or cash advance hiding inside a fuel line, which was a live money
 * defect for months. An always-empty discrepancy detector is a detector finding
 * nothing, not a useless column. Hiding it when empty keeps the signal and
 * returns the width.
 */
export function visibleMoneyColumns(allRows: FuelDisplayRow[]): Set<FuelMoneyColumnKey> {
  const visible = new Set<FuelMoneyColumnKey>();
  for (const col of FUEL_MONEY_COLUMNS) {
    if (allRows.some((r) => (r.split[col.field] ?? 0) !== 0)) visible.add(col.key);
  }
  return visible;
}
