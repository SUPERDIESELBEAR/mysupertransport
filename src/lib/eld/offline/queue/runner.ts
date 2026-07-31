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
import { isRowNotWritable } from '@/lib/eld/rodsWrite';
import { HANDLERS } from './handlers';
import { raiseSyncAlert } from './alerts';
import { drainPendingNotices } from './noticeDrain';
import { setDrainKick, type DrainScope } from './kick';
import {
  dueEntries, markInFlight, markRetry, markSucceeded, markTerminal, purgeSucceeded, syncCounts,
  type SyncCounts,
} from './store';

type Listener = (counts: SyncCounts) => void;

const listeners = new Set<Listener>();
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let lastPassEndedAt = 0;
let passRequested: DrainScope | null = null;

/**
 * Triggers coalesce rather than accumulate.
 *
 * `focus` and `visibilitychange` fire together on most mobile returns, and a
 * phone regaining signal and foreground at the same instant can raise three
 * events in one tick. A pass requested within this window of a completed pass
 * is skipped: the queue is not latency-sensitive and each pass wakes the radio.
 */
const COALESCE_MS = 5_000;

/**
 * Enqueue kicks coalesce on two windows, split by what the driver is watching.
 *
 * Draft writes are durable in Dexie on the keystroke and the certify chain
 * `depends_on` them, so ordering holds however late they drain — 30s is two
 * radio wakes a minute of sustained typing instead of twelve. The certify
 * chain is where the driver is watching a spinner after signing, so it keeps
 * the tight window.
 */
const DRAFT_COALESCE_MS = 30_000;
const CHAIN_COALESCE_MS = COALESCE_MS;

function windowFor(scope: DrainScope): number {
  return scope === 'draft' ? DRAFT_COALESCE_MS : CHAIN_COALESCE_MS;
}

function mergeScope(a: DrainScope | null, b: DrainScope): DrainScope {
  return a === 'chain' || b === 'chain' ? 'chain' : 'draft';
}

/**
 * A kick from `enqueue`. Never dropped:
 *   - a pass already running would swallow it (drainQueue returns early), so it
 *     is recorded and re-run from the pass's `finally`;
 *   - inside the scope's coalesce window it is scheduled for the end of it.
 * Both paths matter — an entry committed after the running pass's last
 * `dueEntries()` read has nothing else to trigger it before the 60s backstop.
 */
function requestPass(scope: DrainScope): void {
  if (running) {
    passRequested = mergeScope(passRequested, scope);
    return;
  }
  const wait = windowFor(scope) - (Date.now() - lastPassEndedAt);
  if (wait > 0) {
    passRequested = mergeScope(passRequested, scope);
    schedule(wait);
    return;
  }
  void drainQueue({ force: true });
}

/** Backstop only — `online` and `visibilitychange` cover the moments that matter. */
const INTERVAL_MS = 60_000;

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

    // RLS filtered the write: 0 rows, no error. Terminal, never retried, and
    // alerted separately — Management must see "the driver's edits were
    // dropped", not a generic sync failure. Bytes stay on the device.
    if (klass === 'row_not_writable') {
      await markTerminal(entry.id, 'rejected', klass, message);
      await raiseSyncAlert({
        kind: 'log_not_writable',
        operator_id: (entry.payload.operator_id as string) ?? null,
        log_date: (entry.payload.log_date as string) ?? null,
        detail: isRowNotWritable(err)
          ? `"${entry.kind}" was filtered by row-level security. ${err.detail}`
          : `"${entry.kind}" affected 0 rows and was not applied.`,
      });
      return;
    }

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

/**
 * Drain every due entry once. Safe to call concurrently — it self-serialises,
 * and back-to-back triggers inside COALESCE_MS collapse into one pass.
 */
export async function drainQueue(options?: { force?: boolean }): Promise<void> {
  if (running) return;
  if (!options?.force && Date.now() - lastPassEndedAt < COALESCE_MS) return;
  running = true;
  try {
    // Migrate any localStorage-era notice into the queue before draining, so a
    // notice saved by the legacy path is delivered by this same pass.
    await drainPendingNotices().catch((err) => {
      console.error('[eld-sync] notice drain failed', err);
    });
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
    lastPassEndedAt = Date.now();
    await notify();
    if (passRequested) {
      const scope = passRequested;
      passRequested = null;
      requestPass(scope);
    }
  }
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void tick(); }, ms);
}

async function tick(): Promise<void> {
  passRequested = null;
  await drainQueue({ force: true });
  schedule(INTERVAL_MS);
}

/**
 * Start the runner. Drains on load, on reconnect, on tab focus/visibility, and
 * every 60s while the tab is open as a backstop. Idempotent — mounting twice
 * does not double-drain, because drainQueue self-serialises and coalesces.
 */
export function startSyncRunner(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  setDrainKick(requestPass);
  window.addEventListener('online', () => { void drainQueue(); });
  window.addEventListener('focus', () => { void drainQueue(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void drainQueue();
  });
  void drainQueue({ force: true }).then(() => schedule(INTERVAL_MS));
}