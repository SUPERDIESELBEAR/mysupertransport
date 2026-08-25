import type { Broker } from '@/lib/brokers';

/**
 * A complete Broker row for tests. Every column is present, so adding a column
 * to the directory does not silently leave a test rendering `undefined` — the
 * reader-boundary tests are only meaningful against the real query shape.
 */
export function brokerFixture(overrides: Partial<Broker> = {}): Broker {
  return {
    id: 'b1',
    company_name: 'BlueGrace Logistics',
    mc_number: '123456',
    dot_number: null,
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    billing_email: null,
    address_line1: null,
    address_line2: null,
    city: 'Tampa',
    state: 'FL',
    zip: null,
    factoring_status: 'approved',
    factoring_status_reason: null,
    factoring_status_updated_at: null,
    payment_terms: null,
    avg_days_to_pay: null,
    notes: null,
    is_active: true,
    created_at: null,
    updated_at: null,
    carrier_packet_completed: false,
    carrier_packet_completed_at: null,
    carrier_packet_completed_by: null,
    broker_agreement_signed: false,
    broker_agreement_signed_at: null,
    broker_agreement_recorded_by: null,
    broker_agreement_document_id: null,
    do_not_load: false,
    do_not_load_reason: null,
    do_not_load_set_at: null,
    do_not_load_set_by: null,
    rating: null,
    load_count: 4,
    ...overrides,
  };
}
