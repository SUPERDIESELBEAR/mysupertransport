/**
 * Sync-queue persistence. Dexie only — this module must never import the
 * Supabase client. The runner is the single place the queue meets the network,
 * which is what keeps /roadside's import graph clean.
 */
import {
  roadsideDb, type SyncQueueEntry, type SyncKind, type SyncErrorClass,
} from '../db';
import { assertSmallPayload, backoffFor, SUCCEEDED_TTL_MS } from './types';
import { requestDrain, type DrainScope } from './kick';

export function newSyncId(): string {
  return crypto.randomUUID();
}

/**
 * Draft writes are already durable in Dexie and the certify chain depends_on
 * them, so they can drain lazily. Everything else is something the driver is
 * watching finish.
 */
const DRAFT_KINDS: readonly SyncKind[] = ['save_draft_day', 'save_draft_segments'];

function scopeFor(kind: SyncKind): DrainScope {
  return DRAFT_KINDS.includes(kind) ? 'draft' : 'chain';
}

export interface EnqueueInput {
  /** Supply an id to make the enqueue idempotent across restarts. */
  id?: string;
  kind: SyncKind;
  payload: Record<string, unknown>;
  depends_on?: string[];
  client_timestamp?: string;
  /**
   * Entries sharing a coalesce key describe the same thing (one day's header,
   * one day's segments). See `enqueueCoalesced`.
   */
  coalesce_key?: string;
}

/**
 * Enqueue, or no-op when an entry with this id already exists in ANY status.
 * Callers that derive a deterministic id (the notice drain does) rely on this:
 * re-running must never produce a second upload or a second send.
 */
export async function enqueue(input: EnqueueInput): Promise<SyncQueueEntry> {
  assertSmallPayload(input.kind, input.payload);
  const id = input.id ?? newSyncId();
  const now = new Date().toISOString();

  const entry = await roadsideDb.transaction('rw', roadsideDb.sync_queue, async () => {
    const existing = await roadsideDb.sync_queue.get(id);
    if (existing) return existing;
    const created: SyncQueueEntry = {
      id,
      kind: input.kind,
      payload: input.payload,
      depends_on: input.depends_on ?? [],
      coalesce_key: input.coalesce_key ?? null,
      attempts: 0,
      next_attempt_at: now,
      status: 'pending',
      last_error: null,
      last_error_class: null,
      client_timestamp: input.client_timestamp ?? now,
      created_at: now,
      updated_at: now,
    };
    await roadsideDb.sync_queue.put(created);
    return created;
  });
  // After the transaction commits, never inside it: the runner reads the queue.
  requestDrain(scopeFor(input.kind));
  return entry;
}

const TERMINAL: readonly SyncQueueEntry['status'][] = ['failed', 'rejected', 'cancelled'];

export function isTerminal(status: SyncQueueEntry['status']): boolean {
  return TERMINAL.includes(status);
}

/**
 * Enqueue a draft write, collapsing redundant ones.
 *
 * A driver typing into the header produces one intent — "the header should end
 * up like this" — not one per keystroke. Queueing each edit separately means a
 * week offline drains as hundreds of round-trips that overwrite each other.
 *
 * Two cases, and the difference matters:
 *   pending   — replace the payload in place. Same entry, same id, same
 *               position in the drain order; nothing downstream is disturbed.
 *   in_flight — the payload is already on the wire. A second entry is created
 *               that DEPENDS on the one in flight, so the later state can never
 *               be applied before the earlier one and then be overwritten by it.
 */
