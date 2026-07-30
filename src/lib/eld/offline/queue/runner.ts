/**
 * The single place the sync queue meets the network.
 *
 * Drains due entries one at a time, in the order the driver performed them,
 * honouring dependencies (a certification never runs before its PDF and
 * signature have landed). Retry policy by error class:
 *
 *   network  — retried forever on backoff. A driver out of coverage for a week
 *              must still sync on day eight; giving up would silently drop a
 *              signed federal record.
 *   server   — retried SERVER_ATTEMPT_LIMIT times, then parked as `failed`.
 *   rejected — never retried. Routed to the rejection path, which tells the
 *              driver and Management loudly, because the day the driver
 *              believes is certified is not.
 */
import { type SyncQueueEntry } from '../db';
import { SERVER_ATTEMPT_LIMIT } from './types';
import { classifyError, isDuplicateDateRejection } from './classify';
import { HANDLERS } from './handlers';
import { raiseSyncAlert } from './alerts';
import {
  dueEntries, markInFlight, markRetry, markSucceeded, markTerminal, purgeSucceeded, syncCounts,
  type SyncCounts,
} from './store';

type Listener = (counts: SyncCounts) => void;

const listeners = new Set<Listener>();
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export function subscribeSyncCounts(fn: Listener): () => void {
  listeners.add(fn);
  void syncCounts().then(fn);
  return () => { listeners.delete(fn); };
}

async function notify(): Promise<void> {
  const counts = await syncCounts();
  listeners.forEach((fn) => fn(counts));
}

async function runEntry(entry: SyncQueueEntry): Promise<void> {
  const handler = HANDLERS[entry.kind];
  if (!handler) {
    await markTerminal(entry.id, 'failed', 'server', `No handler for "${entry.kind}".`);
    return;
  }

  await markInFlight(entry.id);
  try {
    await handler(entry.payload);
    await markSucceeded(entry.id);
  } catch (err) {
    const { klass, message } = classifyError(err);

    if (klass === 'rejected') {
      await markTerminal(entry.id, 'rejected', klass, message);
      await raiseSyncAlert({
        kind: 'certification_rejected',
        operator_id: (entry.payload.operator_id as string) ?? null,
        log_date: (entry.payload.log_date as string) ?? null,
        detail: isDuplicateDateRejection(message)
          ? `A certified log already exists for this date. The offline "${entry.kind}" was not applied: ${message}`
          : `Server rejected "${entry.kind}": ${message}`,
      });
      return;
    }

    if (klass === 'server' && entry.attempts + 1 >= SERVER_ATTEMPT_LIMIT) {
      await markTerminal(entry.id, 'failed', klass, message);
      await raiseSyncAlert({
        kind: 'sync_failed',
        operator_id: (entry.payload.operator_id as string) ?? null,
        log_date: (entry.payload.log_date as string) ?? null,
        detail: `"${entry.kind}" gave up after ${SERVER_ATTEMPT_LIMIT} attempts: ${message}`,
      });
      return;
    }

    await markRetry(entry.id, klass, message);
  }
}

/** Drain every due entry once. Safe to call concurrently — it self-serialises. */
export async function drainQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Re-read between entries: a succeeded upload unblocks its dependent
    // certification within the same drain.
    for (;;) {
      const due = await dueEntries();
      if (!due.length) break;
      // eslint-disable-next-line no-await-in-loop
      await runEntry(due[0]);
      // eslint-disable-next-line no-await-in-loop
      await notify();
    }
    await purgeSucceeded();
  } finally {
    running = false;
    await notify();
  }
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void tick(); }, ms);
}

async function tick(): Promise<void> {
  await drainQueue();
  schedule(30_000);
}

/**
 * Start the runner. Drains on load, on reconnect, on tab focus, and every 30s
 * while the tab is open. Idempotent — mounting twice does not double-drain,
 * because drainQueue self-serialises.
 */
export function startSyncRunner(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { void drainQueue(); });
  window.addEventListener('focus', () => { void drainQueue(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void drainQueue();
  });
  void tick();
}