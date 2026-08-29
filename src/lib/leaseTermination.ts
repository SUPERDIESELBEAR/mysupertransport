/**
 * LEASE TERMINATION — pure guardrail helpers.
 *
 * Nine rows were created in three weeks by one person who believed she was
 * recording a status. These helpers encode the two checks that would have
 * caught it: a typed-name confirmation, and a hard warning when the operator
 * still looks like an actively working driver.
 */

export const TERMINATION_REASONS = ['voluntary', 'mutual', 'cause'] as const;
export type TerminationReason = (typeof TERMINATION_REASONS)[number];

const REASON_LABELS: Record<TerminationReason, string> = {
  voluntary: 'Contractor ended the agreement (voluntary)',
  mutual: 'Both parties released the agreement (mutual)',
  cause: 'Carrier ended the agreement for cause',
};

export function terminationReasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'No legal ground recorded';
  return REASON_LABELS[reason as TerminationReason] ?? reason;
}

export function isTerminationReason(value: unknown): value is TerminationReason {
  return typeof value === 'string' && (TERMINATION_REASONS as readonly string[]).includes(value);
}

/**
 * Typed-name confirmation. Case- and whitespace-insensitive so it is friction,
 * not a typing test — but a different name never proceeds.
 */
export function nameMatches(typed: string, fullName: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const target = norm(fullName);
  if (!target) return false;
  return norm(typed) === target;
}

export interface ActiveDriverSignals {
  isActive: boolean;
  excludedFromDispatch: boolean;
  /** 'dispatched' | 'home' | 'truck_down' | 'not_dispatched' | null */
  dispatchStatus?: string | null;
  /** Any dispatch log activity in the recent window. */
  hasRecentDispatchActivity?: boolean;
}

/**
 * The exact shape all six mistaken rows had: active, not excluded, and still
 * showing dispatch activity.
 */
export function looksActivelyWorking(s: ActiveDriverSignals): boolean {
  if (!s.isActive) return false;
  if (s.excludedFromDispatch) return false;
  return s.hasRecentDispatchActivity === true || s.dispatchStatus === 'dispatched';
}

export function formatTerminationDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
