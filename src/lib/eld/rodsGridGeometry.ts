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
/**
 * Width reserved at the left for the four status-line labels, in the same
 * units as the grid itself. Every renderer derives its label column from this
 * one number — a renderer that picks its own width will not line up with the
 * printed sheet.
 */
export const LABEL_GUTTER_W = 96;
/** Width reserved at the right for the per-status totals column. */
export const TOTALS_W = 54;
/** Height of one duty-status row. */
export const ROW_H = 26;

export const GRID_X = MARGIN + LABEL_GUTTER_W;
export const GRID_W = PAGE_W - MARGIN * 2 - LABEL_GUTTER_W - TOTALS_W;
export const GRID_H = ROW_H * 4;

export const STATUS_LINES = [
  '1. Off duty',
  '2. Sleeper berth',
  '3. Driving',
  '4. On duty (not driving)',
] as const;

/**
 * The same four labels, pre-wrapped for the label gutter. Shrinking the font to
 * fit would make the sheet harder to read at the roadside, so the long ones
 * wrap onto two lines instead. Renderers center a multi-line label on the row
 * so the duty line still sits on rowCenterOffset.
 */
export const STATUS_LABEL_LINES: readonly (readonly string[])[] = [
  ['1. OFF DUTY'],
  ['2. SLEEPER', 'BERTH'],
  ['3. DRIVING'],
  ['4. ON DUTY', '(NOT DRIVING)'],
] as const;

export const STATUS_SHORT = ['Off duty', 'Sleeper', 'Driving', 'On duty'] as const;

export type DutyStatusLine = 1 | 2 | 3 | 4;

/**
 * The one place a duty-status number becomes words. Three surfaces used to
 * spell these out independently; a driver reading "On duty" in the app and
 * "4. On duty (not driving)" on the print must be reading the same thing.
 */
export function dutyStatusLabel(line: DutyStatusLine | null | undefined): string {
  if (!line) return 'No duty status';
  return STATUS_SHORT[line - 1];
}

export const MINUTES_PER_DAY = 1440;

/** Hour tick label: MID at midnight, NOON at noon, 1–11 otherwise. */
export function hourLabel(h: number): string {
  if (h === 0 || h === 24) return 'MID';
  if (h === 12) return 'NOON';
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