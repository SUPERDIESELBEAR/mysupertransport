import type { LoadStatus } from '@/lib/loadFormat';

/** Expected forward progression for a load. `factored` is optional: a directly
 *  billed load moves invoiced → paid. */
export const FORWARD_SEQUENCE: LoadStatus[] = [
  'available', 'covered', 'dispatched', 'in_transit', 'at_delivery', 'delivered',
  'pod_received', 'accessorials_approved', 'ready_to_invoice', 'invoiced',
  'factored', 'paid', 'settled', 'closed',
];

/** Reachable from any status; always destructive and always note-required. */
export const TERMINAL_STATUSES: LoadStatus[] = ['tonu', 'cancelled'];

/** Restricted to management/owner. */
export const BILLING_STATUSES: LoadStatus[] = ['invoiced', 'factored', 'paid', 'settled'];

export type TransitionKind = 'forward' | 'backward' | 'terminal' | 'override';

export function isTerminalStatus(status: LoadStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isBillingStatus(status: LoadStatus): boolean {
  return BILLING_STATUSES.includes(status);
}

/** Valid expected next step(s) for the current status. */
export function getNextStatuses(current: LoadStatus): LoadStatus[] {
  if (isTerminalStatus(current)) return [];
  if (current === 'invoiced') return ['factored', 'paid'];
  const i = FORWARD_SEQUENCE.indexOf(current);
  if (i < 0 || i === FORWARD_SEQUENCE.length - 1) return [];
  return [FORWARD_SEQUENCE[i + 1]];
}

/** forward = expected next step, backward = earlier stage, terminal = tonu/cancelled,
 *  override = a forward skip past one or more steps (or off-sequence move). */
export function classifyTransition(from: LoadStatus, to: LoadStatus): TransitionKind {
  if (isTerminalStatus(to)) return 'terminal';
  if (getNextStatuses(from).includes(to)) return 'forward';
  const f = FORWARD_SEQUENCE.indexOf(from);
  const t = FORWARD_SEQUENCE.indexOf(to);
  if (f < 0 || t < 0) return 'override';
  return t < f ? 'backward' : 'override';
}

/** Mirrors the server-side rule in public.update_load_status. */
export function requiresNote(from: LoadStatus, to: LoadStatus): boolean {
  if (to === 'paid' || to === 'settled') return true;
  return classifyTransition(from, to) !== 'forward';
}

export function noteReason(from: LoadStatus, to: LoadStatus): string | null {
  if (!requiresNote(from, to)) return null;
  if (to === 'tonu' || to === 'cancelled') return 'Terminal status changes require a written reason.';
  if (to === 'paid' || to === 'settled') return 'Settlement-affecting status changes always require a note.';
  const kind = classifyTransition(from, to);
  if (kind === 'backward') return 'Moving a load backward requires a written reason.';
  return 'Skipping one or more steps requires a written reason.';
}

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  forward: 'Forward — expected next step',
  backward: 'Backward — moving to an earlier stage',
  terminal: 'Terminal — ends the load lifecycle',
  override: 'Override — skips one or more steps',
};

/* ------------------------------------------------------------------ */
/* Edit tiers — mirrors public.update_load_with_stops                   */
/* ------------------------------------------------------------------ */

/** Money has been billed out: financial fields are locked to everyone but the owner. */
export const FINANCIALLY_LOCKED_STATUSES: LoadStatus[] = [
  'invoiced', 'factored', 'paid', 'settled', 'closed',
];

/** Invoicing is imminent: financial fields stay open but the user is warned. */
export const FINANCIALLY_SENSITIVE_STATUSES: LoadStatus[] = [
  'accessorials_approved', 'ready_to_invoice',
];

export type FinancialEditTier = 'open' | 'warn' | 'locked';

export function financialEditTier(status: LoadStatus): FinancialEditTier {
  if (FINANCIALLY_LOCKED_STATUSES.includes(status)) return 'locked';
  if (FINANCIALLY_SENSITIVE_STATUSES.includes(status)) return 'warn';
  return 'open';
}
