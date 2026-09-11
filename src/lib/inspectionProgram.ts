/**
 * Quarterly DOT Inspection Program — pure scheduling logic.
 *
 * Assignment comes from the last digit of the truck's unit number:
 *   odd  (1,3,5,7,9) → Group A → October, January, April, July
 *   even (0,2,4,6,8) → Group B → December, March, June, September
 * A unit number ending in 0 counts as even, per the program document.
 *
 * February, May, August and November are makeup months — no unit is scheduled.
 */

export type InspectionGroup = 'A' | 'B';

export type CycleStatus =
  | 'upcoming'
  | 'due'
  | 'submitted'
  | 'closed'
  | 'overdue'
  | 'grace';

export const GROUP_MONTHS: Record<InspectionGroup, number[]> = {
  A: [1, 4, 7, 10],
  B: [3, 6, 9, 12],
};

export const MAKEUP_MONTHS = [2, 5, 8, 11];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Program launch: Group A units inspected on/after this date are credited for October 2026. */
export const LAUNCH_CREDIT_FROM = '2026-08-01';
export const PROGRAM_START = { year: 2026, month: 10 };

/**
 * Group for a unit number. Returns null when there is no usable digit —
 * we never guess a schedule from a blank or letters-only unit.
 */
export function inspectionGroup(unitNumber: string | null | undefined): InspectionGroup | null {
  if (!unitNumber) return null;
  const digits = String(unitNumber).replace(/\D/g, '');
  if (!digits) return null;
  const last = Number(digits[digits.length - 1]);
  return last % 2 === 1 ? 'A' : 'B';
}

export function groupMonths(group: InspectionGroup): number[] {
  return GROUP_MONTHS[group];
}

export function isAssignedMonth(group: InspectionGroup, month: number): boolean {
  return GROUP_MONTHS[group].includes(month);
}

export interface CycleRef { year: number; month: number }

/** The assigned cycle on or after the given date. */
export function nextCycleOnOrAfter(group: InspectionGroup, from: Date): CycleRef {
  let year = from.getFullYear();
  let month = from.getMonth() + 1;
  for (let i = 0; i < 24; i++) {
    if (isAssignedMonth(group, month)) return { year, month };
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month };
}

/** The assigned cycle strictly after the given date. */
export function nextCycleAfter(group: InspectionGroup, from: Date): CycleRef {
  const start = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return nextCycleOnOrAfter(group, start);
}

/**
 * A new contractor joins at the next assigned month falling at least 60 days
 * after onboarding (§5.2).
 */
export function firstCycleForNewContractor(group: InspectionGroup, onboardedAt: Date): CycleRef {
  const eligible = new Date(onboardedAt.getTime());
  eligible.setDate(eligible.getDate() + 60);
  return nextCycleOnOrAfter(group, new Date(eligible.getFullYear(), eligible.getMonth(), 1) < eligible
    ? new Date(eligible.getFullYear(), eligible.getMonth() + 1, 1)
    : eligible);
}

/** Group A units holding an inspection dated on/after Aug 1 2026 skip the October cycle (§5.1). */
export function qualifiesForLaunchCredit(
  group: InspectionGroup | null,
  latestInspectionDate: string | null | undefined,
): boolean {
  if (group !== 'A' || !latestInspectionDate) return false;
  return latestInspectionDate >= LAUNCH_CREDIT_FROM;
}

export function cycleLabel(cycle: CycleRef): string {
  return `${MONTH_NAMES[cycle.month - 1]} ${cycle.year}`;
}

/** Last calendar day of the assigned month. */
export function monthEnd(cycle: CycleRef): Date {
  return new Date(cycle.year, cycle.month, 0);
}

/** Final day the submission is accepted — the grace date when one was granted. */
export function cycleDeadline(cycle: CycleRef, graceUntil?: string | null): Date {
  if (graceUntil) return new Date(`${graceUntil}T12:00:00`);
  return monthEnd(cycle);
}

export interface CycleStatusInput {
  cycle: CycleRef;
  submittedAt?: string | null;
  closedAt?: string | null;
  defectsIdentified?: boolean;
  defectsRepaired?: boolean;
  graceUntil?: string | null;
  now?: Date;
}

/**
 * Single definition of a cycle's state, shared by the Vehicle Hub panel,
 * the overdue badge and the monthly summary.
 */
export function cycleStatus(input: CycleStatusInput): CycleStatus {
  const now = input.now ?? new Date();
  const { cycle } = input;

  if (input.closedAt) return 'closed';

  if (input.submittedAt) {
    const needsRepair = !!input.defectsIdentified && !input.defectsRepaired;
    return needsRepair ? 'submitted' : 'closed';
  }

  const start = new Date(cycle.year, cycle.month - 1, 1);
  const deadline = cycleDeadline(cycle, input.graceUntil);
  const endOfDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate(), 23, 59, 59);

  if (now < start) return 'upcoming';
  if (now > endOfDeadline) return 'overdue';
  if (input.graceUntil && now > new Date(cycle.year, cycle.month, 0, 23, 59, 59)) return 'grace';
  return 'due';
}

/** Whole days left before the deadline. Negative means days overdue. */
export function daysUntilDeadline(cycle: CycleRef, graceUntil?: string | null, now = new Date()): number {
  const deadline = cycleDeadline(cycle, graceUntil);
  const a = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  upcoming: 'Upcoming',
  due: 'Due this month',
  submitted: 'Awaiting repair documentation',
  closed: 'Closed',
  overdue: 'Overdue',
  grace: 'Grace period',
};

/** A unit is flagged not dispatch-eligible once its cycle is overdue (advisory badge). */
export function isDispatchBlocked(status: CycleStatus): boolean {
  return status === 'overdue';
}
