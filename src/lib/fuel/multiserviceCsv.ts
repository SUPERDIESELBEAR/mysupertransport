/**
 * The MultiService "customized detail" CSV, parsed.
 *
 * Three things in this file are load-bearing and were each learned from the
 * live 297-row export rather than from a specification:
 *
 * 1. THE HEADER IS A CONTRACT. If MultiService changes a column, this parser
 *    must FAIL rather than shift every value one place left. A silently
 *    mis-mapped import is money attributed to the wrong category.
 * 2. MONEY ARRIVES IN TWO FORMATS ON THE SAME COLUMN. "Bulk DEF Amount" is
 *    "$0.00" when zero and a bare `50` when populated. A parser that handles
 *    only one form drops DEF on the rows that have it.
 * 3. ONE ROW IS NOT ONE CHARGE. 78 of 297 rows carry more than one category,
 *    diesel plus DEF most often, so each row expands into line items.
 *
 * Reconciliation — the sum of the category columns against the printed total —
 * is the safety net for a category nobody has heard of. A failing row is
 * IMPORTED AND FLAGGED, never dropped and never silently corrected.
 */

/** Line types, matching the `fuel_line_type` enum exactly. */
export type FuelLineType =
  | 'diesel' | 'reefer' | 'def' | 'additive' | 'minor_repairs' | 'misc' | 'tires'
  | 'cash_advance_12digit' | 'cash_advance_emoney' | 'cash_advance_insta'
  | 'fees' | 'fuel_discount';

export interface FuelLine {
  line_type: FuelLineType;
  amount: number;
  quantity: number | null;
}

export interface ParsedFuelRow {
  unit_no: string;
  card_no: string;
  driver_name: string;
  city: string;
  state: string;
  invoice_no: string;
  /** ISO `YYYY-MM-DD`. */
  invoice_date: string;
  daycode: string;

  diesel_amount: number;
  diesel_gallons: number;
  reefer_amount: number;
  additive_amount: number;
  minor_repairs_amount: number;
  misc_amount: number;
  tires_amount: number;
  cash_advance_12digit_amount: number;
  cash_advance_emoney_amount: number;
  cash_advance_insta_amount: number;
  def_amount: number;
  def_quantity: number;
  fees_amount: number;
  /** Always negative, and ALREADY subtracted from `total_amount`. */
  fuel_discount_amount: number;
  total_amount: number;

  reconciliation_ok: boolean;
  /** categories − total, to the cent. Zero on a healthy row. */
  reconciliation_delta: number;

  lines: FuelLine[];
}

export class FuelCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FuelCsvFormatError';
  }
}

/** The header of the live export, in order. Any deviation is a hard failure. */
export const MULTISERVICE_HEADER = [
  'Unit No', 'Card No', 'Driver Name', 'City', 'State', 'Invoice No', 'Invoice Date',
  'Diesel2 Cost', 'Diesel2 Gallons', 'Reefer Cost', 'Additive Amt', 'Minor Repairs',
  'Misc Amt', 'Tires', 'Daycode', '12 Digit Money', 'E-Money', 'Insta Money®',
  'Bulk DEF Amount', 'Bulk DEF Quantity', 'Fees', 'Fuel Disc Amt', 'Total Amount',
] as const;

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** RFC4180-ish splitter: quoted fields, doubled quotes, embedded commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * A money cell in any form MultiService prints it: "$0.00", bare `50`,
 * "$1,234.56", "-$3.10", "($3.10)", or empty. Returns a number rounded to the
 * cent. Throws on text that is not a number at all — a value we cannot read is
 * not a zero.
 */
export function parseMoney(raw: string | undefined | null, column = 'amount'): number {
  const s = String(raw ?? '').trim();
  if (s === '' || s === '-') return 0;
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  const digits = s.replace(/[()$,\s\-]/g, '');
  if (digits === '') return 0;
  if (!/^\d*\.?\d*$/.test(digits)) {
    throw new FuelCsvFormatError(`Unreadable value in "${column}": ${JSON.stringify(s)}`);
  }
  const n = Number(digits);
  if (!Number.isFinite(n)) {
    throw new FuelCsvFormatError(`Unreadable value in "${column}": ${JSON.stringify(s)}`);
  }
  return Math.round((negative ? -n : n) * 100) / 100;
}

/** Quantities (gallons, DEF litres) — same formats, three decimals kept. */
export function parseQuantity(raw: string | undefined | null, column = 'quantity'): number {
  const n = parseMoney(raw, column);
  return Math.round(n * 1000) / 1000;
}

