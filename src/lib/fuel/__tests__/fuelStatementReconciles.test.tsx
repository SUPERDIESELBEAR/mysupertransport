/**
 * THE STATEMENT ADDS UP IN BOTH STATES — 2026-09-11.
 *
 * The defect this file holds closed: with the discount hidden, the visible
 * columns summed to the GROSS while the Total printed the NET, so a driver
 * adding his own statement found an unlabelled gap the size of the discount —
 * $8.12, $2.04 and $10.16 on Ali Mohamed's three real purchases.
 *
 * The Total is now the GROSS in both states, with no branch: it is what is
 * deducted from his pay, what the four bucket columns are built from, and —
 * pump receipts carrying no discount, which is applied only when the purchase
 * clears the MultiService account — what his own receipt says. When the
 * discount IS his, `Discount` and `After discount` follow the Total and explain
 * the difference down to the net.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  buildDriverRows, summarizeDriverRows,
  type FuelDriverTransaction,
} from '../fuelDriverDetail';
import { buildFuelPdfDocument } from '../fuelDriverPdf';

const DOW_WEDNESDAY = 3;
const GENERATED = new Date('2026-09-11T12:00:00');

/** Ali Mohamed's three real purchases, exactly as stored. */
const ALI: FuelDriverTransaction[] = [
  {
    id: 'a', invoice_no: '5533430', invoice_date: '2026-09-01',
    merchant_name: 'Flying J #733', city: 'Lubbock', state: 'TX',
    total_amount: 505.96, fuel_discount_amount: -8.12,
    diesel_amount: 462.91, diesel_gallons: 81.23,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 462.91 },
      { line_type: 'def', amount: 51.17 },
      { line_type: 'fuel_discount', amount: -8.12 },
    ],
  },
  {
    id: 'b', invoice_no: '1333199', invoice_date: '2026-09-01',
    merchant_name: 'Pilot Travel Center #1033', city: 'Midland', state: 'TX',
    total_amount: 625.26, fuel_discount_amount: -2.04,
    diesel_amount: 122.30, diesel_gallons: 20.39,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 122.30 },
      { line_type: 'cash_advance_emoney', amount: 500 },
      { line_type: 'fees', amount: 5 },
      { line_type: 'fuel_discount', amount: -2.04 },
    ],
  },
  {
    id: 'c', invoice_no: '50895', invoice_date: '2026-08-29',
    merchant_name: 'Loves #822', city: 'Clarksville', state: 'AR',
    total_amount: 829.34, fuel_discount_amount: 0,
    diesel_amount: 777.69, diesel_gallons: 132.06,
    reconciliation_ok: true, reconciliation_delta: 0,
    fuel_transaction_lines: [
      { line_type: 'diesel', amount: 777.69 },
      { line_type: 'def', amount: 51.65 },
    ],
  },
];

const rows = buildDriverRows(ALI, {}, DOW_WEDNESDAY);
const pdf = (showDiscount: boolean) => buildFuelPdfDocument({
  driverName: 'Ali Mohamed', unitNumber: '260', rows,
  generatedAt: GENERATED, showDiscount,
});

const cash = (s: string) => Number(s.replace(/[$,]/g, '').replace(/^-/, '-'))
  || (s === '—' ? 0 : Number(s.replace(/[$,]/g, '')));

/** The visible money columns of one printed row, by header name. */
function cellsOf(doc: ReturnType<typeof pdf>, rowIndex: number) {
  const map: Record<string, string> = {};
  doc.columns.forEach((c, i) => { map[c] = doc.rows[rowIndex][i]; });
  return map;
}

const BUCKETS = ['Fuel', 'Cash advance', 'Repairs', 'Other'];

describe('discount HIDDEN: the columns sum to the Total', () => {
  const doc = pdf(false);

  it('reconciles on every row — the three that were off by 8.12, 2.04 and 0.00', () => {
    const seen: number[] = [];
    doc.rows.forEach((_, i) => {
      const c = cellsOf(doc, i);
      const sum = BUCKETS.reduce((t, b) => t + cash(c[b]), 0);
      seen.push(Math.round(sum * 100) / 100);
      expect(Math.round(sum * 100) / 100).toBe(cash(c.Total));
    });
    expect(seen).toEqual([514.08, 627.30, 829.34]);
  });

  it('reconciles in the totals block — the $10.16 gap is gone', () => {
    const b = Object.fromEntries(doc.pending.breakdown.map(x => [x.label, x.value]));
    const sum = BUCKETS.reduce((t, k) => t + cash(b[k]), 0);
    expect(Math.round(sum * 100) / 100).toBe(1970.72);
    expect(doc.pending.amount).toBe('$1,970.72');
  });

  it('says nothing about a discount anywhere', () => {
    expect(JSON.stringify(doc)).not.toMatch(/discount/i);
  });
});

