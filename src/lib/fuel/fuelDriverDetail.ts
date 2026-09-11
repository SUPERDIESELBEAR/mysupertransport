/**
 * MODULE 6/9 — ONE DRIVER'S FUEL, IN THE ORDER HE BOUGHT IT.
 *
 * DISPLAY ONLY. This module computes no money of its own: every bucket figure
 * it emits comes out of `fuelBucketLines` in `src/lib/fuel/fuelBuckets.ts`, the
 * SAME assembler the settlement engine and the import screen use. There is no
 * second `line_type` → bucket map here, and the source guard in
 * `src/lib/fuel/__tests__/fuelBucketSourceGuard.test.ts` refuses one.
 *
 * WHY CHRONOLOGICAL AND NOT GROUPED BY SETTLEMENT PERIOD — decided with the
 * owner 2026-09-09. A driver thinks about fuel as "what I bought", in order,
 * with dates. Grouping by period makes him do arithmetic to answer a simple
 * question and buries the transactions nearest a period boundary, which are
 * exactly the ones he rings about.
 *
 * BUT THE PERIOD IS AN ATTRIBUTE OF EVERY ROW, because the question that
 * generates the phone call is not "what did I spend" — his card statement
 * answers that — it is "why did $2,400 come out of my check". A purchase on
 * 09/01 leaves a different check than one on 08/31, and that boundary lines up
 * with nothing he would notice at the pump. So it is printed on the row.
 *
 * PENDING FUEL IS SHOWN, AND CANNOT BE READ AS DEDUCTED. A report that
 * silently omits Monday's fill-up looks broken on Tuesday. So pending rows
 * appear — and total SEPARATELY. There is deliberately no field on
 * `FuelDriverTotals` holding settled and pending money added together: money
 * already taken and money not yet taken are two different facts and a single
 * combined figure would be a lie in whichever direction the reader assumed.
 */
import {
  FUEL_DISCREPANCY, fuelBucketLines, formatFuelDate, type FuelBucket,
} from './fuelBuckets';
import { workPeriodForDate } from '@/lib/settlementPeriod';

/** A fuel transaction as stored, with its line rows embedded. */
export interface FuelDriverTransaction {
  id: string;
  invoice_no: string;
  /** DATE column, 'YYYY-MM-DD'. Not an instant, so no zone conversion. */
  invoice_date: string;
  merchant_name: string | null;
  city: string | null;
  state: string | null;
  total_amount: number | string | null;
  fuel_discount_amount: number | string | null;
  diesel_amount: number | string | null;
  diesel_gallons: number | string | null;
  reconciliation_ok: boolean | null;
  reconciliation_delta: number | string | null;
  fuel_transaction_lines?: { line_type: string; amount: number | string | null }[] | null;
}

/** The settlement a transaction was ACTUALLY deducted on. Its own record. */
export interface FuelSettlementRef {
  settlementId: string;
  periodStart: string;
  periodEnd: string;
  payday: string | null;
  status: string | null;
}

/** Keyed by `fuel_transactions.id`. Absent means: not yet deducted. */
export type SettledFuelIndex = Record<string, FuelSettlementRef>;

/** Printed wherever a pending row's period would go. Never abbreviated. */
export const NOT_YET_DEDUCTED_LABEL = 'Not yet deducted';

