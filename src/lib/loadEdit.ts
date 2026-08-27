import type { LoadEditData } from '@/lib/loadDetail';
import {
import { isoToNaive } from '@/lib/carrierTimezone';
  emptyStop, loadFormDefaults, type LoadFormValues, type StopFormValues,
} from '@/pages/dispatch/loadFormSchema';

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * ISO timestamp → the `YYYY-MM-DDTHH:mm` shape a datetime-local input wants,
 * read in the CARRIER timezone so an edit round-trips on any machine.
 */
export function toLocalInput(value: string | null | undefined): string {
  return isoToNaive(value);
}

/** Hydrates the shared load form from an existing load, its stops and its charges. */
export function loadToFormValues(data: LoadEditData): LoadFormValues {
  const l = data.load as unknown as Record<string, unknown>;
  const base = loadFormDefaults();

  const stops: StopFormValues[] = data.stops.map(s => {
    const row = s as unknown as Record<string, unknown>;
    return {
      ...emptyStop((row.stop_type as StopFormValues['stop_type']) ?? 'pickup'),
      id: text(row.id),
      has_driver_data: !!(row.actual_arrival_at || row.actual_departure_at
        || row.arrival_latitude || row.departure_latitude),
      facility_id: text(row.facility_id),
      facility_name: text(row.facility_name),
      address_line1: text(row.address_line1),
      address_line2: text(row.address_line2),
      city: text(row.city),
      state: text(row.state),
      zip: text(row.zip),
      contact_name: text(row.contact_name),
      contact_phone: text(row.contact_phone),
      appointment_start: toLocalInput(row.appointment_start as string | null),
      appointment_end: toLocalInput(row.appointment_end as string | null),
      reference_number: text(row.reference_number),
      reference_label: text(row.reference_label),
      stopoff_charge_amount: text(row.stopoff_charge_amount),
      stop_notes: text(row.stop_notes),
      stop_notes_verbatim: text(row.stop_notes_verbatim),
    };
  });

  return {
    ...base,
    load_type: (l.load_type as LoadFormValues['load_type']) ?? 'standard',
    load_number: text(l.load_number),
    broker_id: text(l.broker_id),
    broker_reference_number: text(l.broker_reference_number),
    bol_number: text(l.bol_number),
    po_number: text(l.po_number),
    equipment_type: (l.equipment_type as LoadFormValues['equipment_type']) ?? 'dry_van',
    handling_type: (l.handling_type as LoadFormValues['handling_type']) ?? 'live_load_unload',
    commodity: text(l.commodity),
    weight_lbs: text(l.weight_lbs),
    reefer_temp_f: text(l.reefer_temp_f),
    reefer_temp_min_f: text(l.reefer_temp_min_f),
    reefer_temp_max_f: text(l.reefer_temp_max_f),
    reefer_precool_required: !!l.reefer_precool_required,
    reefer_continuous_run: !!l.reefer_continuous_run,
    reefer_notes: text(l.reefer_notes),
    loadout_trailer_owner_company: text(l.loadout_trailer_owner_company),
    loadout_trailer_owner_contact: text(l.loadout_trailer_owner_contact),
    loadout_trailer_number: text(l.loadout_trailer_number),
    loadout_trailer_vin: text(l.loadout_trailer_vin),
    loadout_trailer_type: text(l.loadout_trailer_type),
    loadout_relocation_fee: text(l.loadout_relocation_fee),
    loadout_use_period_days: text(l.loadout_use_period_days),
    loadout_use_start: text(l.loadout_use_start),
    loadout_use_end: text(l.loadout_use_end),
    loadout_use_window_source: (text(l.loadout_use_window_source) as 'document' | 'derived' | ''),
    rate_type: (l.rate_type as LoadFormValues['rate_type']) ?? 'flat',
    linehaul_rate: text(l.linehaul_rate),
    rate_per_mile: text(l.rate_per_mile),
    rate_per_ton: text(l.rate_per_ton),
    estimated_tons: text(l.estimated_tons),
    fsc_bundled_into_linehaul: l.fsc_bundled_into_linehaul !== false,
    fsc_amount: text(l.fsc_amount),
    loaded_miles: text(l.loaded_miles),
    deadhead_miles: text(l.deadhead_miles),
    stops: stops.length >= 2 ? stops : base.stops,
    // Stop-attached charges live on their stop card; only load-level charges list here.
    charges: data.charges
      .filter(c => !c.load_stop_id)
      .map(c => ({
        charge_type: text(c.charge_type) || 'other',
        description: text(c.description),
        amount: text(c.amount),
        source: text(c.source) || 'manual',
        funding_source: (text((c as unknown as Record<string, unknown>).funding_source)
          || '') as '' | 'driver' | 'company',
        actual_cost: text((c as unknown as Record<string, unknown>).actual_cost),
        proof_document_id: text((c as unknown as Record<string, unknown>).proof_document_id),
      })),
    internal_notes: text(l.internal_notes),
    driver_facing_notes: text(l.driver_facing_notes),
    special_instructions: text(l.special_instructions),
    special_instructions_verbatim: text(l.special_instructions_verbatim),
    broker_terms_verbatim: text(l.broker_terms_verbatim),
    mode: text(l.mode),
    // Stored reference rows are the baseline a revised document is diffed
    // against. Hydrating them as `[]` made every number on the document read as
    // an addition, and the save path then wrote nothing back, so the baseline
    // never appeared.
    references: (data.references ?? []).map(r => ({
      reference_class: r.reference_class,
      label: r.label,
      value: r.value,
      citations: r.citations,
    })),

    is_team_load: !!l.is_team_load,
    co_driver_name: text(l.co_driver_name),
    is_hazmat: !!l.is_hazmat,
    permit_required: !!l.permit_required,
    permit_cost: text(l.permit_cost),
    permit_recovery_method: text(l.permit_recovery_method),
  };
}

