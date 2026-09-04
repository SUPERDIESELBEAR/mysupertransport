/**
 * MODULE 7 (Billing & Invoicing), PASS 4 — remittance ingest.
 *
 * Shaped from a REAL Smart Freight Funding check statement examined on
 * 2026-09-04 (check 764176, $40,027.12 net, ~25 invoice blocks). Facts the
 * shape encodes, none of them guessed:
 *
 *   ONE CHECK FUNDS MANY INVOICES, so the statement is a header plus lines.
 *   THE FEE IS 2% OF THE FULL INVOICE — including accessorials. Row R85015:
 *   rate 1600 + lumper 482 = 2082, commission -41.64, which is 2% of 2082 and
 *   not of 1600. That is the Pass 2 composition, confirmed by the factor.
 *   THERE IS NO RESERVE. Net is gross less fee, and nothing else.
 *   THE MATCH KEY IS OUR INVOICE NUMBER. The statement's "Load #" is the
 *   BROKER's reference (`R85015`, `DL2026080333`) and maps to
 *   `loads.broker_reference_number` — matching on it fails on every row.
 *   THE LUMPER SIGN IS MISLEADING: printed `-$482.00`, it is ADDED to the
 *   grand total. Anything reading that minus literally gets it backwards.
 *
 * The fee is RECORDED, never recomputed. `dispatch_settlement_rates.factoring_pct`
 * and what the factor actually took are the same real-world rate serving two
 * roles; deriving either from the other is the bug, not the safeguard.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** One invoice block off the statement, as printed. */
export interface RemittanceStatementLine {
  /** Our invoice number, however the factor's system chose to render it. */
  invoiceNumber: string;
  /** The factor's "Load #" — the BROKER's reference. Carried, never matched on. */
  brokerReference?: string | null;
  /** The full invoice the fee was charged against, accessorials included. */
  grossAmount: number;
  /** What the factor took. A fact off the statement. */
  feeAmount: number;
  /** What landed: gross less fee. */
  netAmount: number;
}

export interface RemittanceStatement {
  reference: string;
  remittanceDate: string;
  netAmount: number;
  source?: string;
  method?: 'check' | 'ach' | 'wire' | 'other';
  notes?: string | null;
  lines: RemittanceStatementLine[];
}

/**
 * Digits only. `ST26-0001`, `26-0001` and `260001` all reduce to `260001`.
 *
 * Every invoice Smart Freight has received to date came from Alvys as bare
 * digits, so there is no evidence of how a prefix survives their system.
 * Normalising BOTH sides is what makes all three renderings the same key, and
 * the leading year keeps it unambiguous against the legacy 7-digit range.
 */
export function normalizeInvoiceNumber(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits === '' ? null : digits;
}

export type UnmatchedReason = 'no_invoice_number' | 'no_match' | 'ambiguous';

export interface MatchedLine {
  line: RemittanceStatementLine;
  invoiceId: string;
  invoiceNumber: string;
}

export interface UnmatchedLine {
  line: RemittanceStatementLine;
  reason: UnmatchedReason;
}

export interface KnownInvoice {
  id: string;
  invoiceNumber: string;
}

/**
 * Match on normalised digits, and NEVER on a near match. A line that finds no
 * invoice, or more than one, is held for a human rather than guessed at.
 */
export function matchRemittanceLines(
  lines: RemittanceStatementLine[],
  invoices: KnownInvoice[],
): { matched: MatchedLine[]; unmatched: UnmatchedLine[] } {
  const matched: MatchedLine[] = [];
  const unmatched: UnmatchedLine[] = [];

  for (const line of lines) {
    const key = normalizeInvoiceNumber(line.invoiceNumber);
    if (key === null) {
      unmatched.push({ line, reason: 'no_invoice_number' });
      continue;
    }
    const hits = invoices.filter((i) => normalizeInvoiceNumber(i.invoiceNumber) === key);
    if (hits.length === 0) unmatched.push({ line, reason: 'no_match' });
    else if (hits.length > 1) unmatched.push({ line, reason: 'ambiguous' });
    else matched.push({ line, invoiceId: hits[0].id, invoiceNumber: hits[0].invoiceNumber });
  }

  return { matched, unmatched };
}

