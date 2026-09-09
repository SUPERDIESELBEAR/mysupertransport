/**
 * MODULE 9 — COST PER GALLON BY LOCATION.
 *
 * THREE GROUPINGS, ONE COMPUTATION. Truck stop, state and chain are the same
 * arithmetic over the same rows with a different key. There is deliberately no
 * second aggregation: `groupFuelByLocation` is called three times with three
 * key functions, so a change to how a gallon or a dollar is counted cannot
 * apply to one grouping and not the others.
 *
 * NO SECOND BUCKET MAP. Fuel spend comes out of `fuelBucketLines` in
 * `./fuelBuckets`, the same assembler the settlement engine uses, and the
 * source guard refuses a local `line_type` decision in this file.
 *
 * ONLY THE FUEL BUCKET REACHES A PER-GALLON AVERAGE. A cash advance is money
 * drawn at the pump, not a purchase of anything, and it has no gallons. Letting
 * it into the numerator would inflate the price of diesel by whatever the
 * driver happened to withdraw.
 *
 * THE AVERAGE IS WEIGHTED — total spend ÷ total gallons for the group, NOT the
 * mean of the per-transaction rates. Those two figures differ whenever purchase
 * sizes differ, and only the weighted one describes what was actually paid. The
 * unweighted mean is computed alongside it for one purpose: so a test can prove
 * they differ, and so nobody re-derives it believing it equivalent.
 *
 * REPORT ONLY. There is no fleet average here, no benchmark and no "above
 * average" flag. Comparison against other drivers is on the HELD list in
 * `docs/tms-wish-list.md` and stays there.
 */
import { FUEL_DISCREPANCY, fuelBucketLines } from './fuelBuckets';

/** A committed transaction, as the report reads it. */
export interface FuelLocationTransaction {
  id: string;
  invoice_no: string | null;
  invoice_date: string;
  merchant_name: string | null;
  city: string | null;
  state: string | null;
  total_amount: number | string | null;
  fuel_discount_amount: number | string | null;
  diesel_gallons: number | string | null;
  reconciliation_ok?: boolean | null;
  fuel_transaction_lines?: { line_type: string; amount: number | string | null }[] | null;
}

/** Printed wherever a merchant name could not be classified into a chain. */
export const UNRECOGNISED_CHAIN = 'Unrecognised';

/** Printed wherever a merchant name is missing altogether. */
export const UNKNOWN_MERCHANT = 'Unnamed merchant';

/** Printed wherever a state is missing. */
export const UNKNOWN_STATE = 'Unknown state';

/**
 * CHAIN IS DERIVED BY STRING-MATCHING A THIRD PARTY'S NAMING, and is labelled
 * as derived everywhere it is shown. These patterns were established by reading
 * the 66 distinct merchant names present on the 69 committed transactions —
 * NOT from what truck stops are expected to be called. The file spells things
 * its own way (`Loves`, `Loves Travel Stop`, `Loves Country Stores`; `One 9`,
 * `One9`, `One9 Xpress Fuel`; `Pilot Travel Center`, `Pilot Travel Ctr`; and
 * `Thortons`, which is MultiService's misspelling of Thorntons).
 *
 * Anything not matched groups under `Unrecognised` and is counted there. A
 * chain average that silently drops purchases is worse than one that says what
 * it could not classify.
 */
