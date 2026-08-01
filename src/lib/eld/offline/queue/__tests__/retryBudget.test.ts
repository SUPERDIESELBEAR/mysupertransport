/**
 * The budget is split by CLASS, not by kind.
 *
 * `network` stays unbounded for every kind — a dead zone is not a failure.
 * `server` is bounded for every kind, cascade-exempt ones included: a
 * permanent server answer (a check-constraint violation, say) never becomes
 * deliverable by retrying, and an exempt kind looping on one forever is the
 * defect this test locks out. Exempt means never silently dropped, not never
 * terminal.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SERVER_ATTEMPT_LIMIT } from '../types';

const dueEntries = vi.fn();
const markTerminal = vi.fn(async () => {});
const markRetry = vi.fn(async () => {});
const raiseSyncAlert = vi.fn(async () => {});
const recordAlertDeliveryFailure = vi.fn();
const markDayStalled = vi.fn(async () => {});
const handler = vi.fn(async () => { throw new Error('boom'); });

vi.mock('../store', () => ({
  dueEntries: (...a: unknown[]) => dueEntries(...a),
  markInFlight: vi.fn(async () => {}),
  markRetry: (...a: unknown[]) => markRetry(...(a as [])),
  markSucceeded: vi.fn(async () => {}),
  markTerminal: (...a: unknown[]) => markTerminal(...(a as [])),
  purgeSucceeded: vi.fn(async () => 0),
  resolveBlocked: vi.fn(async () => []),
  syncCounts: vi.fn(async () => ({ pending: 0, inFlight: 0, failed: 0, rejected: 0, cancelled: 0 })),
}));
vi.mock('../handlers', () => ({
  HANDLERS: {
    record_unlock: () => handler(),
    raise_sync_alert: () => handler(),
    certify_day: () => handler(),
  },
}));
vi.mock('../noticeDrain', () => ({ drainPendingNotices: vi.fn(async () => {}) }));
vi.mock('../alerts', () => ({
  raiseSyncAlert: (...a: unknown[]) => raiseSyncAlert(...(a as [])),
  recordAlertDeliveryFailure: (...a: unknown[]) => recordAlertDeliveryFailure(...(a as [])),
}));
vi.mock('../../cache', () => ({ markDayStalled: (...a: unknown[]) => markDayStalled(...(a as [])) }));

import { drainQueue } from '../runner';

function entry(kind: string, attempts: number) {
  return {
    id: `${kind}-${attempts}`, kind, payload: { operator_id: 'op-1', log_date: '2026-07-02' },
    depends_on: [], coalesce_key: null, attempts,
    next_attempt_at: '', status: 'pending', last_error: null, last_error_class: null,
    client_timestamp: '', created_at: '', updated_at: '',
  };
}

async function drainOne(e: ReturnType<typeof entry>, err: unknown) {
  handler.mockImplementationOnce(async () => { throw err; });
  dueEntries.mockResolvedValueOnce([e]).mockResolvedValue([]);
  await drainQueue({ force: true });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  [dueEntries, markTerminal, markRetry, raiseSyncAlert, recordAlertDeliveryFailure, markDayStalled, handler]
    .forEach((m) => m.mockReset());
  handler.mockImplementation(async () => { throw new Error('boom'); });
});
afterEach(() => { vi.useRealTimers(); });

/** An unlisted SQLSTATE from a completed round trip: server class, not network. */
const CHECK_VIOLATION = Object.assign(new Error('violates check constraint'), { code: '23514' });

describe('server-class budget applies to cascade-exempt kinds', () => {
  it('marks record_unlock terminal at the limit and raises unlock_record_rejected', async () => {
    await drainOne(entry('record_unlock', SERVER_ATTEMPT_LIMIT - 1), CHECK_VIOLATION);

    expect(markTerminal).toHaveBeenCalledTimes(1);
    expect(markTerminal.mock.calls[0][1]).toBe('failed');
    expect(markTerminal.mock.calls[0][2]).toBe('server');
    expect(raiseSyncAlert).toHaveBeenCalledTimes(1);
    expect(raiseSyncAlert.mock.calls[0][0].kind).toBe('unlock_record_rejected');
    // The driver's log is fine; only the audit row is missing.
    expect(markDayStalled).not.toHaveBeenCalled();
  });

  it('keeps retrying record_unlock on a network error, with no budget', async () => {
    await drainOne(entry('record_unlock', SERVER_ATTEMPT_LIMIT + 40), new TypeError('Failed to fetch'));

    expect(markTerminal).not.toHaveBeenCalled();
    expect(markRetry).toHaveBeenCalledTimes(1);
    expect(markRetry.mock.calls[0][1]).toBe('network');
  });

  it('never alerts about a failed alert — counted and logged instead', async () => {
    await drainOne(entry('raise_sync_alert', SERVER_ATTEMPT_LIMIT - 1), CHECK_VIOLATION);

    expect(markTerminal).toHaveBeenCalledTimes(1);
    expect(raiseSyncAlert).not.toHaveBeenCalled();
    expect(recordAlertDeliveryFailure).toHaveBeenCalledTimes(1);
  });

  it('still flags the day for a non-exempt chain kind', async () => {
    await drainOne(entry('certify_day', SERVER_ATTEMPT_LIMIT - 1), CHECK_VIOLATION);

    expect(raiseSyncAlert.mock.calls[0][0].kind).toBe('sync_failed');
    expect(markDayStalled).toHaveBeenCalledWith('2026-07-02', 'stalled');
  });
});
