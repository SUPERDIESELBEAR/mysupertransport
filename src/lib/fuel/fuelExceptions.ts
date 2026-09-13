/**
 * MODULE 9 — THE WEEKLY FUEL EXCEPTION VIEW.
 *
 * The question this answers, and the only one: "does anything look wrong before
 * I pay them". Two exceptions, chosen by the owner on 2026-09-13:
 *
 *   1. A CATEGORY THAT HAS NEVER APPEARED ON THAT CARD BEFORE. He has never
 *      bought oil; this week there is an oil charge. Not necessarily wrong —
 *      worth a glance. A NOTE, never a gate: nothing is held, nothing is
 *      blocked, the money still moves as the statement says.
 *
 *   2. UNMATCHED ROWS. Fuel that did not resolve to a driver.
 *
 * NOTHING ELSE IS AN EXCEPTION HERE. Cost-per-gallon comparison, MPG, fuel as a
 * share of earnings, cash-advance patterns, purchases away from a route and
 * week-over-week change are on the HELD list in `docs/tms-wish-list.md`. They
 * were parked by the owner, not rejected, and they stay parked.
 *
 * THE BASELINE RULE, AND WHY IT IS PER CARD.
 *
 * The FIRST import for a card is a baseline, not a set of exceptions — on a
 * first import every category is a first appearance, so a naive reading flags
 * everything and the signal is worth nothing. Flagging begins with the SECOND
 * import for that card.
 *
 * Per CARD rather than per driver, because a driver's card changes: Ali
 * Mohamed's did, 212 → 224. A new card is a new baseline, and a category that
 * is new on 224 but was routine on 212 is not an exception — it is the same
 * driver buying the same thing on a different card.
 *
 * WHEN IT CANNOT HELP IT SAYS SO. With one import in the system every card is
 * on its baseline and this report has nothing to say. It reports that state
 * explicitly (`insufficientHistory`) rather than returning an empty list,
 * because an empty list and "no history to compare against" look identical from
 * the outside and only one of them means the screen is working.
 *
 * NO SECOND BUCKET MAP AND NO SECOND UNIT RULE. Categories are decided by
 * `./fuelBuckets` — `bucketOf` for a stored line type and `fuelBucketLines` for
 * a transaction that carries no itemisation at all. Units come from
 * `./operatorUnit`. Both are guarded (`fuelBucketSourceGuard.test.ts`,
 * `fuelUnitSourceGuard.test.ts`) and this file is listed in both.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  FUEL_BUCKET_LABELS, FUEL_DISCREPANCY, bucketOf, formatFuelDate, fuelBucketLines,
  type FuelBucket,
} from './fuelBuckets';
import { fetchOperatorUnits, resolveOperatorUnit } from './operatorUnit';

/** A committed transaction, as this report reads it. */
export interface FuelExceptionTransaction {
  id: string;
  batch_id: string | null;
  card_no: string | null;
  operator_id: string | null;
  driver_name: string | null;
  /** The unit as the FILE printed it. Only used where we have no driver. */
  unit_no: string | null;
  invoice_no: string | null;
  invoice_date: string;
  total_amount: number | string | null;
  fuel_discount_amount: number | string | null;
  reconciliation_ok?: boolean | null;
  match_status: string;
  fuel_transaction_lines?: { line_type: string; amount: number | string | null }[] | null;
}

/** An import, for ordering. Oldest first is what the report needs. */
export interface FuelExceptionBatch {
  id: string;
  file_name: string | null;
  imported_at: string;
  date_range_start: string | null;
  date_range_end: string | null;
}

/** The one status that means the row never resolved to a driver. */
export const UNMATCHED_STATUS = 'unmatched';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** What the driver is charged for a transaction, before the price reduction. */
function grossOf(txn: FuelExceptionTransaction): number {
  return round2(num(txn.total_amount) - num(txn.fuel_discount_amount));
}

