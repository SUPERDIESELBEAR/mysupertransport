/**
 * The guard's whole value is that it fails. These cover the shapes that were
 * silent before it existed: a header field that never reached the row, a
 * segment edit that did not, and the unreadable-copy case.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eventsResult = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => (table === 'rods_days'
        ? { eq: () => ({ maybeSingle }) }
        : { eq: () => ({ order: () => eventsResult() }) }),
    }),
  },
}));

vi.mock('../offline/db', () => ({
  roadsideDb: {
    rods_days_cache: { get: vi.fn(async () => undefined) },
    rods_events_cache: { get: vi.fn(async () => undefined) },
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
  maybeSingle.mockReset();
  eventsResult.mockReset();
});

function persist(day: unknown, events: unknown[]) {
  maybeSingle.mockResolvedValue({ data: day, error: null });
  eventsResult.mockResolvedValue({ data: events, error: null });
}

describe('assertPersistedMatches', () => {
  it('passes when the persisted row matches the screen', async () => {
    persist(DAY, [EVENT]);
    const res = await assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04', online: true,
      onScreen: { day: DAY, events: [EVENT] as never },
    });
    expect(res.ok).toBe(true);
    expect(res.source).toBe('server');
  });

  it('treats blank and null as the same value', async () => {
    persist(DAY, [EVENT]);
    const res = await assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04', online: true,
      onScreen: { day: { ...(DAY as object), trailer_numbers: '' } as never, events: [{ ...EVENT, remarks: '' }] as never },
    });
    expect(res.ok).toBe(true);
  });

  it('reports a header edit that never reached the row', async () => {
    persist(DAY, [EVENT]);
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04', online: true,
      onScreen: { day: { ...(DAY as object), to_location: 'Wichita, KS' } as never, events: [EVENT] as never },
    })).rejects.toSatisfy((err: unknown) => isPreflightMismatch(err)
      && err.differences.some((d) => d.field_path === 'To' && d.new_value === 'Wichita, KS'));
  });

  it('reports a segment edit that never reached the row', async () => {
    persist(DAY, [EVENT]);
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04', online: true,
      onScreen: { day: DAY, events: [{ ...EVENT, end_minute: 600 }] as never },
    })).rejects.toSatisfy((err: unknown) => isPreflightMismatch(err) && err.differences.length === 1);
  });

  it('refuses when the persisted copy cannot be read', async () => {
    persist(null, []);
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04', online: true,
      onScreen: { day: DAY, events: [EVENT] as never },
    })).rejects.toBeInstanceOf(PreflightUnavailableError);
  });

  it('refuses offline when the device holds no cached copy', async () => {
    await expect(assertPersistedMatches({
      dayId: 'day-1', logDate: '2026-03-04', online: false,
      onScreen: { day: DAY, events: [EVENT] as never },
    })).rejects.toBeInstanceOf(PreflightUnavailableError);
  });
});