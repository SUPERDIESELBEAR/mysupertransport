/**
 * MODULE 6 — WHAT THE FUEL DEDUCTION IS MADE OF.
 *
 * A fuel transaction is not one thing. A single MultiService invoice can carry
 * diesel, a cash advance the driver took at the pump, and a repair — and until
 * now all three left the driver's pay as ONE unnamed line reading "Fuel". This
 * module is the ONE map from a `fuel_line_type` to the bucket the driver is
 * shown, and the ONE assembler of the bucket lines.
 *
 * TWO RULES, and they are the whole of it:
 *
 *  1. EVERY `fuel_line_type` VALUE HAS AN ENTRY. A category the parser captures
 *     but no bucket names is money deducted with nothing explaining it. The
 *     enum-coverage test is what makes adding an enum value without deciding
 *     its bucket impossible.
 *
 *  2. THE BUCKETS ALWAYS SUM TO THE DEDUCTION. Never more, never less. The
 *     residual between the line rows and the transaction's gross is assigned
 *     rather than dropped, so no arrangement of line rows — missing, stale, or
 *     absent altogether — can change what the driver is charged. This module
 *     RE-LABELS money. It never re-computes it.
 *
 * THE DISCOUNT IS NOT A BUCKET. `fuel_discount` is a reduction in the price of
 * the fuel, already subtracted from `total_amount`, and the settlement engine
 * treats it separately (its own credit line when pass-through is on). Folding
 * it into a bucket would make the buckets sum to the NET rather than the gross
 * the driver is actually charged. It carries the sentinel `'discount'` so the
 * coverage rule still binds it: it is decided, not forgotten.
 */
import type { FuelLineType } from './multiserviceCsv';

/** The four things a driver can be charged for on a fuel card. */
export type FuelBucket = 'fuel' | 'cash_advance' | 'repair' | 'other';

/** A bucket, or the sentinel for the one line type that is not a charge. */
export type FuelBucketAssignment = FuelBucket | 'discount';

/**
 * Every `fuel_line_type` value, decided. Exhaustive by type: the `Record` will
 * not compile with a value missing, and the coverage test checks the same
 * thing against the live enum so a database-side addition cannot slip past.
 */
export const FUEL_LINE_TYPE_BUCKET: Record<FuelLineType, FuelBucketAssignment> = {
  // Fuel and the things that are fuel by another name.
  diesel: 'fuel',
  diesel1: 'fuel',
  unleaded: 'fuel',
  reefer: 'fuel',
  reefer_cng: 'fuel',
  reefer_lng: 'fuel',
  reefer_lpg: 'fuel',
  cng: 'fuel',
  lng: 'fuel',
  lpg: 'fuel',
  def: 'fuel',

  // Money taken at the pump. It was never a purchase; it is a repayment.
  cash_advance_12digit: 'cash_advance',
  cash_advance_emoney: 'cash_advance',
  cash_advance_insta: 'cash_advance',
  // A fee charged FOR taking the advance travels with the advance, so the
  // driver sees the true cost of the money he drew rather than a stray charge
  // filed under fuel.
  fees: 'cash_advance',

  // Work done on the truck. Named separately because a repair is the one
  // category this record says must be approved before it moves.
  minor_repairs: 'repair',
  tires: 'repair',

  // Real charges that are none of the above. Named honestly rather than
  // pushed into a bucket they do not belong in.
  additive: 'other',
  oil: 'other',
  misc: 'other',
  tax: 'other',

  // Not a charge. See the header.
  fuel_discount: 'discount',
};

/** Driver-facing bucket names. The driver's words, not the parser's. */
export const FUEL_BUCKET_LABELS: Record<FuelBucket, string> = {
  fuel: 'Fuel',
  cash_advance: 'Cash advance',
  repair: 'Repairs',
  other: 'Other fuel-card charges',
};

/** Fixed display order, so a statement always reads the same way. */
export const FUEL_BUCKET_ORDER: FuelBucket[] = ['fuel', 'cash_advance', 'repair', 'other'];

/**
 * NOT a bucket. The line that says the itemisation and the statement total do
 * not agree, and by how much. It is printed LAST, after every real category.
 */
export const FUEL_DISCREPANCY = 'discrepancy' as const;

/**
 * The two directions of the same defect, worded so neither can be read as a
 * category of spending, and the negative one cannot be read as a refund.
 */
export const FUEL_DISCREPANCY_LABELS = {
  /** Itemised lines fall SHORT of the statement total: money with no category. */
  short: 'Unexplained balance — the statement total exceeds its itemised lines',
  /** Itemised lines EXCEED the statement total. Reduces the deduction; it is
   *  a defect in the data, NOT a credit the driver earned, and says so. */
  over: 'Unexplained balance — the itemised lines exceed the statement total (not a credit)',
} as const;

/** Appended to every line of a transaction the IMPORTER already flagged. */
export const FUEL_IMPORT_FLAG_SUFFIX = ' [statement did not add up at import]';

