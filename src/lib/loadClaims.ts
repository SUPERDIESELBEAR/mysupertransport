import {
  CLAIM_LEVEL_LABELS,
  CLAIM_TYPE_LABELS,
  type ClaimLevel,
  type ClaimType,
} from '@/components/dispatch/loadDetail/claimConstants';

export interface ActiveClaimSummary {
  level: ClaimLevel;
  claimType: ClaimType;
  title: string;
}

/**
 * Collapse multiple active claims on one load into a single inline indicator.
 * Severity wins: if any claim is a hold, the indicator is a hold.
 */
export function summarizeActiveClaims(
  claims: { flag_level: ClaimLevel | string; claim_type: ClaimType | string }[],
): ActiveClaimSummary | null {
  if (!claims || claims.length === 0) return null;

  const hasHold = claims.some(c => c.flag_level === 'hold');
  const level: ClaimLevel = hasHold ? 'hold' : 'watch';
  const types = Array.from(new Set(claims.map(c => c.claim_type as ClaimType)));
  const typeLabel =
    types.length === 1 ? CLAIM_TYPE_LABELS[types[0]] : `${types.length} claim types`;
  const levelLabel = CLAIM_LEVEL_LABELS[level];

  return {
    level,
    claimType: types.length === 1 ? types[0] : 'other',
    title: `${levelLabel} — ${typeLabel}`,
  };
}

export type ClaimFilterValue = 'all' | 'active' | 'watch' | 'hold';

export const CLAIM_FILTER_VALUES: ClaimFilterValue[] = ['all', 'active', 'watch', 'hold'];

/** Narrow a stored preference value back to a valid claim filter. */
export function normalizeClaimFilter(value: unknown): ClaimFilterValue {
  return CLAIM_FILTER_VALUES.includes(value as ClaimFilterValue)
    ? (value as ClaimFilterValue)
    : 'all';
}

/**
 * PURE claim-filter predicate shared by the Loads list and its tests.
 * A settlement-blocking state must never be hidden, so 'all' passes everything.
 */
export function matchesClaimFilter(
  activeClaim: ActiveClaimSummary | null | undefined,
  filter: ClaimFilterValue,
): boolean {
  if (filter === 'all') return true;
  if (!activeClaim) return false;
  if (filter === 'active') return true;
  return activeClaim.level === filter;
}
