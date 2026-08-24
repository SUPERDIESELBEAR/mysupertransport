/**
 * The agreed trailer use window on a loadout, and where it came from.
 *
 * Rolling River prints no window at all, so the dates are inferred from the
 * pickup and delivery dates on the document. That is a reasonable inference for
 * a trailer relocation and it is still an inference — the broker never stated
 * it. So the provenance travels with the load (`loadout_use_window_source`)
 * rather than living only in the parse session, and the note is shown wherever
 * the window is shown.
 *
 * The DATES are the record. The day count is informational: "eight days
 * inclusive" and "the 17th through the 24th" are not reliably the same thing to
 * a broker on the phone, and an authoritative-looking count that is off by one
 * is worse than no count. A count printed on the document is authoritative; a
 * derived one says how it was counted.
 */

export type UseWindowSource = 'document' | 'derived';

export const DERIVED_USE_WINDOW_NOTE =
  'Derived from the pickup and delivery dates on the document — confirm with the broker.';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The date half of a `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` value. */
export function datePart(v: string | null | undefined): string {
  const m = DATE_ONLY.exec(String(v ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Noon-anchored, per the project date rule — never parsed at local midnight. */
const asDate = (d: string): Date | null => {
  const p = datePart(d);
  if (!p) return null;
  const t = new Date(`${p}T12:00:00`);
  return Number.isNaN(t.getTime()) ? null : t;
};

/** Inclusive day count: 08/17 through 08/24 is 8 days. */
export function inclusiveDays(start: string, end: string): number | null {
  const a = asDate(start);
  const b = asDate(end);
  if (!a || !b) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  return days >= 1 ? days : null;
}

export interface DerivedUseWindow {
  start: string;
  end: string;
  days: number | null;
}

/**
 * The window implied by the stops: earliest appointment date through the latest.
 * Returns null unless both ends are actually present — no dates, no guess.
 */
export function deriveUseWindowFromStops(
  stops: { appointment_start?: string | null; appointment_end?: string | null }[] | null | undefined,
): DerivedUseWindow | null {
  const dates = (stops ?? [])
    .flatMap(s => [datePart(s.appointment_start), datePart(s.appointment_end)])
    .filter(Boolean)
    .sort();
  if (dates.length < 2) return null;
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (start === end) return null;
  return { start, end, days: inclusiveDays(start, end) };
}

const MDY = (d: string): string => {
  const p = datePart(d);
  if (!p) return '';
  const [y, m, dd] = p.split('-');
  return `${Number(m)}/${Number(dd)}/${y}`;
};

const ORDINAL = (d: string): string => {
  const p = datePart(d);
  if (!p) return '';
  const n = Number(p.split('-')[2]);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
    : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

/** `8/17/2026 – 8/24/2026`, or '' when neither end is set. */
export function formatUseWindow(start: string | null | undefined, end: string | null | undefined): string {
  const a = MDY(String(start ?? ''));
  const b = MDY(String(end ?? ''));
  if (!a && !b) return '';
  return `${a || '—'} – ${b || '—'}`;
}

export interface DayCountReport {
  /** What to show next to the dates. Empty when there is nothing to say. */
  text: string;
  /** True when a stated day count and the stated dates do not agree. */
  disagrees: boolean;
}

/**
 * The day count, described rather than asserted. When the document states a
 * count AND dates that imply a different one, both are reported — neither wins
 * silently.
 */
export function describeDayCount(args: {
  statedDays?: string | number | null;
  start?: string | null;
  end?: string | null;
}): DayCountReport {
  const stated = args.statedDays === null || args.statedDays === undefined || args.statedDays === ''
    ? null
    : Number(args.statedDays);
  const start = datePart(args.start);
  const end = datePart(args.end);
  const implied = start && end ? inclusiveDays(start, end) : null;

  if (stated !== null && Number.isFinite(stated)) {
    if (implied !== null && implied !== stated) {
      return {
        text: `${stated} days stated on the document, but the dates cover ${implied} days `
          + `(${ORDINAL(start)} through ${ORDINAL(end)}, inclusive). Both are shown as read — confirm which the broker meant.`,
        disagrees: true,
      };
    }
    return { text: `${stated} days`, disagrees: false };
  }

  if (implied !== null) {
    return {
      text: `${implied} days (${ORDINAL(start)} through ${ORDINAL(end)}, inclusive)`,
      disagrees: false,
    };
  }
  return { text: '', disagrees: false };
}
