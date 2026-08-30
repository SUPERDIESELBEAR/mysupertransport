/**
 * Pure ladder math for the §2 ELD malfunction escalation job.
 *
 * Two clocks, deliberately kept separate:
 *
 *  1. REPAIR CLOCK — the ladder rungs ("day N of 8"). Counted from
 *     `discovered_at` rendered as a calendar date in the carrier's home
 *     terminal timezone; the discovery date is day 1. Same basis Stage 1 used
 *     for `repair_deadline = discovered_at::date + 8`, so the console's
 *     deadline and the job's rung can never name different dates.
 *
 *  2. EXTENSION WINDOW — 49 CFR 395.34(d)(2) gives the carrier 5 days from the
 *     DRIVER'S NOTIFICATION, not from discovery. Notification is when the
 *     event row was written, so this clock keys on `created_at`. On a report
 *     backdated up to MAX_BACKDATE_HOURS (48) the two differ by up to two days
 *     and the regulation follows `created_at`.
 *
 * Backdating also means an event's FIRST evaluation can already be past
 * several rungs. `evaluateEvent` fires only the CURRENT rung (plus the
 * extension prompt while its window is open); skipped rungs are reported in
 * `skippedRungs` for the email body rather than sent. A report backdated 48
 * hours produces one rung email, not five.
 */

/** Rungs of the 8-day repair window that produce a send. */
export const LADDER_RUNGS = [3, 5, 6, 7, 8] as const;

/**
 * Past-deadline cadence.
 *
 * A blown repair window used to fire an escalation EVERY day, forever — an open
 * event with nobody working it turns into a permanent daily mail to every
 * compliance recipient, which is how a real notice stops being read. The event
 * is still open, still red in the console, and still in the daily digest; only
 * the per-event email is capped: day 9 (the loud one), then weekly, then quiet.
 */
export const PAST_DEADLINE_INTERVAL_DAYS = 7;
export const PAST_DEADLINE_LAST_DAY = 23;

/** True on day 9, 16, 23 — and on nothing after that. */
export function isPastDeadlineSendDay(day: number): boolean {
  if (day < 9 || day > PAST_DEADLINE_LAST_DAY) return false;
  return (day - 9) % PAST_DEADLINE_INTERVAL_DAYS === 0;
}


/** 395.34(d)(2): five days from the driver's notification to file. */
export const EXTENSION_WINDOW_DAYS = 5;

/** ack_overdue fires at these elapsed hours and then stops. */
export const ACK_OVERDUE_HOURS = [24, 72] as const;

/** Driver-facing in-app sends are held outside these local hours. */
export const DRIVER_QUIET_HOURS = { startHour: 7, endHour: 21 } as const;

export type EscalationKind =
  | 'escalation_day'
  | 'ack_overdue'
  | 'extension_prompt'
  | 'pause_lapsed';

export interface LadderEvent {
  id: string;
  discovered_at: string;
  created_at: string;
  status: string;
  carrier_acknowledged_at: string | null;
  extension_granted_at: string | null;
  /** `YYYY-MM-DD`; the extended repair date recorded with the grant. */
  extension_expires_on?: string | null;
  escalations_suppressed_until: string | null;
  escalations_suppressed_reason: string | null;
}

export interface LadderAction {
  kind: EscalationKind;
  /** null for ack_overdue and pause_lapsed — the dedupe constraint is NULLS NOT DISTINCT. */
  dayNumber: number | null;
  reason: string;
  /** Rungs that elapsed before the event existed; reported, never sent. */
  skippedRungs?: number[];
}

/** `YYYY-MM-DD` for an instant as seen in `timeZone`. */
export function zonedDateKey(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Local wall-clock hour (0-23) of an instant in `timeZone`. */
export function zonedHour(instant: Date | string, timeZone: string): number {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(d),
  ) % 24;
}

function dateKeyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days between two `YYYY-MM-DD` keys. */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtcMs(toKey) - dateKeyToUtcMs(fromKey)) / 86400000);
}

/**
 * 1-based day of the repair window, counted in the home terminal timezone.
 * The discovery date is day 1, so day 8 is `repair_deadline`.
 */
export function repairDayInZone(discoveredAt: string, now: Date, timeZone: string): number {
  const start = zonedDateKey(discoveredAt, timeZone);
  const today = zonedDateKey(now, timeZone);
  return Math.max(1, calendarDaysBetween(start, today) + 1);
}

/** Hours elapsed since the driver notified the carrier (`created_at`). */
export function hoursSinceNotification(createdAt: string, now: Date): number {
  return (now.getTime() - new Date(createdAt).getTime()) / 3600000;
}

/** The extension window runs from notification, not discovery. */
export function extensionWindowOpen(createdAt: string, now: Date): boolean {
  return hoursSinceNotification(createdAt, now) <= EXTENSION_WINDOW_DAYS * 24;
}

