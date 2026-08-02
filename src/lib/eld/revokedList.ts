/**
 * §7 Revoked-list verification — shared shapes and staleness bands.
 *
 * 49 CFR 395.8(a)(1) requires a self-certified device that is registered on
 * FMCSA's list. FMCSA publishes no stable API, so the check is a human reading
 * the published lists and recording an outcome. A scraper that broke silently
 * would produce false confidence, which is worse than no check at all.
 */

export type RevokedListResult = 'registered' | 'revoked' | 'not_found';

export interface DeviceModelRow {
  id: string;
  provider_name: string;
  device_make: string;
  device_model: string;
  fmcsa_registration_id: string | null;
  is_active: boolean;
  last_check_at: string | null;
  last_check_result: RevokedListResult | null;
  fmcsa_list_date: string | null;
  revocation_date: string | null;
  replacement_deadline: string | null;
}

export const DEVICE_MODEL_SELECT = `id, provider_name, device_make, device_model,
  fmcsa_registration_id, is_active, last_check_at, last_check_result,
  fmcsa_list_date, revocation_date, replacement_deadline`;

export const FMCSA_REGISTERED_LIST_URL = 'https://eld.fmcsa.dot.gov/List';
export const FMCSA_REVOKED_LIST_URL = 'https://eld.fmcsa.dot.gov/List/Revoked';

export const RESULT_LABEL: Record<RevokedListResult, string> = {
  registered: 'Registered',
  revoked: 'Revoked',
  not_found: 'Not found',
};

/** Whole days since the last check; null when the model has never been checked. */
export function daysSinceCheck(lastCheckAt: string | null, now = new Date()): number | null {
  if (!lastCheckAt) return null;
  return Math.floor((now.getTime() - new Date(lastCheckAt).getTime()) / 86_400_000);
}

export type AgeBand = 'gold' | 'amber' | 'red';

/**
 * Age colour: gold 0–90, amber 91–120, red over 120 or never checked. A
 * `revoked` result outranks the age entirely — a model verified as revoked
 * yesterday is the most urgent row on the panel, not the freshest.
 */
export function ageBand(row: Pick<DeviceModelRow, 'last_check_at' | 'last_check_result'>,
  now = new Date()): AgeBand {
  if (row.last_check_result === 'revoked') return 'red';
  const days = daysSinceCheck(row.last_check_at, now);
  if (days === null) return 'red';
  if (days <= 90) return 'gold';
  if (days <= 120) return 'amber';
  return 'red';
}

/** Days remaining until a replacement deadline; negative once it has passed. */
export function daysUntil(dateStr: string | null, now = new Date()): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T12:00:00`).getTime();
  const today = new Date(now.toISOString().slice(0, 10) + 'T12:00:00').getTime();
  return Math.round((target - today) / 86_400_000);
}

export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}