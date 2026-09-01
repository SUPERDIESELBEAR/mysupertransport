/**
 * SETTLEMENT CONFIGURATION AND THE THREE NON-PAYMENT STATES.
 *
 * Every number here is a FALLBACK for a row that has not been read yet, never
 * a rule. The live values live in `settlement_settings` and are editable by
 * management or owner, with every change written to
 * `settlement_settings_history` with the actor. Nothing in this file may be
 * treated as authoritative once the row is loaded.
 */

export interface SettlementSettings {
  minimum_net_pay_threshold: number;
  hold_buffer: number;
  equipment_value_per_driver: number;
  rm_deposit_target: number;
  rm_weekly_deduction: number;
  /** Postgres dow numbering. 3 = Wednesday. */
  work_week_start_dow: number;
}

/** Shipping defaults, matching the database column defaults exactly. */
export const SETTLEMENT_SETTINGS_DEFAULTS: SettlementSettings = {
  minimum_net_pay_threshold: 100,
  hold_buffer: 500,
  equipment_value_per_driver: 1200,
  rm_deposit_target: 2000,
  rm_weekly_deduction: 200,
  work_week_start_dow: 3,
};

export const SETTLEMENT_SETTING_KEYS = [
  'minimum_net_pay_threshold',
  'hold_buffer',
  'equipment_value_per_driver',
  'rm_deposit_target',
  'rm_weekly_deduction',
  'work_week_start_dow',
] as const;

export type SettlementSettingKey = (typeof SETTLEMENT_SETTING_KEYS)[number];

export const SETTLEMENT_SETTING_LABELS: Record<SettlementSettingKey, string> = {
  minimum_net_pay_threshold: 'Minimum net pay',
  hold_buffer: 'Hold buffer',
  equipment_value_per_driver: 'Equipment value per driver',
  rm_deposit_target: 'Repair & Maintenance Deposit target',
  rm_weekly_deduction: 'Repair & Maintenance weekly deduction',
  work_week_start_dow: 'Work week starts',
};

export const SETTLEMENT_SETTING_HELP: Record<SettlementSettingKey, string> = {
  minimum_net_pay_threshold:
    'A settlement under this amount rolls forward to the next period unless management authorises payment.',
  hold_buffer:
    'A departing driver is held when net pay plus their Repair & Maintenance Deposit, less the value of equipment still out, falls below this.',
  equipment_value_per_driver:
    'Flat exposure per driver while equipment is still outstanding. Counts only until the equipment is back.',
  rm_deposit_target:
    'The Repair & Maintenance Deposit stops building at this balance and resumes after a withdrawal.',
  rm_weekly_deduction: 'Taken each week until the deposit reaches its target.',
  work_week_start_dow: 'The work week runs from this day 00:00 through the following week, ending 23:59.',
};

export const DOW_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export function dowLabel(dow: number): string {
  return DOW_NAMES[dow] ?? String(dow);
}

/* ------------------------------------------------------------------ */
/* Status vocabulary — PAID, PROCESSING, UPCOMING. No other words.     */
/* ------------------------------------------------------------------ */

export const SETTLEMENT_STATUSES = [
  'upcoming', 'processing', 'paid', 'held', 'below_threshold',
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/** Driver-facing wording. Each non-payment state says which one it is. */
export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  upcoming: 'UPCOMING',
  processing: 'PROCESSING',
  paid: 'PAID',
  held: 'HELD',
  below_threshold: 'BELOW MINIMUM',
};

export const SETTLEMENT_STATUS_EXPLANATIONS: Record<SettlementStatus, string> = {
  upcoming: 'This work week is still in progress.',
  processing: 'The week is closed and the settlement is being reconciled.',
  paid: 'Paid and deposited.',
  held: 'Computed in full. Payment is held pending return of company equipment.',
  below_threshold:
    'Under the minimum net pay, so it rolls forward to the next period. Management can authorise payment anyway.',
};

/**
 * DRIVER-FACING explanations. Same vocabulary, no staff mechanics, and the two
 * forbidden words never appear: a settlement under the minimum ROLLS INTO THE
 * NEXT ONE, and the deposit is always the Repair & Maintenance Deposit. The
 * below-threshold line takes the amount so the driver reads a number.
 */