export function isPaused(event: LadderEvent, now: Date, timeZone: string): boolean {
  if (!event.escalations_suppressed_until) return false;
  return event.escalations_suppressed_until >= zonedDateKey(now, timeZone);
}

/**
 * True only on the FIRST local day after the pause expired.
 *
 * A plain `until < today` is true forever, which would re-announce the lapse
 * every day (the ledger key includes `sent_on`, so a daily re-fire is not
 * deduped) and — since the lapse run skips rung evaluation — would suppress
 * the ladder permanently. The lapse is a one-day event: announced on the day
 * the pause ends, after which the event is simply unpaused again.
 */
export function pauseJustLapsed(event: LadderEvent, now: Date, timeZone: string): boolean {
  if (!event.escalations_suppressed_until) return false;
  return calendarDaysBetween(event.escalations_suppressed_until, zonedDateKey(now, timeZone)) === 1;
}

/**
 * A recorded extension holds the rung ladder until the extended date passes.
 *
 * Without this the console can show "extension granted" while the job keeps
 * sending day-9 past-deadline escalations every hour — a disagreement a staff
 * member sees and does not believe. `extension_granted_at` is the single field
 * both sides read; `extension_expires_on` only says when the hold ends. A grant
 * with no recorded date holds indefinitely, which is the safe direction: the
 * carrier has an extension on file.
 */
export function extensionHolds(event: LadderEvent, now: Date, timeZone: string): boolean {
  if (!event.extension_granted_at) return false;
  if (!event.extension_expires_on) return true;
  return event.extension_expires_on >= zonedDateKey(now, timeZone);
}

export function driverQuietHoursOk(now: Date, timeZone: string): boolean {
  const h = zonedHour(now, timeZone);
  return h >= DRIVER_QUIET_HOURS.startHour && h < DRIVER_QUIET_HOURS.endHour;
}

/**
 * Decides what a single open event owes today. Callers still dedupe through
 * `eld_malfunction_notifications`; this function is only the "what is due".
 */
export function evaluateEvent(
  event: LadderEvent,
  now: Date,
  timeZone: string,
): { day: number; actions: LadderAction[] } {
  const day = repairDayInZone(event.discovered_at, now, timeZone);
  const actions: LadderAction[] = [];

  // Resolved / closed events owe nothing at all — including ack_overdue.
  if (event.status !== 'open') return { day, actions };

  const hours = hoursSinceNotification(event.created_at, now);
  const acknowledged = !!event.carrier_acknowledged_at;
  const extensionGranted = !!event.extension_granted_at;

  // ack_overdue can never be paused: a notice nobody has looked at is the one
  // thing a pause must not hide. It fires at 24h and again at 72h, then stops
  // and lets the daily digest carry it. Acknowledgment, resolve, or a granted
  // extension each end it immediately.
  if (!acknowledged && !extensionGranted) {
    const rung = ACK_OVERDUE_HOURS.find((h) => hours >= h && hours < h + 24);
    if (rung !== undefined) {
      actions.push({
        kind: 'ack_overdue',
        dayNumber: null,
        reason: `no acknowledgment ${rung} hours after the driver reported it`,
      });
    }
  }

  if (isPaused(event, now, timeZone)) return { day, actions };

  if (pauseJustLapsed(event, now, timeZone)) {
    actions.push({
      kind: 'pause_lapsed',
      dayNumber: null,
      reason: `escalation pause ended ${event.escalations_suppressed_until}`,
    });
    // The lapse is its own event. Firing the current rung in the same run turns
    // the moment a pause lifts into the loudest run the ladder produces — on a
    // long pause, the lapse notice plus a past-deadline rung in the same minute,
    // reading as though the pause did nothing. Evaluation resumes on the next
    // hourly pass; one hour on an event deliberately quiet for days is not a
    // compliance risk.
    return { day, actions };
  }

  // Rungs. Only the current one — a backdated report must not fan out.
  const isRung = (LADDER_RUNGS as readonly number[]).includes(day) || isPastDeadlineSendDay(day);
  if (isRung && !extensionHolds(event, now, timeZone)) {
    const firstEvaluatedDay = repairDayInZone(
      event.discovered_at,
      new Date(event.created_at),
      timeZone,
    );
    const skipped = LADDER_RUNGS.filter((r) => r < firstEvaluatedDay);
    actions.push({
      kind: 'escalation_day',
      dayNumber: day,
      reason: day >= 9
        ? `repair deadline passed — day ${day}`
        : `day ${day} of 8 of the repair window`,
      skippedRungs: skipped.length ? [...skipped] : undefined,
    });
  }

  // The day-3 extension prompt. Keyed on created_at, offered once while the
  // filing window is open, dropped the moment an extension exists.
  if (day >= 3 && !extensionGranted && extensionWindowOpen(event.created_at, now)) {
    actions.push({
      kind: 'extension_prompt',
      dayNumber: null,
      reason: 'the 5-day window to file a 395.34(d)(2) extension is still open',
    });
  }

  return { day, actions };
}