export async function enqueueCoalesced(
  input: EnqueueInput & { coalesce_key: string },
): Promise<SyncQueueEntry> {
  assertSmallPayload(input.kind, input.payload);
  const now = new Date().toISOString();

  const entry = await roadsideDb.transaction('rw', roadsideDb.sync_queue, async () => {
    const siblings = (await roadsideDb.sync_queue.toArray())
      .filter((e) => e.coalesce_key === input.coalesce_key && !isTerminal(e.status))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const pending = siblings.find((e) => e.status === 'pending');
    if (pending) {
      const merged: SyncQueueEntry = {
        ...pending,
        payload: input.payload,
        client_timestamp: input.client_timestamp ?? pending.client_timestamp,
        updated_at: now,
      };
      await roadsideDb.sync_queue.put(merged);
      return merged;
    }

    const inFlight = siblings.filter((e) => e.status === 'in_flight').map((e) => e.id);
    const created: SyncQueueEntry = {
      id: input.id ?? newSyncId(),
      kind: input.kind,
      payload: input.payload,
      depends_on: [...(input.depends_on ?? []), ...inFlight],
      coalesce_key: input.coalesce_key,
      attempts: 0,
      next_attempt_at: now,
      status: 'pending',
      last_error: null,
      last_error_class: null,
      client_timestamp: input.client_timestamp ?? now,
      created_at: now,
      updated_at: now,
    };
    await roadsideDb.sync_queue.put(created);
    return created;
  });
  requestDrain(scopeFor(input.kind));
  return entry;
}

export async function getEntry(id: string): Promise<SyncQueueEntry | undefined> {
  return roadsideDb.sync_queue.get(id);
}

export async function allEntries(): Promise<SyncQueueEntry[]> {
  return roadsideDb.sync_queue.toArray();
}

/**
 * Entries that are pending, due, and whose every prerequisite has succeeded.
 * Ordered by client_timestamp so a day's uploads and its certification replay
 * in the order the driver performed them.
 */
export async function dueEntries(now = new Date()): Promise<SyncQueueEntry[]> {
  const all = await roadsideDb.sync_queue.toArray();
  const byId = new Map(all.map((e) => [e.id, e]));
  const iso = now.toISOString();
  return all
    .filter((e) => e.status === 'pending' && e.next_attempt_at <= iso)
    .filter((e) => e.depends_on.every((dep) => {
      const prerequisite = byId.get(dep);
      // A dependency that is GONE succeeded long enough ago to be purged —
      // purgeSucceeded refuses to remove one anything still depends on, so an
      // absent prerequisite can only be an old success. A terminal one is
      // handled by resolveBlocked, which cancels this entry rather than
      // leaving it to sit here forever.
      if (!prerequisite) return true;
      return prerequisite.status === 'succeeded';
    }))
    .sort((a, b) => a.client_timestamp.localeCompare(b.client_timestamp));
}

/**
 * Cancel every entry whose chain can never drain.
 *
 * Without this a certification whose PDF upload was rejected sits `pending`
 * forever: its dependency will never succeed, so it is never due, so nothing
 * ever reports it. The driver sees one permanent item on the sync chip and no
 * explanation. Cancellation is transitive — a cancelled entry is itself a dead
 * prerequisite — and runs to a fixed point.
 *
 * Returns the entries it cancelled so the caller can raise ONE alert per
 * broken chain instead of one per orphan.
 */
