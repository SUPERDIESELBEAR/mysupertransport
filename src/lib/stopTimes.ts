import { supabase } from '@/integrations/supabase/client';

/**
 * Stop arrival / departure capture.
 *
 * The client writes ONLY the two timestamps. `arrival_source`,
 * `departure_source` and the two `*_recorded_by` columns are written by the
 * database trigger from the writer's role, so provenance cannot be overstated
 * by whoever is holding the keyboard. Nothing here writes latitude or
 * longitude: a dispatcher typing a time has no location, and an absent
 * coordinate is honest.
 */

export type StopTimeSource = 'driver_app' | 'dispatcher_entry';

export interface StopTimeProvenance {
  arrival_source?: StopTimeSource | null;
  departure_source?: StopTimeSource | null;
  arrival_recorded_by?: string | null;
  departure_recorded_by?: string | null;
}

export const DEPARTURE_BEFORE_ARRIVAL_MESSAGE =
  'Departure cannot be earlier than arrival on the same stop.';

/**
 * Returns an error message, or null when the pair is acceptable.
 * The pair is never silently swapped — a reversed pair is a data-entry mistake
 * and the person entering it is the only one who knows which one is wrong.
 */
export function validateStopTimes(
  arrival: string | null,
  departure: string | null,
): string | null {
  if (!arrival || !departure) return null;
  const a = new Date(arrival).getTime();
  const d = new Date(departure).getTime();
  if (Number.isNaN(a) || Number.isNaN(d)) return 'Enter a valid date and time.';
  if (d < a) return DEPARTURE_BEFORE_ARRIVAL_MESSAGE;
  return null;
}

/** `2026-08-27T13:04:00Z` -> `2026-08-27T08:04` in the viewer's local zone. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `2026-08-27T08:04` (local) -> ISO instant, or null when empty. */
export function fromLocalInputValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function saveStopTimes(
  stopId: string,
  times: { actual_arrival_at: string | null; actual_departure_at: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('load_stops')
    .update(times)
    .eq('id', stopId);
  if (error) throw error;
}
