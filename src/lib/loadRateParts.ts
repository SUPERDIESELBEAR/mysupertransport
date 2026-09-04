/**
 * THE SHARED PARTS ASSEMBLER — Module 7, Pass 2.
 *
 * The broker invoice and the dispatch company's eligible base read THE SAME
 * LOADS. They must never disagree about the PARTS a load is made of; they are
 * only allowed to disagree about the PREDICATE applied to the charges.
 *
 *   invoice        = header + unbundled FSC + ALL charges
 *   dispatch base  = header + unbundled FSC + charges MINUS §4.3 exclusions
 *
 * So the header/FSC assembly and the charge itemisation live here, once, and
 * both callers call it. The §4.3 exclusion predicate deliberately does NOT
 * live here — it is dispatch-only, and generalising it is how a rule ends up
 * being applied where it does not belong.
 *
 * Section references are to docs/tms-build-status.md, "Settlement rules — the
 * authoritative record", section 4.2.
 *
 * BUILT FROM PARTS. `loads.total_load_value` is never read by either caller:
 * it falls back to `estimated_tons` on a per-ton load (which would bill a
 * figure the scale ticket contradicts) and it drops charges entirely on a
 * loadout.
 */
import { chargeClassification, type LoadChargeRecord } from '@/lib/loadCharges';
import type { ClassificationKey } from '@/lib/revisedRateCon';

/** Which column set produced the header rate. Reported so a line can name it. */
export type HeaderBasis = 'flat' | 'per_mile' | 'per_ton' | 'loadout';

/** The rate columns of a load. Both callers map their own row shape onto this. */
export interface LoadRateBasis {
  loadType: string | null;
  rateType?: string | null;
  linehaulRate?: number | string | null;
  ratePerMile?: number | string | null;
  loadedMiles?: number | string | null;
  ratePerTon?: number | string | null;
  /** Scale-ticket tonnage. The ONLY tonnage either caller may read. */
  confirmedTons?: number | string | null;
  fscAmount?: number | string | null;
  /** NULL and true both mean bundled; only an explicit false adds the FSC. */
  fscBundledIntoLinehaul?: boolean | null;
  loadoutRelocationFee?: number | string | null;
}

/** One charge, itemised. No verdict: a verdict is the caller's business. */
export interface LoadChargePart {
  chargeId: string;
  chargeType: string;
  classification: ClassificationKey;
  amount: number;
}

export interface LoadRateParts {
  headerBasis: HeaderBasis;
  headerComponent: number;
  fscComponent: number;
  chargeParts: LoadChargePart[];
  /** Every charge at full amount. The invoice bills this; dispatch filters it. */
  chargesTotal: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function headerBasisOf(load: LoadRateBasis): HeaderBasis {
  if (load.loadType === 'loadout') return 'loadout';
  const rt = String(load.rateType ?? 'flat');
  if (rt === 'per_mile') return 'per_mile';
  if (rt === 'per_ton') return 'per_ton';
  // flat, and `percentage_of_load`, which behaves as flat.
  return 'flat';
}

/** The header rate, from its own columns. Never `total_load_value`. */
export function headerComponentOf(load: LoadRateBasis): number {
  switch (headerBasisOf(load)) {
    case 'loadout':
      return round2(num(load.loadoutRelocationFee));
    case 'per_mile':
      return round2(num(load.ratePerMile) * num(load.loadedMiles));
    case 'per_ton':
      // CONFIRMED tonnage only. `estimated_tons` is a broker-facing stand-in
      // and reaches neither the invoice nor a settlement; an unscaled load
      // contributes no linehaul rather than a plausible guess.
      return round2(num(load.ratePerTon) * num(load.confirmedTons));
    default:
      return round2(num(load.linehaulRate));
  }
}

/** Unbundled fuel surcharge only. NULL means bundled. */
export function fscComponentOf(load: LoadRateBasis): number {
  if (load.loadType === 'loadout') return 0;
  return load.fscBundledIntoLinehaul === false ? round2(num(load.fscAmount)) : 0;
}

/** Every charge, itemised at FULL amount, in the order supplied. */
export function chargePartsOf(charges: LoadChargeRecord[] | null | undefined): LoadChargePart[] {
  return (charges ?? []).map((c) => ({
    chargeId: c.id,
    chargeType: String(c.charge_type ?? ''),
    classification: chargeClassification(String(c.charge_type ?? '')),
    amount: round2(num(c.amount)),
  }));
}

/** The whole load, in parts. The single assembly both callers use. */
export function assembleLoadRateParts(
  load: LoadRateBasis,
  charges?: LoadChargeRecord[] | null,
): LoadRateParts {
  const chargeParts = chargePartsOf(charges);
  return {
    headerBasis: headerBasisOf(load),
    headerComponent: headerComponentOf(load),
    fscComponent: fscComponentOf(load),
    chargeParts,
    chargesTotal: round2(chargeParts.reduce((s, p) => s + p.amount, 0)),
  };
}
