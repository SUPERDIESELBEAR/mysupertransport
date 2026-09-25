/**
 * THE INVOICE DOCUMENT MODEL — Alvys milestone 2, pass 2 (P72).
 *
 * PURE. No Deno, no supabase client, no pdf-lib: it takes the database rows
 * and returns every string the PDF prints, so the layout can be tested in
 * vitest and the renderer only draws. The layout copies the Alvys invoice
 * Smart Freight Funding already accepts.
 *
 * It REFUSES rather than renders when the lines do not add up to the
 * invoice's amount to the cent. A PDF that disagrees with the row it was
 * printed from is worse than no PDF.
 */

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  amount: number | string;
  created_at: string;
}
export interface InvoiceLineRow {
  line_type: string;
  description: string;
  amount: number | string;
}
export interface LoadRow {
  load_number: string;
  broker_reference_number: string | null;
  po_number: string | null;
  created_at: string;
  delivered_at: string | null;
  rate_type: string | null;
  rate_per_ton: number | string | null;
  confirmed_tons: number | string | null;
  rate_per_mile: number | string | null;
  loaded_miles: number | string | null;
}
export interface StopRow {
  stop_sequence: number;
  stop_type: string;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  reference_label: string | null;
  reference_number: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  appointment_start: string | null;
}
export interface BrokerRow {
  company_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}
export interface BillingSettingsRow {
  remit_to_name: string | null;
  remit_to_address_1: string | null;
  remit_to_address_2: string | null;
  remit_to_city: string | null;
  remit_to_state: string | null;
  remit_to_zip: string | null;
  remit_to_phone: string | null;
  remit_to_email: string | null;
  payment_terms_days: number;
}
export interface CarrierRow {
  mc_number: string | null;
  usdot_number: string | null;
}

export interface InvoiceModelInput {
  invoice: InvoiceRow;
  lines: InvoiceLineRow[];
  load: LoadRow;
  stops: StopRow[];
  broker: BrokerRow | null;
  settings: BillingSettingsRow;
  carrier: CarrierRow | null;
  /** Sum of posted payments (gross) against this invoice. */
  paymentsTotal: number;
  /** IANA zone the carrier works in, for instants → calendar days. */
  timeZone?: string;
}

export interface ChargeRow {
  description: string;
  rate: string;
  units: string;
  uom: string;
  amount: string;
}

export interface InvoiceDocument {
  remitHeader: string[];
  meta: [string, string][];
  billTo: string[];
  stops: { label: string; facility: string; place: string; reference: string }[];
  charges: ChargeRow[];
  totalCharges: string;
  balanceDue: string;
  remitTo: string[];
  totalCents: number;
}

export class InvoiceTotalsMismatch extends Error {}

const cents = (v: number | string | null | undefined) =>
  Math.round(Number(v ?? 0) * 100);

