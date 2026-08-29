/**
 * PARKED STATE — pure helpers.
 *
 * Parked means: still under contract, still active, equipment still assigned,
 * settlements still run — just not taking loads for a defined stretch.
 *
 * It is deliberately SEPARATE from `active_dispatch.dispatch_status` (a day
 * status, rewritten nightly by the rollover cron), from
 * `operators.excluded_from_dispatch` (an administrative hide, meaning "gone"),
 * and from `lease_terminations` (a legal end of the ICA).
 *
 * One writer per state: parking never writes dispatch_status, and the nightly
 * rollover skips parked drivers rather than carrying their last status forward.
 */

export const PARKED_REASONS = [
  'truck_down',
  'vacation',
  'personal_time_off',
  'medical',
  'other',
] as const;

export type ParkedReason = (typeof PARKED_REASONS)[number];

const REASON_LABELS: Record<ParkedReason, string> = {
  truck_down: 'Truck down',
  vacation: 'Vacation',
  personal_time_off: 'Personal time off',
  medical: 'Medical',
  other: 'Other',
};

export function parkedReasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'No reason recorded';
  return REASON_LABELS[reason as ParkedReason] ?? reason;
}

export function isParkedReason(value: unknown): value is ParkedReason {
  return typeof value === 'string' && (PARKED_REASONS as readonly string[]).includes(value);
}

/** `other` must carry a note; every reason must be chosen deliberately. */
export function canSubmitPark(reason: string | null, note: string): boolean {
  if (!isParkedReason(reason)) return false;
  if (reason === 'other') return note.trim().length > 0;
  return true;
}

export interface ParkedState {
  is_parked?: boolean | null;
  parked_reason?: string | null;
  parked_note?: string | null;
  parked_expected_return?: string | null;
}

export function isParked(op: ParkedState | null | undefined): boolean {
  return op?.is_parked === true;
}

/** Noon-anchored so a date-only value never drifts a day in local time. */
export function formatParkedReturn(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One line for badges and tooltips: "Parked — Truck down · back Sep 8, 2026". */
export function parkedSummary(op: ParkedState | null | undefined): string | null {
  if (!isParked(op)) return null;
  const parts = [parkedReasonLabel(op?.parked_reason)];
  const back = formatParkedReturn(op?.parked_expected_return);
  parts.push(back ? `back ${back}` : 'return date unknown');
  return parts.join(' · ');
}

/**
 * Nightly rollover rule. A parked driver's last day status must NOT be carried
 * forward — three weeks parked would otherwise read as three weeks dispatched.
 */
export function shouldRollForward(op: { excluded_from_dispatch?: boolean | null } & ParkedState): boolean {
  if (op.excluded_from_dispatch === true) return false;
  return !isParked(op);
}
