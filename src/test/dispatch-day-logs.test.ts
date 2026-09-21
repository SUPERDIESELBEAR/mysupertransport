import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal PostgREST-shaped stub: records the select list it was asked for and
// answers per-call from a queue.
const calls: string[] = [];
let queue: Array<{ data: unknown; error: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => {
  const builder = (select: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain as never;
    chain.eq = self; chain.gte = self; chain.lte = self; chain.order = self;
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
      calls.push(select);
      return Promise.resolve(queue.shift() ?? { data: [], error: null }).then(resolve);
    };
    return chain;
  };
  return {
    supabase: { from: () => ({ select: (s: string) => builder(s) }) },
  };
});

import {
  fetchDispatchDayLogs,
  isMissingColumnError,
  stripAbsenceFields,
  __resetReasonColumnCache,
  reasonColumnKnownMissing,
} from '@/lib/dispatchDayLogs';

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'a1', log_date: '2026-06-02', status: 'truck_down', notes: 'engine', ...extra,
});

describe('isMissingColumnError', () => {
  it('matches 42703 and the message form', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ message: 'column dispatch_daily_log.absence_reason does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe('fetchDispatchDayLogs', () => {
  beforeEach(() => { calls.length = 0; queue = []; __resetReasonColumnCache(null); });

  it('uses the full shape when the columns exist', async () => {
    queue = [{ data: [row({ absence_reason: 'truck_down', notes_by: 'u1', notes_at: 't' })], error: null }];
    const res = await fetchDispatchDayLogs('op', '2026-06-01', '2026-06-30');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('absence_reason');
    expect(res.hasReasonColumn).toBe(true);
    expect(res.logs[0].absence_reason).toBe('truck_down');
    expect(res.error).toBeNull();
  });

  it('retries without the staged columns and still returns the days', async () => {
    queue = [
      { data: null, error: { code: '42703', message: 'column does not exist' } },
      { data: [row()], error: null },
    ];
    const res = await fetchDispatchDayLogs('op', '2026-06-01', '2026-06-30');
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain('absence_reason');
    expect(res.hasReasonColumn).toBe(false);
    expect(res.logs).toHaveLength(1);
    expect(res.logs[0].status).toBe('truck_down');
    expect(res.logs[0].absence_reason).toBeNull();
    expect(res.error).toBeNull();
    expect(reasonColumnKnownMissing()).toBe(true);
  });

  it('remembers the missing column so later reads take one round trip', async () => {
    __resetReasonColumnCache(false);
    queue = [{ data: [row()], error: null }];
    const res = await fetchDispatchDayLogs('op', '2026-06-01', '2026-06-30');
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('absence_reason');
    expect(res.logs).toHaveLength(1);
  });

  it('surfaces any other error instead of retrying', async () => {
    queue = [{ data: null, error: { code: '42501', message: 'permission denied' } }];
    const res = await fetchDispatchDayLogs('op', '2026-06-01', '2026-06-30');
    expect(calls).toHaveLength(1);
    expect(res.error).toBe('permission denied');
    expect(res.logs).toEqual([]);
  });
});

describe('stripAbsenceFields', () => {
  const payload = { status: 'home', notes: 'x', absence_reason: 'home_time', notes_by: 'u', notes_at: 't' };

  it('keeps everything when the columns exist', () => {
    expect(stripAbsenceFields(payload, true)).toEqual(payload);
  });

  it('drops only the staged fields otherwise', () => {
    expect(stripAbsenceFields(payload, false)).toEqual({ status: 'home', notes: 'x' });
  });
});
