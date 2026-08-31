/**
 * DEPARTING STATE — pure helpers.
 *
 * Departing means: this driver may be leaving. It is a suspicion, recorded
 * early, and it is REVERSIBLE without ceremony — drivers change their minds,
 * and if un-flagging were awkward nobody would flag early, which is exactly
 * when the flag is useful.
 *
 * It is the counterpart to parked, and deliberately NOT any of these:
 *  - `lease_terminations` — a legal end of the ICA and a document sent to the
 *    insurer. Six rows were written there in error because no departing concept
 *    existed. This is the legitimate control for that intent.
 *  - `operators.is_active` / `excluded_from_dispatch` — eligibility.
 *  - `active_dispatch.dispatch_status` — a day status.
 *
 * A departing driver stays ACTIVE, DISPATCHABLE and SETTLING. The flag changes
 * settlement BEHAVIOUR (it is one input to the hold test), never eligibility.
 *
 * It is never shown to the driver. Nothing in the operator portal reads it.
 */

export interface DepartingState {
  is_departing?: boolean | null;
  departing_note?: string | null;
  departing_expected_date?: string | null;
  departing_at?: string | null;
}

export function isDeparting(op: DepartingState | null | undefined): boolean {
  return op?.is_departing === true;
}

/** Noon-anchored so a date-only value never drifts a day in local time. */
export function formatDepartingDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One line for badges and tooltips: "expected Sep 12, 2026". */
export function departingSummary(op: DepartingState | null | undefined): string | null {
  if (!isDeparting(op)) return null;
  const when = formatDepartingDate(op?.departing_expected_date);
  return when ? `expected ${when}` : 'no expected date';
}

/**
 * Flagging costs nothing and needs no justification — a required reason is the
 * friction that stops people flagging early. A note is welcome, never demanded.
 */
export function canSubmitDeparting(): boolean {
  return true;
}

export type DepartingAction = 'flagged' | 'cleared';

export interface DepartingEvent {
  id: string;
  action: string;
  note: string | null;
  expected_date: string | null;
  changed_at: string;
  changed_by: string | null;
}

export function departingActionLabel(action: string): string {
  if (action === 'flagged') return 'Flagged as departing';
  if (action === 'cleared') return 'Departing cleared';
  return action;
}

/**
 * Clearing CLOSES an episode; it never erases one. A cleared driver still has
 * every event on file.
 */
export function episodeCount(events: Pick<DepartingEvent, 'action'>[]): number {
  return events.filter(e => e.action === 'flagged').length;
}
