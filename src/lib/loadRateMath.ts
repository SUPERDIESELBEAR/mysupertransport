import type { Database } from '@/integrations/supabase/types';

export type RateType = Database['public']['Enums']['rate_type'];
export type LoadType = Database['public']['Enums']['load_type'];
export type HandlingType = Database['public']['Enums']['load_handling_type'];
export type StopType = Database['public']['Enums']['stop_type'];

export const RATE_TYPES: RateType[] = ['flat', 'per_mile', 'per_ton', 'percentage_of_load'];
export const LOAD_TYPES: LoadType[] = ['standard', 'per_ton', 'loadout'];
export const HANDLING_TYPES: HandlingType[] = ['live_load_unload', 'drop_and_hook'];
export const STOP_TYPES: StopType[] = ['pickup', 'delivery', 'drop_and_hook'];

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  flat: 'Flat',
  per_mile: 'Per Mile',
  per_ton: 'Per Ton',
  percentage_of_load: 'Percentage of Load',
};

export const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  standard: 'Standard',
  per_ton: 'Per-Ton Bulk',
  loadout: 'Trailer Relocation (Loadout)',
};

export const HANDLING_TYPE_LABELS: Record<HandlingType, string> = {
  live_load_unload: 'Live Load / Unload',
  drop_and_hook: 'Drop & Hook',
};

export const STOP_TYPE_LABELS: Record<StopType, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  drop_and_hook: 'Drop & Hook',
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export interface RateInput {
  loadType: LoadType;
  rateType: RateType;
  linehaulRate?: unknown;
  ratePerMile?: unknown;
  ratePerTon?: unknown;
  estimatedTons?: unknown;
  loadedMiles?: unknown;
  fscBundled?: boolean;
  fscAmount?: unknown;
  relocationFee?: unknown;
  /** Per-stop stop-off charges; summed into the total for non-loadout loads. */
  stopoffCharges?: unknown[];
  /**
   * Load-level charges that are not attached to a stop (for example an Extra Stop
   * fee on a two-stop load). Stop-attached charges arrive via `stopoffCharges`, so
   * the two lists never describe the same money.
   */
  additionalCharges?: unknown[];
}

/** Live "Total Load Value" for the create form. Loadout uses the relocation fee. */
export function calcTotalLoadValue(input: RateInput): number {
  if (input.loadType === 'loadout') return num(input.relocationFee);

  let base = 0;
  switch (input.rateType) {
    case 'per_mile':
      base = num(input.ratePerMile) * num(input.loadedMiles);
      break;
    case 'per_ton':
      base = num(input.ratePerTon) * num(input.estimatedTons);
      break;
    case 'flat':
    case 'percentage_of_load':
    default:
      base = num(input.linehaulRate);
      break;
  }

  const fsc = input.fscBundled === false ? num(input.fscAmount) : 0;
  const stopoff = (input.stopoffCharges ?? []).reduce<number>((sum, v) => sum + num(v), 0);
  const extra = (input.additionalCharges ?? []).reduce<number>((sum, v) => sum + num(v), 0);
  return Math.round((base + fsc + stopoff + extra) * 100) / 100;
}