/**
 * `minor_repairs` → `Minor repairs`. A DISPLAY transformation of whatever the
 * parser stored, deliberately not a table of names: a table would be a second
 * place a category is defined, and this project has six recorded instances of
 * that going wrong. The BUCKET each category belongs to is never guessed here —
 * `bucketOf` in `./fuelBuckets` decides it.
 */
export function categoryLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** A category on a transaction: the stored key plus the bucket it falls in. */
export interface FuelCategory {
  key: string;
  label: string;
  bucket: FuelBucket;
  bucketLabel: string;
  amount: number;
}

/**
 * The categories one transaction carries.
 *
 * TWO CASES, and they are the same two `fuelBucketLines` distinguishes.
 *
 *   ITEMISED — the line rows are the categories, at the granularity the
 *   statement actually named them, which is what makes "he has never bought
 *   oil" answerable at all. The discount is not a category: `bucketOf` returns
 *   the `discount` sentinel for it and it is skipped, exactly as the settlement
 *   engine skips it.
 *
 *   NOT ITEMISED — nothing was broken out, so the only honest category is
 *   whatever the shared assembler makes of the gross. It is asked, not guessed.
 */
export function categoriesOf(txn: FuelExceptionTransaction): FuelCategory[] {
  const out = new Map<string, FuelCategory>();
  for (const line of txn.fuel_transaction_lines ?? []) {
    const bucket = bucketOf(line.line_type);
    if (bucket === 'discount') continue;
    const amount = round2(num(line.amount));
    if (!amount) continue;
    const existing = out.get(line.line_type);
    out.set(line.line_type, {
      key: line.line_type,
      label: categoryLabel(line.line_type),
      bucket,
      bucketLabel: FUEL_BUCKET_LABELS[bucket],
      amount: round2((existing?.amount ?? 0) + amount),
    });
  }
  if (out.size > 0) return [...out.values()];

  for (const line of fuelBucketLines({
    grossAmount: grossOf(txn),
    lines: txn.fuel_transaction_lines ?? [],
    invoiceDate: txn.invoice_date,
    invoiceNo: txn.invoice_no,
    reconciliationOk: txn.reconciliation_ok,
  })) {
    if (line.bucket === FUEL_DISCREPANCY) continue;
    const bucket = line.bucket;
    out.set(bucket, {
      key: bucket,
      label: FUEL_BUCKET_LABELS[bucket],
      bucket,
      bucketLabel: FUEL_BUCKET_LABELS[bucket],
      amount: line.amount,
    });
  }
  return [...out.values()];
}

/** How a driver is named on an exception row. Unit first — the owner reads units. */
export function driverLabel(name: string | null, unit: string | null): string {
  const person = String(name ?? '').trim() || 'Unknown driver';
  return unit ? `Unit ${unit} · ${person}` : person;
}

export interface NewCategoryException {
  transactionId: string;
  cardNo: string;
  driver: string;
  categoryKey: string;
  categoryLabel: string;
  bucketLabel: string;
  amount: number;
  invoiceDate: string;
  invoiceNo: string | null;
  /** How many transactions in this import carry the new category on this card. */
  occurrences: number;
  /** The sentence shown on the row. */
  message: string;
}

export interface UnmatchedException {
  transactionId: string;
  cardNo: string | null;
  fileDriver: string | null;
  fileUnit: string | null;
  amount: number;
  invoiceDate: string;
  invoiceNo: string | null;
  message: string;
}

export interface FuelExceptionsReport {
  /** Imports in the system, all cards. One means baseline only. */
  imports: number;
  /** Cards whose second-or-later import could be compared against something. */
  cardsWithHistory: number;
  /** Cards sitting on their first import — nothing to compare, by design. */
  cardsOnBaseline: number;
  /**
   * TRUE when no card anywhere has a second import. The new-category half can
   * say nothing at all, and the screen must say why rather than look empty.
   */
  insufficientHistory: boolean;
  /** The sentence the screen prints when `insufficientHistory` is true. */
  historyNote: string | null;
  newCategories: NewCategoryException[];
  /** Needs no history whatsoever, so it works from the first import onward. */
  unmatched: UnmatchedException[];
  /** Rows with no card number: they cannot be baselined and are counted, not flagged. */
  rowsWithoutCard: number;
}