/** `M/D/YYYY`, `MM/DD/YY` or an already-ISO date, normalised to `YYYY-MM-DD`. */
export function parseInvoiceDate(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Four-digit year FIRST: `(\d{2}|\d{4})` would match "20" of "2026" and
  // silently produce 2020 for every date in the file.
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\s*$/.exec(s);

  if (us) {
    const [, mm, dd, yy] = us;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  throw new FuelCsvFormatError(`Unreadable invoice date: ${JSON.stringify(s)}`);
}

/* ------------------------------------------------------------------ */
/* Row assembly                                                        */
/* ------------------------------------------------------------------ */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Category → the parsed row field holding its amount, and optional quantity. */
const LINE_SOURCES: { type: FuelLineType; amount: keyof ParsedFuelRow; quantity?: keyof ParsedFuelRow }[] = [
  { type: 'diesel',               amount: 'diesel_amount', quantity: 'diesel_gallons' },
  { type: 'reefer',               amount: 'reefer_amount' },
  { type: 'def',                  amount: 'def_amount', quantity: 'def_quantity' },
  { type: 'additive',             amount: 'additive_amount' },
  { type: 'minor_repairs',        amount: 'minor_repairs_amount' },
  { type: 'misc',                 amount: 'misc_amount' },
  { type: 'tires',                amount: 'tires_amount' },
  { type: 'cash_advance_12digit', amount: 'cash_advance_12digit_amount' },
  { type: 'cash_advance_emoney',  amount: 'cash_advance_emoney_amount' },
  { type: 'cash_advance_insta',   amount: 'cash_advance_insta_amount' },
  { type: 'fees',                 amount: 'fees_amount' },
  { type: 'fuel_discount',        amount: 'fuel_discount_amount' },
];

/**
 * The line items on a row: one per NON-ZERO category. The discount is a line
 * like any other, carrying its own negative amount, so it is visible rather
 * than folded into the fuel figure.
 */
export function deriveLines(row: ParsedFuelRow): FuelLine[] {
  const lines: FuelLine[] = [];
  for (const src of LINE_SOURCES) {
    const amount = Number(row[src.amount] ?? 0);
    const quantity = src.quantity ? Number(row[src.quantity] ?? 0) : 0;
    if (amount === 0 && quantity === 0) continue;
    lines.push({ line_type: src.type, amount, quantity: src.quantity ? quantity : null });
  }
  return lines;
}

/**
 * Categories against the printed total. The discount is already subtracted
 * from Total Amount and is itself negative, so it is ADDED here like every
 * other category — subtracting it would double-count it.
 */
export function reconcile(row: Omit<ParsedFuelRow, 'reconciliation_ok' | 'reconciliation_delta' | 'lines'>): {
  ok: boolean; delta: number;
} {
  const sum =
    row.diesel_amount + row.reefer_amount + row.def_amount + row.additive_amount +
    row.minor_repairs_amount + row.misc_amount + row.tires_amount +
    row.cash_advance_12digit_amount + row.cash_advance_emoney_amount +
    row.cash_advance_insta_amount + row.fees_amount + row.fuel_discount_amount;
  const delta = round2(sum - row.total_amount);
  return { ok: Math.abs(delta) < 0.005, delta };
}

export interface ParsedFuelFile {
  rows: ParsedFuelRow[];
  /** Rows whose categories do not add up. Imported anyway, flagged. */
  flaggedCount: number;
}

/**
 * Parse a whole file. Throws `FuelCsvFormatError` on a header that is not the
 * MultiService export — loudly, rather than mapping columns by position and
 * hoping.
 */
export function parseMultiserviceCsv(text: string): ParsedFuelFile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new FuelCsvFormatError('The file is empty.');

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  if (header.length !== MULTISERVICE_HEADER.length) {
    throw new FuelCsvFormatError(
      `Unexpected header: ${header.length} columns, expected ${MULTISERVICE_HEADER.length}. ` +
      `This does not look like the MultiService customized detail export.`,
    );
  }
  const mismatch = MULTISERVICE_HEADER.findIndex((expected, i) => header[i] !== expected);
  if (mismatch !== -1) {
    throw new FuelCsvFormatError(
      `Unexpected header at column ${mismatch + 1}: got ${JSON.stringify(header[mismatch])}, ` +
      `expected ${JSON.stringify(MULTISERVICE_HEADER[mismatch])}.`,
    );
  }

  const rows: ParsedFuelRow[] = [];
  let flaggedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]).map((v) => v.trim());
    if (c.length !== MULTISERVICE_HEADER.length) {
      throw new FuelCsvFormatError(
        `Row ${i + 1} has ${c.length} columns, expected ${MULTISERVICE_HEADER.length}.`,
      );
    }
    const base = {
      unit_no: c[0],
      card_no: c[1],
      driver_name: c[2],
      city: c[3],
      state: c[4],
      invoice_no: c[5],
      invoice_date: parseInvoiceDate(c[6]),
      diesel_amount: parseMoney(c[7], 'Diesel2 Cost'),
      diesel_gallons: parseQuantity(c[8], 'Diesel2 Gallons'),
      reefer_amount: parseMoney(c[9], 'Reefer Cost'),
      additive_amount: parseMoney(c[10], 'Additive Amt'),
      minor_repairs_amount: parseMoney(c[11], 'Minor Repairs'),
      misc_amount: parseMoney(c[12], 'Misc Amt'),
      tires_amount: parseMoney(c[13], 'Tires'),
      daycode: c[14],
      cash_advance_12digit_amount: parseMoney(c[15], '12 Digit Money'),
      cash_advance_emoney_amount: parseMoney(c[16], 'E-Money'),
      cash_advance_insta_amount: parseMoney(c[17], 'Insta Money®'),
      def_amount: parseMoney(c[18], 'Bulk DEF Amount'),
      def_quantity: parseQuantity(c[19], 'Bulk DEF Quantity'),
      fees_amount: parseMoney(c[20], 'Fees'),
      fuel_discount_amount: parseMoney(c[21], 'Fuel Disc Amt'),
      total_amount: parseMoney(c[22], 'Total Amount'),
    };
    const { ok, delta } = reconcile(base);
    if (!ok) flaggedCount++;
    const row: ParsedFuelRow = {
      ...base,
      reconciliation_ok: ok,
      reconciliation_delta: delta,
      lines: [],
    };
    row.lines = deriveLines(row);
    rows.push(row);
  }

  return { rows, flaggedCount };
}

/** Date range covered by a parsed file, or nulls when empty. */
export function fileDateRange(rows: ParsedFuelRow[]): { start: string | null; end: string | null } {
  if (rows.length === 0) return { start: null, end: null };
  const dates = rows.map((r) => r.invoice_date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