export async function resolveBlocked(): Promise<SyncQueueEntry[]> {
  const cancelled: SyncQueueEntry[] = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const all = await roadsideDb.sync_queue.toArray();
    const byId = new Map(all.map((e) => [e.id, e]));
    const doomed = all.filter((e) => !isTerminal(e.status) && e.depends_on.some((dep) => {
      const prerequisite = byId.get(dep);
      return !!prerequisite && isTerminal(prerequisite.status);
    }));
    if (!doomed.length) return cancelled;
    for (const entry of doomed) {
      const cause = entry.depends_on
        .map((dep) => byId.get(dep))
        .find((dep) => dep && isTerminal(dep.status));
      // eslint-disable-next-line no-await-in-loop
      await roadsideDb.sync_queue.update(entry.id, {
        status: 'cancelled',
        last_error_class: 'cancelled',
        last_error: `Cancelled because "${cause?.kind}" ended as ${cause?.status}: ${cause?.last_error ?? 'no detail'}`,
        cancelled_by: cause?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      cancelled.push({ ...entry, status: 'cancelled', cancelled_by: cause?.id ?? null });
    }
  }
}

/**
 * Cancel every non-terminal entry for one day. Used by the authorized unlock:
 * the driver is being given the day back, so the chain that was trying to
 * certify the old version must not later spring to life and re-lock it.
 */
export async function cancelChainForDay(logDate: string, reason: string): Promise<number> {
  const all = await roadsideDb.sync_queue.toArray();
  const mine = all.filter((e) => !isTerminal(e.status) && e.payload.log_date === logDate);
  const now = new Date().toISOString();
  for (const entry of mine) {
    // eslint-disable-next-line no-await-in-loop
    await roadsideDb.sync_queue.update(entry.id, {
      status: 'cancelled', last_error_class: 'cancelled', last_error: reason, updated_at: now,
    });
  }
  return mine.length;
}

export async function markInFlight(id: string): Promise<void> {
  await roadsideDb.sync_queue.update(id, { status: 'in_flight', updated_at: new Date().toISOString() });
}

export async function markSucceeded(id: string): Promise<void> {
  await roadsideDb.sync_queue.update(id, {
    status: 'succeeded', last_error: null, last_error_class: null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function markRetry(
  id: string, errorClass: SyncErrorClass, message: string,
): Promise<void> {
  const entry = await roadsideDb.sync_queue.get(id);
  if (!entry) return;
  const attempts = entry.attempts + 1;
  await roadsideDb.sync_queue.update(id, {
    status: 'pending',
    attempts,
    next_attempt_at: new Date(Date.now() + backoffFor(attempts - 1)).toISOString(),
    last_error: message,
    last_error_class: errorClass,
    updated_at: new Date().toISOString(),
  });
}

export async function markTerminal(
  id: string, status: 'failed' | 'rejected' | 'cancelled', errorClass: SyncErrorClass, message: string,
): Promise<void> {
  const entry = await roadsideDb.sync_queue.get(id);
  await roadsideDb.sync_queue.update(id, {
    status,
    attempts: (entry?.attempts ?? 0) + 1,
    last_error: message,
    last_error_class: errorClass,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Purge succeeded entries older than the TTL. `rejected` and `failed` are kept
 * forever: they are the only on-device record that a signed federal document
 * never reached the server.
 */
export async function purgeSucceeded(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - SUCCEEDED_TTL_MS).toISOString();
  const all = await roadsideDb.sync_queue.toArray();
  // An entry something non-terminal still depends on is NOT purgeable, however
  // old it is: dueEntries reads an absent prerequisite as satisfied, so
  // deleting it here would release a dependent early — exactly the ordering
  // guarantee the dependency existed to provide.
  const stillDependedOn = new Set(
    all.filter((e) => !isTerminal(e.status)).flatMap((e) => e.depends_on),
  );
  const stale = await roadsideDb.sync_queue
    .where('status').equals('succeeded')
    .filter((e) => e.updated_at < cutoff && !stillDependedOn.has(e.id))
    .toArray();
  await roadsideDb.sync_queue.bulkDelete(stale.map((e) => e.id));
  return stale.length;
}

export interface SyncCounts {
  pending: number;
  inFlight: number;
  failed: number;
  rejected: number;
  cancelled: number;
}

export async function syncCounts(): Promise<SyncCounts> {
  const all = await roadsideDb.sync_queue.toArray();
  return {
    pending: all.filter((e) => e.status === 'pending').length,
    inFlight: all.filter((e) => e.status === 'in_flight').length,
    failed: all.filter((e) => e.status === 'failed').length,
    rejected: all.filter((e) => e.status === 'rejected').length,
    cancelled: all.filter((e) => e.status === 'cancelled').length,
  };
}