/** $1,400.00 */
export function formatMoney(v: number | string | null | undefined): string {
  const c = cents(v);
  const neg = c < 0;
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const s = `$${dollars}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

function formatQty(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * M/D/YYYY. A bare `YYYY-MM-DD` is a calendar day and is read digit-for-digit;
 * an instant is converted to the carrier's zone first.
 */
export function formatDateMDY(iso: string | null | undefined, timeZone = 'America/Chicago'): string {
  if (!iso) return '-';
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (bare) return `${Number(bare[2])}/${Number(bare[3])}/${bare[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}/${get('day')}/${get('year')}`;
}

/** The invoice date plus the terms, as a calendar day in the carrier's zone. */
export function dueDate(invoiceCreatedAt: string, termsDays: number, timeZone = 'America/Chicago'): string {
  const mdy = formatDateMDY(invoiceCreatedAt, timeZone);
  const [m, d, y] = mdy.split('/').map(Number);
  const due = new Date(Date.UTC(y, m - 1, d + termsDays, 12));
  return `${due.getUTCMonth() + 1}/${due.getUTCDate()}/${due.getUTCFullYear()}`;
}

const joinNonEmpty = (parts: (string | null | undefined)[], sep = ' ') =>
  parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);

export function buildInvoiceDocument(input: InvoiceModelInput): InvoiceDocument {
  const tz = input.timeZone ?? 'America/Chicago';
  const { invoice, lines, load, settings, carrier, broker } = input;

  const totalCents = cents(invoice.amount);
  const lineCents = lines.reduce((s, l) => s + cents(l.amount), 0);
  if (lineCents !== totalCents) {
    throw new InvoiceTotalsMismatch(
      `Invoice ${invoice.invoice_number} lines total ${formatMoney(lineCents / 100)} `
      + `but the invoice amount is ${formatMoney(totalCents / 100)}; the PDF was not rendered.`,
    );
  }

  const stops = [...input.stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const firstPickup = stops.find((s) => s.stop_type === 'pickup') ?? null;
  const pickupAt = firstPickup
    ? firstPickup.actual_departure_at ?? firstPickup.actual_arrival_at ?? firstPickup.appointment_start
    : null;

  const cityLine = (city: string | null, state: string | null, zip: string | null) =>
    joinNonEmpty([city ? `${city},` : null, state, zip]);

  const remitHeader = [
    settings.remit_to_name ?? '',
    settings.remit_to_address_1 ?? '',
    settings.remit_to_address_2 ?? '',
    cityLine(settings.remit_to_city, settings.remit_to_state, settings.remit_to_zip),
    joinNonEmpty([
      carrier?.mc_number ? `MC ${carrier.mc_number}` : null,
      carrier?.usdot_number ? `USDOT ${carrier.usdot_number}` : null,
    ], '   '),
  ].filter(Boolean);

  const meta: [string, string][] = [
    ['Invoice #', invoice.invoice_number],
    ['Invoice Date', formatDateMDY(invoice.created_at, tz)],
    ['Due Date', dueDate(invoice.created_at, settings.payment_terms_days, tz)],
    ['Load Number', load.load_number],
    ['Order No', load.broker_reference_number?.trim() || '-'],
    ['PO Number', load.po_number?.trim() || '-'],
    ['Order Date', formatDateMDY(load.created_at, tz)],
    ['Pickup Date', formatDateMDY(pickupAt, tz)],
    ['Delivered', formatDateMDY(load.delivered_at, tz)],
  ];

  const billTo = [
    broker?.company_name ?? '',
    broker?.address_line1 ?? '',
    broker?.address_line2 ?? '',
    broker ? cityLine(broker.city, broker.state, broker.zip) : '',
  ].filter(Boolean);

  const counters: Record<string, number> = {};
  const stopRows = stops.map((s) => {
    const kind = s.stop_type === 'pickup' ? 'Pickup' : 'Delivery';
    counters[kind] = (counters[kind] ?? 0) + 1;
    const ref = s.reference_number?.trim()
      ? joinNonEmpty([s.reference_label?.trim() ? `${s.reference_label.trim().replace(/\.$/, '')}.` : 'Ref.', s.reference_number.trim()])
      : '';
    return {
      label: `${kind} ${counters[kind]}`,
      facility: s.facility_name ?? '',
      place: joinNonEmpty([s.city?.toUpperCase(), s.state?.toUpperCase(), s.zip]),
      reference: ref,
    };
  });

  const charges: ChargeRow[] = lines.map((l) => {
    if (l.line_type === 'linehaul' && load.rate_type === 'per_ton'
        && load.rate_per_ton != null && load.confirmed_tons != null) {
      return {
        description: l.description,
        rate: formatMoney(load.rate_per_ton),
        units: formatQty(load.confirmed_tons),
        uom: 'Ton',
        amount: formatMoney(l.amount),
      };
    }
    if (l.line_type === 'linehaul' && load.rate_type === 'per_mile'
        && load.rate_per_mile != null && load.loaded_miles != null) {
      return {
        description: l.description,
        rate: formatMoney(load.rate_per_mile),
        units: formatQty(load.loaded_miles),
        uom: 'Mile',
        amount: formatMoney(l.amount),
      };
    }
    return {
      description: l.description,
      rate: formatMoney(l.amount),
      units: '1',
      uom: 'Flat',
      amount: formatMoney(l.amount),
    };
  });

  const remitTo = [
    settings.remit_to_name ?? '',
    settings.remit_to_address_1 ?? '',
    settings.remit_to_address_2 ?? '',
    cityLine(settings.remit_to_city, settings.remit_to_state, settings.remit_to_zip),
    settings.remit_to_phone ?? '',
    settings.remit_to_email ?? '',
  ].filter(Boolean);

  return {
    remitHeader,
    meta,
    billTo,
    stops: stopRows,
    charges,
    totalCharges: formatMoney(totalCents / 100),
    balanceDue: formatMoney((totalCents - cents(input.paymentsTotal)) / 100),
    remitTo,
    totalCents,
  };
}
