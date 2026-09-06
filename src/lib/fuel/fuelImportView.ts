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
import type { FuelPreviewRow } from './fuelImport';

export interface FuelRowSplit {
  fuel: number;
  cash_advance: number;
  repair: number;
  other: number;
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
  total_amount: number;
  duplicate: boolean;
  match_status: FuelPreviewRow['match_status'];
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
 * The four buckets plus the discrepancy for one parsed row, taken straight off
 * `fuelBucketLines`. By that function's own invariant the five figures sum to
 * the gross, which is what makes the on-screen row verifiable.
 */
export function splitParsedRow(row: ParsedFuelRow): FuelRowSplit {
  const split: FuelRowSplit = { fuel: 0, cash_advance: 0, repair: 0, other: 0, discrepancy: 0 };
  for (const line of fuelBucketLines({
    grossAmount: row.total_amount,
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
      : { fuel: round2(r.total_amount), cash_advance: 0, repair: 0, other: 0, discrepancy: 0 };
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
    case 'gallons': return row.diesel_gallons || null;
    case 'cpg': return row.cost_per_gallon;
    default: return null;
  }
}
