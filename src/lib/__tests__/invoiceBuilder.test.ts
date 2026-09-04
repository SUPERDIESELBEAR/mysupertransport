/**
 * BEHAVIOURAL COVER for the pure invoice builder (Module 7, Pass 2).
 *
 * The verification of the module is the six seed loads and
 * `src/test/invoice-dispatch-reconciliation.test.ts`. These pin the rules
 * against hand-built inputs so a rule change fails loudly here first — in
 * particular the ABSENCE of an exclusion predicate, which is the rule most
 * likely to be "fixed" by someone reading the dispatch engine next to it.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadInvoice, type InvoiceLoadInput } from '@/lib/invoiceBuilder';
import type { LoadChargeRecord } from '@/lib/loadCharges';

const charge = (over: Partial<LoadChargeRecord>): LoadChargeRecord => ({
  id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'other',
  description: null, amount: 0, source: null, funding_source: null,
  actual_cost: null, proof_document_id: null, ...over,
});

const load = (over: Partial<InvoiceLoadInput> = {}): InvoiceLoadInput => ({
  id: 'l1', loadNumber: 'ST-1', loadType: 'standard', rateType: 'flat',
  linehaulRate: 1000, charges: [], ...over,
});

describe('the header rate is built from its own columns', () => {
  it('flat and percentage_of_load read the linehaul rate', () => {
    expect(buildLoadInvoice(load()).amount).toBe(1000);
    expect(buildLoadInvoice(load({ rateType: 'percentage_of_load' })).amount).toBe(1000);
  });

  it('per-mile multiplies the rate by loaded miles', () => {
    expect(buildLoadInvoice(load({ rateType: 'per_mile', ratePerMile: 2, loadedMiles: 500 }))
      .amount).toBe(1000);
  });

  it('per-ton bills CONFIRMED tons, never the estimate', () => {
    const scaled = load({ rateType: 'per_ton', ratePerTon: 270, confirmedTons: 25, linehaulRate: 0 });
    expect(buildLoadInvoice(scaled).amount).toBe(6750);
    const unscaled = { ...scaled, confirmedTons: null, estimatedTons: 30 } as InvoiceLoadInput;
    // An unscaled load bills no linehaul rather than a figure the scale ticket
    // has not confirmed.
    expect(buildLoadInvoice(unscaled).amount).toBe(0);
  });

  it('a loadout bills its relocation fee', () => {
    expect(buildLoadInvoice(load({
      loadType: 'loadout', loadoutRelocationFee: 150, linehaulRate: 0,
    })).amount).toBe(150);
  });

  it('a loadout bills its charges too — total_load_value drops them', () => {
    const r = buildLoadInvoice(load({
      loadType: 'loadout', loadoutRelocationFee: 150, linehaulRate: 0,
      charges: [charge({ charge_type: 'detention', amount: 300 })],
    }));
    expect(r.amount).toBe(450);
  });
});

describe('the fuel surcharge is billed only when it is unbundled', () => {
  it('an explicit false adds it; null and true do not', () => {
    expect(buildLoadInvoice(load({ fscAmount: 300, fscBundledIntoLinehaul: false })).amount)
      .toBe(1300);
    expect(buildLoadInvoice(load({ fscAmount: 300, fscBundledIntoLinehaul: null })).amount)
      .toBe(1000);
    expect(buildLoadInvoice(load({ fscAmount: 300, fscBundledIntoLinehaul: true })).amount)
      .toBe(1000);
  });
});

describe('THERE IS NO EXCLUSION PREDICATE — the broker owes every line', () => {
  it('bills detention in full, though the dispatch base drops it', () => {
    const r = buildLoadInvoice(load({
      charges: [charge({ charge_type: 'detention', amount: 500 })],
    }));
    expect(r.amount).toBe(1500);
    expect(r.lines.find(l => l.chargeType === 'detention')?.amount).toBe(500);
  });

  it('bills a lumper and a reimbursement-classed charge in full', () => {
    const r = buildLoadInvoice(load({
      charges: [
        charge({ id: 'a', charge_type: 'lumper', amount: 200 }),
        charge({ id: 'b', charge_type: 'reimbursement', amount: 90 }),
      ],
    }));
    expect(r.amount).toBe(1290);
  });

  it('bills a TONU charge on a load of any status — status is not read here', () => {
    const r = buildLoadInvoice(load({
      linehaulRate: 0, charges: [charge({ charge_type: 'tonu', amount: 150 })],
    }));
    expect(r.amount).toBe(150);
  });
});

describe('the lines ARE the amount', () => {
  it('the total is the sum of the lines, to the cent', () => {
    const r = buildLoadInvoice(load({
      fscAmount: 123.45, fscBundledIntoLinehaul: false,
      charges: [
        charge({ id: 'a', charge_type: 'detention', amount: 66.66 }),
        charge({ id: 'b', charge_type: 'stopoff', amount: 75.01 }),
      ],
    }));
    expect(r.amount).toBe(Math.round(r.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100);
    expect(r.amount).toBe(1265.12);
  });

  it('every charge line carries the load_charges id it bills', () => {
    const r = buildLoadInvoice(load({
      charges: [charge({ id: 'the-charge', charge_type: 'detention', amount: 10 })],
    }));
    expect(r.lines.filter(l => l.lineType === 'charge').map(l => l.loadChargeId))
      .toEqual(['the-charge']);
    expect(r.lines.filter(l => l.lineType !== 'charge').every(l => l.loadChargeId === null))
      .toBe(true);
  });

  it('a zero header still prints a line', () => {
    const r = buildLoadInvoice(load({ loadType: 'loadout', loadoutRelocationFee: 0, linehaulRate: 0 }));
    expect(r.amount).toBe(0);
    expect(r.lines.map(l => l.lineType)).toEqual(['linehaul']);
  });
});
