import { supabase } from '@/integrations/supabase/client';
import { carrierZoneAbbrev, isoToNaive, naiveToIso, CARRIER_TIMEZONE } from '@/lib/carrierTimezone';

/**
 * Driver check-in at a facility.
 *
 * THE TAP IS LATE, ALWAYS. He is navigating in, reading signage, talking to a
 * guard shack, hunting a dock. He taps once he is stopped, which is routinely
 * ten to twenty minutes after he actually arrived, and never early. At
 * $50/hour in fifteen-minute increments that drift is money, and it always
 * falls in the carrier's disfavour. So the tap NEVER silently records "now":
 * it asks when it happened, defaults to now, and offers one-tap corrections.
 *
 * Arrival, departure and paperwork are three INDEPENDENT acts. Nothing here
 * requires an arrival before a departure, and nothing sequences them.
 *
 * Coordinates are BEST EFFORT. A denied permission, a cold fix, a dead GPS —
 * none of them may cost us a timestamp. The write goes through with nulls.
 */

export type StopTimeKind = 'arrival' | 'departure';

/** Minutes-ago offsets offered as one tap each. 0 is "just now". */
export const CHECK_IN_OFFSETS = [0, 15, 30, 45] as const;

/** An instant N minutes before `nowMs`, as an ISO string. */
export function minutesAgoIso(minutes: number, nowMs: number = Date.now()): string {
  return new Date(nowMs - Math.max(0, minutes) * 60_000).toISOString();
}

/** Stored instant -> carrier wall clock for a manual-entry field. */
export function toCarrierNaive(iso: string | null | undefined): string {
  return isoToNaive(iso);
}

/** Carrier wall clock -> stored instant. Null when empty or unparseable. */
export function fromCarrierNaive(naive: string): string | null {
  if (!naive.trim()) return null;
  try {
    return naiveToIso(naive.trim());
  } catch {
    return null;
  }
}

const displayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: CARRIER_TIMEZONE,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * "Aug 28, 3:42 PM CDT". Always carries the zone abbreviation — a recorded
 * time without one is a time somebody will read in the wrong zone.
 */
export function formatCheckInTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${displayFmt.format(d)} ${carrierZoneAbbrev(d)}`.trim();
}

export interface CheckInCoords {
  latitude: number | null;
  longitude: number | null;
}

export const NO_COORDS: CheckInCoords = { latitude: null, longitude: null };

/**
 * A location fix if the device offers one quickly, nulls otherwise. NEVER
 * rejects: the caller must not be able to lose a timestamp to a location fix.
 */
export function bestEffortCoords(timeoutMs = 6000): Promise<CheckInCoords> {
  return new Promise(resolve => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo?.getCurrentPosition) { resolve(NO_COORDS); return; }
    let settled = false;
    const done = (c: CheckInCoords) => { if (!settled) { settled = true; resolve(c); } };
    const timer = setTimeout(() => done(NO_COORDS), timeoutMs);
    try {
      geo.getCurrentPosition(
        pos => { clearTimeout(timer); done({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
        () => { clearTimeout(timer); done(NO_COORDS); },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
      );
    } catch {
      clearTimeout(timer);
      done(NO_COORDS);
    }
  });
}

/**
 * Writes one timestamp on one stop.
 *
 * Only the timestamp and — when a fix exists — the coordinates are sent.
 * `arrival_source` / `departure_source` and the `*_recorded_by` actor are
 * stamped by stamp_load_stop_time_source from the writer's role, so a driver
 * cannot claim a dispatcher's provenance or vice versa. Nulls are never
 * written to the coordinate columns; an absent fix leaves whatever is there.
 */
export async function recordStopTime(
  stopId: string,
  kind: StopTimeKind,
  atIso: string,
  coords: CheckInCoords = NO_COORDS,
): Promise<void> {
  const patch: Record<string, string | number> =
    kind === 'arrival' ? { actual_arrival_at: atIso } : { actual_departure_at: atIso };
  if (coords.latitude !== null && coords.longitude !== null) {
    patch[`${kind}_latitude`] = coords.latitude;
    patch[`${kind}_longitude`] = coords.longitude;
  }
  const { error } = await supabase.from('load_stops').update(patch as never).eq('id', stopId);
  if (error) throw error;
}