export interface FuelExceptionsInput {
  transactions: FuelExceptionTransaction[];
  /** Every import, in any order — this sorts them by `imported_at`. */
  batches: FuelExceptionBatch[];
  /** Resolved unit per operator id, from `./operatorUnit`. Never re-derived here. */
  unitByOperator?: Map<string, string | null>;
}

function historySentence(batches: FuelExceptionBatch[]): string {
  if (batches.length === 0) {
    return 'No fuel has been imported yet, so there is nothing to compare. '
      + 'The first import for each card is a baseline; new-category exceptions begin '
      + 'with the second import for that card.';
  }
  const spans = batches
    .map((b) => (b.date_range_start && b.date_range_end
      ? `${formatFuelDate(b.date_range_start)} to ${formatFuelDate(b.date_range_end)}`
      : null))
    .filter(Boolean)
    .join('; ');
  return `Insufficient history — ${batches.length} import`
    + `${batches.length === 1 ? '' : 's'}`
    + `${spans ? ` (${spans})` : ''}, and every card is still on its baseline. `
    + 'A first import is a baseline, not a set of exceptions: on it every category is a '
    + 'first appearance for every card, so there is nothing earlier to compare against. '
    + 'New-category exceptions begin with the second import for a card. '
    + 'This section is quiet because it has no history, not because nothing was checked.';
}

/**
 * THE WHOLE REPORT. One pass per card, in import order.
 *
 * A new category is reported ONCE per card per import, with the first
 * transaction that carried it and a count — three oil charges in one week are
 * one thing to glance at, not three.
 */