export interface FuelDriverRow {
  id: string;
  invoiceNo: string;
  /** ISO as stored; `dateLabel` is the printable form. */
  invoiceDate: string;
  dateLabel: string;
  merchantName: string | null;
  location: string | null;
  /** The four buckets, straight off `fuelBucketLines`. */
  fuel: number;
  cashAdvance: number;
  repair: number;
  other: number;
  /** Always ≤ 0. Already netted into `total`. */
  discount: number;
  /** Signed, non-zero only when the itemisation and the total disagree. */
  discrepancy: number;
  /** The net `total_amount` — what the card was charged. */
  total: number;
  /**
   * `total − discount`. WHAT THE DRIVER IS DEDUCTED, in every state, and the
   * figure the four buckets already sum to — they are built from it. The
   * driver-facing surfaces print THIS as the Total so their columns add up
   * whether or not the discount line is shown; see `fuelDriverPdf`.
   */
  grossTotal: number;
  gallons: number;
  /** Diesel cost ÷ diesel gallons. Null unless both are present. */
  costPerGallon: number | null;
  /** TRUE only when a settlement line item exists for this transaction. */
  deducted: boolean;
  /** The period start this row belongs to — actual if settled, attributed if not. */
  periodStart: string;
  periodEnd: string;
  payday: string | null;
  /** Ready to print: the week, or `Not yet deducted`. */
  periodLabel: string;
  settlementId: string | null;
  settlementStatus: string | null;
  /** The importer's verdict, carried so the row can say the statement was flagged. */
  reconciliationOk: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** `Week of 08/26 – 09/01`, plus the payday when one is known. */
export function periodLabelOf(
  periodStart: string, periodEnd: string, payday: string | null,
): string {
  const week = `Week of ${formatFuelDate(periodStart)} – ${formatFuelDate(periodEnd)}`;
  return payday ? `${week} · paid ${formatFuelDate(payday)}` : week;
}

/**
 * One transaction as a row.
 *
 * THE TWO TOTALS, as `fuelImportView` reconciles them and for the same reason:
 * `fuelBucketLines` reconciles against the GROSS (before the price reduction)
 * while the screen prints the NET total. The gross is rebuilt here exactly as
 * the settlement defines it — `total − discount`, the discount being negative —
 * so a known, named reduction never surfaces as an unexplained balance.
 */
export function buildDriverRow(
  txn: FuelDriverTransaction,
  settled: FuelSettlementRef | null,
  workWeekStartDow: number,
): FuelDriverRow {
  const discount = round2(num(txn.fuel_discount_amount));
  const total = round2(num(txn.total_amount));

  let fuel = 0, cashAdvance = 0, repair = 0, other = 0, discrepancy = 0;
  for (const line of fuelBucketLines({
    grossAmount: round2(total - discount),
    lines: txn.fuel_transaction_lines ?? [],
    invoiceDate: txn.invoice_date,
    invoiceNo: txn.invoice_no,
    reconciliationOk: txn.reconciliation_ok,
    reconciliationDelta: num(txn.reconciliation_delta),
  })) {
    if (line.bucket === FUEL_DISCREPANCY) { discrepancy = round2(discrepancy + line.amount); continue; }
    const bucket = line.bucket as FuelBucket;
    if (bucket === 'fuel') fuel = round2(fuel + line.amount);
    else if (bucket === 'cash_advance') cashAdvance = round2(cashAdvance + line.amount);
    else if (bucket === 'repair') repair = round2(repair + line.amount);
    else other = round2(other + line.amount);
  }

  // A pending row still shows a period — the one the engine WILL attribute it
  // to, by the same `invoice_date` bound `gatherSettlementRun` uses. It is
  // labelled as not yet deducted regardless, so the two can never be confused.
  const attributed = workPeriodForDate(txn.invoice_date, workWeekStartDow);
  const periodStart = settled?.periodStart ?? attributed.periodStart;
  const periodEnd = settled?.periodEnd ?? attributed.periodEnd;
  const payday = settled ? settled.payday : null;

  const gallons = round2(num(txn.diesel_gallons));
  const dieselAmount = num(txn.diesel_amount);
  const location = [txn.city, txn.state].filter(Boolean).join(', ') || null;

  return {
    id: txn.id,
    invoiceNo: txn.invoice_no,
    invoiceDate: txn.invoice_date,
    dateLabel: formatFuelDate(txn.invoice_date),
    merchantName: txn.merchant_name || null,
    location,
    fuel, cashAdvance, repair, other,
    discount, discrepancy, total,
    gallons,
    costPerGallon: gallons > 0 && dieselAmount > 0
      ? Math.round((dieselAmount / gallons) * 1000) / 1000
      : null,
    deducted: Boolean(settled),
    periodStart,
    periodEnd,
    payday,
    periodLabel: settled ? periodLabelOf(periodStart, periodEnd, payday) : NOT_YET_DEDUCTED_LABEL,
    settlementId: settled?.settlementId ?? null,
    settlementStatus: settled?.status ?? null,
    reconciliationOk: txn.reconciliation_ok !== false,
  };
}

/** Every transaction as a row, MOST RECENT FIRST. Invoice number breaks ties. */
export function buildDriverRows(
  transactions: FuelDriverTransaction[],
  settledIndex: SettledFuelIndex,
  workWeekStartDow: number,
): FuelDriverRow[] {
  return transactions
    .map((t) => buildDriverRow(t, settledIndex[t.id] ?? null, workWeekStartDow))
    .sort((a, b) =>
      b.invoiceDate.localeCompare(a.invoiceDate)
      || b.invoiceNo.localeCompare(a.invoiceNo));
}

export interface FuelDriverTotals {
  count: number;
  fuel: number;
  cashAdvance: number;
  repair: number;
  other: number;
  discount: number;
  discrepancy: number;
  /** The sum of the rows' net totals. */
  total: number;
  gallons: number;
}

const EMPTY_TOTALS: FuelDriverTotals = {
  count: 0, fuel: 0, cashAdvance: 0, repair: 0, other: 0,
  discount: 0, discrepancy: 0, total: 0, gallons: 0,
};

function accumulate(rows: FuelDriverRow[]): FuelDriverTotals {
  return rows.reduce<FuelDriverTotals>((t, r) => ({
    count: t.count + 1,
    fuel: round2(t.fuel + r.fuel),
    cashAdvance: round2(t.cashAdvance + r.cashAdvance),
    repair: round2(t.repair + r.repair),
    other: round2(t.other + r.other),
    discount: round2(t.discount + r.discount),
    discrepancy: round2(t.discrepancy + r.discrepancy),
    total: round2(t.total + r.total),
    gallons: round2(t.gallons + r.gallons),
  }), { ...EMPTY_TOTALS });
}

/**
 * The running totals for whatever is on screen — SETTLED AND PENDING APART.
 *
 * There is no third, combined total, and adding one would defeat the point:
 * a driver (or the owner answering him) must never be shown one figure that
 * mixes money already taken with money not yet taken.
 */
export interface FuelDriverSummary {
  settled: FuelDriverTotals;
  pending: FuelDriverTotals;
}

export function summarizeDriverRows(rows: FuelDriverRow[]): FuelDriverSummary {
  return {
    settled: accumulate(rows.filter((r) => r.deducted)),
    pending: accumulate(rows.filter((r) => !r.deducted)),
  };
}

/** The distinct periods present, newest first, for the period filter. */
export function periodOptions(rows: FuelDriverRow[]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!seen.has(r.periodStart)) {
      seen.set(r.periodStart, periodLabelOf(r.periodStart, r.periodEnd, r.payday));
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([value, label]) => ({ value, label }));
}

/** Filter to one period. `null` keeps everything; ordering is untouched. */
export function filterByPeriod(rows: FuelDriverRow[], periodStart: string | null): FuelDriverRow[] {
  return periodStart ? rows.filter((r) => r.periodStart === periodStart) : rows;
}
