/**
 * Detention TERMS as the rate confirmation states them.
 *
 * NULL means NOT STATED, and that is information. There is no default free
 * time, rate, cap or clock start anywhere in this file: two hours free is an
 * industry convention, not a contract term, and a rate con silent on detention
 * means detention was never agreed. Showing a default would fabricate an
 * agreement and send a dispatcher into a chase he cannot win.
 *
 * Nothing here computes. No eligible hours, no dollar estimate, no comparison
 * against a recorded arrival. The terms are reference material for a
 * negotiation, exactly as the claim record is a log of one.
 */

export type DetentionClockStart = 'appointment' | 'arrival' | 'gate_checkin';

export const DETENTION_CLOCK_STARTS: DetentionClockStart[] = [
  'appointment', 'arrival', 'gate_checkin',
];

/**
 * Plain words, not the enum key. These are three genuinely different moments
 * and can differ by 30–90 minutes; which one governs varies by broker.
 */
export const DETENTION_CLOCK_START_LABELS: Record<DetentionClockStart, string> = {
  appointment: 'Clock starts at the scheduled appointment',
  arrival: "Clock starts at the driver's actual arrival",
  gate_checkin: 'Clock starts at gate check-in',
};

/** The short form used inside a select. */
export const DETENTION_CLOCK_START_OPTION_LABELS: Record<DetentionClockStart, string> = {
  appointment: 'Scheduled appointment',
  arrival: 'Driver arrival',
  gate_checkin: 'Gate check-in',
};

export interface DetentionTerms {
  freeTimeMinutes: number | null;
  ratePerHour: number | null;
  dailyCap: number | null;
  clockStart: DetentionClockStart | null;
  notificationRequired: boolean | null;
  note: string | null;
}

export const EMPTY_DETENTION_TERMS: DetentionTerms = {
  freeTimeMinutes: null,
  ratePerHour: null,
  dailyCap: null,
  clockStart: null,
  notificationRequired: null,
  note: null,
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool = (v: unknown): boolean | null => {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
};

const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s === '' ? null : s;
};

/** Reads the terms off a load row. Anything absent stays null. */
export function readDetentionTerms(load: unknown): DetentionTerms {
  const l = (load ?? {}) as Record<string, unknown>;
  const clock = str(l.detention_clock_start);
  return {
    freeTimeMinutes: num(l.detention_free_time_minutes),
    ratePerHour: num(l.detention_rate_per_hour),
    dailyCap: num(l.detention_daily_cap),
    clockStart: DETENTION_CLOCK_STARTS.includes(clock as DetentionClockStart)
      ? (clock as DetentionClockStart)
      : null,
    notificationRequired: bool(l.detention_notification_required),
    note: str(l.detention_terms_note),
  };
}

/** True when the rate confirmation stated anything at all about detention. */
export function hasAnyDetentionTerms(t: DetentionTerms): boolean {
  return t.freeTimeMinutes !== null
    || t.ratePerHour !== null
    || t.dailyCap !== null
    || t.clockStart !== null
    || t.notificationRequired !== null
    || t.note !== null;
}

/** Minutes, said as minutes. Never rounded into a convenient "2 hours". */
export function freeTimeLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  return m === 0 ? `${minutes} minutes (${hours})` : `${minutes} minutes (${hours} ${m} min)`;
}

export function notificationLabel(required: boolean | null): string | null {
  if (required === null) return null;
  return required
    ? 'Broker must be notified'
    : 'No notification required by these terms';
}

/**
 * Part C: the only actionable signal in this pass. A prompt, never a block —
 * it does not gate any status transition and it notifies nothing.
 *
 * Silent when the requirement is not stated: absence of a stated requirement is
 * not permission to skip notifying, and the system does not know either way.
 */
export function needsNotificationPrompt(
  terms: DetentionTerms,
  claim: { broker_notified_at: string | null; status: string },
): boolean {
  if (terms.notificationRequired !== true) return false;
  if (claim.broker_notified_at) return false;
  return !['resolved_revision', 'denied', 'abandoned'].includes(claim.status);
}

/* ------------------------------------------------------------------ */
/* Provenance: was this number read off the document, or typed?        */
/* ------------------------------------------------------------------ */

/**
 * Where a stated term came from. A dispatcher arguing a detention claim with a
 * broker needs to know whether the number was read off the rate confirmation or
 * typed by a colleague, and the two carry very different weight on a phone call.
 *
 * `unknown` is a real answer and is said out loud rather than guessed at: loads
 * created before this pass carry no record either way, and labelling those
 * "from the rate confirmation" would be exactly the invention this module
 * exists to avoid.
 */
export type DetentionTermSource = 'parse' | 'revision' | 'manual' | 'unknown';

export const DETENTION_SOURCE_LABELS: Record<DetentionTermSource, string> = {
  parse: 'Read from the rate confirmation',
  revision: 'From a revised rate confirmation',
  manual: 'Entered by hand',
  unknown: 'Source not recorded',
};

export type DetentionTermKey =
  | 'freeTimeMinutes' | 'ratePerHour' | 'dailyCap' | 'clockStart'
  | 'notificationRequired' | 'note';

/** Form/column path each term is stored and audited under. */
export const DETENTION_FIELD_PATHS: Record<DetentionTermKey, string> = {
  freeTimeMinutes: 'detention_free_time_minutes',
  ratePerHour: 'detention_rate_per_hour',
  dailyCap: 'detention_daily_cap',
  clockStart: 'detention_clock_start',
  notificationRequired: 'detention_notification_required',
  note: 'detention_terms_note',
};

export interface DetentionHistoryEntry {
  field_path: string;
  reason: string | null;
  changed_at: string;
}

/** A revision save stamps its reason; `buildRevisionReason` writes this prefix. */
const REVISION_REASON = /^revised rate confirmation/i;

/**
 * Per-field provenance, derived from the load's own change trail.
 *
 * No column stores this. A field with an edit row was last written by a person
 * (or by a dispatcher accepting a revised document, which the reason text names);
 * a field with no edit row still holds what the load was created with, which is
 * the parse when the load was created from a parsed document.
 */
export function detentionTermSources(
  history: DetentionHistoryEntry[],
  createdFromParse: boolean,
): Record<DetentionTermKey, DetentionTermSource> {
  const latest = new Map<string, DetentionHistoryEntry>();
  history.forEach(h => {
    const prev = latest.get(h.field_path);
    if (!prev || h.changed_at > prev.changed_at) latest.set(h.field_path, h);
  });

  const out = {} as Record<DetentionTermKey, DetentionTermSource>;
  (Object.keys(DETENTION_FIELD_PATHS) as DetentionTermKey[]).forEach(key => {
    const row = latest.get(DETENTION_FIELD_PATHS[key]);
    if (row) {
      out[key] = REVISION_REASON.test((row.reason ?? '').trim()) ? 'revision' : 'manual';
      return;
    }
    out[key] = createdFromParse ? 'parse' : 'unknown';
  });
  return out;
}