export function buildFuelExceptionsReport(input: FuelExceptionsInput): FuelExceptionsReport {
  const batches = [...input.batches].sort((a, b) => a.imported_at.localeCompare(b.imported_at));
  const batchIndex = new Map(batches.map((b, i) => [b.id, i]));
  const units = input.unitByOperator ?? new Map<string, string | null>();

  const unmatched: UnmatchedException[] = [];
  const rowsByCard = new Map<string, FuelExceptionTransaction[]>();
  let rowsWithoutCard = 0;

  for (const txn of input.transactions) {
    if (txn.match_status === UNMATCHED_STATUS) {
      const gross = grossOf(txn);
      const who = [txn.driver_name?.trim(), txn.unit_no?.trim() ? `unit ${txn.unit_no.trim()}` : '']
        .filter(Boolean).join(', ');
      unmatched.push({
        transactionId: txn.id,
        cardNo: txn.card_no?.trim() || null,
        fileDriver: txn.driver_name?.trim() || null,
        fileUnit: txn.unit_no?.trim() || null,
        amount: gross,
        invoiceDate: txn.invoice_date,
        invoiceNo: txn.invoice_no,
        message: `Card ${txn.card_no?.trim() || '(none on the statement)'} — `
          + `$${gross.toFixed(2)} on ${formatFuelDate(txn.invoice_date)} did not match a driver`
          + `${who ? `. The statement says ${who}` : ''}.`,
      });
      continue;
    }
    const card = txn.card_no?.trim();
    if (!card) { rowsWithoutCard += 1; continue; }
    const list = rowsByCard.get(card) ?? [];
    list.push(txn);
    rowsByCard.set(card, list);
  }

  const newCategories: NewCategoryException[] = [];
  let cardsWithHistory = 0;
  let cardsOnBaseline = 0;

  for (const [card, rows] of rowsByCard) {
    // The imports this CARD appears on, oldest first. A card issued last month
    // has its own baseline regardless of how many imports the fleet has.
    const cardBatches = [...new Set(rows.map((r) => r.batch_id).filter(Boolean) as string[])]
      .sort((a, b) => (batchIndex.get(a) ?? 0) - (batchIndex.get(b) ?? 0));
    if (cardBatches.length < 2) { cardsOnBaseline += 1; continue; }
    cardsWithHistory += 1;

    const seen = new Set<string>();
    for (const [position, batchId] of cardBatches.entries()) {
      const batchRows = rows.filter((r) => r.batch_id === batchId);
      // Everything the card carried on this import, before anything is reported,
      // so two transactions in one week cannot flag each other.
      const thisImport = new Map<string, { category: FuelCategory; txn: FuelExceptionTransaction; count: number }>();
      for (const txn of batchRows) {
        for (const category of categoriesOf(txn)) {
          const existing = thisImport.get(category.key);
          if (existing) { existing.count += 1; continue; }
          thisImport.set(category.key, { category, txn, count: 1 });
        }
      }

      if (position > 0) {
        for (const { category, txn, count } of thisImport.values()) {
          if (seen.has(category.key)) continue;
          const unit = txn.operator_id ? units.get(txn.operator_id) ?? null : null;
          const driver = driverLabel(txn.driver_name, unit);
          newCategories.push({
            transactionId: txn.id,
            cardNo: card,
            driver,
            categoryKey: category.key,
            categoryLabel: category.label,
            bucketLabel: category.bucketLabel,
            amount: category.amount,
            invoiceDate: txn.invoice_date,
            invoiceNo: txn.invoice_no,
            occurrences: count,
            message: `${driver} — first ${category.label} charge on card ${card} `
              + `(${category.bucketLabel}), $${category.amount.toFixed(2)} on `
              + `${formatFuelDate(txn.invoice_date)}. No earlier import for this card carries it.`,
          });
        }
      }
      for (const key of thisImport.keys()) seen.add(key);
    }
  }

  newCategories.sort((a, b) =>
    b.invoiceDate.localeCompare(a.invoiceDate) || a.driver.localeCompare(b.driver));
  unmatched.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.amount - a.amount);

  const insufficientHistory = cardsWithHistory === 0;
  return {
    imports: batches.length,
    cardsWithHistory,
    cardsOnBaseline,
    insufficientHistory,
    historyNote: insufficientHistory ? historySentence(batches) : null,
    newCategories,
    unmatched,
    rowsWithoutCard,
  };
}

/* --------------------------------------------------------------- the reads -- */

const TXN_SELECT =
  'id, batch_id, card_no, operator_id, driver_name, unit_no, invoice_no, invoice_date, '
  + 'total_amount, fuel_discount_amount, reconciliation_ok, match_status, '
  + 'fuel_transaction_lines(line_type, amount)';

/**
 * Everything the report needs, in three reads plus the shared unit resolution.
 * The unit is RESOLVED through `./operatorUnit`, never read off one column —
 * 48 of 60 active drivers have their unit only in the onboarding record.
 */
export async function fetchFuelExceptionsData(): Promise<FuelExceptionsInput> {
  const [txns, batches] = await Promise.all([
    supabase.from('fuel_transactions').select(TXN_SELECT)
      .order('invoice_date', { ascending: false }).limit(5000),
    supabase.from('fuel_import_batches')
      .select('id, file_name, imported_at, date_range_start, date_range_end')
      .order('imported_at', { ascending: true }).limit(500),
  ]);
  if (txns.error) throw txns.error;
  if (batches.error) throw batches.error;

  const transactions = (txns.data ?? []) as unknown as FuelExceptionTransaction[];
  const operatorIds = [...new Set(transactions.map((t) => t.operator_id).filter(Boolean) as string[])];
  const unitValues = await fetchOperatorUnits(operatorIds);
  const unitByOperator = new Map<string, string | null>();
  for (const id of operatorIds) {
    unitByOperator.set(id, resolveOperatorUnit(unitValues.get(id) ?? null));
  }

  return {
    transactions,
    batches: (batches.data ?? []) as unknown as FuelExceptionBatch[],
    unitByOperator,
  };
}