const cents = (n: number) => Math.round(n * 100) / 100;

export interface StatementProblem {
  invoiceNumber: string | null;
  problem: 'line_net_is_not_gross_less_fee' | 'header_net_is_not_the_sum_of_the_lines';
  stated: number;
  computed: number;
}

/**
 * Statement arithmetic, checked as a STATEMENT — before any matching, so a
 * mis-keyed figure is caught whether or not we recognise the invoice.
 */
export function checkStatementArithmetic(statement: RemittanceStatement): StatementProblem[] {
  const problems: StatementProblem[] = [];

  for (const l of statement.lines) {
    const expected = cents(l.grossAmount - l.feeAmount);
    if (cents(l.netAmount) !== expected) {
      problems.push({
        invoiceNumber: l.invoiceNumber,
        problem: 'line_net_is_not_gross_less_fee',
        stated: cents(l.netAmount),
        computed: expected,
      });
    }
  }

  const sum = cents(statement.lines.reduce((s, l) => s + l.netAmount, 0));
  if (sum !== cents(statement.netAmount)) {
    problems.push({
      invoiceNumber: null,
      problem: 'header_net_is_not_the_sum_of_the_lines',
      stated: cents(statement.netAmount),
      computed: sum,
    });
  }

  return problems;
}

export interface RemittanceResult {
  remittanceId: string;
  reference: string;
  netAmount: number;
  posted: Array<{
    payment_id: string;
    invoice_number: string;
    gross_amount: number;
    fee_amount: number;
    net_deposited: number;
    invoice_status: string;
  }>;
  unmatched: Array<{
    invoice_number: string | null;
    broker_reference: string | null;
    gross_amount: number | null;
    net_amount: number | null;
    reason: UnmatchedReason;
  }>;
}

/** Hand the statement to the single writer. Matching happens server-side too. */
export async function recordRemittance(
  sb: Client,
  statement: RemittanceStatement,
): Promise<RemittanceResult> {
  const problems = checkStatementArithmetic(statement);
  if (problems.length > 0) {
    throw new Error(
      `The statement does not add up: ${problems
        .map((p) => `${p.invoiceNumber ?? 'header'} ${p.problem} (stated ${p.stated}, computed ${p.computed})`)
        .join('; ')}`,
    );
  }

  const { data, error } = await sb.rpc('record_factoring_remittance', {
    p_payload: {
      reference: statement.reference,
      remittance_date: statement.remittanceDate,
      net_amount: statement.netAmount,
      source: statement.source ?? 'factor',
      method: statement.method ?? 'check',
      notes: statement.notes ?? null,
      lines: statement.lines.map((l) => ({
        invoice_number: l.invoiceNumber,
        broker_reference: l.brokerReference ?? null,
        gross_amount: l.grossAmount,
        fee_amount: l.feeAmount,
        net_amount: l.netAmount,
      })),
    },
  });

  if (error) throw new Error(error.message);
  const r = data as any;
  return {
    remittanceId: r.remittance_id,
    reference: r.reference,
    netAmount: Number(r.net_amount),
    posted: r.posted ?? [],
    unmatched: r.unmatched ?? [],
  };
}

/** A direct broker payment: no factor, so no fee unless one is stated. */
export async function recordDirectPayment(
  sb: Client,
  invoiceId: string,
  payment: {
    grossAmount: number; feeAmount?: number; netDeposited: number;
    receivedAt?: string; reference?: string | null;
    method?: 'check' | 'ach' | 'wire' | 'other';
  },
) {
  const { data, error } = await sb.rpc('record_invoice_payment', {
    p_invoice_id: invoiceId,
    p_payload: {
      source: 'broker',
      method: payment.method ?? 'check',
      reference: payment.reference ?? null,
      received_at: payment.receivedAt ?? null,
      gross_amount: payment.grossAmount,
      fee_amount: payment.feeAmount ?? 0,
      net_deposited: payment.netDeposited,
    },
  });
  if (error) throw new Error(error.message);
  return data;
}

/** A short pay closes ONLY with a written reason. Until then it sits `partial`. */
export async function closeShortPay(sb: Client, invoiceId: string, reason: string) {
  const { data, error } = await sb.rpc('close_short_paid_invoice', {
    p_invoice_id: invoiceId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}
