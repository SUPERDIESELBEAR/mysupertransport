/**
 * The MultiService "customized detail" CSV, parsed.
 *
 * Four things in this file are load-bearing and were each learned from the
 * live 297-row export rather than from a specification:
 *
 * 1. COLUMNS ARE FOUND BY NAME, NOT BY POSITION. The 23 columns of the live
 *    export are the checkboxes one operator happened to tick on MultiService's
 *    report screen, out of roughly fifty. A different tick list is a normal
 *    variation, not a corrupt file. Only four columns are genuinely required;
 *    everything else is optional and absent means zero.
 * 2. MONEY ARRIVES IN TWO FORMATS ON THE SAME COLUMN. "Bulk DEF Amount" is
 *    "$0.00" when zero and a bare `50` when populated. A parser that handles
 *    only one form drops DEF on the rows that have it.
 * 3. ONE ROW IS NOT ONE CHARGE. 78 of 297 rows carry more than one category,
 *    diesel plus DEF most often, so each row expands into line items.
 * 4. THE MONEY IS WHAT CATCHES A FORGOTTEN CHECKBOX. Name matching cannot see
 *    a category that was never exported — every column present parses fine.
 *    But the categories then do not sum to `Total Amount`. Reconciliation is
 *    therefore the detector for a missing column, not merely a tidiness check.
 *    A failing row is IMPORTED AND FLAGGED, never dropped, never corrected.
 */

/** Line types, matching the `fuel_line_type` enum exactly. */
export type FuelLineType =
  | 'diesel' | 'reefer' | 'def' | 'additive' | 'minor_repairs' | 'misc' | 'tires'
  | 'cash_advance_12digit' | 'cash_advance_emoney' | 'cash_advance_insta'
  | 'fees' | 'fuel_discount'
  // Added in Module 6 Pass 2 — categories SUPERTRANSPORT does not use but the
  // MultiService report screen offers and another carrier may tick.
  | 'diesel1' | 'unleaded' | 'cng' | 'lng' | 'lpg'
  | 'reefer_cng' | 'reefer_lng' | 'reefer_lpg' | 'oil' | 'tax';

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

  /**
   * Categories with no dedicated column on `fuel_transactions` — CNG, Diesel 1,
   * Tax and the rest. They travel as line items only, keyed by line type, and
   * they count towards reconciliation like any other category.
   */
  extra_amounts: Partial<Record<FuelLineType, number>>;
  extra_quantities: Partial<Record<FuelLineType, number>>;

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

/**
 * The 23 columns of the FIRST live SUPERTRANSPORT export. Retained as the
 * Pass 1 reference tick list and for the regression test — it is NO LONGER a
 * positional contract.
 */
export const MULTISERVICE_HEADER = [
  'Unit No', 'Card No', 'Driver Name', 'City', 'State', 'Invoice No', 'Invoice Date',
  'Diesel2 Cost', 'Diesel2 Gallons', 'Reefer Cost', 'Additive Amt', 'Minor Repairs',
  'Misc Amt', 'Tires', 'Daycode', '12 Digit Money', 'E-Money', 'Insta Money®',
  'Bulk DEF Amount', 'Bulk DEF Quantity', 'Fees', 'Fuel Disc Amt', 'Total Amount',
] as const;

/**
 * The 27 columns of the REAL export dated 2026-09-05, verbatim and in file
 * order. This is the only header any of these names has actually been SEEN in,
 * and it is the reason `Oil Amt` / `Oil Qty` replaced the checkbox labels
 * `Oil Amount` / `Oil Quantity`, which were both wrong.
 */
export const MULTISERVICE_HEADER_2026_09_05 = [
  'Unit No', 'Card No', 'Driver Name', 'Merchant Name', 'City', 'State', 'Invoice No',
  'Invoice Date', 'Diesel2 Cost', 'Diesel2 Gallons', 'Reefer Cost', 'Reefer Gallons',
  'Oil Amt', 'Oil Qty', 'Additive Amt', 'Minor Repairs', 'Misc Amt', 'Tires', 'Daycode',
  '12 Digit Money', 'E-Money', 'Insta Money®', 'Bulk DEF Amount', 'Bulk DEF Quantity',
  'Fees', 'Fuel Disc Amt', 'Total Amount',
] as const;

/** A row cannot be identified, dated or costed without these. */
export const REQUIRED_COLUMNS = [
  'Card No', 'Invoice No', 'Invoice Date', 'Total Amount',
] as const;

