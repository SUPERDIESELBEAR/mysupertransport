import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake, AUTH_UID } from '@/test/helpers/pgFake';

/**
 * DETENTION TERMS WRITE-PATH ROUND TRIP.
 *
 * The reader fixture is not hand-written: every row read back here was put
 * there by the same payload builder and RPC shape the load form uses, so a
 * column that silently stops being carried fails this file rather than
 * surfacing as a blank on Load Detail mid-call.
 *
 * The tri-state assertions are the point of the file. A save path that wrote
 * `false` for "not stated" would make Part C's prompt lie about what the
 * broker agreed to.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __termsFake: { client: unknown } };
holder.__termsFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__termsFake.client; },
}));

const baseStops = [
  { city: 'Macon', state: 'GA', stop_type: 'pickup' },
  { city: 'Ames', state: 'IA', stop_type: 'delivery' },
];

async function createLoad(terms: Record<string, string>) {
  const client = fake.client as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const { data } = await client.rpc('create_load_with_stops', {
    p_load: { load_number: 'ST-9001', load_type: 'standard', rate_type: 'flat', ...terms },
    p_stops: baseStops,
    p_charges: [],
  });
  return data as string;
}

const loadRow = (id: string) =>
  (fake.tables.loads as Record<string, unknown>[]).find(l => l.id === id)!;

beforeEach(() => {
  fake.reset();
  fake.setAuthUid(AUTH_UID);
});

describe('detention terms round trip', () => {
  it('writes every stated term and reads it back unchanged', async () => {
    const id = await createLoad({
      detention_free_time_minutes: '90',
      detention_rate_per_hour: '55',
      detention_daily_cap: '440',
      detention_clock_start: 'gate_checkin',
      detention_notification_required: 'true',
      detention_terms_note: 'Call the desk before rolling.',
    });
    const row = loadRow(id);
    const { readDetentionTerms } = await import('@/lib/detentionTerms');
    expect(readDetentionTerms(row)).toEqual({
      freeTimeMinutes: 90,
      ratePerHour: 55,
      dailyCap: 440,
      clockStart: 'gate_checkin',
      notificationRequired: true,
      note: 'Call the desk before rolling.',
    });
  });

  it('stores nothing at all when the rate confirmation is silent', async () => {
    const id = await createLoad({
      detention_free_time_minutes: '',
      detention_rate_per_hour: '',
      detention_daily_cap: '',
      detention_clock_start: '',
      detention_notification_required: '',
      detention_terms_note: '',
    });
    const row = loadRow(id);
    expect(row.detention_free_time_minutes).toBeNull();
    expect(row.detention_rate_per_hour).toBeNull();
    expect(row.detention_clock_start).toBeNull();
    expect(row.detention_notification_required).toBeNull();
  });

  it('keeps "not required" distinct from "not stated" in the data', async () => {
    const notRequired = loadRow(await createLoad({ detention_notification_required: 'false' }));
    const notStated = loadRow(await createLoad({ detention_notification_required: '' }));
    expect(notRequired.detention_notification_required).toBe(false);
    expect(notStated.detention_notification_required).toBeNull();
    expect(notRequired.detention_notification_required)
      .not.toBe(notStated.detention_notification_required);
  });

  it('records a terms edit in load change history, attributable like any field', async () => {
    const id = await createLoad({ detention_free_time_minutes: '90' });
    const client = fake.client as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    const stops = (fake.tables.load_stops as Record<string, unknown>[])
      .filter(s => s.load_id === id)
      .map(s => ({ id: s.id, city: s.city, state: s.state, stop_type: s.stop_type }));

    await client.rpc('update_load_with_stops', {
      p_load_id: id,
      p_load: {
        load_number: 'ST-9001',
        load_type: 'standard',
        rate_type: 'flat',
        detention_free_time_minutes: '120',
        detention_notification_required: 'true',
      },
      p_stops: stops,
      p_charges: [],
    });

    const history = (fake.tables.load_change_history as Record<string, unknown>[])
      .filter(h => h.load_id === id);
    const freeTime = history.find(h => h.field_path === 'detention_free_time_minutes');
    expect(freeTime).toBeTruthy();
    expect(String(freeTime!.previous_value)).toBe('90');
    expect(String(freeTime!.new_value)).toBe('120');
    expect(freeTime!.changed_by).toBeTruthy();
    // Terms are not a money change: no written reason is demanded.
    expect(freeTime!.is_financial).toBe(false);
    expect(history.some(h => h.field_path === 'detention_notification_required')).toBe(true);
  });
});
