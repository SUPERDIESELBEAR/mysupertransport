import type { Confidence, Field, ParsedRateConfirmation } from '@/lib/rateConfirmation';
import {
  BG_BROKER_TERMS_LAYER,
  BG_SPECIAL_INSTRUCTIONS_VERBATIM,
} from '@/test/fixtures/blueGraceRateCon';
import { BG_LOAD_NUMBER } from '@/test/fixtures/blueGracePage';

/**
 * What the parse edge function returns for the Blue Grace tender.
 *
 * THIS IS THE ONE STUB IN THE END-TO-END TEST. The edge function calls a model
 * over the network and cannot run under vitest, so its answer is fixed here and
 * everything downstream of it — verification, adoption, form population, the
 * save RPCs, references, diagnostics — runs for real.
 *
 * The values are the ones the deployed parser produced for this document, so
 * the transcriptions are faithful: the interesting behaviour is not a bad model,
 * it is that the page's own text layer is damaged in one region and clean in
 * another, and the two must resolve differently.
 */

const f = <T>(value: T | null, confidence: Confidence = 'high'): Field<T> => ({ value, confidence });

export function blueGraceParse(): ParsedRateConfirmation {
  return {
    broker: {
      company_name: f('BlueGrace Logistics'),
      mc_number: f('612310'),
      contact_name: f('Calavo Desk'),
      contact_phone: f('(800) 697-4477'),
      contact_email: f('CALAVO@BLUEGRACEGROUP.COM'),
      address_line1: f('2846 S Falkenburg Rd'),
      address_line2: f(null),
      city: f('Riverview'),
      state: f('FL'),
      zip: f('33578'),
      address_source: 'bill_to',
    },
    load: {
      broker_load_number: f(BG_LOAD_NUMBER),
      bol_number: f(BG_LOAD_NUMBER),
      po_number: f('001000562117'),
      equipment_type: f('reefer'),
      handling_type: f('live_load_unload'),
      commodity: f('Avocados'),
      weight_lbs: f(42000),
      loaded_miles: f(2180),
      is_hazmat: f(false),
      is_team_load: f(false),
      mode: f('TL'),
    },
    reefer: {
      temp_f: f(34),
      temp_min_f: f(null),
      temp_max_f: f(null),
      precool_required: f(true),
      continuous_run: f(true),
      notes: f(null),
    },
    rate: {
      linehaul: f(3200),
      fsc_amount: f(400),
      total: f(3600),
      line_items: [
        { description: 'Linehaul', amount: 3200, category: 'linehaul', stop_hint: null, confidence: 'high' },
        { description: 'Fuel surcharge', amount: 400, category: 'fsc', stop_hint: null, confidence: 'high' },
      ],
    },
    stops: [
      {
        sequence: 1,
        stop_type: 'pickup',
        facility_name: f('CALAVO GROWERS'),
        address_line1: f('1141 Cummings Rd'),
        address_line2: f(null),
        city: f('Santa Paula'),
        state: f('CA'),
        zip: f('93060'),
        contact_name: f(null),
        contact_phone: f(null),
        appointment_start: f('2025-06-18T08:00'),
        appointment_end: f('2025-06-18T12:00'),
        notes: f('Pickup number IX00286060'),
        notes_verbatim: f('Comments: PU# IX00286060'),
        references: [{ label: 'PU#', value: 'IX00286060', confidence: 'high' }],
      },
      {
        sequence: 2,
        stop_type: 'delivery',
        facility_name: f('KROGER DISTRIBUTION CENTER'),
        address_line1: f('2400 Vine St'),
        address_line2: f(null),
        city: f('Cincinnati'),
        state: f('OH'),
        zip: f('45214'),
        contact_name: f(null),
        contact_phone: f(null),
        appointment_start: f('2025-06-20T06:00'),
        appointment_end: f('2025-06-20T10:00'),
        notes: f('Delivery number 001000562117'),
        notes_verbatim: f('Comments: DEL# 001000562117'),
        references: [{ label: 'DEL#', value: '001000562117', confidence: 'high' }],
      },
    ],
    special_instructions: f('Reefer at 34F, precool before check-in, washout on site, $30 paid by driver.'),
    verbatim: {
      // A faithful transcription of a DAMAGED region: the model resolved the
      // layer's `¶` back to `53' 102"`, which is why the page must not be
      // adopted here even though the model's text is the better record.
      special_instructions: f(BG_SPECIAL_INSTRUCTIONS_VERBATIM),
      // A clean region. The page is the better source and should be adopted.
      broker_terms: f(BG_BROKER_TERMS_LAYER),
    },
    references: [
      { label: 'BOL', value: BG_LOAD_NUMBER, confidence: 'high' },
      { label: 'Mode', value: 'TL', confidence: 'high' },
      { label: 'Pickup Number', value: '562117', confidence: 'high' },
      { label: 'Pickup Number', value: 'IX00286060', confidence: 'high' },
      { label: 'PO Number', value: '001000562117', confidence: 'high' },
    ],
    loadout_signals: {
      no_bol_mentioned: false,
      photo_pod_required: false,
      multi_day_use_period: false,
      trailer_relocation_language: false,
      no_commodity: false,
      trailer_number: f(null),
      trailer_owner_company: f(null),
      relocation_fee: f(null),
      use_period_days: f(null),
    },
    parser_build: { contract: 5, built_at: '2026-08-24T00:00:00Z', notes: 'fixture', code_hash: '4f39d6ae' },
    run: { model: 'fixture', temperature: 0, seed: 7, seed_echoed: true, system_fingerprint: 'fixture' },
  };
}

/**
 * The REVISED tender.
 *
 * Three changes, one of each kind the revision path has to handle:
 *   - the linehaul moves 3200 → 3450 (financial, needs a reason)
 *   - stop 2's appointment moves a day later (non-financial)
 *   - `Pickup Number 562117` is gone and a `PRO` row appears, whose value
 *     equals the BOL — the row that deduping on value alone used to swallow.
 */
export function blueGraceRevisedParse(): ParsedRateConfirmation {
  const p = blueGraceParse();
  p.rate.linehaul = f(3450);
  p.rate.total = f(3850);
  p.rate.line_items = [
    { description: 'Linehaul', amount: 3450, category: 'linehaul', stop_hint: null, confidence: 'high' },
    { description: 'Fuel surcharge', amount: 400, category: 'fsc', stop_hint: null, confidence: 'high' },
  ];
  p.stops[1].appointment_start = f('2025-06-21T06:00');
  p.stops[1].appointment_end = f('2025-06-21T10:00');
  p.references = [
    { label: 'BOL', value: BG_LOAD_NUMBER, confidence: 'high' },
    { label: 'Mode', value: 'TL', confidence: 'high' },
    { label: 'Pickup Number', value: 'IX00286060', confidence: 'high' },
    { label: 'PO Number', value: '001000562117', confidence: 'high' },
    { label: 'PRO', value: BG_LOAD_NUMBER, confidence: 'high' },
  ];
  return p;
}