/** Descriptive columns: parsed when present, empty string when absent. */
const TEXT_COLUMNS = ['Unit No', 'Driver Name', 'City', 'State', 'Daycode'] as const;

/**
 * Every money category the report screen can emit. `field` names the flat
 * column on `fuel_transactions`; categories without one ride as line items.
 *
 * `unverified` marks a column name that came from a CHECKBOX LABEL on
 * MultiService's report screen and has NEVER been seen in a real file header.
 * Two out of two checkable labels (`Oil Amount`, `Oil Quantity`) turned out to
 * be wrong, so every remaining label is assumed wrong until a real header
 * containing it is examined. The CATEGORIES are real; only the names are in
 * doubt, which is why none of these entries — and none of the `fuel_line_type`
 * values — were deleted.
 */
interface CategorySpec {
  column: string;
  quantityColumn?: string;
  lineType: FuelLineType;
  amountField?: keyof ParsedFuelRow;
  quantityField?: keyof ParsedFuelRow;
  /** Name taken from a checkbox label, never seen in a file header. */
  unverified?: true;
}

export const CATEGORY_SPECS: CategorySpec[] = [
  // --- VERIFIED against the 2026-09-05 export header ---
  { column: 'Diesel2 Cost', quantityColumn: 'Diesel2 Gallons', lineType: 'diesel', amountField: 'diesel_amount', quantityField: 'diesel_gallons' },
  { column: 'Reefer Cost', quantityColumn: 'Reefer Gallons', lineType: 'reefer', amountField: 'reefer_amount' },
  { column: 'Bulk DEF Amount', quantityColumn: 'Bulk DEF Quantity', lineType: 'def', amountField: 'def_amount', quantityField: 'def_quantity' },
  { column: 'Oil Amt', quantityColumn: 'Oil Qty', lineType: 'oil' },
  { column: 'Additive Amt', lineType: 'additive', amountField: 'additive_amount' },
  { column: 'Minor Repairs', lineType: 'minor_repairs', amountField: 'minor_repairs_amount' },
  { column: 'Misc Amt', lineType: 'misc', amountField: 'misc_amount' },
  { column: 'Tires', lineType: 'tires', amountField: 'tires_amount' },
  { column: '12 Digit Money', lineType: 'cash_advance_12digit', amountField: 'cash_advance_12digit_amount' },
  { column: 'E-Money', lineType: 'cash_advance_emoney', amountField: 'cash_advance_emoney_amount' },
  { column: 'Insta Money®', lineType: 'cash_advance_insta', amountField: 'cash_advance_insta_amount' },
  { column: 'Fees', lineType: 'fees', amountField: 'fees_amount' },
  { column: 'Fuel Disc Amt', lineType: 'fuel_discount', amountField: 'fuel_discount_amount' },
  // --- UNVERIFIED: checkbox labels, never seen in a file header ---
  { column: 'Diesel 1 Amount', quantityColumn: 'Diesel 1 Quantity', lineType: 'diesel1', unverified: true },
  { column: 'Unleaded Amount', quantityColumn: 'Unleaded Quantity', lineType: 'unleaded', unverified: true },
  { column: 'CNG Amount', quantityColumn: 'CNG Quantity', lineType: 'cng', unverified: true },
  { column: 'LNG Amount', quantityColumn: 'LNG Quantity', lineType: 'lng', unverified: true },
  { column: 'LPG Amount', quantityColumn: 'LPG Quantity', lineType: 'lpg', unverified: true },
  { column: 'Reefer CNG', lineType: 'reefer_cng', unverified: true },
  { column: 'Reefer LNG', lineType: 'reefer_lng', unverified: true },
  { column: 'Reefer LPG', lineType: 'reefer_lpg', unverified: true },
  { column: 'Tax', lineType: 'tax', unverified: true },
];

/** Every column name the parser understands, required and optional together. */
export const KNOWN_COLUMNS: string[] = [
  ...REQUIRED_COLUMNS,
  ...TEXT_COLUMNS,
  ...CATEGORY_SPECS.flatMap((s) => (s.quantityColumn ? [s.column, s.quantityColumn] : [s.column])),
];


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
/* Header: found by name                                               */
/* ------------------------------------------------------------------ */

/** Matching is case- and spacing-insensitive; reporting uses the file's text. */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** An unrecognised column that carries money — the loud case. */
export interface UnrecognizedMoneyColumn {
  column: string;
  /** Sum of the non-zero numeric values found in that column. */
  total: number;
  /** How many rows carried a non-zero value. */
  rows: number;
}

