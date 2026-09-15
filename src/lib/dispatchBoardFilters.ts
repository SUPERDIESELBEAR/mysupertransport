/**
 * Dispatch Board search + attention filtering. PURE — no supabase, no React.
 *
 * Every signal here is derived from data the board already fetches: the
 * assembled chain (`DriverChain`) and the active-claim map keyed by load id.
 * Nothing new is queried.
 */
import type { ChainLoad, DriverChain } from '@/lib/dispatchBoard';
import type { ActiveClaimSummary } from '@/lib/loadClaims';
import { CARRIER_TIMEZONE } from '@/lib/carrierTimezone';

export type AttentionFlagKey = 'claim' | 'paperwork' | 'noLoad' | 'dueSoon';

export interface AttentionFlags {
  claim: boolean;
  paperwork: boolean;
  noLoad: boolean;
  dueSoon: boolean;
}

export const ATTENTION_FLAG_LABELS: Record<AttentionFlagKey, string> = {
  claim: 'Claim',
  paperwork: 'Awaiting paperwork',
  noLoad: 'No load',
  dueSoon: 'Late / due today',
};

/** Every load on a driver's row, in the three presentation groups. */
function allLoads(row: DriverChain): ChainLoad[] {
  return [...(row.current ? [row.current] : []), ...row.queued, ...row.paperworkTail];
}

const squash = (v: string) => v.toLowerCase().replace(/[\s-]+/g, '');

/**
 * Case-insensitive match on driver name, unit number, any load number in the
 * chain, or any load's origin/destination city or state. Load numbers also
 * match with spaces and dashes removed, so "st1042" finds "ST-1042".
 */
export function matchesBoardSearch(row: DriverChain, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const qSquashed = squash(q);

  if (row.driver.name.toLowerCase().includes(q)) return true;
  if ((row.driver.unit_number ?? '').toLowerCase().includes(q)) return true;

  return allLoads(row).some(l => {
    if (l.load_number.toLowerCase().includes(q)) return true;
    if (squash(l.load_number).includes(qSquashed)) return true;
    return [l.originCity, l.originState, l.destinationCity, l.destinationState]
      .some(v => (v ?? '').toLowerCase().includes(q));
  });
}

/** YYYY-MM-DD for an instant, read in carrier time. */
function carrierDay(iso: string | Date): string | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA gives ISO-ordered parts.
  return d.toLocaleDateString('en-CA', { timeZone: CARRIER_TIMEZONE });
}

/**
 * Which problems this driver row carries. `dueSoon` is true when a load's
 * delivery time is today or already past, in carrier time — the same clock
 * the board renders delivery dates in.
 */
export function boardAttentionFlags(
  row: DriverChain,
  activeClaimsByLoad: Record<string, ActiveClaimSummary>,
  now: Date = new Date(),
): AttentionFlags {
  const loads = allLoads(row);
  const today = carrierDay(now);

  return {
    claim: loads.some(l => Boolean(activeClaimsByLoad[l.id])),
    paperwork: row.paperworkTail.length > 0,
    noLoad: row.state === 'no_chain',
    dueSoon: today !== null && loads.some(l => {
      const day = carrierDay(l.deliveryTime);
      return day !== null && day <= today;
    }),
  };
}

export interface BoardFilterInput {
  term: string;
  /** Selected attention chips. Empty means "no attention filter". */
  flags: AttentionFlagKey[];
  activeClaimsByLoad: Record<string, ActiveClaimSummary>;
  now?: Date;
}

/**
 * Search AND (OR of the selected attention flags). Run this AFTER the
 * dispatcher scope so the dispatcher filter always wins.
 */
export function filterBoardRows(rows: DriverChain[], input: BoardFilterInput): DriverChain[] {
  const { term, flags, activeClaimsByLoad, now } = input;
  if (!term.trim() && flags.length === 0) return rows;

  return rows.filter(row => {
    if (!matchesBoardSearch(row, term)) return false;
    if (flags.length === 0) return true;
    const f = boardAttentionFlags(row, activeClaimsByLoad, now);
    return flags.some(key => f[key]);
  });
}

/** Chip counts over the rows the dispatcher can actually see. */
export function countAttentionFlags(
  rows: DriverChain[],
  activeClaimsByLoad: Record<string, ActiveClaimSummary>,
  now: Date = new Date(),
): Record<AttentionFlagKey, number> {
  const counts: Record<AttentionFlagKey, number> = { claim: 0, paperwork: 0, noLoad: 0, dueSoon: 0 };
  rows.forEach(row => {
    const f = boardAttentionFlags(row, activeClaimsByLoad, now);
    (Object.keys(counts) as AttentionFlagKey[]).forEach(k => { if (f[k]) counts[k] += 1; });
  });
  return counts;
}
