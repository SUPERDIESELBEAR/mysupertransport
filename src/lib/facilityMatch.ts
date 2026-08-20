import type { Facility } from '@/lib/facilities';
import { nameScore } from '@/lib/rateConfirmation';

/**
 * Facility matching for parsed rate confirmations.
 *
 * Address-first, name only as a tiebreak: broker documents truncate and mangle
 * facility names ("J M Exotic Foods (a Midas Foods Comp"), but the street address
 * and ZIP they print are reliable. ZIP is an exact-match component on purpose —
 * the same street name in a different town must never match.
 */

/** Street types and directionals folded to one spelling so "St" == "Street". */
const CANON: Record<string, string> = {
  street: 'st', str: 'st',
  road: 'rd',
  avenue: 'ave', av: 'ave',
  boulevard: 'blvd', boul: 'blvd',
  drive: 'dr',
  lane: 'ln',
  court: 'ct',
  circle: 'cir',
  place: 'pl',
  parkway: 'pkwy', pky: 'pkwy',
  highway: 'hwy',
  terrace: 'ter',
  trail: 'trl',
  square: 'sq',
  plaza: 'plz',
  crossing: 'xing',
  route: 'rte',
  turnpike: 'tpke',
  expressway: 'expy',
  freeway: 'fwy',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  suite: 'ste', apartment: 'apt', building: 'bldg',
};

/**
 * "2435 US-78" and "2435 US 78" collapse to the same key, as do
 * "2103 South Main Street" and "2103 S Main St".
 */
export function normalizeAddressKey(value: string | null | undefined): string {
  const cleaned = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map(token => CANON[token] ?? token)
    .join(' ');
}

/** First five digits only — "36264-1234" and "36264" are the same ZIP. */
export function normalizeZipKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(0, 5);
}

export interface MatchableStop {
  facility_name?: string | null;
  address_line1?: string | null;
  zip?: string | null;
}

/** Name similarity below this is not enough to break a tie on its own. */
const NAME_TIEBREAK_MIN = 0.5;

/**
 * Active facilities at the same street address and ZIP as the stop.
 *
 * Returns an empty list when the stop has no usable address or ZIP — a name-only
 * match is too weak to put in front of a dispatcher as "this is your facility".
 * When several facilities share an address (multi-tenant docks), the name is used
 * to pick a clear winner; if none is clear, every candidate is returned so the
 * dispatcher chooses rather than the code guessing.
 */
export function matchFacilities(stop: MatchableStop, facilities: Facility[]): Facility[] {
  const addr = normalizeAddressKey(stop.address_line1);
  const zip = normalizeZipKey(stop.zip);
  if (!addr || !zip) return [];

  const candidates = (facilities ?? []).filter(
    f => f.is_active
      && normalizeAddressKey(f.address_line1) === addr
      && normalizeZipKey(f.zip) === zip,
  );
  if (candidates.length <= 1) return candidates;

  const name = (stop.facility_name ?? '').trim();
  if (!name) return candidates;

  const scored = candidates
    .map(f => ({ f, score: nameScore(name, f.facility_name) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  if (best.score >= NAME_TIEBREAK_MIN && best.score > runnerUp.score) return [best.f];
  return candidates;
}

/** One-line address summary shown next to a suggested facility. */
export function facilitySummary(f: Facility): string {
  const line = [f.address_line1, f.address_line2].filter(Boolean).join(', ');
  const region = [f.city, [f.state, f.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line, region].filter(Boolean).join(' — ');
}