export interface FuelColumnReport {
  /** Known column names, as the file printed them, in file order. */
  recognized: string[];
  /** Columns the parser does not understand. Ignored for parsing, reported. */
  unrecognized: string[];
  /**
   * The subset of `unrecognized` that holds non-zero numbers. Money we are
   * DROPPING, as opposed to a descriptive label we are rightly ignoring.
   * Populated by `parseMultiserviceCsv`, which is the only place rows exist.
   */
  unrecognized_money: UnrecognizedMoneyColumn[];
  /** Known optional columns absent from this file — treated as zero. */
  missing_optional: string[];
  /** Total columns in the header, recognised or not. */
  column_count: number;
}


interface HeaderIndex {
  at: (column: string) => number | undefined;
  report: FuelColumnReport;
}

export function indexHeader(header: string[]): HeaderIndex {
  const byName = new Map<string, number>();
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  header.forEach((raw, i) => {
    const key = norm(raw);
    if (key === '') return;
    if (seen.has(key)) { duplicates.push(raw.trim()); return; }
    seen.set(key, raw.trim());
    byName.set(key, i);
  });

  if (duplicates.length > 0) {
    throw new FuelCsvFormatError(
      `Duplicate column name${duplicates.length > 1 ? 's' : ''} in the header: `
      + `${[...new Set(duplicates)].map((d) => `"${d}"`).join(', ')}. `
      + 'A column cannot appear twice — this export is malformed.',
    );
  }

  const missingRequired = REQUIRED_COLUMNS.filter((c) => !byName.has(norm(c)));
  if (missingRequired.length > 0) {
    throw new FuelCsvFormatError(
      `Required column${missingRequired.length > 1 ? 's' : ''} missing: `
      + `${missingRequired.map((c) => `"${c}"`).join(', ')}. `
      + 'Without them a row cannot be identified, dated or costed.',
    );
  }

  const knownKeys = new Set(KNOWN_COLUMNS.map(norm));
  const recognized: string[] = [];
  const unrecognized: string[] = [];
  header.forEach((raw) => {
    const name = raw.trim();
    if (name === '') return;
    (knownKeys.has(norm(name)) ? recognized : unrecognized).push(name);
  });

  const present = new Set(header.map(norm));
  const missing_optional = KNOWN_COLUMNS
    .filter((c) => !REQUIRED_COLUMNS.includes(c as typeof REQUIRED_COLUMNS[number]))
    .filter((c) => !present.has(norm(c)));

  return {
    at: (column: string) => byName.get(norm(column)),
    report: {
      recognized,
      unrecognized,
      unrecognized_money: [],
      missing_optional,
      column_count: header.filter((h) => h.trim() !== '').length,
    },

  };
}

/* ------------------------------------------------------------------ */
/* Row assembly                                                        */
/* ------------------------------------------------------------------ */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The line items on a row: one per NON-ZERO category. The discount is a line
 * like any other, carrying its own negative amount, so it is visible rather
 * than folded into the fuel figure.
 */
export function deriveLines(row: ParsedFuelRow): FuelLine[] {
  const lines: FuelLine[] = [];
  for (const spec of CATEGORY_SPECS) {
    const amount = spec.amountField
      ? Number(row[spec.amountField] ?? 0)
      : Number(row.extra_amounts?.[spec.lineType] ?? 0);
    const hasQuantity = Boolean(spec.quantityColumn);
    const quantity = !hasQuantity ? 0 : spec.quantityField
      ? Number(row[spec.quantityField] ?? 0)
      : Number(row.extra_quantities?.[spec.lineType] ?? 0);
    if (amount === 0 && quantity === 0) continue;
    lines.push({ line_type: spec.lineType, amount, quantity: hasQuantity ? quantity : null });
  }
  return lines;
}

/** Every category amount on a row, whether it has a flat column or not. */
function categorySum(row: Pick<ParsedFuelRow, 'extra_amounts'> & Record<string, unknown>): number {
  let sum = 0;
  for (const spec of CATEGORY_SPECS) {
    sum += spec.amountField
      ? Number(row[spec.amountField] ?? 0)
      : Number(row.extra_amounts?.[spec.lineType] ?? 0);
  }
  return sum;
}

/**
 * Categories against the printed total. The discount is already subtracted
 * from Total Amount and is itself negative, so it is ADDED here like every
 * other category — subtracting it would double-count it.
 *
 * A negative delta means the categories present fall SHORT of the total: the
 * money is on the invoice but no exported column accounts for it, which is
 * exactly what a forgotten checkbox looks like.
 */