/** Load-level fields whose change alters what the broker is billed. */
export const FINANCIAL_FIELDS: (keyof LoadFormValues)[] = [
  'rate_type', 'linehaul_rate', 'rate_per_mile', 'rate_per_ton', 'estimated_tons',
  'fsc_bundled_into_linehaul', 'fsc_amount', 'loaded_miles', 'loadout_relocation_fee',
  'permit_cost', 'permit_recovery_method',
];

const numEq = (a: unknown, b: unknown) => (Number(a) || 0) === (Number(b) || 0);

/** Mirrors the server rule that decides whether a reason is required. */
export function financialChanges(before: LoadFormValues, after: LoadFormValues): string[] {
  const changed: string[] = [];

  FINANCIAL_FIELDS.forEach(key => {
    const a = before[key];
    const b = after[key];
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      if (!!a !== !!b) changed.push(key);
      return;
    }
    const numeric = key !== 'rate_type' && key !== 'permit_recovery_method';
    if (numeric ? !numEq(a, b) : text(a) !== text(b)) changed.push(key);
  });

  const stopoffSum = (v: LoadFormValues) =>
    (v.stops ?? []).reduce((sum, s) => sum + (Number(s?.stopoff_charge_amount) || 0), 0);
  if (!numEq(stopoffSum(before), stopoffSum(after))) changed.push('stop-off charges');

  const chargeSum = (v: LoadFormValues) =>
    (v.charges ?? []).reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
  if (!numEq(chargeSum(before), chargeSum(after))) changed.push('additional charges');

  return changed;
}

/** Stops present before the edit that the user has removed, with their driver data flag. */
export function removedStops(
  before: LoadFormValues, after: LoadFormValues,
): { id: string; hasDriverData: boolean }[] {
  const keptIds = new Set((after.stops ?? []).map(s => s?.id).filter(Boolean) as string[]);
  return (before.stops ?? [])
    .filter(s => s.id && !keptIds.has(s.id))
    .map(s => ({ id: s.id as string, hasDriverData: !!s.has_driver_data }));
}
