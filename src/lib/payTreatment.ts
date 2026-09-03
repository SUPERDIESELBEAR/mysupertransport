import { supabase } from '@/integrations/supabase/client';
import type { ClassificationKey } from '@/lib/revisedRateCon';

/**
 * What a classification does to the driver's settlement, read from the pay
 * policy in force rather than hardcoded.
 *
 * The treatment is a DESCRIPTOR, not a number, on purpose. Every class today
 * settles as a percentage of the line, but that is a property of today's
 * classes, not of the display. A class whose treatment is not a percentage —
 * a reimbursement paid at cost with any excess kept as company margin — returns
 * its own wording and every call site renders it unchanged.
 */
export type PayTreatment =
  | { kind: 'percentage'; pct: number; label: string }
  | { kind: 'at_cost'; label: string }
  | { kind: 'unknown'; label: null };

/**
 * What a classification does with the money. `revenue` splits the line at the
 * policy percentage; `reimbursement` pays back the actual cost to whoever spent
 * it, with any difference falling to the company.
 *
 * Which charge types are reimbursements is POLICY, stored on the pay policy —
 * a carrier who splits washout as revenue configures it that way. Lumper stays
 * revenue by default so existing percentage treatment does not change silently.
 */
export type PayClass = 'revenue' | 'reimbursement';

/** Fallback used only when a policy row predates the column or fails to load. */
export const DEFAULT_CHARGE_PAY_CLASSES: Record<ClassificationKey, PayClass> = {
  linehaul: 'revenue',
  fsc: 'revenue',
  detention: 'revenue',
  stopoff: 'revenue',
  // Lumper stays revenue-classed at its existing 100% so no charge already on a
  // load changes treatment in this pass. A lumper the driver paid out of pocket
  // is classified explicitly as "Reimbursement — driver-paid cost".
  lumper: 'revenue',
  layover: 'revenue',
  tonu: 'revenue',
  reimbursement: 'reimbursement',
  other: 'revenue',
};

export interface PayPolicyRates {
  id: string;
  name: string;
  linehaul_pct: number;
  fsc_pct: number;
  detention_pct: number;
  layover_pct: number;
  stopoff_pct: number;
  lumper_reimbursement_pct: number;
  tonu_pct: number;
  other_accessorial_pct: number;
  /** Classification key → pay class, as configured on this policy. */
  charge_pay_classes?: Record<string, string> | null;
  /** Off means the fuel discount is company margin and the driver never sees it. */
  fuel_discount_passthrough?: boolean | null;
}

const POLICY_COLUMNS =
  'id, name, linehaul_pct, fsc_pct, detention_pct, layover_pct, stopoff_pct, '
  + 'lumper_reimbursement_pct, tonu_pct, other_accessorial_pct, charge_pay_classes, '
  + 'fuel_discount_passthrough';

/**
 * Header-rate kinds that are NOT charge classifications but still take a
 * percentage from the pay policy. A per-ton load's linehaul and a loadout's
 * relocation fee are paid on their own columns, so a carrier can pay a
 * different share by freight type; that is what makes the policy engine
 * configurable rather than a single split with extra columns nobody reads.
 */
export type HeaderRateKey = 'per_ton' | 'loadout';

/** Anything the policy can price: a charge classification or a header rate. */
export type PayRateKey = ClassificationKey | HeaderRateKey;

/**
 * THE percentage column backing each priced thing. ONE map, project-wide.
 *
 * Until 2026-09-03 this map existed three times — here, in
 * `settlementEngine.ts` and in `driverLoadPay.ts`. All three agreed, which is
 * exactly the danger: the map behind the figure a driver is SHOWN and the map
 * behind what he is PAID were separate objects that happened to match.
 */
const PCT_FIELD: Record<PayRateKey, keyof PayPolicyRates> = {
  linehaul: 'linehaul_pct',
  fsc: 'fsc_pct',
  detention: 'detention_pct',
  stopoff: 'stopoff_pct',
  lumper: 'lumper_reimbursement_pct',
  layover: 'layover_pct',
  tonu: 'tonu_pct',
  // Never read while this class is a reimbursement; present so the map stays
  // exhaustive and a policy that reclassifies it as revenue still resolves.
  reimbursement: 'other_accessorial_pct',
  other: 'other_accessorial_pct',
  per_ton: 'per_ton_pct',
  loadout: 'loadout_pct',
};

/**
 * The percentage in force for a priced thing, or null when it cannot be read
 * honestly — no policy, or a column that is absent or non-numeric. Callers
 * pay nothing on null rather than falling back to a guess.
 */
export function pctForClassification(
  klass: PayRateKey,
  policy: PayPolicyRates | null | undefined,
): number | null {
  if (!policy) return null;
  const raw = policy[PCT_FIELD[klass]];
  const pct = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  return Number.isFinite(pct) ? pct : null;
}

/** The pay class in force for a classification under this policy. */
export function payClassOf(
  klass: ClassificationKey,
  policy: PayPolicyRates | null,
): PayClass {
  const configured = policy?.charge_pay_classes?.[klass];
  if (configured === 'revenue' || configured === 'reimbursement') return configured;
  return DEFAULT_CHARGE_PAY_CLASSES[klass];
}

const trimPct = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));

/** The settlement consequence of a classification, or unknown when no policy loaded. */
export function payTreatment(
  klass: ClassificationKey,
  policy: PayPolicyRates | null,
): PayTreatment {
  if (!policy) return { kind: 'unknown', label: null };
  if (payClassOf(klass, policy) === 'reimbursement') {
    return { kind: 'at_cost', label: 'reimbursed at cost' };
  }
  const pct = Number(policy[PCT_FIELD[klass]]);
  if (!Number.isFinite(pct)) return { kind: 'unknown', label: null };
  return { kind: 'percentage', pct, label: `${trimPct(pct)}% to driver` };
}

/**
 * The policy in force for a load: the driver's own assignment where one is
 * effective today, otherwise the company default. Returns null rather than a
 * guess when neither is readable — the UI then shows no percentage at all.
 */
export async function fetchEffectivePayPolicy(
  operatorId: string | null | undefined,
): Promise<PayPolicyRates | null> {
  if (operatorId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('pay_policy_assignments')
      .select(`pay_policy_id, effective_start_date, effective_end_date, pay_policies(${POLICY_COLUMNS})`)
      .eq('operator_id', operatorId)
      .lte('effective_start_date', today)
      .order('effective_start_date', { ascending: false });

    const active = (data ?? []).find(row =>
      !row.effective_end_date || String(row.effective_end_date) >= today);
    const policy = active?.pay_policies as unknown as PayPolicyRates | null | undefined;
    if (policy) return policy;
  }

  const { data: def } = await supabase
    .from('pay_policies')
    .select(POLICY_COLUMNS)
    .eq('is_company_default', true)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (def as unknown as PayPolicyRates | null) ?? null;
}
