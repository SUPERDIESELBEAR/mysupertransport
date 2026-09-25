import { describe, it, expect } from 'vitest';
import {
  buildInvoiceDocument, dueDate, formatDateMDY, formatMoney, InvoiceTotalsMismatch,
  type InvoiceModelInput,
} from '../../supabase/functions/_shared/invoice/model';

const base = (): InvoiceModelInput => ({
  invoice: { id: 'i1', invoice_number: 'ST26-0009', amount: 1400, created_at: '2026-09-04T17:00:00Z' },
  lines: [{ line_type: 'linehaul', description: 'Linehaul', amount: 1400 }],
  load: {
    load_number: 'ST-9', broker_reference_number: 'ORD-77', po_number: null,
    created_at: '2026-09-01T17:00:00Z', delivered_at: '2026-09-03T17:00:00Z',
    rate_type: 'flat', rate_per_ton: null, confirmed_tons: null, rate_per_mile: null, loaded_miles: null,
  },
  stops: [
    { stop_sequence: 2, stop_type: 'delivery', facility_name: 'Receiver', city: 'Dallas', state: 'tx', zip: '75201',
      reference_label: null, reference_number: null, actual_arrival_at: null, actual_departure_at: null, appointment_start: null },
    { stop_sequence: 1, stop_type: 'pickup', facility_name: 'Shipper', city: 'Joplin', state: 'mo', zip: '64801',
      reference_label: 'BOL', reference_number: '96025', actual_arrival_at: '2026-09-02T14:00:00Z',
      actual_departure_at: null, appointment_start: '2026-09-01T14:00:00Z' },
  ],
  broker: { company_name: 'Broker Co', address_line1: '1 Main', address_line2: null, city: 'Omaha', state: 'NE', zip: '68102' },
  settings: {
    remit_to_name: 'Remit Name', remit_to_address_1: '605 Street', remit_to_address_2: null,
    remit_to_city: 'Town', remit_to_state: 'MO', remit_to_zip: '64080', remit_to_phone: '(816) 555-0100',
    remit_to_email: 'ar@example.com', payment_terms_days: 30,
  },
  carrier: { mc_number: '111', usdot_number: '222' },
  paymentsTotal: 0,
});

const meta = (d: ReturnType<typeof buildInvoiceDocument>) => Object.fromEntries(d.meta);

describe('invoice PDF model', () => {
  it('formats money and dates', () => {
    expect(formatMoney(1400)).toBe('$1,400.00');
    expect(formatDateMDY('2026-09-04')).toBe('9/4/2026');
    expect(dueDate('2026-09-04T17:00:00Z', 30)).toBe('10/4/2026');
  });

  it('fills every header field', () => {
    const m = meta(buildInvoiceDocument(base()));
    expect(m).toEqual({
      'Invoice #': 'ST26-0009', 'Invoice Date': '9/4/2026', 'Due Date': '10/4/2026',
      'Load Number': 'ST-9', 'Order No': 'ORD-77', 'PO Number': '-', 'Order Date': '9/1/2026',
      'Pickup Date': '9/2/2026', Delivered: '9/3/2026',
    });
  });

  it('pickup date prefers departure, then arrival, then appointment', () => {
    const i = base();
    i.stops[1].actual_departure_at = '2026-09-05T14:00:00Z';
    expect(meta(buildInvoiceDocument(i))['Pickup Date']).toBe('9/5/2026');
    i.stops[1].actual_departure_at = null; i.stops[1].actual_arrival_at = null;
    expect(meta(buildInvoiceDocument(i))['Pickup Date']).toBe('9/1/2026');
  });

  it('prints remit header with MC/USDOT, bill-to, stops in sequence, remit-to', () => {
    const d = buildInvoiceDocument(base());
    expect(d.remitHeader).toContain('MC 111   USDOT 222');
    expect(d.billTo).toEqual(['Broker Co', '1 Main', 'Omaha, NE 68102']);
    expect(d.stops).toEqual([
      { label: 'Pickup 1', facility: 'Shipper', place: 'JOPLIN MO 64801', reference: 'BOL. 96025' },
      { label: 'Delivery 1', facility: 'Receiver', place: 'DALLAS TX 75201', reference: '' },
    ]);
    expect(d.remitTo).toContain('ar@example.com');
  });

  it('flat charges show 1 Flat; per-ton shows rate and tons', () => {
    expect(buildInvoiceDocument(base()).charges[0]).toMatchObject({ units: '1', uom: 'Flat', amount: '$1,400.00' });
    const i = base();
    i.load = { ...i.load, rate_type: 'per_ton', rate_per_ton: 56, confirmed_tons: 25 };
    expect(buildInvoiceDocument(i).charges[0]).toMatchObject({ rate: '$56.00', units: '25', uom: 'Ton' });
  });

  it('balance due is total minus posted payments', () => {
    const i = base(); i.paymentsTotal = 400;
    const d = buildInvoiceDocument(i);
    expect(d.totalCharges).toBe('$1,400.00');
    expect(d.balanceDue).toBe('$1,000.00');
  });

  it('refuses to render when lines do not add up to the cent', () => {
    const i = base(); i.lines[0].amount = 1399.99;
    expect(() => buildInvoiceDocument(i)).toThrow(InvoiceTotalsMismatch);
  });

});
