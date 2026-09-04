/**
 * THE POPULATION RULE.
 *
 * A settlement run includes any operator with UNSETTLED WORK in the period:
 *
 *   - a load delivered in the period and not yet on a settlement
 *   - fuel transactions not yet deducted
 *   - an outstanding cash advance balance
 *   - a negative carry-forward from a prior period
 *   - an R&M deduction due
 *
 * It keys on NONE of the seven "active operator" definitions this codebase
 * carries — not `operators.is_active`, not `excluded_from_dispatch`, not
 * `fully_onboarded`, not parked, not departing, and not `lease_terminations`
 * (which appears in none of the seven anyway). A departed driver still
 * settles. A parked driver still settles.
 *
 * A driver with ONLY deductions and no revenue DOES get a settlement. It runs
 * negative, the debt is real, and it carries forward. He is not skipped.
 */

export interface UnsettledWork {
  operatorId: string;
  /** Loads delivered in the period that are not on a settlement yet. */
  deliveredLoadCount: number;
  /** Fuel transactions in the period not yet deducted. */
  undeductedFuelCount: number;
  /** Outstanding cash advance balance, in dollars. */
  outstandingAdvanceBalance: number;
  /** Negative carry-forward from a prior period (a positive number = owed). */
  negativeCarryForward: number;
  /** Repair & Maintenance Deposit deduction due this period. */
  rmDeductionDue: number;
  /** Other recurring or one-time deductions due this period. */
  otherDeductionsDue: number;
  /**
   * APPROVED late accessorial adjustments (`-A1`) approved in this period and
   * not yet settled. A trigger IN ITS OWN RIGHT: a driver whose only unsettled
   * item is an approved adjustment is in the run, exactly as a driver whose
   * only item is a deduction is.
   */
  approvedAdjustmentCount: number;
}

export const POPULATION_TRIGGERS = [
  'deliveredLoadCount',
  'undeductedFuelCount',
  'outstandingAdvanceBalance',
  'negativeCarryForward',
  'rmDeductionDue',
  'otherDeductionsDue',
  'approvedAdjustmentCount',
] as const;

/**
 * Eligibility predicates the settlement run must NOT consult. Named so the
 * test can assert the rule never grows one by accident.
 */
export const IGNORED_ACTIVE_PREDICATES = [
  'is_active',
  'excluded_from_dispatch',
  'fully_onboarded',
  'is_parked',
  'is_departing',
  'lease_terminations',
  'account_status',
] as const;

export function hasUnsettledWork(work: UnsettledWork): boolean {
  return (
    work.deliveredLoadCount > 0
    || work.undeductedFuelCount > 0
    || work.outstandingAdvanceBalance > 0
    || work.negativeCarryForward > 0
    || work.rmDeductionDue > 0
    || work.otherDeductionsDue > 0
    || work.approvedAdjustmentCount > 0
  );
}

/** Why this operator is in the run — used for the run's own audit line. */
export function populationReasons(work: UnsettledWork): string[] {
  const out: string[] = [];
  if (work.deliveredLoadCount > 0) out.push(`${work.deliveredLoadCount} delivered load(s) not yet settled`);
  if (work.undeductedFuelCount > 0) out.push(`${work.undeductedFuelCount} fuel transaction(s) not yet deducted`);
  if (work.outstandingAdvanceBalance > 0) out.push('outstanding cash advance balance');
  if (work.negativeCarryForward > 0) out.push('negative carry-forward from a prior period');
  if (work.rmDeductionDue > 0) out.push('Repair & Maintenance Deposit deduction due');
  if (work.otherDeductionsDue > 0) out.push('deductions due');
  if (work.approvedAdjustmentCount > 0) out.push(`${work.approvedAdjustmentCount} approved late accessorial adjustment(s)`);
  return out;
}

/**
 * The whole rule. `work` is the ONLY argument: there is deliberately nowhere to
 * pass an eligibility flag in.
 */
export function selectSettlementPopulation(work: UnsettledWork[]): string[] {
  return work.filter(hasUnsettledWork).map(w => w.operatorId);
}
