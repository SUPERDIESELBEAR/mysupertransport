import { z } from 'zod';

const optionalText = z.string().trim().max(500).optional().or(z.literal(''));
const optionalNumber = z
  .string()
  .trim()
  .optional()
  .refine(v => !v || Number.isFinite(Number(v)), { message: 'Enter a number' });

export const stopSchema = z.object({
  /** Present only in edit mode — the row this stop reconciles back to. */
  id: z.string().optional().or(z.literal('')),
  /** Edit mode only: the driver has already checked in or out at this stop. */
  has_driver_data: z.boolean().optional(),
  facility_id: z.string().optional().or(z.literal('')),
  stop_type: z.enum(['pickup', 'delivery', 'drop_and_hook']),
  facility_name: optionalText,
  address_line1: optionalText,
  address_line2: optionalText,
  city: z.string().trim().min(1, 'City is required').max(120),
  state: z.string().trim().min(1, 'State is required').max(60),
  zip: optionalText,
  contact_name: optionalText,
  contact_phone: optionalText,
  appointment_start: z.string().optional().or(z.literal('')),
  appointment_end: z.string().optional().or(z.literal('')),
  reference_number: z.string().trim().max(60).optional().or(z.literal('')),
  reference_label: z.string().trim().max(60).optional().or(z.literal('')),
  stopoff_charge_amount: optionalNumber,
  stop_notes: z.string().trim().max(2000).optional().or(z.literal('')),
  /**
   * The stop's comment line exactly as printed on the rate confirmation.
   * `stop_notes` may be a condensed rendering; this is the system of record.
   */
  stop_notes_verbatim: z.string().trim().max(4000).optional().or(z.literal('')),
});

/**
 * A reference number printed on the document, kept as (class, label, value).
 * One value printed as BOL, PRO and load number is three rows, because a
 * broker's AP and tracing desks look each one up separately.
 */
export const referenceCitationSchema = z.object({
  /** Stop sequence (1-based) this reference is printed against. */
  stopSequence: z.number().int().positive(),
  /** The label as that stop printed it ("PU#"), which may differ from the row's. */
  printedLabel: z.string().trim().max(60),
});

export const referenceSchema = z.object({
  reference_class: z.string().trim().max(40),
  /** The load-level printed label ("Pickup Number"), or the class label. */
  label: z.string().trim().max(60),
  value: z.string().trim().max(120),
  /** Every stop that printed this reference, with its own printed label. */
  citations: z.array(referenceCitationSchema).optional(),
});


export const chargeSchema = z.object({
  /**
   * The row's identity. Empty on a charge the form has just invented; carried
   * back out on every existing charge so the save path can diff rather than
   * replace. Without it a save re-keys the row and orphans the detention
   * claim, proof document and settlement line item pointing at it.
   */
  id: z.string().optional().or(z.literal('')),
  charge_type: z.string().trim().max(60),
  description: z.string().trim().max(200),
  amount: optionalNumber,
  /** Provenance carried through an edit so re-saving does not relabel a parsed line. */
  source: z.string().trim().max(60).optional(),
  /**
   * Reimbursement fields. Carried through the form so a load edit — which
   * rewrites every charge row — does not erase what dispatch confirmed on
   * Load Detail. Empty until confirmed; never required to save a load.
   */
  funding_source: z.enum(['driver', 'company']).optional().or(z.literal('')),
  actual_cost: optionalNumber,
  proof_document_id: z.string().optional().or(z.literal('')),
});


