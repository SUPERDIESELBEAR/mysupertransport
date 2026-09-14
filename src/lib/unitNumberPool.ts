/**
 * WHICH UNIT NUMBERS A STAFF MEMBER MAY ACTUALLY ASSIGN.
 *
 * Numbers run in one sequence. A number handed to a driver who never reached
 * Go-Live never belonged to a truck that ran under the authority, so it comes
 * back into the pool; a number held by someone who DID go live is spent
 * forever, even after that driver leaves.
 *
 * Release is derived, not recorded — see `public.unit_number_pool()`. This
 * module holds the ordering and labelling rules only, so they can be tested
 * without a database.
 */
import { supabase } from '@/integrations/supabase/client';

export type UnitPoolKind = 'recycled' | 'gap' | 'next';

export interface UnitPoolEntry {
  unit: number;
  kind: UnitPoolKind;
  freedAt: string | null;
  note: string;
}

/** The state a holder of a number is in, as reported by the database. */
export type UnitHolderState = 'live' | 'departed' | 'onboarding' | 'released';

export interface UnitHolder {
  operatorId: string;
  driverName: string;
  isActive: boolean;
  goLiveDate: string | null;
  deactivatedAt: string | null;
  state: UnitHolderState;
}

/**
 * Recycled first, then never-issued gaps, then the next number.
 *
 * Recycled leads deliberately: reusing a freed number keeps the sequence dense,
 * and the oldest freed number is the one least likely to still be printed on a
 * decal somewhere.
 */
const KIND_RANK: Record<UnitPoolKind, number> = { recycled: 0, gap: 1, next: 2 };

export function sortPool(entries: UnitPoolEntry[]): UnitPoolEntry[] {
  return [...entries].sort((a, b) => {
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (a.kind === 'recycled') {
      // Oldest freed first; a wash-out with no archive timestamp sorts last.
      const av = a.freedAt ? Date.parse(a.freedAt) : Number.POSITIVE_INFINITY;
      const bv = b.freedAt ? Date.parse(b.freedAt) : Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
    }
    return a.unit - b.unit;
  });
}

export const KIND_GROUP_LABEL: Record<UnitPoolKind, string> = {
  recycled: 'Recycled — freed before Go-Live',
  gap: 'Never issued',
  next: 'Next in sequence',
};

/** The short right-hand hint on a pool row. */
export function formatPoolOption(entry: UnitPoolEntry): string {
  if (entry.kind === 'recycled') {
    if (!entry.freedAt) return 'freed';
    const d = new Date(entry.freedAt);
    return `freed ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  if (entry.kind === 'next') return 'next available';
  return 'unused';
}

/**
 * The sentence shown when staff type a number that someone already holds.
 * NO SAVE IS BLOCKED HERE — the warning names the holder and their state so a
 * person can decide, because a rehire legitimately reuses his own old number.
 */
export function holderWarning(unit: string, holders: UnitHolder[]): string | null {
  if (!holders.length) return null;
  const parts = holders.map(h => {
    const name = h.driverName || 'an unnamed driver';
    switch (h.state) {
      case 'live': return `${name} (active, went live${h.goLiveDate ? ` ${h.goLiveDate}` : ''})`;
      case 'departed': return `${name} (went live, no longer active)`;
      case 'onboarding': return `${name} (still in onboarding — reserved)`;
      case 'released': return `${name} (never went live — this number is free)`;
    }
  });
  return `Unit ${unit} is already on ${parts.join(' and ')}.`;
}

/** True when the typed number is held by someone whose number is NOT free. */
export function isHardCollision(holders: UnitHolder[]): boolean {
  return holders.some(h => h.state !== 'released');
}

/** How the chosen number was arrived at, recorded on the audit entry. */
export function poolKindFor(unit: string, pool: UnitPoolEntry[]): UnitPoolKind | 'manual' {
  const n = Number(String(unit).trim());
  if (!Number.isFinite(n)) return 'manual';
  return pool.find(e => e.unit === n)?.kind ?? 'manual';
}

/* ------------------------- not switched on yet -------------------------- */

/**
 * The pool functions ship with a staged database change, so until that change
 * is accepted the list simply does not exist. Say so in words a person can act
 * on — typing a number by hand keeps working either way.
 */
export const POOL_UNAVAILABLE_MESSAGE =
  'The available-number list turns on when this draft is accepted. You can type the unit number in the meantime.';

/** True when the error is "that function does not exist", not a real failure. */
export function isPoolMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'PGRST202') return true;
  return /unit_number_pool|unit_number_holders/.test(String(e.message ?? ''));
}

/* --------------------------------- data --------------------------------- */

export async function fetchUnitNumberPool(): Promise<UnitPoolEntry[]> {
  const { data, error } = await (supabase as any).rpc('unit_number_pool');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ unit: number; kind: UnitPoolKind; freed_at: string | null; note: string }>;
  return sortPool(rows.map(r => ({
    unit: r.unit,
    kind: r.kind,
    freedAt: r.freed_at ?? null,
    note: r.note,
  })));
}

export async function fetchUnitHolders(unit: string): Promise<UnitHolder[]> {
  const trimmed = String(unit ?? '').trim();
  if (!trimmed) return [];
  const { data, error } = await (supabase as any).rpc('unit_number_holders', { _unit: trimmed });
  if (error) throw error;
  return ((data ?? []) as any[]).map(r => ({
    operatorId: r.operator_id,
    driverName: (r.driver_name ?? '').trim(),
    isActive: !!r.is_active,
    goLiveDate: r.go_live_date ?? null,
    deactivatedAt: r.deactivated_at ?? null,
    state: r.state as UnitHolderState,
  }));
}
