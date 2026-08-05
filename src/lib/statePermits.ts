import { differenceInDays, parseISO, startOfDay } from 'date-fns';

/**
 * Four states that require a special permit / authority registration beyond
 * standard IFTA. Listed in alphabetical order — this order is the single
 * source of truth for every UI surface.
 */
export const PERMIT_STATES = ['KY', 'NM', 'NY', 'OR'] as const;
export type PermitStateCode = (typeof PERMIT_STATES)[number];

export const PERMIT_STATE_META: Record<PermitStateCode, { name: string; permitLabel: string }> = {
  KY: { name: 'Kentucky',   permitLabel: 'KYU Number' },
  NM: { name: 'New Mexico', permitLabel: 'NM Weight Distance Permit' },
  NY: { name: 'New York',   permitLabel: 'NY HUT Credential' },
  OR: { name: 'Oregon',     permitLabel: 'OR Weight-Mile Permit' },
};

export interface StatePermit {
  id?: string;
  stateCode: PermitStateCode;
  registered: boolean;
  permitNumber: string | null;
  expiresAt: string | null;
  documentId: string | null;
}

export function emptyPermit(stateCode: PermitStateCode): StatePermit {
  return { stateCode, registered: false, permitNumber: null, expiresAt: null, documentId: null };
}

/** Only the enabled states, in alphabetical order. */
export function activePermits(permits: StatePermit[]): StatePermit[] {
  return PERMIT_STATES
    .map(code => permits.find(p => p.stateCode === code))
    .filter((p): p is StatePermit => !!p && p.registered);
}

export type PermitExpiryStatus = 'none' | 'ok' | 'expiring' | 'expired';

export function permitExpiryStatus(expiresAt: string | null): PermitExpiryStatus {
  if (!expiresAt) return 'none';
  const days = differenceInDays(startOfDay(parseISO(expiresAt)), startOfDay(new Date()));
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'ok';
}