/**
 * Single source of truth for the 49 CFR 395.8(g) duty-status grid geometry.
 *
 * Used by three renderers that MUST stay visually identical:
 *   1. the on-screen SVG grid (`RodsGrid`)
 *   2. the certified-day PDF (`renderRodsDay`)
 *   3. the blank 8-day paper packet (`renderDutyStatusGrid`)
 *
 * Two implementations would drift, and a driver's printed blank sheet has to
 * line up with the certified log produced from it. Change the numbers here and
 * nowhere else.
 */

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 36;
/** Width reserved at the left for the four status-line labels. */
export const LABEL_W = 96;
/** Width reserved at the right for the per-status totals column. */
export const TOTALS_W = 54;
/** Height of one duty-status row. */
export const ROW_H = 26;

export const GRID_X = MARGIN + LABEL_W;
export const GRID_W = PAGE_W - MARGIN * 2 - LABEL_W - TOTALS_W;
export const GRID_H = ROW_H * 4;

export const STATUS_LINES = [
  '1. Off duty',
  '2. Sleeper berth',
  '3. Driving',
  '4. On duty (not driving)',
] as const;

export const STATUS_SHORT = ['Off duty', 'Sleeper', 'Driving', 'On duty'] as const;

export type DutyStatusLine = 1 | 2 | 3 | 4;

export const MINUTES_PER_DAY = 1440;

/** Hour tick label: M at midnight, N at noon, 1–11 otherwise. */
export function hourLabel(h: number): string {
  if (h === 0 || h === 24) return 'M';
  if (h === 12) return 'N';
  return String(h % 12 === 0 ? 12 : h % 12);
}

/** A tick is a "major" (heavier) rule every 6 hours. */
export function isMajorHour(h: number): boolean {
  return h % 6 === 0;
}

/** Horizontal offset, in grid units, of a given minute of the day. */
export function minuteToX(minute: number, gridWidth: number = GRID_W): number {
  return (minute / MINUTES_PER_DAY) * gridWidth;
}

/** Width of one hour column. */
export function hourWidth(gridWidth: number = GRID_W): number {
  return gridWidth / 24;
}

/** Center line of a duty-status row, measured downward from the grid top. */
export function rowCenterOffset(line: DutyStatusLine): number {
  return ROW_H * (line - 1) + ROW_H / 2;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatClock(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (minute >= MINUTES_PER_DAY) return 'Midnight';
  return `${h12}:${mm} ${suffix}`;
}