describe('discount SHOWN: the same Total, and the discount explains the net', () => {
  const doc = pdf(true);

  it('the buckets still sum to the Total on every row', () => {
    doc.rows.forEach((_, i) => {
      const c = cellsOf(doc, i);
      const sum = BUCKETS.reduce((t, b) => t + cash(c[b]), 0);
      expect(Math.round(sum * 100) / 100).toBe(cash(c.Total));
    });
  });

  it('Total plus the discount is what the card was charged', () => {
    doc.rows.forEach((_, i) => {
      const c = cellsOf(doc, i);
      const after = Math.round((cash(c.Total) + cash(c.Discount)) * 100) / 100;
      expect(after).toBe(cash(c['After discount']));
    });
  });

  it('and the same holds in the totals block', () => {
    const b = Object.fromEntries(doc.pending.breakdown.map(x => [x.label, x.value]));
    expect(BUCKETS.reduce((t, k) => t + cash(b[k]), 0)).toBe(1970.72);
    expect(cash(b.Discount)).toBe(-10.16);
    expect(cash(b['After discount'])).toBe(1960.56);
    expect(doc.pending.amount).toBe('$1,970.72');
  });

  it('prints the SAME Total as the hidden state — no branch', () => {
    expect(pdf(true).pending.amount).toBe(pdf(false).pending.amount);
  });
});

describe('the deduction is the gross, in both states', () => {
  it('matches the settlement engine definition, total + |discount|', () => {
    ALI.forEach((t) => {
      const row = rows.find(r => r.id === t.id)!;
      const engineGross = Number(t.total_amount) + Math.abs(Number(t.fuel_discount_amount));
      expect(row.grossTotal).toBe(Math.round(engineGross * 100) / 100);
    });
    expect(summarizeDriverRows(rows).pending.grossTotal).toBe(1970.72);
  });
});

// ---------------------------------------------------------------------------
// The screen prints what the document prints.
// ---------------------------------------------------------------------------

const rpcRows = (passthrough: boolean) => ALI.map((t) => ({
  id: t.id, invoice_no: t.invoice_no, invoice_date: t.invoice_date,
  merchant_name: t.merchant_name, city: t.city, state: t.state,
  total_amount: t.total_amount, fuel_discount_amount: t.fuel_discount_amount,
  diesel_amount: t.diesel_amount, diesel_gallons: t.diesel_gallons,
  lines: t.fuel_transaction_lines ?? [],
  settlement_id: null, period_start: null, period_end: null,
  payday: null, settlement_status: null, work_week_start_dow: DOW_WEDNESDAY,
  discount_passthrough: passthrough,
}));

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

async function renderMyFuel(passthrough: boolean) {
  rpc.mockResolvedValue({ data: rpcRows(passthrough), error: null });
  const { default: MyFuel } = await import('@/components/operator/MyFuel');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}><MyFuel driverName="Ali Mohamed" unitNumber="260" /></QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getAllByTestId('my-fuel-row').length).toBe(3));
}

describe('My Fuel prints the same figures as the document', () => {
  beforeEach(() => { rpc.mockReset(); });

  it('OFF: the gross totals, and no reference to a discount', async () => {
    const { container } = { container: document.body };
    await renderMyFuel(false);
    expect(screen.getAllByText('$1,970.72').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/discount/i);
    expect(container.textContent).not.toContain('$1,960.56');
  });

  it('ON: the same gross total, with the discount and the net beneath it', async () => {
    await renderMyFuel(true);
    expect(screen.getAllByText('$1,970.72').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Discount').length).toBeGreaterThan(0);
    expect(screen.getAllByText('After discount').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$10.16').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$1,960.56').length).toBeGreaterThan(0);
  });
});