export interface FuelTransactionLine {
  line_type: string;
  amount: number | string | null;
}

export interface FuelBucketLine {
  bucket: FuelBucket | typeof FUEL_DISCREPANCY;
  /** Positive magnitude, EXCEPT a negative discrepancy. The engine negates. */
  amount: number;
  /** Ready to print: `Fuel — 08/28/2026 (invoice 771030)`. */
  description: string;
  /** True only on the discrepancy line. Lets staff views single it out. */
  isDiscrepancy?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** `2026-08-28` → `08/28/2026`. Anything else is printed as it arrived. */
export function formatFuelDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso ?? '');
}

/** The bucket a stored line type falls in. Unknown values are `other`. */
export function bucketOf(lineType: string): FuelBucketAssignment {
  return FUEL_LINE_TYPE_BUCKET[lineType as FuelLineType] ?? 'other';
}

export interface FuelBucketInput {
  /** What the driver is charged for this transaction, before any discount. */
  grossAmount: number;
  lines?: FuelTransactionLine[] | null;
  invoiceDate?: string | null;
  invoiceNo?: string | null;
  /**
   * `fuel_transactions.reconciliation_ok` — the IMPORTER's verdict on whether
   * the category COLUMNS summed to `Total Amount`. A settlement-time
   * discrepancy is usually this same fact, rediscovered where it was silent,
   * so it is carried through and named rather than re-derived.
   */
  reconciliationOk?: boolean | null;
  /** `fuel_transactions.reconciliation_delta`, for the staff-facing note. */
  reconciliationDelta?: number | null;
}

/**
 * The lines a single transaction contributes to a settlement.
 *
 * TWO CASES, and they are NOT the same thing.
 *
 *   NO LINE ROWS AT ALL — there is nothing to reconcile. The whole gross is one
 *   `Fuel` line, exactly as before itemisation existed. This is the correct
 *   handling of a transaction with no breakdown, not a discrepancy, and it is
 *   not labelled as one.
 *
 *   LINE ROWS EXIST BUT DO NOT SUM TO THE GROSS — something IS wrong: a
 *   category the parser captured into a column the line derivation missed, or
 *   rows deleted after import. The difference gets its OWN line, worded as
 *   unexplained, and is NEVER merged into `Other fuel-card charges` — that
 *   would be the very defect this module exists to close, money on a statement
 *   with nothing accurately naming it. A NEGATIVE difference is the same defect
 *   with the opposite sign and is worded so it cannot read as a credit.
 *
 * The sum is unchanged by either case: buckets + discrepancy = the gross, so
 * this still only ever RE-LABELS money.
 */
export function fuelBucketLines(input: FuelBucketInput): FuelBucketLine[] {
  const gross = round2(num(input.grossAmount));
  const stamp = [
    formatFuelDate(input.invoiceDate),
    input.invoiceNo ? `(invoice ${input.invoiceNo})` : '',
  ].filter(Boolean).join(' ');
  const suffix = stamp ? ` — ${stamp}` : '';
  // The importer's flag rides on EVERY line of the transaction, so a statement
  // that failed its own check at import says so even when the line rows happen
  // to sum here.
  const flag = input.reconciliationOk === false ? FUEL_IMPORT_FLAG_SUFFIX : '';

  const totals = new Map<FuelBucket, number>();
  let itemisedRows = 0;
  for (const line of input.lines ?? []) {
    const bucket = bucketOf(line.line_type);
    if (bucket === 'discount') continue;
    itemisedRows += 1;
    const amount = round2(num(line.amount));
    if (!amount) continue;
    totals.set(bucket, round2((totals.get(bucket) ?? 0) + amount));
  }

  const assigned = round2([...totals.values()].reduce((t, v) => t + v, 0));
  const residual = round2(gross - assigned);

  // CASE ONE: nothing itemised. One `Fuel` line, no discrepancy.
  if (itemisedRows === 0) {
    return gross
      ? [{ bucket: 'fuel', amount: gross, description: `${FUEL_BUCKET_LABELS.fuel}${suffix}${flag}` }]
      : [];
  }

  const lines: FuelBucketLine[] = FUEL_BUCKET_ORDER
    .map((bucket) => ({ bucket, amount: round2(totals.get(bucket) ?? 0) }))
    .filter((b) => b.amount !== 0)
    .map((b) => ({
      bucket: b.bucket as FuelBucket,
      amount: b.amount,
      description: `${FUEL_BUCKET_LABELS[b.bucket]}${suffix}${flag}`,
    }));

  // CASE TWO: itemised, but it does not add up. Its own line, either sign.
  if (residual) {
    lines.push({
      bucket: FUEL_DISCREPANCY,
      amount: residual,
      isDiscrepancy: true,
      description: `${residual > 0 ? FUEL_DISCREPANCY_LABELS.short : FUEL_DISCREPANCY_LABELS.over}${suffix}${flag}`,
    });
  }

  return lines;
}

