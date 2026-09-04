/**
 * FIXTURE EVIDENCE — weaker than seeded-data evidence, which is itself weaker
 * than the Pratt run.
 *
 * The one live invoice, ST26-0001 for $1,875.00, is on the DIRECT billing path,
 * so it would never appear on a factoring remittance at all. This pass
 * therefore cannot be verified against real data, and no fake invoice was
 * created in the live database to make it look otherwise.
 *
 * The fixtures below are the SHAPE and the FIGURES of a real Smart Freight
 * Funding statement examined on 2026-09-04 — check 764176, and in particular
 * the R85015 row, which is what proves the fee base includes accessorials.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeInvoiceNumber, matchRemittanceLines, checkStatementArithmetic,
  type RemittanceStatement,
} from '@/lib/remittance';

/** Rows copied from the statement, fee included exactly as printed. */
const R85015 = {
  invoiceNumber: 'ST26-0007', brokerReference: 'R85015',
  grossAmount: 2082, feeAmount: 41.64, netAmount: 2040.36,
};

const statement: RemittanceStatement = {
  reference: '764176',
  remittanceDate: '2026-09-04',
  netAmount: 2401 + 1666 + 1163.26 + 857.5 + 2040.36,
  lines: [
    { invoiceNumber: 'ST26-0001', brokerReference: '0205370', grossAmount: 2450, feeAmount: 49, netAmount: 2401 },
    { invoiceNumber: '26-0002', brokerReference: 'DL2026080333', grossAmount: 1700, feeAmount: 34, netAmount: 1666 },
    { invoiceNumber: '260003', brokerReference: '1004725', grossAmount: 1187, feeAmount: 23.74, netAmount: 1163.26 },
    { invoiceNumber: 'ST26-0004', brokerReference: '0205371', grossAmount: 875, feeAmount: 17.5, netAmount: 857.5 },
    R85015,
  ],
};

describe('the invoice number survives the round trip', () => {
  it('all three possible return formats reduce to the same key', () => {
    expect(normalizeInvoiceNumber('ST26-0001')).toBe('260001');
    expect(normalizeInvoiceNumber('26-0001')).toBe('260001');
    expect(normalizeInvoiceNumber('260001')).toBe('260001');
  });

  it('an empty or punctuation-only value is not a key', () => {
    expect(normalizeInvoiceNumber('')).toBeNull();
    expect(normalizeInvoiceNumber('   ')).toBeNull();
    expect(normalizeInvoiceNumber('--')).toBeNull();
    expect(normalizeInvoiceNumber(null)).toBeNull();
  });

  it('the leading year keeps our digits clear of the Alvys 7-digit range', () => {
    expect(normalizeInvoiceNumber('260001')).not.toBe(normalizeInvoiceNumber('1004725'));
  });

  it('the broker reference is never a key — it is not even digits on most rows', () => {
    expect(normalizeInvoiceNumber('R85015')).toBe('85015');
    expect(normalizeInvoiceNumber('R85015')).not.toBe(normalizeInvoiceNumber('ST26-0007'));
  });
});

describe('matching holds what it cannot place', () => {
  const invoices = [
    { id: 'i1', invoiceNumber: 'ST26-0001' },
    { id: 'i2', invoiceNumber: 'ST26-0002' },
    { id: 'i7', invoiceNumber: 'ST26-0007' },
  ];

  it('matches whichever way the factor rendered the number', () => {
    const { matched } = matchRemittanceLines(statement.lines, invoices);
    expect(matched.map((m) => m.invoiceNumber)).toEqual(['ST26-0001', 'ST26-0002', 'ST26-0007']);
  });

  it('reports an unknown number as UNMATCHED rather than guessing a near match', () => {
    const { unmatched } = matchRemittanceLines(statement.lines, invoices);
    expect(unmatched.map((u) => [u.line.invoiceNumber, u.reason])).toEqual([
      ['260003', 'no_match'],
      ['ST26-0004', 'no_match'],
    ]);
  });

  it('an ambiguous key is held, never resolved by picking one', () => {
    const { matched, unmatched } = matchRemittanceLines(
      [{ invoiceNumber: 'ST26-0001', grossAmount: 100, feeAmount: 2, netAmount: 98 }],
      [{ id: 'a', invoiceNumber: 'ST26-0001' }, { id: 'b', invoiceNumber: '26-0001' }],
    );
    expect(matched).toHaveLength(0);
    expect(unmatched[0].reason).toBe('ambiguous');
  });

  it('a line with no invoice number at all is held', () => {
    const { unmatched } = matchRemittanceLines(
      [{ invoiceNumber: '', grossAmount: 100, feeAmount: 2, netAmount: 98 }], invoices);
    expect(unmatched[0].reason).toBe('no_invoice_number');
  });
});

describe('the statement arithmetic, as printed', () => {
  it('the real statement adds up line by line and in total', () => {
    expect(checkStatementArithmetic(statement)).toEqual([]);
  });

  it('the fee is 2% of the FULL invoice, accessorials included', () => {
    // 2% of 1600 would be 32.00. The factor charged 41.64 — 2% of 2082.
    expect(Math.round(R85015.grossAmount * 0.02 * 100) / 100).toBe(R85015.feeAmount);
    expect(Math.round(1600 * 0.02 * 100) / 100).not.toBe(R85015.feeAmount);
  });

  it('the lumper is ADDED to the base the fee is charged on, despite the minus sign', () => {
    const rate = 1600, lumperAsPrinted = -482;
    expect(rate + Math.abs(lumperAsPrinted)).toBe(R85015.grossAmount);
    expect(rate + lumperAsPrinted).not.toBe(R85015.grossAmount);
  });

  it('net is gross less fee and nothing else — there is no reserve', () => {
    for (const l of statement.lines) {
      expect(Math.round((l.grossAmount - l.feeAmount) * 100) / 100).toBe(l.netAmount);
    }
  });

  it('a mis-keyed line is caught before any matching happens', () => {
    const broken: RemittanceStatement = {
      ...statement,
      lines: [{ ...R85015, netAmount: 2040.63 }],
      netAmount: 2040.63,
    };
    expect(checkStatementArithmetic(broken)[0].problem).toBe('line_net_is_not_gross_less_fee');
  });

  it('a header that disagrees with its own lines is caught', () => {
    expect(checkStatementArithmetic({ ...statement, netAmount: 40027.12 })[0].problem)
      .toBe('header_net_is_not_the_sum_of_the_lines');
  });
});
