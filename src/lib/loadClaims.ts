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