export function reconcile(
  row: Omit<ParsedFuelRow, 'reconciliation_ok' | 'reconciliation_delta' | 'lines'>,
): { ok: boolean; delta: number } {
  const delta = round2(categorySum(row as never) - row.total_amount);
  return { ok: Math.abs(delta) < 0.005, delta };
}

export interface ParsedFuelFile {
  rows: ParsedFuelRow[];
  /** Rows whose categories do not add up. Imported anyway, flagged. */
  flaggedCount: number;
  /** Which columns were found, ignored, or absent. */
  columns: FuelColumnReport;
  /** Sum of the deltas on the flagged rows. Negative means short. */
  reconciliationDelta: number;
}

/**
 * Parse a whole file. Columns are located by name in any order; unknown
 * columns are ignored and reported. Throws `FuelCsvFormatError` only when a
 * required column is missing or a name appears twice.
 */
export function parseMultiserviceCsv(text: string): ParsedFuelFile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new FuelCsvFormatError('The file is empty.');

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const { at, report } = indexHeader(header);

  const cell = (c: string[], column: string): string => {
    const i = at(column);
    return i === undefined ? '' : (c[i] ?? '');
  };

  const rows: ParsedFuelRow[] = [];
  let flaggedCount = 0;
  let reconciliationDelta = 0;

  // An unrecognised column is only a quiet note while it holds no money. Track
  // each one as the rows go by so the preview can tell a dropped AMOUNT apart
  // from a descriptive label. This is the check that would have caught
  // `Oil Amt` on the first import.
  const unknownTallies = report.unrecognized.map((name) => ({
    column: name,
    index: header.findIndex((h) => norm(h) === norm(name)),
    total: 0,
    rows: 0,
  }));

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]).map((v) => v.trim());
    // Width is still checked: a short row would silently read absent cells as
    // zero, which is the one failure the name lookup cannot distinguish from a
    // column the operator chose not to export.
    if (c.length !== header.length) {
      throw new FuelCsvFormatError(
        `Row ${i + 1} has ${c.length} columns, expected ${header.length}.`,
      );
    }

    for (const t of unknownTallies) {
      if (t.index < 0) continue;
      let value = 0;
      try { value = parseMoney(c[t.index], t.column); } catch { continue; } // text: not money
      if (value !== 0) { t.total = round2(t.total + value); t.rows += 1; }
    }

    const extra_amounts: Partial<Record<FuelLineType, number>> = {};
    const extra_quantities: Partial<Record<FuelLineType, number>> = {};
    const amountOf = (spec: CategorySpec) => parseMoney(cell(c, spec.column), spec.column);
    const quantityOf = (spec: CategorySpec) =>
      (spec.quantityColumn ? parseQuantity(cell(c, spec.quantityColumn), spec.quantityColumn) : 0);

    for (const spec of CATEGORY_SPECS) {
      // A quantity with no flat column of its own — `Reefer Gallons` — rides
      // as a line-item quantity beside its flat amount.
      if (spec.quantityColumn && !spec.quantityField) {
        const quantity = quantityOf(spec);
        if (quantity !== 0) extra_quantities[spec.lineType] = quantity;
      }
      if (spec.amountField) continue;
      const amount = amountOf(spec);
      if (amount !== 0) extra_amounts[spec.lineType] = amount;
    }


    const flat = (column: string) => parseMoney(cell(c, column), column);
    const base = {
      unit_no: cell(c, 'Unit No'),
      card_no: cell(c, 'Card No'),
      driver_name: cell(c, 'Driver Name'),
      city: cell(c, 'City'),
      state: cell(c, 'State'),
      invoice_no: cell(c, 'Invoice No'),
      invoice_date: parseInvoiceDate(cell(c, 'Invoice Date')),
      daycode: cell(c, 'Daycode'),
      diesel_amount: flat('Diesel2 Cost'),
      diesel_gallons: parseQuantity(cell(c, 'Diesel2 Gallons'), 'Diesel2 Gallons'),
      reefer_amount: flat('Reefer Cost'),
      additive_amount: flat('Additive Amt'),
      minor_repairs_amount: flat('Minor Repairs'),
      misc_amount: flat('Misc Amt'),
      tires_amount: flat('Tires'),
      cash_advance_12digit_amount: flat('12 Digit Money'),
      cash_advance_emoney_amount: flat('E-Money'),
      cash_advance_insta_amount: flat('Insta Money®'),
      def_amount: flat('Bulk DEF Amount'),
      def_quantity: parseQuantity(cell(c, 'Bulk DEF Quantity'), 'Bulk DEF Quantity'),
      fees_amount: flat('Fees'),
      fuel_discount_amount: flat('Fuel Disc Amt'),
      total_amount: flat('Total Amount'),
      extra_amounts,
      extra_quantities,
    };

    const { ok, delta } = reconcile(base);
    if (!ok) { flaggedCount++; reconciliationDelta = round2(reconciliationDelta + delta); }
    const row: ParsedFuelRow = {
      ...base,
      reconciliation_ok: ok,
      reconciliation_delta: delta,
      lines: [],
    };
    row.lines = deriveLines(row);
    rows.push(row);
  }

  report.unrecognized_money = unknownTallies
    .filter((t) => t.rows > 0)
    .map(({ column, total, rows: r }) => ({ column, total, rows: r }));

  return { rows, flaggedCount, columns: report, reconciliationDelta };
}

