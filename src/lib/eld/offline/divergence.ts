/**
 * Divergence detection for certified days.
 *
 * A certified day is immutable on the server and immutable on the device, so
 * the two copies must be identical. When they are not, something is genuinely
 * wrong — a bad merge, a partial write, or a day certified twice through
 * different paths — and it must never be smoothed over by a cache refresh.
 *
 * Must not import the Supabase client: this module is read by the roadside
 * import graph through prune.ts. Fetching is the caller's job.
 */
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import { roadsideDb, type DivergenceAckSource, type RodsDivergenceEntry } from './db';

/**
 * After this many days an unacknowledged divergence keeps its record but stops
 * pinning bytes: the day is far outside the 8-day roadside window by then.
 */
export const DIVERGENCE_PRUNE_HOLD_DAYS = 30;

const TOTAL_FIELDS = [
  'total_off_duty_minutes',
  'total_sleeper_minutes',
  'total_driving_minutes',
  'total_on_duty_minutes',
] as const;

export interface Comparison {
  differing: string[];
  local: Record<string, unknown>;
  server: Record<string, unknown>;
}

function diff(local: Record<string, unknown>, server: Record<string, unknown>): Comparison {
  const differing = Object.keys(local).filter((k) => local[k] !== server[k]);
  return { differing, local, server };
}

/**
 * Cheap check — certification time, the four status totals, segment count.
 * A field-by-field comparison is not needed to notice something is off.
 */
export function compareKeyedDay(
  localDay: RodsDay, localEvents: RodsEvent[],
  serverDay: RodsDay, serverEvents: RodsEvent[],
): Comparison {
  const shape = (d: RodsDay, e: RodsEvent[]) => ({
    certified_at: d.certified_at,
    ...Object.fromEntries(TOTAL_FIELDS.map((f) => [f, d[f]])),
    segment_count: e.length,
  });
  return diff(shape(localDay, localEvents), shape(serverDay, serverEvents));
}

/** Uploaded ELD logs have no segments — the file path and certification time are the record. */
export function compareDocumentDay(
  local: { certified_at: string | null | undefined; source_document_path: string | null },
  serverDay: RodsDay,
): Comparison {
  return diff(
    { certified_at: local.certified_at ?? null, source_document_path: local.source_document_path },
    { certified_at: serverDay.certified_at, source_document_path: serverDay.source_document_path },
  );
}

export interface RecordDivergenceInput {
  logDate: string;
  operatorId: string;
  localDay: RodsDay;
  localEvents: RodsEvent[];
  serverRowId: string;
  comparison: Comparison;
}

/**
 * Store an open divergence. Returns true only the first time a given date is
 * flagged, so the caller alerts Management once per detection rather than on
 * every hydration pass.
 */
export async function recordDivergence(input: RecordDivergenceInput): Promise<boolean> {
  const existing = await roadsideDb.rods_divergences.get(input.logDate);
  if (existing && existing.acknowledged === 0) return false;

  const entry: RodsDivergenceEntry = {
    log_date: input.logDate,
    operator_id: input.operatorId,
    local_day: input.localDay,
    local_events: input.localEvents,
    local_row_id: input.localDay.id,
    server_row_id: input.serverRowId,
    local_values: input.comparison.local,
    server_values: input.comparison.server,
    differing_fields: input.comparison.differing,
    detected_at: new Date().toISOString(),
    acknowledged: 0,
    acknowledged_source: null,
    acknowledged_by: null,
    acknowledged_reason: null,
    acknowledged_at: null,
  };
  await roadsideDb.rods_divergences.put(entry);
  return true;
}

/** Dates with an unresolved divergence. Drives the driver-facing chip. */
export async function openDivergenceDates(): Promise<Set<string>> {
  try {
    const rows = await roadsideDb.rods_divergences.toArray();
    return new Set(rows.filter((r) => r.acknowledged === 0).map((r) => r.log_date));
  } catch {
    return new Set();
  }
}

/**
 * Dates whose bytes must survive pruning: an open divergence younger than the
 * hold window. Past that the record stays but the exclusion is released, so an
 * unresolved divergence can never pin storage forever.
 */
export async function divergenceHeldDates(now: Date = new Date()): Promise<Set<string>> {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - DIVERGENCE_PRUNE_HOLD_DAYS);
  const cutoffIso = cutoff.toISOString();
  try {
    const rows = await roadsideDb.rods_divergences.toArray();
    return new Set(
      rows.filter((r) => r.acknowledged === 0 && r.detected_at > cutoffIso).map((r) => r.log_date),
    );
  } catch {
    return new Set();
  }
}

/**
 * Resolve a divergence locally. This is intentionally device-local until Stage 4
 * introduces a server-side divergence resolution table and a sync-queue kind for
 * acknowledgement propagation. Do not treat this as the final, cross-device flow.
 */
export async function acknowledgeDivergence(
  logDate: string,
  by: { source: DivergenceAckSource; actor: string | null; reason: string | null },
): Promise<void> {
  const existing = await roadsideDb.rods_divergences.get(logDate);
  if (!existing) return;
  await roadsideDb.rods_divergences.put({
    ...existing,
    acknowledged: 1,
    acknowledged_source: by.source,
    acknowledged_by: by.actor,
    acknowledged_reason: by.reason,
    acknowledged_at: new Date().toISOString(),
    // Marked pending until the queue entry carrying it drains. Reconciliation
    // reads this: a local acknowledgement the server has not seen is
    // authoritative and must not be reopened by a hydration pass.
    ack_pending: 1,
  });
}

/**
 * Dates whose acknowledgement exists only on this device — the sync queue entry
 * has not drained. PRECEDENCE: these win over the server row. A driver who
 * dismissed offline must not have the chip come back because hydration ran
 * before the queue did. Same rule as `unsynced` on the day cache.
 */
export async function pendingAckDates(): Promise<Set<string>> {
  try {
    const rows = await roadsideDb.rods_divergences.toArray();
    return new Set(rows.filter((r) => r.ack_pending === 1).map((r) => r.log_date));
  } catch {
    return new Set();
  }
}

/**
 * Apply a resolution recorded in the office to the device copy.
 *
 * One direction only: open → acknowledged. This never reopens a resolved row,
 * so it can never undo a driver's dismissal, and a locally pending
 * acknowledgement is skipped outright by the caller.
 */
export async function applyServerAcknowledgement(
  logDate: string,
  ack: {
    serverId: string;
    source: DivergenceAckSource;
    actor: string | null;
    reason: string | null;
    at: string | null;
  },
): Promise<boolean> {
  const existing = await roadsideDb.rods_divergences.get(logDate);
  if (!existing) return false;
  if (existing.ack_pending === 1) return false;
  if (existing.acknowledged === 1) return false;
  await roadsideDb.rods_divergences.put({
    ...existing,
    acknowledged: 1,
    acknowledged_source: ack.source,
    acknowledged_by: ack.actor,
    acknowledged_reason: ack.reason,
    acknowledged_at: ack.at ?? new Date().toISOString(),
    ack_pending: 0,
    server_id: ack.serverId,
  });
  return true;
}

/** Local rows that have never been reported to the server, for the report queue. */
export async function unreportedDivergences(): Promise<RodsDivergenceEntry[]> {
  try {
    const rows = await roadsideDb.rods_divergences.toArray();
    return rows.filter((r) => !r.server_id);
  } catch {
    return [];
  }
}