export const loadFormSchema = z
  .object({
    load_type: z.enum(['standard', 'per_ton', 'loadout']),
    load_number: z.string().trim().min(1, 'Load number is required').max(60),
    broker_id: z.string().optional().or(z.literal('')),
    broker_reference_number: optionalText,
    bol_number: optionalText,
    po_number: optionalText,
    equipment_type: z.enum(['dry_van', 'reefer', 'flatbed', 'hopper_bottom'], {
      errorMap: () => ({ message: 'Equipment type is required' }),
    }),
    handling_type: z.enum(['live_load_unload', 'drop_and_hook']),
    commodity: optionalText,
    weight_lbs: optionalNumber,

    reefer_temp_f: optionalNumber,
    reefer_temp_min_f: optionalNumber,
    reefer_temp_max_f: optionalNumber,
    reefer_precool_required: z.boolean(),
    reefer_continuous_run: z.boolean(),
    reefer_notes: z.string().trim().max(2000).optional().or(z.literal('')),

    loadout_trailer_owner_company: optionalText,
    loadout_trailer_owner_contact: optionalText,
    loadout_trailer_number: optionalText,
    loadout_trailer_vin: optionalText,
    loadout_trailer_type: optionalText,
    loadout_relocation_fee: optionalNumber,
    loadout_use_period_days: optionalNumber,
    // Agreed trailer use window. Stated on the rate confirmation when the
    // broker prints it; otherwise inferred from the first and last stop
    // appointment dates. The inference is never presented as a broker
    // commitment, so its provenance travels with the load.
    loadout_use_start: optionalText,
    loadout_use_end: optionalText,
    loadout_use_window_source: z.enum(['document', 'derived']).or(z.literal('')),

    rate_type: z.enum(['flat', 'per_mile', 'per_ton', 'percentage_of_load']),
    linehaul_rate: optionalNumber,
    rate_per_mile: optionalNumber,
    rate_per_ton: optionalNumber,
    estimated_tons: optionalNumber,
    /**
     * What actually crossed the scale. Authoritative for a per-ton load's
     * money; the form carries it so an edit cannot overwrite the scale ticket
     * with the pre-load estimate.
     */
    confirmed_tons: optionalNumber,
    /**
     * Tri-state on purpose. NULL and true both mean "bundled into the linehaul
     * rate" (see the coalesce in recompute_load_total_value); NULL is simply a
     * row that never stated it. Coercing NULL to a boolean on save made every
     * edit of such a load diff as a financial change and demand a reason.
     */
    fsc_bundled_into_linehaul: z.boolean().nullable(),
    fsc_amount: optionalNumber,
    loaded_miles: optionalNumber,
    deadhead_miles: optionalNumber,

    /**
     * Detention terms as the rate confirmation states them. Every one is
     * optional and empty means NOT STATED — there is no default free time,
     * rate, cap or clock start, because defaulting would fabricate an
     * agreement the broker never made.
     */
    detention_free_time_minutes: optionalNumber,
    detention_rate_per_hour: optionalNumber,
    detention_daily_cap: optionalNumber,
    detention_clock_start: z
      .enum(['appointment', 'arrival', 'gate_checkin'])
      .or(z.literal('')),
    /** Tri-state: 'true' required, 'false' not required, '' not stated. */
    detention_notification_required: z.enum(['true', 'false']).or(z.literal('')),
    detention_terms_note: z.string().trim().max(2000).optional().or(z.literal('')),

    stops: z.array(stopSchema).min(2, 'A load needs at least two stops'),
    /** Charges that belong to the load but not to any one stop. */
    charges: z.array(chargeSchema),

    internal_notes: z.string().trim().max(4000).optional().or(z.literal('')),
    driver_facing_notes: z.string().trim().max(4000).optional().or(z.literal('')),
    special_instructions: z.string().trim().max(4000).optional().or(z.literal('')),
    /** Broker-authored text as printed. Never a rewrite; display condenses at render time. */
    special_instructions_verbatim: z.string().trim().max(8000).optional().or(z.literal('')),
    broker_terms_verbatim: z.string().trim().max(8000).optional().or(z.literal('')),
    /** Categorical attribute ("TL"). Recognised as a reference label, stored as a load field. */
    mode: z.string().trim().max(40).optional().or(z.literal('')),
    references: z.array(referenceSchema),
    is_team_load: z.boolean(),
    co_driver_name: optionalText,
    is_hazmat: z.boolean(),
    permit_required: z.boolean(),
    permit_cost: optionalNumber,
    permit_recovery_method: z.string().optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    const need = (path: keyof typeof v, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (v.equipment_type === 'reefer' && !v.reefer_temp_f) {
      need('reefer_temp_f', 'Reefer temperature is required');
    }

    if (v.load_type === 'loadout') {
      if (!v.loadout_relocation_fee) need('loadout_relocation_fee', 'Relocation pay is required');
      return;
    }

    if (v.rate_type === 'flat' || v.rate_type === 'percentage_of_load') {
      if (!v.linehaul_rate) need('linehaul_rate', 'Linehaul rate is required');
    }
    if (v.rate_type === 'per_mile' && !v.rate_per_mile) {
      need('rate_per_mile', 'Rate per mile is required');
    }
    if (v.rate_type === 'per_ton' && !v.rate_per_ton) {
      need('rate_per_ton', 'Rate per ton is required');
    }
  });

export type ReferenceFormValues = z.infer<typeof referenceSchema>;
export type LoadFormValues = z.infer<typeof loadFormSchema>;
export type StopFormValues = z.infer<typeof stopSchema>;
export type ChargeFormValues = z.infer<typeof chargeSchema>;

export const emptyStop = (stop_type: StopFormValues['stop_type']): StopFormValues => ({
  id: '',
  has_driver_data: false,
  facility_id: '',
  stop_type,

  facility_name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  contact_name: '',
  contact_phone: '',
  appointment_start: '',
  appointment_end: '',
  reference_number: '',
  reference_label: '',
  stopoff_charge_amount: '',
  stop_notes: '',
  stop_notes_verbatim: '',
});

export const loadFormDefaults = (): LoadFormValues => ({
  load_type: 'standard',
  load_number: '',
  broker_id: '',
  broker_reference_number: '',
  bol_number: '',
  po_number: '',
  equipment_type: 'dry_van',
  handling_type: 'live_load_unload',
  commodity: '',
  weight_lbs: '',
  reefer_temp_f: '',
  reefer_temp_min_f: '',
  reefer_temp_max_f: '',
  reefer_precool_required: false,
  reefer_continuous_run: false,
  reefer_notes: '',
  loadout_trailer_owner_company: '',
  loadout_trailer_owner_contact: '',
  loadout_trailer_number: '',
  loadout_trailer_vin: '',
  loadout_trailer_type: '',
  loadout_relocation_fee: '',
  loadout_use_period_days: '',
  loadout_use_start: '',
  loadout_use_end: '',
  loadout_use_window_source: '' as const,
  rate_type: 'flat',
  linehaul_rate: '',
  rate_per_mile: '',
  rate_per_ton: '',
  estimated_tons: '',
  confirmed_tons: '',
  fsc_bundled_into_linehaul: true,
  fsc_amount: '',
  loaded_miles: '',
  deadhead_miles: '',
  detention_free_time_minutes: '',
  detention_rate_per_hour: '',
  detention_daily_cap: '',
  detention_clock_start: '' as const,
  detention_notification_required: '' as const,
  detention_terms_note: '',
  stops: [emptyStop('pickup'), emptyStop('delivery')],
  charges: [],
  internal_notes: '',
  driver_facing_notes: '',
  special_instructions: '',
  special_instructions_verbatim: '',
  broker_terms_verbatim: '',
  mode: '',
  references: [],
  is_team_load: false,
  co_driver_name: '',
  is_hazmat: false,
  permit_required: false,
  permit_cost: '',
  permit_recovery_method: '',
});
