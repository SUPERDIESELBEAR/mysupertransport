import type { LoadType } from '@/lib/loadRateMath';

/**
 * Moving money across a load-type change.
 *
 * A load type is a statement about what the money on the document MEANS, not a
 * reason to forget it. On the Rolling River loadout the parser read $150 as the
 * linehaul rate; clicking "Trailer Relocation" made the linehaul fields
 * irrelevant and the $150 vanished, even though $150 is exactly the relocation
 * fee that document states.
 *
 * So: the amount field of the old type is carried into the amount field of the
 * new type whenever the destination is empty. When the destination already
 * holds a different number, nothing is overwritten — the caller is told, and
 * asks.
 */

/** The single "what this load pays" field for each load type. */
export const LOAD_TYPE_AMOUNT_FIELD: Record<LoadType, 'linehaul_rate' | 'loadout_relocation_fee'> = {
  standard: 'linehaul_rate',
  per_ton: 'linehaul_rate',
  loadout: 'loadout_relocation_fee',
};

export interface LoadTypeCarry {
  /** Field to write, or null when there is nothing to move. */
  toField: 'linehaul_rate' | 'loadout_relocation_fee' | null;
  /** Field the amount came from. */
  fromField: 'linehaul_rate' | 'loadout_relocation_fee' | null;
  /** The amount, as the string the form field holds. */
  amount: string;
  /**
   * True when the destination already holds a different amount, so writing
   * would destroy a value someone entered. The caller must confirm first.
   */
  conflicts: boolean;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const same = (a: string, b: string) => {
  const na = parseFloat(a); const nb = parseFloat(b);
  return Number.isFinite(na) && Number.isFinite(nb) ? na === nb : a === b;
};

export function planLoadTypeCarry(
  from: LoadType,
  to: LoadType,
  values: { linehaul_rate?: unknown; loadout_relocation_fee?: unknown },
): LoadTypeCarry {
  const fromField = LOAD_TYPE_AMOUNT_FIELD[from];
  const toField = LOAD_TYPE_AMOUNT_FIELD[to];
  const empty: LoadTypeCarry = { toField: null, fromField: null, amount: '', conflicts: false };
  if (!fromField || !toField || fromField === toField) return empty;

  const amount = str(values[fromField]);
  if (!amount) return empty;

  const existing = str(values[toField]);
  return {
    fromField,
    toField,
    amount,
    conflicts: !!existing && !same(existing, amount),
  };
}
