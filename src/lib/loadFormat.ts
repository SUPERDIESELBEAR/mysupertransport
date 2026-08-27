import type { Database } from '@/integrations/supabase/types';
import { CARRIER_TIMEZONE } from '@/lib/carrierTimezone';

export type LoadStatus = Database['public']['Enums']['load_status'];
export type EquipmentType = Database['public']['Enums']['equipment_type'];

export const LOAD_STATUSES: LoadStatus[] = [
  'available', 'covered', 'dispatched', 'in_transit', 'at_delivery',
  'delivered', 'pod_received', 'accessorials_approved', 'ready_to_invoice',
  'invoiced', 'factored', 'paid', 'settled', 'closed', 'tonu', 'cancelled',
];

export const EQUIPMENT_TYPES: EquipmentType[] = [
  'dry_van', 'reefer', 'flatbed', 'hopper_bottom',
];

const LABEL_OVERRIDES: Record<string, string> = {
  tonu: 'TONU',
  pod_received: 'POD Received',
  in_transit: 'In Transit',
};

/** Words that must render as acronyms rather than Title Case. */
const ACRONYMS = new Set([
  'ui', 'pod', 'bol', 'eld', 'dot', 'cdl', 'irp', 'mc', 'tonu', 'po', 'ica', 'osas', 'ifta', 'usdot',
]);

/** Turns a snake_case enum value into a human label ("dry_van" → "Dry Van"). */
export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return '—';
  if (LABEL_OVERRIDES[value]) return LABEL_OVERRIDES[value];
  return value
    .split('_')
    .filter(Boolean)
    .map(word =>
      ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

/** Formats a load rate as USD, or an em dash when there is nothing to show. */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return currency.format(Number(value));
}

/** Short date for list views, e.g. "Aug 19, 2026". */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: CARRIER_TIMEZONE });
}