export const FUEL_CHAIN_PATTERNS: { chain: string; test: RegExp }[] = [
  { chain: "Love's", test: /^love'?s\b/i },
  { chain: 'Pilot', test: /^pilot\b/i },
  { chain: 'Flying J', test: /^flying\s*j\b/i },
  // Pilot Flying J's own combined billing name. Kept as its own group rather
  // than folded into Pilot: the file distinguishes them and so does this.
  { chain: 'PFJ (Pilot Flying J)', test: /^pfj\b/i },
  { chain: 'TA', test: /^ta\b/i },
  { chain: 'One9', test: /^one\s*9\b/i },
  { chain: 'QuikTrip', test: /^quik\s*trip\b/i },
  { chain: 'RaceTrac', test: /^racetrac\b/i },
  { chain: 'RaceWay', test: /^raceway\b/i },
  { chain: 'Speedway', test: /^speedway\b/i },
  { chain: "Casey's", test: /^casey'?s\b/i },
  { chain: 'Circle K', test: /^circle\s*k\b/i },
  { chain: 'Kangaroo Express', test: /^kangaroo\b/i },
  { chain: 'Kwik Star', test: /^kwik\s*star\b/i },
  { chain: 'Thorntons', test: /^thor\w*tons\b/i },
];

/** The derived chain for a merchant name, or `Unrecognised`. */
export function chainOf(merchantName: string | null | undefined): string {
  const name = String(merchantName ?? '').trim();
  if (!name) return UNRECOGNISED_CHAIN;
  return FUEL_CHAIN_PATTERNS.find((p) => p.test.test(name))?.chain ?? UNRECOGNISED_CHAIN;
}

export interface FuelLocationGroup {
  /** The grouping value as printed. */
  key: string;
  /** Sub-label — the city/state under a truck stop, empty otherwise. */
  sublabel: string | null;
  purchases: number;
  gallons: number;
  /** The FUEL bucket only. Advances, repairs and other charges are excluded. */
  fuelSpend: number;
  /** fuelSpend ÷ gallons. Null when the group bought no gallons. */
  costPerGallon: number | null;
  /**
   * The unweighted mean of the per-transaction rates. Present ONLY so the
   * difference from `costPerGallon` can be shown and tested; never displayed
   * as the group's price.
   */
  meanOfRates: number | null;
  /** True only on the `Unrecognised` chain group. */
  isUnrecognised?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The FUEL bucket for one transaction, from the shared assembler.
 *
 * The assembler reconciles against the GROSS (before the price reduction), as
 * `fuelDriverDetail` does and for the same reason, so a known discount never
 * surfaces as an unexplained balance.
 */
export function fuelSpendOf(txn: FuelLocationTransaction): number {
  const discount = round2(num(txn.fuel_discount_amount));
  const total = round2(num(txn.total_amount));
  let fuel = 0;
  for (const line of fuelBucketLines({
    grossAmount: round2(total - discount),
    lines: txn.fuel_transaction_lines ?? [],
    invoiceDate: txn.invoice_date,
    invoiceNo: txn.invoice_no,
    reconciliationOk: txn.reconciliation_ok,
  })) {
    if (line.bucket === FUEL_DISCREPANCY) continue;
    if (line.bucket === 'fuel') fuel = round2(fuel + line.amount);
  }
  return fuel;
}

/** ONE aggregation. The grouping is only the key function handed to it. */
export function groupFuelByLocation(
  transactions: FuelLocationTransaction[],
  keyOf: (t: FuelLocationTransaction) => { key: string; sublabel?: string | null },
): FuelLocationGroup[] {
  const acc = new Map<string, {
    key: string; sublabel: string | null;
    purchases: number; gallons: number; fuelSpend: number; rates: number[];
  }>();

  for (const txn of transactions) {
    const { key, sublabel = null } = keyOf(txn);
    const id = `${key}\u0000${sublabel ?? ''}`;
    const group = acc.get(id) ?? {
      key, sublabel, purchases: 0, gallons: 0, fuelSpend: 0, rates: [] as number[],
    };
    const gallons = round2(num(txn.diesel_gallons));
    const spend = fuelSpendOf(txn);
    group.purchases += 1;
    group.gallons = round2(group.gallons + gallons);
    group.fuelSpend = round2(group.fuelSpend + spend);
    // A transaction with no gallons contributes no RATE either — a cash
    // advance must not enter an average of prices in any form.
    if (gallons > 0 && spend > 0) group.rates.push(spend / gallons);
    acc.set(id, group);
  }

  return [...acc.values()]
    .map((g) => ({
      key: g.key,
      sublabel: g.sublabel,
      purchases: g.purchases,
      gallons: g.gallons,
      fuelSpend: g.fuelSpend,
      costPerGallon: g.gallons > 0 ? round3(g.fuelSpend / g.gallons) : null,
      meanOfRates: g.rates.length
        ? round3(g.rates.reduce((t, r) => t + r, 0) / g.rates.length)
        : null,
      isUnrecognised: g.key === UNRECOGNISED_CHAIN || undefined,
    }))
    .sort((a, b) => b.gallons - a.gallons || a.key.localeCompare(b.key));
}

export interface FuelLocationReport {
  from: string;
  to: string;
  /** Every transaction in range, before grouping. */
  purchases: number;
  gallons: number;
  fuelSpend: number;
  /** The report-wide weighted average. */
  costPerGallon: number | null;
  byTruckStop: FuelLocationGroup[];
  byState: FuelLocationGroup[];
  byChain: FuelLocationGroup[];
  /** How many purchases the chain derivation could not classify. */
  unrecognisedChainPurchases: number;
}

/** Inclusive date-range filter on the DATE column. No zone conversion. */
export function filterByDateRange(
  transactions: FuelLocationTransaction[], from: string, to: string,
): FuelLocationTransaction[] {
  return transactions.filter((t) => t.invoice_date >= from && t.invoice_date <= to);
}

/**
 * THE DEFAULT RANGE: the 30 days ending on the most recent purchase present.
 *
 * Anchoring on the newest transaction rather than on today is deliberate. The
 * committed set spans five days at the end of August; a range anchored on the
 * clock would show an empty report to whoever opened the screen a month later,
 * which reads as a broken page rather than as "no fuel imported recently".
 * Thirty days is wide enough that a month's worth of imports lands in one view
 * without paging.
 */
export const DEFAULT_RANGE_DAYS = 30;

export function defaultDateRange(
  transactions: FuelLocationTransaction[], today: string,
): { from: string; to: string } {
  const newest = transactions.reduce<string>(
    (max, t) => (t.invoice_date > max ? t.invoice_date : max), '');
  const to = newest || today;
  const d = new Date(`${to}T12:00:00`);
  d.setDate(d.getDate() - (DEFAULT_RANGE_DAYS - 1));
  return { from: d.toISOString().slice(0, 10), to };
}

export function buildFuelLocationReport(
  transactions: FuelLocationTransaction[], from: string, to: string,
): FuelLocationReport {
  const rows = filterByDateRange(transactions, from, to);

  const byTruckStop = groupFuelByLocation(rows, (t) => ({
    key: t.merchant_name?.trim() || UNKNOWN_MERCHANT,
    sublabel: [t.city, t.state].filter(Boolean).join(', ') || null,
  }));
  const byState = groupFuelByLocation(rows, (t) => ({
    key: t.state?.trim() || UNKNOWN_STATE,
  }));
  const byChain = groupFuelByLocation(rows, (t) => ({ key: chainOf(t.merchant_name) }));

  const gallons = round2(rows.reduce((s, t) => s + num(t.diesel_gallons), 0));
  const fuelSpend = round2(rows.reduce((s, t) => s + fuelSpendOf(t), 0));

  return {
    from,
    to,
    purchases: rows.length,
    gallons,
    fuelSpend,
    costPerGallon: gallons > 0 ? round3(fuelSpend / gallons) : null,
    byTruckStop,
    byState,
    byChain,
    unrecognisedChainPurchases:
      byChain.find((g) => g.key === UNRECOGNISED_CHAIN)?.purchases ?? 0,
  };
}
