/**
 * What THIS load is expected to add to the driver's settlement.
 *
 * PURE. No supabase, no React. The caller holds the charges and the pay policy
 * in force and hands them in.
 *
 * Driver-facing rule, deliberate and enforced here rather than at each call
 * site: the figure returned is the DRIVER's number. The gross line haul and the
 * split percentage are never returned, never formatted, never exposed. A
 * percentage shown against a gross invites arithmetic that will not match the
 * check, because a settlement also carries detention at 100%, reimbursements,
 * deductions and the R&M deposit. The contract percentage lives in the ICA.
 */
import { chargeClassification, type LoadChargeRecord } from '@/lib/loadCharges';
import { payClassOf, type PayPolicyRates } from '@/lib/payTreatment';

const PCT_FIELD = {
  linehaul: 'linehaul_pct',
  fsc: 'fsc_pct',
  detention: 'detention_pct',
  stopoff: 'stopoff_pct',
  lumper: 'lumper_reimbursement_pct',
  layover: 'layover_pct',
  tonu: 'tonu_pct',
  reimbursement: 'other_accessorial_pct',
  other: 'other_accessorial_pct',
} as const;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export interface DriverLoadPayEstimate {
  /** The driver's estimated figure, or null when it cannot be computed honestly. */
  amount: number | null;
  /**
   * True when at least one charge could not be valued (an unconfirmed
   * driver-funded reimbursement with no actual cost recorded yet).
   */
  incomplete: boolean;
}

/**
 * Sum of the driver's share of every charge on the load.
 *
 * Revenue-classed charges settle at the policy percentage for their class.
 * Reimbursement-classed charges pay back the ACTUAL cost, and only to whoever
 * spent it — a company-funded reimbursement is worth nothing to the driver.
 *
 * Returns `amount: null` when no policy is readable, so the UI shows no figure
 * at all rather than a guess.
 */
export function estimateDriverLoadPay(
  charges: LoadChargeRecord[],
  policy: PayPolicyRates | null,
): DriverLoadPayEstimate {
  if (!policy) return { amount: null, incomplete: true };

  let total = 0;
  let incomplete = false;

  for (const charge of charges) {
    const klass = chargeClassification(charge.charge_type);
    if (payClassOf(klass, policy) === 'reimbursement') {
      if (charge.funding_source !== 'driver') continue;
      if (charge.actual_cost === null || charge.actual_cost === undefined || charge.actual_cost === '') {
        incomplete = true;
        continue;
      }
      total += num(charge.actual_cost);
      continue;
    }
    const pct = Number(policy[PCT_FIELD[klass]]);
    if (!Number.isFinite(pct)) { incomplete = true; continue; }
    total += num(charge.amount) * (pct / 100);
  }

  return { amount: Math.round(total * 100) / 100, incomplete };
}
