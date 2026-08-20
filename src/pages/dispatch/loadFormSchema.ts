import { z } from 'zod';

const optionalText = z.string().trim().max(500).optional().or(z.literal(''));
const optionalNumber = z
  .string()
  .trim()
  .optional()
  .refine(v => !v || Number.isFinite(Number(v)), { message: 'Enter a number' });

export const stopSchema = z.object({
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
});

export const chargeSchema = z.object({
  charge_type: z.string().trim().max(60),
  description: z.string().trim().max(200),
  amount: optionalNumber,
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

    rate_type: z.enum(['flat', 'per_mile', 'per_ton', 'percentage_of_load']),
    linehaul_rate: optionalNumber,
    rate_per_mile: optionalNumber,
    rate_per_ton: optionalNumber,
    estimated_tons: optionalNumber,
    fsc_bundled_into_linehaul: z.boolean(),
    fsc_amount: optionalNumber,
    loaded_miles: optionalNumber,
    deadhead_miles: optionalNumber,

    stops: z.array(stopSchema).min(2, 'A load needs at least two stops'),
    /** Charges that belong to the load but not to any one stop. */
    charges: z.array(chargeSchema),

    internal_notes: z.string().trim().max(4000).optional().or(z.literal('')),
    driver_facing_notes: z.string().trim().max(4000).optional().or(z.literal('')),
    special_instructions: z.string().trim().max(4000).optional().or(z.literal('')),
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
      if (!v.loadout_relocation_fee) need('loadout_relocation_fee', 'Relocation fee is required');
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

export type LoadFormValues = z.infer<typeof loadFormSchema>;
export type StopFormValues = z.infer<typeof stopSchema>;
export type ChargeFormValues = z.infer<typeof chargeSchema>;

export const emptyStop = (stop_type: StopFormValues['stop_type']): StopFormValues => ({
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
  rate_type: 'flat',
  linehaul_rate: '',
  rate_per_mile: '',
  rate_per_ton: '',
  estimated_tons: '',
  fsc_bundled_into_linehaul: true,
  fsc_amount: '',
  loaded_miles: '',
  deadhead_miles: '',
  stops: [emptyStop('pickup'), emptyStop('delivery')],
  charges: [],
  internal_notes: '',
  driver_facing_notes: '',
  special_instructions: '',
  is_team_load: false,
  co_driver_name: '',
  is_hazmat: false,
  permit_required: false,
  permit_cost: '',
  permit_recovery_method: '',
});
