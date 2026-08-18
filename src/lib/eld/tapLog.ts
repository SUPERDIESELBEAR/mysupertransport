/**
 * Tap-to-change boundary maths.
 *
 * ONE RULE: a status runs until the next tap. The day is therefore a tiling of
 * [0, 1440) with no holes and no overlaps, *by construction* — there is exactly
 * one boundary between any two statuses, so a boundary can only be in the wrong
 * place, never missing. That is what removes gap detection, the 'pending'
 * validation state and the 1440-minute arithmetic problem from the driver's
 * screen: the states they described cannot occur.
 *
 * Every function here takes a segment list and returns a new, re-tiled list.
 * Nothing in this file touches the network, Dexie or React.
 */
import { MINUTES_PER_DAY } from './rodsGridGeometry';
import { newLocalId, type DraftSegment } from '@/hooks/useRodsDay';

export type DutyStatus = 1 | 2 | 3 | 4;

export interface TapLocation {
  city: string;
  state: string;
  remarks?: string;
}

/** Minute-of-day for a Date, clamped into the day. */
export function minuteOfDay(d: Date): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY - 1, d.getHours() * 60 + d.getMinutes()));
}

/**
 * Re-tile: sort by start, close each segment at the next one's start, close the
 * last at midnight, and drop anything that collapsed to zero length. Called at
 * the end of every mutation, so the invariant is restored in one place rather
 * than argued about at each call site.
 */
export function tile(list: DraftSegment[]): DraftSegment[] {
  const sorted = [...list].sort((a, b) => a.start_minute - b.start_minute);
  const out: DraftSegment[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    // Two changes stamped on the same minute: the later tap wins outright,
    // because the driver's second statement replaces the first.
    if (prev && prev.start_minute === s.start_minute) out.pop();
    out.push({ ...s });
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i].end_minute = i + 1 < out.length ? out[i + 1].start_minute : MINUTES_PER_DAY;
  }
  return out.filter((s) => (s.end_minute ?? 0) > s.start_minute);
}

/** True when the list is a complete, hole-free tiling of the 24 hours. */
export function isTiled(list: DraftSegment[]): boolean {
  if (!list.length) return false;
  const t = [...list].sort((a, b) => a.start_minute - b.start_minute);
  if (t[0].start_minute !== 0) return false;
  for (let i = 0; i < t.length; i += 1) {
    const expected = i + 1 < t.length ? t[i + 1].start_minute : MINUTES_PER_DAY;
    if (t[i].end_minute !== expected) return false;
  }
  return true;
}

export function totalMinutes(list: DraftSegment[]): number {
  return list.reduce((sum, s) => sum + Math.max(0, (s.end_minute ?? s.start_minute) - s.start_minute), 0);
}

export function segmentAt(list: DraftSegment[], minute: number): DraftSegment | null {
  return tile(list).find((s) => minute >= s.start_minute && minute < (s.end_minute ?? MINUTES_PER_DAY)) ?? null;
}

/** The status in force at the end of the day — what carries into tomorrow. */
export function statusAtMidnight(list: DraftSegment[]): DraftSegment | null {
  const t = tile(list);
  return t[t.length - 1] ?? null;
}

function makeSegment(startMinute: number, status: DutyStatus, loc: TapLocation): DraftSegment {
  return {
    localId: newLocalId(),
    start_minute: startMinute,
    end_minute: MINUTES_PER_DAY,
    duty_status: status,
    city: loc.city.trim(),
    state: loc.state.trim().toUpperCase(),
    remarks: (loc.remarks ?? '').trim(),
  };
}

/**
 * The tap. Stamps a change of status at `minute`, splitting whatever was
 * running. An empty day is opened at midnight with this status, because the
 * driver cannot have been in no status at all.
 */
export function tapStatus(
  list: DraftSegment[],
  minute: number,
  status: DutyStatus,
  loc: TapLocation,
): DraftSegment[] {
  const at = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minute)));
  if (!list.length) return tile([makeSegment(0, status, loc)]);
  return tile([...list, makeSegment(at, status, loc)]);
}

/** Insert a change the driver forgot to tap. Same operation as a tap; named for the UI. */
export const insertChange = tapStatus;

/**
 * Move a boundary. The change identified by `localId` moves to `minute`; the
 * status before it shortens or lengthens to match. Constrained so it cannot
 * cross the change before or after it — that is the only way a boundary can be
 * wrong, and the constraint keeps the tiling intact.
 */
export function moveBoundary(list: DraftSegment[], localId: string, minute: number): DraftSegment[] {
  const t = tile(list);
  const idx = t.findIndex((s) => s.localId === localId);
  // The first change owns midnight and cannot move: the day starts at 00:00.
  if (idx <= 0) return t;
  const lower = t[idx - 1].start_minute + 1;
  const upper = (t[idx + 1]?.start_minute ?? MINUTES_PER_DAY) - 1;
  const clamped = Math.max(lower, Math.min(upper, Math.round(minute)));
  return tile(t.map((s) => (s.localId === localId ? { ...s, start_minute: clamped } : s)));
}

/** The window a boundary may be moved within, for the correction screen. */
export function boundaryBounds(list: DraftSegment[], localId: string): { min: number; max: number } | null {
  const t = tile(list);
  const idx = t.findIndex((s) => s.localId === localId);
  if (idx <= 0) return null;
  return {
    min: t[idx - 1].start_minute + 1,
    max: (t[idx + 1]?.start_minute ?? MINUTES_PER_DAY) - 1,
  };
}

/**
 * Delete a change entered in error. The preceding status simply extends over
 * it. Deleting the first change of the day promotes the next one to midnight,
 * because the day must start somewhere.
 */
export function deleteChange(list: DraftSegment[], localId: string): DraftSegment[] {
  const t = tile(list);
  const idx = t.findIndex((s) => s.localId === localId);
  if (idx < 0) return t;
  const rest = t.filter((s) => s.localId !== localId);
  if (!rest.length) return [];
  if (idx === 0) rest[0] = { ...rest[0], start_minute: 0 };
  return tile(rest);
}

/** Change the status or location of an existing entry without moving it. */
export function editChange(
  list: DraftSegment[],
  localId: string,
  patch: Partial<Pick<DraftSegment, 'duty_status' | 'city' | 'state' | 'remarks'>>,
): DraftSegment[] {
  return tile(list.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
}

/**
 * Midnight split. A status still running at 00:00 closes the outgoing day at
 * midnight (already true — every day ends at 1440) and opens the new day at
 * midnight carrying the same status and place. Returns the seed for the new
 * day, or null when there is nothing to carry.
 */
export function carryIntoNextDay(previousDay: DraftSegment[]): DraftSegment[] {
  const last = statusAtMidnight(previousDay);
  if (!last || last.duty_status === null) return [];
  return tile([{
    localId: newLocalId(),
    start_minute: 0,
    end_minute: MINUTES_PER_DAY,
    duty_status: last.duty_status,
    city: last.city,
    state: last.state,
    // Remarks describe an event, not a state; they do not carry across midnight.
    remarks: '',
  }]);
}

/** Entries still missing something the printed log needs. */
export function incompleteEntries(list: DraftSegment[]): DraftSegment[] {
  return list.filter((s) => s.duty_status === null || !s.city.trim() || !s.state.trim());
}
