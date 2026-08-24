import type { Confidence, Field, ParsedRateConfirmation } from '@/lib/rateConfirmation';
import {
  BG_BROKER_TERMS_LAYER,
  BG_SPECIAL_INSTRUCTIONS_VERBATIM,
} from '@/test/fixtures/blueGraceRateCon';
import { BG_LOAD_NUMBER } from '@/test/fixtures/blueGracePage';

/**
 * What the parse edge function returns for the Blue Grace tender BG969676425.
 *
 * THESE VALUES ARE THE STORED PARSE OF THE REAL DOCUMENT — load ST26035, read
 * back out of `loads`, `load_stops`, `load_references` and the load's
 * `verbatim_verification` record. MIXED PRODUCTS, 1224 / 176 / 1400, Laredo TX
 * to Garland TX, reefer at 38F, is what this tender actually says.
 *
 * DO NOT HAND-EDIT A VALUE HERE TO MAKE A TEST PASS. If an assertion disagrees
 * with this fixture, either the code changed behaviour or the fixture has
 * drifted from the document; re-derive it from the stored parse, do not tune it.
 *
 * An earlier version of this file invented most of these fields (Avocados,
 * 3200/400/3600, Santa Paula to Cincinnati, 34F, a `DEL#` stop label the
 * document never prints). Path coverage was unaffected — the edge function is
 * stubbed either way — but the citation assertion was passing against a label
 * that does not occur in this document.
 *
 * THIS IS THE ONE STUB IN THE END-TO-END TEST. The edge function calls a model
 * over the network and cannot run under vitest, so its answer is fixed here and
 * everything downstream of it — verification, adoption, form population, the
 * save RPCs, references, diagnostics — runs for real.
 */

const f = <T>(value: T | null, confidence: Confidence = 'high'): Field<T> => ({ value, confidence });

export function blueGraceParse(): ParsedRateConfirmation {
  return {
    broker: {
      company_name: f('Blue Grace Logistics'),
      mc_number: f(null),
      contact_name: f('Sean Grogan'),
      contact_phone: f('8135913771'),
      contact_email: f('sgrogan@bluegracegroup.com'),
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
      commodity: f('MIXED PRODUCTS'),
      weight_lbs: f(43500),
      loaded_miles: f(440.09),
      is_hazmat: f(false),
      is_team_load: f(false),
      mode: f('TL'),
    },
    reefer: {
      temp_f: f(38),
      temp_min_f: f(38),
      temp_max_f: f(38),
      precool_required: f(true),
      continuous_run: f(true),
      notes: f(
        'REQUIRED 53\' 102" SWING DOOR REEFER TRAILER(MUST BE DOWNLOADABLE), CLEAN, ODOR FREE WITH PERFECT CHUTE CONDITION.',
      ),
    },
    rate: {
      linehaul: f(1224),
      fsc_amount: f(176),
      total: f(1400),
      line_items: [
        { description: 'Linehaul', amount: 1224, category: 'linehaul', stop_hint: null, confidence: 'high' },
        { description: 'Fuel surcharge', amount: 176, category: 'fsc', stop_hint: null, confidence: 'high' },
      ],
    },
    stops: [
      {
        sequence: 1,
        stop_type: 'pickup',
        facility_name: f('Calavo Librado Pina'),
        address_line1: f('8901 San Mateo Dr'),
        address_line2: f(null),
        city: f('Laredo'),
        state: f('TX'),
        zip: f('78045'),
        contact_name: f(null),
        contact_phone: f(null),
        appointment_start: f('2025-06-18T08:00'),
        appointment_end: f('2025-06-18T17:00'),
        notes: f('(See Warehouse Comments)'),
        notes_verbatim: f('Comments: PU# IX00286060'),
        references: [{ label: 'PU#', value: 'IX00286060', confidence: 'high' }],
      },
      {
        sequence: 2,
        stop_type: 'delivery',
        facility_name: f('Calavo Texas'),
        address_line1: f('2600 McCree Rd'),
        address_line2: f(null),
        city: f('Garland'),
        state: f('TX'),
        zip: f('75041'),
        contact_name: f(null),
        contact_phone: f(null),
        appointment_start: f('2025-06-20T06:00'),
        appointment_end: f('2025-06-20T09:00'),
        notes: f(null),
        // The document prints `PO#` on this stop, not `DEL#`.
        notes_verbatim: f('Comments: PO# 001000562117'),
        references: [{ label: 'PO#', value: '001000562117', confidence: 'high' }],
      },
    ],
    special_instructions: f(
      "Required 53' reefer swing door. Precool required. Washout mandatory at shipper. Driver pay $30 on site. Electronic tracking required. Report delays/OS&D in real time. Submit docs within 24hrs for reimbursement. No detention on produce.",
    ),
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
 *   - the linehaul moves 1224 → 1350 (financial, needs a reason)
 *   - stop 2's appointment moves a day later (non-financial)
 *   - `Pickup Number 562117` is gone and a `PRO` row appears, whose value
 *     equals the BOL — the row that deduping on value alone used to swallow.
 */
export function blueGraceRevisedParse(): ParsedRateConfirmation {
  const p = blueGraceParse();
  p.rate.linehaul = f(1350);
  p.rate.total = f(1526);
  p.rate.line_items = [
    { description: 'Linehaul', amount: 1350, category: 'linehaul', stop_hint: null, confidence: 'high' },
    { description: 'Fuel surcharge', amount: 176, category: 'fsc', stop_hint: null, confidence: 'high' },
  ];
  p.stops[1].appointment_start = f('2025-06-21T06:00');
  p.stops[1].appointment_end = f('2025-06-21T09:00');
  p.references = [
    { label: 'BOL', value: BG_LOAD_NUMBER, confidence: 'high' },
    { label: 'Mode', value: 'TL', confidence: 'high' },
    { label: 'Pickup Number', value: 'IX00286060', confidence: 'high' },
    { label: 'PO Number', value: '001000562117', confidence: 'high' },
    { label: 'PRO', value: BG_LOAD_NUMBER, confidence: 'high' },
  ];
  return p;
}
