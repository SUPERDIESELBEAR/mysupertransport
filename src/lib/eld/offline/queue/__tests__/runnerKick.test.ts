/**
 * The drop window this test exists for: `drainQueue` returns immediately when
 * a pass is running, so an entry committed after that pass's last
 * `dueEntries()` read has nothing left to trigger it. It must be re-run from
 * the pass's `finally`, not left to the 60s backstop.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const dueEntries = vi.fn();
const handler = vi.fn(async () => {});

vi.mock('../store', () => ({
  dueEntries: (...a: unknown[]) => dueEntries(...a),
  markInFlight: vi.fn(async () => {}),
  markRetry: vi.fn(async () => {}),
  markSucceeded: vi.fn(async () => {}),
  markTerminal: vi.fn(async () => {}),
  purgeSucceeded: vi.fn(async () => 0),
  syncCounts: vi.fn(async () => ({ pending: 0, inFlight: 0, failed: 0, rejected: 0, cancelled: 0 })),
}));
vi.mock('../handlers', () => ({ HANDLERS: { save_draft_day: () => handler() } }));
vi.mock('../noticeDrain', () => ({ drainPendingNotices: vi.fn(async () => {}) }));
vi.mock('../alerts', () => ({ raiseSyncAlert: vi.fn(async () => {}) }));

import { drainQueue } from '../runner';
import { requestDrain, setDrainKick, __resetDrainKick } from '../kick';

function entry(id: string) {
  return {
    id, kind: 'save_draft_day', payload: {}, depends_on: [], coalesce_key: null,
    attempts: 0, next_attempt_at: '', status: 'pending', last_error: null,
    last_error_class: null, client_timestamp: '', created_at: '', updated_at: '',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetDrainKick();
  dueEntries.mockReset();
  handler.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('drain kick during a running pass', () => {
  it('re-runs a pass requested while one was already in flight', async () => {
    let kicked: 'draft' | 'chain' | null = null;
    setDrainKick((scope) => { kicked = scope; });

    // One entry on the first pass, then empty — mirroring an enqueue that
    // commits after the final dueEntries() read.
    dueEntries.mockResolvedValueOnce([entry('a')]).mockResolvedValue([]);

    const pass = drainQueue({ force: true });
    requestDrain('draft');
    await pass;

    expect(kicked).toBe('draft');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a concurrent drainQueue call does not double-run an entry', async () => {
    dueEntries.mockResolvedValueOnce([entry('a')]).mockResolvedValue([]);
    await Promise.all([drainQueue({ force: true }), drainQueue({ force: true })]);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});