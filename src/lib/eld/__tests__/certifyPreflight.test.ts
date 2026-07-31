/**
 * The guard's whole value is that it fails. These cover the shapes that were
 * silent before it existed: a header field that never reached the cache, a
 * segment edit that did not, and the unreadable-copy cases.
 *
 * The comparison is against Dexie unconditionally — there is no server read
 * here any more, so there is no Supabase mock either.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const dayGet = vi.fn();
const eventsGet = vi.fn();

vi.mock('../offline/db', () => ({
  roadsideDb: {
    rods_days_cache: { get: (...a: unknown[]) => dayGet(...a) },
    rods_events_cache: { get: (...a: unknown[]) => eventsGet(...a) },
  },
}));

import {
  assertPersistedMatches, isPreflightMismatch, PreflightUnavailableError,
} from '../certifyPreflight';

const DAY = {
  id: 'day-1', log_date: '2026-03-04', truck_number: '104', trailer_numbers: null,
  from_location: 'Joplin, MO', to_location: 'Tulsa, OK',
} as never;

const EVENT = {
  start_minute: 0, end_minute: 480, duty_status: 1, city: 'Joplin', state: 'MO', remarks: null,
};

beforeEach(() => {
  dayGet.mockReset();
  eventsGet.mockReset();
  dayGet.mockResolvedValue(undefined);
  eventsGet.mockResolvedValue(undefined);
});

function persist(day: unknown, events: unknown[]) {
  dayGet.mockResolvedValue({ log_date: '2026-03-04', day });
  eventsGet.mockResolvedValue({ events });
}

describe('assertPersistedMatches', () => {
  it('passes when the persisted row matches the screen', async () => {
    persist(DAY, [EVENT]);
    const res = await assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04',
      onScreen: { day: DAY, events: [EVENT] as never },
    });
    expect(res.ok).toBe(true);
    expect(res.source).toBe('local_cache');
  });

  it('treats blank and null as the same value', async () => {
    persist(DAY, [EVENT]);
    const res = await assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04',
      onScreen: { day: { ...(DAY as object), trailer_numbers: '' } as never, events: [{ ...EVENT, remarks: '' }] as never },
    });
    expect(res.ok).toBe(true);
  });

  it('reports a header edit that never reached the row', async () => {
    persist(DAY, [EVENT]);
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04',
      onScreen: { day: { ...(DAY as object), to_location: 'Wichita, KS' } as never, events: [EVENT] as never },
    })).rejects.toSatisfy((err: unknown) => isPreflightMismatch(err)
      && err.differences.some((d) => d.field_path === 'To' && d.new_value === 'Wichita, KS'));
  });

  it('reports a segment edit that never reached the row', async () => {
    persist(DAY, [EVENT]);
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04',
      onScreen: { day: DAY, events: [{ ...EVENT, end_minute: 600 }] as never },
    })).rejects.toSatisfy((err: unknown) => isPreflightMismatch(err) && err.differences.length === 1);
  });

  it('refuses when this device holds no cached copy at all', async () => {
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04',
      onScreen: { day: DAY, events: [EVENT] as never },
    })).rejects.toBeInstanceOf(PreflightUnavailableError);
  });

  it('treats a different row owning the date as unavailable, not a mismatch', async () => {
    // Divergence, not a dropped write: a field-by-field diff between two
    // unrelated logs would be meaningless to the driver.
    persist({ ...(DAY as object), id: 'day-2' }, [EVENT]);
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04',
      onScreen: { day: DAY, events: [EVENT] as never },
    })).rejects.toBeInstanceOf(PreflightUnavailableError);
  });
});