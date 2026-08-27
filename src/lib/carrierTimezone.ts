/**
 * The carrier's operating timezone.
 *
 * All load appointment and actual times are entered, stored and displayed
 * against this zone, regardless of where the user's machine is set.
 * SUPERTRANSPORT's dispatchers work from Pakistan on Central-set machines;
 * this constant is what makes that a decision rather than an accident.
 *
 * When multi-tenancy activates this becomes a per-carrier setting. It is
 * deliberately NOT configurable yet — no unused override parameter, no
 * settings row — following the same reasoning recorded for the paperwork
 * requirement matrix: a knob nobody turns is a knob that rots.
 */
export const CARRIER_TIMEZONE = 'America/Chicago';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CARRIER_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock parts of an instant, as read in the carrier timezone. */
function carrierParts(date: Date) {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl can emit "24" for midnight in hour12:false mode on some engines.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Milliseconds the carrier zone is ahead of UTC at this instant (negative in the US). */
function carrierOffsetMs(date: Date): number {
  const p = carrierParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * "YYYY-MM-DDTHH:mm" (a wall-clock time in the carrier timezone) -> ISO instant.
 *
 * DST is handled by solving for the offset at the resulting instant rather than
 * assuming a fixed one: −5 in summer (CDT), −6 in winter (CST).
 *
 * Spring-forward gap (02:00–02:59 on the second Sunday in March, a wall-clock
 * time that does not exist): the offset solve settles on the pre-transition
 * offset, so 02:30 stores as 07:30Z — 01:30 CST, the instant one hour BEFORE
 * the nominal reading. It never throws, and the round-trip through isoToNaive
 * therefore returns 01:30, not 02:30, for that hour alone. No appointment is
 * ever legitimately written into a gap hour; this is documented so the
 * behaviour is chosen rather than discovered.
 * The fall-back repeated hour resolves to the first (daylight) occurrence.
 */
export function naiveToIso(naive: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive.trim());
  if (!m) {
    const fallback = new Date(naive);
    if (Number.isNaN(fallback.getTime())) throw new Error(`Invalid naive datetime: ${naive}`);
    return fallback.toISOString();
  }
  const [, y, mo, d, h, mi, s] = m;
  const utcGuess = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  // Two passes converge for every real zone transition.
  let instant = utcGuess - carrierOffsetMs(new Date(utcGuess));
  instant = utcGuess - carrierOffsetMs(new Date(instant));
  return new Date(instant).toISOString();
}

/** Stored instant -> "YYYY-MM-DDTHH:mm" as it reads in the carrier timezone. */
export function isoToNaive(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = carrierParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const zoneAbbrevFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CARRIER_TIMEZONE,
  timeZoneName: 'short',
});

/** "CST" or "CDT" for the date of the given instant. */
export function carrierZoneAbbrev(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const part = zoneAbbrevFormatter.formatToParts(d).find(p => p.type === 'timeZoneName');
  return part?.value ?? '';
}
