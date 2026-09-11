/**
 * Clean Roadside Inspection Bonus (§12).
 *
 * Clean means ZERO recorded violations of any kind — a non-out-of-service
 * violation still generates CSA points, so it is not clean.
 */

import type { RoadsideInspectionLevel } from '@/components/drivers/roadsideStopTypes';

export interface BonusAmounts {
  level_1: number;
  level_2: number;
  level_3: number;
}

export const DEFAULT_BONUS_AMOUNTS: BonusAmounts = { level_1: 100, level_2: 50, level_3: 25 };
export const DEFAULT_REPORT_WINDOW_HOURS = 24;

export interface BonusCandidateInput {
  stopType: string;
  outcome: string;
  level: RoadsideInspectionLevel | null | undefined;
  violationCount: number;
  oosDriver?: boolean;
  oosVehicle?: boolean;
  reportNumber?: string | null;
  stopAt?: string | null;
  reportSubmittedAt?: string | null;
  amounts?: BonusAmounts;
  reportWindowHours?: number;
}

export interface BonusEvaluation {
  eligible: boolean;
  amount: number;
  /** Soft warnings — the reviewer decides, per "verified against the FMCSA record". */
  warnings: string[];
  reason?: string;
}

export function bonusAmountForLevel(
  level: RoadsideInspectionLevel | null | undefined,
  amounts: BonusAmounts = DEFAULT_BONUS_AMOUNTS,
): number {
  switch (level) {
    case 'level_1': return amounts.level_1;
    case 'level_2': return amounts.level_2;
    case 'level_3': return amounts.level_3;
    default: return 0;
  }
}

export function evaluateBonus(input: BonusCandidateInput): BonusEvaluation {
  const amounts = input.amounts ?? DEFAULT_BONUS_AMOUNTS;
  const windowHours = input.reportWindowHours ?? DEFAULT_REPORT_WINDOW_HOURS;
  const warnings: string[] = [];

  if (input.stopType !== 'dot_inspection') {
    return { eligible: false, amount: 0, warnings, reason: 'Only DOT inspections qualify.' };
  }
  const amount = bonusAmountForLevel(input.level, amounts);
  if (!amount) {
    return { eligible: false, amount: 0, warnings, reason: 'Only Level I, II and III inspections qualify.' };
  }
  if (input.violationCount > 0 || input.oosDriver || input.oosVehicle || input.outcome !== 'clean') {
    return {
      eligible: false,
      amount: 0,
      warnings,
      reason: 'Clean means zero recorded violations of any kind.',
    };
  }

  if (!input.reportNumber || !input.reportNumber.trim()) {
    warnings.push('No inspection case number recorded — the bonus is paid only on a report bearing one.');
  }
  if (input.stopAt) {
    if (!input.reportSubmittedAt) {
      warnings.push('Report submission time not recorded — the 24-hour window cannot be confirmed.');
    } else {
      const hours = (new Date(input.reportSubmittedAt).getTime() - new Date(input.stopAt).getTime()) / 3_600_000;
      if (hours > windowHours) {
        warnings.push(`Report submitted ${Math.round(hours)} hours after the stop — outside the ${windowHours}-hour window.`);
      }
    }
  }

  return { eligible: true, amount, warnings };
}
