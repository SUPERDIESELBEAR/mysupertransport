import type { LoadFormValues } from '@/pages/dispatch/loadFormSchema';
import { calcTotalLoadValue } from '@/lib/loadRateMath';
import { naiveToIso } from '@/lib/carrierTimezone';

/**
 * The exact payload shape `create_load_with_stops` / `update_load_with_stops` expect.
 *
 * Extracted verbatim out of the load form so the form and the revised-rate-confirmation
 * apply path emit byte-identical payloads. Nothing here is UI-aware.
 */
export interface LoadSavePayload {
  load: Record<string, unknown>;
  stops: Record<string, unknown>[];
  charges: Record<string, unknown>[];
  /**
   * Reference rows. The RPCs do not take these — `load_references` is written
   * separately by `saveLoadReferences` once stop ids exist, because a citation
   * points at a stop row.
   */
  references: LoadFormValues['references'];
}

/**
 * Appointment strings come off the form (and the parser) as naive wall-clock
 * text. They are resolved against the carrier timezone, never the browser's.
 */
const toIso = (v?: string) => (v ? naiveToIso(v) : '');

export function buildLoadSavePayload(
  v: LoadFormValues, opts: { isEdit: boolean },
): LoadSavePayload {
  const isLoadout = v.load_type === 'loadout';
  const isReefer = v.equipment_type === 'reefer';

  const totalValue = calcTotalLoadValue({
    loadType: v.load_type,
    rateType: v.rate_type,
    linehaulRate: v.linehaul_rate,
    ratePerMile: v.rate_per_mile,
    ratePerTon: v.rate_per_ton,
    estimatedTons: v.estimated_tons,
    loadedMiles: v.loaded_miles,
    fscBundled: v.fsc_bundled_into_linehaul,
    fscAmount: v.fsc_amount,
    relocationFee: v.loadout_relocation_fee,
    stopoffCharges: (v.stops ?? []).map(s => s?.stopoff_charge_amount),
    additionalCharges: (v.charges ?? []).map(c => c?.amount),
  });

  const load: Record<string, unknown> = {
    load_number: v.load_number,
    load_type: v.load_type,
    broker_id: v.broker_id || '',
    broker_reference_number: v.broker_reference_number ?? '',
    equipment_type: v.equipment_type,
    handling_type: v.handling_type,
    commodity: v.commodity ?? '',
    weight_lbs: isLoadout ? '' : (v.weight_lbs ?? ''),
    bol_number: v.bol_number ?? '',
    po_number: v.po_number ?? '',
    rate_type: isLoadout ? 'flat' : v.rate_type,
    linehaul_rate: isLoadout ? '' : (v.linehaul_rate ?? ''),
    rate_per_mile: isLoadout ? '' : (v.rate_per_mile ?? ''),
    rate_per_ton: isLoadout ? '' : (v.rate_per_ton ?? ''),
    estimated_tons: isLoadout ? '' : (v.estimated_tons ?? ''),
    fsc_bundled_into_linehaul: v.fsc_bundled_into_linehaul,
    fsc_amount: v.fsc_bundled_into_linehaul ? '' : (v.fsc_amount ?? ''),
    loaded_miles: v.loaded_miles ?? '',
    deadhead_miles: v.deadhead_miles ?? '',
    total_load_value: totalValue ? String(totalValue) : '',
    reefer_temp_f: isReefer ? (v.reefer_temp_f ?? '') : '',
    reefer_temp_min_f: isReefer ? (v.reefer_temp_min_f ?? '') : '',
    reefer_temp_max_f: isReefer ? (v.reefer_temp_max_f ?? '') : '',
    reefer_precool_required: isReefer ? v.reefer_precool_required : false,
    reefer_continuous_run: isReefer ? v.reefer_continuous_run : false,
    reefer_notes: isReefer ? (v.reefer_notes ?? '') : '',
    loadout_trailer_owner_company: isLoadout ? (v.loadout_trailer_owner_company ?? '') : '',
    loadout_trailer_owner_contact: isLoadout ? (v.loadout_trailer_owner_contact ?? '') : '',
    loadout_trailer_number: isLoadout ? (v.loadout_trailer_number ?? '') : '',
    loadout_trailer_vin: isLoadout ? (v.loadout_trailer_vin ?? '') : '',
    loadout_trailer_type: isLoadout ? (v.loadout_trailer_type ?? '') : '',
    loadout_relocation_fee: isLoadout ? (v.loadout_relocation_fee ?? '') : '',
    loadout_use_period_days: isLoadout ? (v.loadout_use_period_days ?? '') : '',
    loadout_use_start: isLoadout ? (v.loadout_use_start ?? '') : '',
    loadout_use_end: isLoadout ? (v.loadout_use_end ?? '') : '',
    loadout_use_window_source: isLoadout ? (v.loadout_use_window_source ?? '') : '',
    // Detention terms travel as strings; '' is NOT STATED and the RPC's
    // NULLIF turns it back into NULL. Never coerce the tri-state to false.
    detention_free_time_minutes: v.detention_free_time_minutes ?? '',
    detention_rate_per_hour: v.detention_rate_per_hour ?? '',
    detention_daily_cap: v.detention_daily_cap ?? '',
    detention_clock_start: v.detention_clock_start ?? '',
    detention_notification_required: v.detention_notification_required ?? '',
    detention_terms_note: v.detention_terms_note ?? '',
    internal_notes: v.internal_notes ?? '',
    driver_facing_notes: v.driver_facing_notes ?? '',
    special_instructions: v.special_instructions ?? '',
    special_instructions_verbatim: v.special_instructions_verbatim ?? '',
    broker_terms_verbatim: v.broker_terms_verbatim ?? '',
    mode: v.mode ?? '',
    is_team_load: v.is_team_load,
    co_driver_name: v.is_team_load ? (v.co_driver_name ?? '') : '',
    is_hazmat: v.is_hazmat,
    permit_required: v.permit_required,
    permit_cost: v.permit_required ? (v.permit_cost ?? '') : '',
    permit_recovery_method: v.permit_required ? (v.permit_recovery_method ?? '') : '',
  };

  const stops = v.stops.map(s => ({
    id: s.id ?? '',
    stop_type: s.stop_type,
    facility_id: s.facility_id ?? '',
    facility_name: s.facility_name ?? '',
    address_line1: s.address_line1 ?? '',
    address_line2: s.address_line2 ?? '',
    city: s.city,
    state: s.state,
    zip: s.zip ?? '',
    contact_name: s.contact_name ?? '',
    contact_phone: s.contact_phone ?? '',
    appointment_start: toIso(s.appointment_start),
    appointment_end: toIso(s.appointment_end),
    reference_number: s.reference_number ?? '',
    reference_label: s.reference_label ?? '',
    stopoff_charge_amount: s.stopoff_charge_amount ?? '',
    stop_notes: s.stop_notes ?? '',
    stop_notes_verbatim: s.stop_notes_verbatim ?? '',
  }));

  // load_charges is the authoritative record of every charge on the load.
  // A stop-attached charge also mirrors into load_stops.stopoff_charge_amount
  // for display; the total counts it once, from this list only.
  const charges = [
    ...v.stops
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i > 0 && i < v.stops.length - 1 && Number(s.stopoff_charge_amount) > 0)
      .map(({ s, i }) => ({
        stop_index: String(i),
        charge_type: 'stopoff',
        description: 'Stop-off charge',
        amount: String(s.stopoff_charge_amount),
        source: 'manual',
      })),
    ...(v.charges ?? [])
      .filter(c => Number(c.amount) > 0)
      .map(c => ({
        // The row's identity. Present means "this is the same charge" and the
        // RPC updates it in place; empty means insert. Never omit it — the
        // RPC deletes charges absent from the payload and re-keys the rest.
        id: c.id || '',
        stop_index: '',
        charge_type: c.charge_type || 'other',
        description: c.description || '',
        amount: String(c.amount),
        source: c.source || (opts.isEdit ? 'manual' : 'parsed_rate_confirmation'),
        // Reimbursement confirmations survive a load edit only because they
        // travel back out with the charge they belong to.
        funding_source: c.funding_source || '',
        actual_cost: c.actual_cost ? String(c.actual_cost) : '',
        proof_document_id: c.proof_document_id || '',
      })),
  ];

  return { load, stops, charges, references: v.references ?? [] };
}