export const SETTLEMENT_STATUS_DRIVER_EXPLANATIONS: Record<SettlementStatus, string> = {
  upcoming: 'This work week is still in progress.',
  processing: 'The week is closed and your settlement is being reconciled.',
  paid: 'Paid and deposited.',
  held: 'Your settlement is computed in full. Payment is held pending return of company equipment.',
  below_threshold: 'This settlement is under the minimum, so it rolls into your next settlement.',
};

/** Below-threshold, said plainly, with the amount. */
export function belowThresholdDriverLine(netAmount: number): string {
  const amount = netAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return `${amount} rolls into your next settlement.`;
}


/** The three states in which a driver is not paid this period. */
export const NON_PAYMENT_STATES = ['below_threshold', 'held'] as const;

export function isNonPayment(status: SettlementStatus): boolean {
  return status === 'below_threshold' || status === 'held';
}

/** Each non-payment state has its own release path, with a named actor. */
export function releasePathFor(status: SettlementStatus): 'authorize_below_threshold_payment' | 'release_settlement_hold' | null {
  if (status === 'below_threshold') return 'authorize_below_threshold_payment';
  if (status === 'held') return 'release_settlement_hold';
  return null;
}

/* ------------------------------------------------------------------ */
/* The hold test                                                       */
/* ------------------------------------------------------------------ */

export interface HoldInput {
  /** Departing flag on the operator. Nothing else triggers a hold. */
  isDeparting: boolean;
  netAmount: number;
  /** Repair & Maintenance Deposit balance — the driver's money, and it offsets. */
  rmDepositBalance: number;
  /** True only while company equipment is still out. */
  equipmentOutstanding: boolean;
  settings: Pick<SettlementSettings, 'hold_buffer' | 'equipment_value_per_driver'>;
}

export interface HoldDecision {
  held: boolean;
  /** net + R&M − equipment exposure. */
  coverage: number;
  exposure: number;
  reason: string | null;
}

/**
 *   held  ⇔  departing AND (net + R&M deposit − equipment value) < hold buffer
 *
 * HELD MEANS COMPUTED AND VISIBLE. The settlement still runs, the number still
 * exists, both sides can read it, and only PAYMENT is withheld.
 */
export function evaluateHold(input: HoldInput): HoldDecision {
  const exposure = input.equipmentOutstanding ? input.settings.equipment_value_per_driver : 0;
  const coverage = input.netAmount + input.rmDepositBalance - exposure;
  if (!input.isDeparting) return { held: false, coverage, exposure, reason: null };
  if (coverage >= input.settings.hold_buffer) return { held: false, coverage, exposure, reason: null };
  return {
    held: true,
    coverage,
    exposure,
    reason: exposure > 0
      ? 'Held pending return of company equipment.'
      : 'Held pending final reconciliation.',
  };
}

/** Under the minimum, and no authorisation on file. */
export function isBelowThreshold(
  netAmount: number,
  settings: Pick<SettlementSettings, 'minimum_net_pay_threshold'>,
  authorized = false,
): boolean {
  if (authorized) return false;
  return netAmount < settings.minimum_net_pay_threshold;
}

/* ------------------------------------------------------------------ */
/* Repair & Maintenance Deposit                                        */
/* ------------------------------------------------------------------ */

export interface RmDepositState {
  current_balance: number;
  target_amount?: number | null;
  weekly_deduction?: number | null;
  is_paused?: boolean | null;
}

/**
 * Auto-stops at target, auto-resumes after a withdrawal drops the balance
 * below it. Partial: never take more than the shortfall.
 */
export function rmDeductionDue(
  deposit: RmDepositState,
  settings: Pick<SettlementSettings, 'rm_deposit_target' | 'rm_weekly_deduction'>,
): number {
  if (deposit.is_paused) return 0;
  const target = deposit.target_amount ?? settings.rm_deposit_target;
  const weekly = deposit.weekly_deduction ?? settings.rm_weekly_deduction;
  const shortfall = target - deposit.current_balance;
  if (shortfall <= 0) return 0;
  return Math.min(weekly, shortfall);
}
