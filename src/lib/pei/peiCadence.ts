/**
 * Pure helpers for the PEI automatic follow-up cadence.
 *
 * The cadence sends a reminder every `interval` days after the initial send,
 * and files a Good Faith Effort once `gfeDay` days have passed. Both numbers
 * are company settings; these helpers hold the arithmetic so the edge function
 * and the UI agree on what is scheduled.
 */

export interface PEICadenceSettings {
  auto_follow_ups_enabled: boolean;
  follow_up_interval_days: number;
  gfe_after_days: number;
}

export const DEFAULT_PEI_CADENCE: PEICadenceSettings = {
  auto_follow_ups_enabled: true,
  follow_up_interval_days: 5,
  gfe_after_days: 30,
};

export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 15;
export const GFE_MIN = 7;
export const GFE_MAX = 60;

/** Reminder days after the initial send, strictly before the GFE day. */
export function milestonesFor(interval: number, gfeDay: number): number[] {
  if (!Number.isFinite(interval) || !Number.isFinite(gfeDay)) return [];
  if (interval < INTERVAL_MIN || gfeDay <= interval) return [];
  const out: number[] = [];
  for (let d = interval; d < gfeDay; d += interval) out.push(d);
  return out;
}

/** Human-readable validation error, or null when the pair is acceptable. */
export function validateCadence(interval: number, gfeDay: number): string | null {
  if (!Number.isInteger(interval) || interval < INTERVAL_MIN || interval > INTERVAL_MAX) {
    return `Follow up every ${INTERVAL_MIN}–${INTERVAL_MAX} days.`;
  }
  if (!Number.isInteger(gfeDay) || gfeDay < GFE_MIN || gfeDay > GFE_MAX) {
    return `File the Good Faith Effort after ${GFE_MIN}–${GFE_MAX} days.`;
  }
  if (gfeDay <= interval) {
    return 'The Good Faith Effort day must be later than the follow-up interval.';
  }
  return null;
}

/** Next scheduled event for a request sent `daysSinceSent` days ago. */
export function nextCadenceEvent(
  daysSinceSent: number,
  settings: PEICadenceSettings,
): { day: number; kind: 'follow_up' | 'gfe' } | null {
  if (!settings.auto_follow_ups_enabled) return null;
  const next = milestonesFor(settings.follow_up_interval_days, settings.gfe_after_days)
    .find((m) => m > daysSinceSent);
  if (next !== undefined) return { day: next, kind: 'follow_up' };
  if (settings.gfe_after_days > daysSinceSent) return { day: settings.gfe_after_days, kind: 'gfe' };
  return null;
}