/* ------------------------------------------------------------------ */
/* What the operator must be shown before committing                   */
/* ------------------------------------------------------------------ */

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The warning that answers "did I forget a checkbox". Name matching cannot
 * detect an absent category; the money can. Null when everything adds up.
 */
export function reconciliationWarning(file: ParsedFuelFile): string | null {
  if (file.flaggedCount === 0) return null;
  const rows = `${file.flaggedCount} row${file.flaggedCount === 1 ? '' : 's'}`;
  const direction = file.reconciliationDelta < 0 ? 'short by' : 'over by';
  return (
    `Categories present do not sum to Total Amount on ${rows}, `
    + `${direction} ${money(file.reconciliationDelta)}. `
    + 'A category column may be missing from this export.'
  );
}

/**
 * An unrecognised column carrying MONEY is not the same event as an
 * unrecognised label. One is an amount we are dropping; the other is
 * description. Null when no unrecognised column holds a non-zero number.
 */
export function unrecognizedMoneyNotice(columns: FuelColumnReport): string | null {
  const cols = columns.unrecognized_money;
  if (cols.length === 0) return null;
  const detail = cols
    .map((c) => `\`${c.column}\` (${money(c.total)} across ${c.rows} row${c.rows === 1 ? '' : 's'})`)
    .join(', ');
  return (
    `${cols.length} unrecognised column${cols.length === 1 ? '' : 's'} `
    + `contain${cols.length === 1 ? 's' : ''} money: ${detail}. `
    + `${cols.length === 1 ? 'Its amount is' : 'Their amounts are'} NOT captured.`
  );
}

/**
 * The quiet note: unrecognised columns that hold no money. Those that DO hold
 * money are reported separately and louder by `unrecognizedMoneyNotice`.
 */
export function unrecognizedColumnsNotice(columns: FuelColumnReport): string | null {
  const loud = new Set(columns.unrecognized_money.map((c) => norm(c.column)));
  const quiet = columns.unrecognized.filter((c) => !loud.has(norm(c)));
  const n = quiet.length;
  if (n === 0) return null;
  return `${n} column${n === 1 ? '' : 's'} not recognised: ${quiet.join(', ')}.`;
}


/**
 * This file's column set against the last import for the same provider. Turns
 * "did I miss a checkbox" into a question the app answers before commit.
 */
export function columnDriftNotice(
  columns: FuelColumnReport,
  previousRecognized: string[] | null | undefined,
): string | null {
  if (!previousRecognized || previousRecognized.length === 0) return null;
  const now = new Set(columns.recognized.map(norm));
  const absent = previousRecognized.filter((c) => !now.has(norm(c)));
  const added = columns.recognized.filter(
    (c) => !previousRecognized.some((p) => norm(p) === norm(c)),
  );
  if (absent.length === 0 && added.length === 0) return null;

  const parts = [
    `This file has ${columns.column_count} columns. The last import had ${previousRecognized.length}.`,
  ];
  if (absent.length > 0) {
    parts.push(`${absent.map((c) => `\`${c}\``).join(', ')} ${absent.length === 1 ? 'is' : 'are'} absent.`);
  }
  if (added.length > 0) {
    parts.push(`${added.map((c) => `\`${c}\``).join(', ')} ${added.length === 1 ? 'is' : 'are'} new.`);
  }
  return parts.join(' ');
}

/** Date range covered by a parsed file, or nulls when empty. */
export function fileDateRange(rows: ParsedFuelRow[]): { start: string | null; end: string | null } {
  if (rows.length === 0) return { start: null, end: null };
  const dates = rows.map((r) => r.invoice_date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
