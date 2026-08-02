/**
 * Readers for `eld_malfunction_notifications` — the §2 escalation ledger.
 *
 * `day_number` does NOT mean the same thing for every row, and reading it
 * without filtering on `notification_type` is a correctness bug:
 *
 *  - `escalation_day`   — day_number IS the rung (1-8) of the repair window.
 *  - `extension_prompt` — the one-time prompt. day_number, when present, is the
 *                         day the prompt happened to fire, NOT a rung.
 *  - `ack_overdue`      — day_number is NULL. The 24h/72h step lives in the
 *                         notification's reason text.
 *
 * Anything answering "which rungs have fired" must go through `rungRows`.
 */
export interface LedgerRow {
  notification_type: string;
  day_number: number | null;
  is_override?: boolean | null;
  [k: string]: unknown;
}

/** The rungs the job sends on — mirrors LADDER_RUNGS in the shared job module. */
export const LADDER_RUNGS_UI = [3, 5, 6, 7, 8] as const;

/** Rows that actually represent a rung of the 8-day repair ladder. */
export function rungRows<T extends LedgerRow>(rows: T[]): T[] {
  return rows.filter((r) => r.notification_type === 'escalation_day' && r.day_number != null);
}

/** The rung numbers that have fired, ascending and deduped. */
export function firedRungs(rows: LedgerRow[]): number[] {
  return Array.from(new Set(rungRows(rows).map((r) => r.day_number as number))).sort((a, b) => a - b);
}

/**
 * Evidence rows only. Override runs (time-travelled or channel-forced) are
 * verification artifacts and must never be counted as proof the office was
 * notified on time.
 */
export function evidenceRows<T extends LedgerRow>(rows: T[]): T[] {
  return rows.filter((r) => r.is_override !== true);
}
