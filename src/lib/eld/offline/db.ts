/**
 * Offline store for Roadside Presentation Mode.
 *
 * Everything an officer sees at the roadside is read from here. This module
 * must never import the Supabase client, directly or transitively — see
 * src/lib/eld/offline/__tests__/roadsideImportGraph.test.ts, which walks the
 * real import graph from the /roadside entry and fails if it can reach it.
 */
import Dexie, { type Table } from 'dexie';
import { RODS_PERIOD_START_DEFAULT } from '@/lib/eld/rodsTypes';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';

/**
 * Cached identity for the roadside header, and the ONLY carrier source the
 * record-creating paths are allowed to read. Written on authenticated load.
 *
 * The seven carrier_* fields mirror `carrier_profile` in full. They are written
 * as a unit: a partial or failed carrier fetch must leave a previously good
 * cache alone rather than half-overwrite it (see writeLocalMeta). Absent
 * `carrier_cached_at`, treat the carrier identity as unknown and block record
 * creation instead of substituting a bootstrap constant.
 */
export interface LocalMeta {
  key: 'identity';
  operator_id: string;
  driver_name: string;
  driver_user_id: string | null;
  truck_number: string | null;
  carrier_name: string;
  carrier_usdot: string;
  carrier_mc: string;
  carrier_main_office_address: string;
  carrier_home_terminal_address: string;
  carrier_home_terminal_timezone: string;
  carrier_fmcsa_division_state: string;
  /** Set only after a complete carrier_profile fetch. Absent = unknown carrier. */
  carrier_cached_at: string | null;
  /** The operator's own terminal, which may differ from the carrier default. */
  home_terminal_address: string | null;
  home_terminal_timezone: string;
  /**
   * Demo (sandbox) driver. Cached so the roadside surface — which renders with
   * no network — can watermark artifacts that have no record row of their own,
   * such as the officer packet cover and placeholder pages.
   */
  is_demo?: boolean;
  /**
   * The `operators.demo_reset_at` value this device has already honoured. Only
   * ever advanced by the demo wipe (see demoReset.ts), which refuses to run
   * unless the server row says `is_demo`.
   */
  demo_reset_at?: string | null;
  updated_at: string;
}

/** Locally rendered PDF for a `keyed` certified day. */
export interface RodsPdfEntry {
  log_date: string;
  operator_id: string;
  bytes: ArrayBuffer;
  mime: string;
  /** False once Pass B writes local-first certifications. Never pruned while false. */
  uploaded: boolean;
  cached_at: string;
}

/**
 * Bytes for an `eld_document` day. These exist only in Storage — they cannot
 * be regenerated on the device, so hydration is the only path to them and it
 * stays in Pass B.
 */
export interface RodsDocumentEntry {
  log_date: string;
  operator_id: string;
  source_path: string;
  filename: string;
  bytes: ArrayBuffer;
  mime: string;
  size: number;
  /**
   * The rods_days row this file belongs to. Needed so hydration can tell a
   * legitimate replacement (replace_rods_document supersedes the old row) from
   * a genuine divergence. Optional: rows cached before v4 predate the field.
   */
  day_id?: string;
  /** Server-set certification time of `day_id`, for the same-id comparison. */
  certified_at?: string | null;
  /**
   * Whether the browser could actually decode this as an image. Probed at
   * hydration, never inferred from the MIME type: Chrome cannot decode HEIC
   * even though the MIME type says image/heic.
   */
  renderable: boolean;
  /** Display-only JPEG re-encode. The original above stays the record. */
  display_bytes: ArrayBuffer | null;
  display_mime: string | null;
  /**
   * The uploading device tried to convert this image for display and could
   * not — the driver's phone produced a format the app cannot decode. Drives
   * the officer-facing named-card copy. Absent on rows cached before Pass B §6.
   */
  display_conversion_failed?: boolean;
  cached_at: string;
}

export interface NoticePdfEntry {
  event_id: string;
  bytes: ArrayBuffer;
  cached_at: string;
}

/**
 * Where a cached signature image came from. This decides whether it can ever
 * be pruned.
 *
 * 'local_pending_upload' — produced on this device and not yet uploaded. It is
 *   the only copy of part of a signed record, so it is never pruned at any age.
 * 'downloaded_cache'     — a copy of a signature that already lives on the
 *   server. Prunes on the same rules as rods_pdfs; otherwise the store grows
 *   without bound.
 */
export type SignatureOrigin = 'local_pending_upload' | 'downloaded_cache';

export interface SignatureImageEntry {
  key: string;
  data_url: string;
  uploaded: boolean;
  /** Required at every write site. Never defaulted — the two cases prune differently. */
  origin: SignatureOrigin;
  cached_at: string;
}

export type ManifestDayKind = 'keyed' | 'eld_document';

export interface ManifestDay {
  log_date: string;
  kind: ManifestDayKind;
  /** 'Certified' | 'On file (ELD log)' — the officer-facing label. */
  label: string;
  cached: boolean;
  renderable: boolean;
  filename: string | null;
  showsTotals: boolean;
  /**
   * Bytes for this day exist on the device, so print / email-merge / download
   * can serve it. Distinct from `renderable`, which is the in-app decode probe:
   * a PDF the browser cannot preview still prints perfectly well.
   *
   * Added after manifests were already on devices, and a version mismatch marks
   * a manifest stale without discarding it — so an older cached manifest has
   * this undefined. Every consumer MUST read `printable ?? cached`.
   */
  printable?: boolean;
  /**
   * An open, unresolved mismatch between this device's certified copy and the
   * office copy. The local copy keeps rendering — it is the driver's signed
   * record — but the day is flagged for review.
   */
  diverged?: boolean;
}

export interface RoadsideManifest {
  key: 'current';
  operator_id: string;
  /** Ordered newest-first, computed in the cached home-terminal timezone. */
  days: ManifestDay[];
  window_start: string;
  window_end: string;
  event: {
    id: string;
    discovered_at: string;
    malfunction_code: string;
    malfunction_description: string;
    repair_deadline: string;
    device_label: string | null;
    has_notice: boolean;
  } | null;
  built_at: string;
}

export interface RodsDayCacheEntry {
  log_date: string;
  operator_id: string;
  day: RodsDay;
  /**
   * When the driver actually signed on this device. Distinct from
   * `day.certified_at`, which the server stamps when the queued certification
   * replays — possibly days later. Never compared against the server.
   */
  local_certified_at: string | null;
  /**
   * The device holds edits the server has not confirmed. Hydration must not
   * overwrite an unsynced entry: local is ahead, not behind.
   */
  unsynced: boolean;
  /** Monotonic per-day. A sync only clears `unsynced` for the version it sent. */
  version: number;
  /** 0/1 mirror of `unsynced`, because Dexie cannot index a boolean. Written by putCachedDay only. */
  unsynced_flag?: 0 | 1;
  /** A draft write was refused terminally. The day needs a resolution path. */
  sync_rejected: boolean;
  /** The chain for this day gave up or was cancelled. Same. */
  sync_stalled: boolean;
  /**
   * The SQLSTATE (or `HTTP <status>`) behind a terminal failure, and whether
   * the refusal was one this client knows by name. An unrecognised code gets
   * plain driver-facing copy that carries the code instead of copy that
   * implies the driver did something wrong.
   */
  sync_failure_code?: string | null;
  sync_failure_recognized?: boolean;
  /**
   * When the driver tapped to dismiss the "the office has your log"
   * confirmation. Written ONLY by that tap. Never set by a timer, a mount, or
   * a visibility heuristic — see LogSyncBanner.
   */
  sync_confirmed_seen_at?: string | null;
  cached_at: string;
}

export interface RodsEventCacheEntry {
  rods_day_id: string;
  log_date: string;
  events: RodsEvent[];
  unsynced: boolean;
  version: number;
  cached_at: string;
}

/** Declared in Pass A, exercised in Pass B. */
export interface PendingMutation {
  id?: number;
  kind: string;
  payload: unknown;
  idempotency_key: string;
  depends_on: string | null;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
}

/**
 * Pass B sync queue.
 *
 * This supersedes `pending_mutations`, which is left in place untouched: its
 * primary key is an auto-increment `++id` and Pass B needs a client-generated
 * uuid (the id IS the idempotency key). Dexie upgrades here are additive only,
 * so redefining that key is not allowed — a new store is. `pending_mutations`
 * is never written again and is removed in a later version, after telemetry
 * shows it empty. No bytes are discarded.
 */
export type SyncKind =
  | 'upload_rods_pdf'
  | 'upload_signature'
  | 'certify_rods_day'
  | 'save_draft_day'
  | 'save_draft_segments'
  // 'create_eld_document_day' and 'replace_rods_document' were removed here,
  // and the RPCs behind them were dropped on 2026-08-18 with the driver-facing
  // ELD-document upload (docs/deferred-removals.md). An entry carrying one of
  // these kinds cannot exist, and the runner fails an unknown kind loudly
  // ("No handler for ...") rather than crashing the drain.
  | 'upload_notice_pdf'
  | 'upload_notice_signature'
  | 'send_notice'
  | 'upload_merged_packet'
  | 'send_officer_email'
  /**
   * Office-facing. Reports a sync condition Management must act on. Exempt
   * from every cancellation path — see CASCADE_EXEMPT_KINDS.
   */
  | 'raise_sync_alert'
  /**
   * Office-facing. Files the audit record of an authorized unlock: the driver
   * took a signed, locked, unsynced day back to draft with office permission.
   * Exempt from every cancellation path — it reports the very act that
   * cancelled the rest of the day's chain, so the chain cannot kill it.
   */
  | 'record_unlock'
  /**
   * Office-facing. Files the server-side record of a certified day whose local
   * copy does not match the office copy. Cascade-exempt: a divergence is
   * reported precisely when the day's own chain is in doubt, so that chain must
   * not be able to cancel the report of it.
   */
  | 'record_divergence'
  /**
   * Office-facing. Propagates a device-side resolution of a divergence to the
   * server so the console and the phone agree. Cascade-exempt for the same
   * reason as its sibling.
   */
  | 'acknowledge_divergence';

/**
 * `cancelled` is terminal and is NOT a failure of the entry itself: the chain
 * it belonged to was abandoned (a predecessor rejected, or the driver unlocked
 * the day). Distinguished from `failed` so the driver is told once, about the
 * cause, rather than once per orphaned entry.
 */
export type SyncStatus =
  | 'pending' | 'in_flight' | 'succeeded' | 'failed' | 'rejected' | 'cancelled';
/**
 * `row_not_writable` is a write that RLS filtered: 0 rows, no error. It is
 * terminal like `rejected` — replaying cannot change the answer, and the
 * driver must be told the edit never landed.
 */
export type SyncErrorClass =
  | 'network' | 'server' | 'rejected' | 'row_not_writable' | 'cancelled';

export interface SyncQueueEntry {
  /** Client-generated uuid. Also the idempotency key — never regenerated. */
  id: string;
  kind: SyncKind;
  /**
   * Byte-store KEYS only, never bytes. Enforced by assertSmallPayload: an entry
   * carrying megabytes would be rewritten on every attempt and every backoff.
   */
  payload: Record<string, unknown>;
  depends_on: string[];
  attempts: number;
  next_attempt_at: string;
  status: SyncStatus;
  last_error: string | null;
  last_error_class: SyncErrorClass | null;
  client_timestamp: string;
  created_at: string;
  updated_at: string;
  /** Why this entry was cancelled, when status is `cancelled`. */
  cancelled_by?: string | null;
  /**
   * Entries with the same key describe the same thing — one day's header, one
   * day's segments — so a pending one is replaced rather than accumulated.
   */
  coalesce_key?: string | null;
  /** Set by the runner when an entry reaches `succeeded`. Drives case (h). */
  completed_at?: string | null;
}

/** A merged officer packet, assembled on-device and queued for upload/send. */
export interface MergedPacketEntry {
  id: string;
  event_id: string;
  bytes: ArrayBuffer;
  mime: string;
  size: number;
  included_dates: string[];
  created_at: string;
}

export type DivergenceAckSource = 'management' | 'driver';

/**
 * A certified day whose local copy does not match the office copy. Certified
 * days are immutable at both ends, so this should never happen in normal
 * operation — when it does, both copies are kept until someone understands
 * why. Nothing here is ever silently overwritten.
 */
export interface RodsDivergenceEntry {
  log_date: string;
  operator_id: string;
  local_day: RodsDay;
  local_events: RodsEvent[];
  local_row_id: string;
  server_row_id: string;
  /** Only the cheap comparison fields, both sides, for the console record. */
  local_values: Record<string, unknown>;
  server_values: Record<string, unknown>;
  differing_fields: string[];
  detected_at: string;
  /** 0 = open, 1 = resolved. Numeric because Dexie cannot index a boolean. */
  acknowledged: 0 | 1;
  acknowledged_source: DivergenceAckSource | null;
  acknowledged_by: string | null;
  acknowledged_reason: string | null;
  acknowledged_at: string | null;
  /**
   * The server row id, once `record_divergence` has drained. Absent while the
   * report is still queued — the acknowledgement handler resolves the row by
   * (operator, date) in that case.
   */
  server_id?: string | null;
  /**
   * 1 while an acknowledgement has been made on this device but the queue
   * entry carrying it has not drained. Reconciliation treats such a row as
   * locally authoritative: the driver's dismissal wins until it syncs.
   */
  ack_pending?: 0 | 1;
}

class RoadsideDb extends Dexie {
  local_meta!: Table<LocalMeta, string>;
  rods_pdfs!: Table<RodsPdfEntry, string>;
  rods_documents!: Table<RodsDocumentEntry, string>;
  notice_pdfs!: Table<NoticePdfEntry, string>;
  signature_images!: Table<SignatureImageEntry, string>;
  roadside_manifest!: Table<RoadsideManifest, string>;
  rods_days_cache!: Table<RodsDayCacheEntry, string>;
  rods_events_cache!: Table<RodsEventCacheEntry, string>;
  pending_mutations!: Table<PendingMutation, number>;
  sync_queue!: Table<SyncQueueEntry, string>;
  merged_packets!: Table<MergedPacketEntry, string>;
  rods_divergences!: Table<RodsDivergenceEntry, string>;

  constructor() {
    super('superdrive_roadside');
    this.version(1).stores({
      local_meta: 'key',
      rods_pdfs: 'log_date, operator_id, uploaded, cached_at',
      rods_documents: 'log_date, operator_id, renderable, cached_at',
      notice_pdfs: 'event_id',
      signature_images: 'key, uploaded',
      roadside_manifest: 'key',
      rods_days_cache: 'log_date, operator_id',
      rods_events_cache: 'rods_day_id',
      pending_mutations: '++id, idempotency_key, next_attempt_at, depends_on',
    });
    // v2 — signature origin, and a log_date index on the events cache so it can
    // be pruned by day alongside rods_days_cache.
    //
    // Dexie upgrade invariant: every version here is ADDITIVE. Never drop a
    // store, never delete rows, and never call clear() in an upgrade. These
    // stores hold the only offline copy of signed federal records, and a
    // driver who upgrades roadside with no connectivity has no way to
    // re-hydrate. Schema drift is handled by marking the manifest stale, not
    // by discarding bytes.
    this.version(2).stores({
      signature_images: 'key, uploaded, origin',
      rods_events_cache: 'rods_day_id, log_date',
    }).upgrade(async (tx) => {
      // Pre-v2 rows were all written by the (unshipped) local signing path.
      // Treat them as local so nothing signed is ever pruned by the upgrade.
      await tx.table('signature_images').toCollection().modify((row: SignatureImageEntry) => {
        row.origin = row.origin ?? 'local_pending_upload';
      });
    });
    // v3 — additive: the Pass B sync queue and the merged officer packets it
    // uploads. Nothing is dropped, nothing is migrated, nothing is cleared.
    this.version(3).stores({
      sync_queue: 'id, status, next_attempt_at, kind, created_at',
      merged_packets: 'id, event_id, created_at',
    });
    // v4 — additive: divergence records. No store is dropped and no existing
    // row is touched; the two new optional fields on rods_documents and
    // rods_days_cache are simply absent on pre-v4 rows and read as undefined.
    this.version(4).stores({
      rods_divergences: 'log_date, operator_id, detected_at, acknowledged',
    });
    // v5 — additive: local-first draft bookkeeping. No store is dropped and no
    // bytes are discarded; existing rows are backfilled with the conservative
    // defaults (synced, version 0, not locked, not stalled) so a device that
    // upgrades offline keeps every record it already holds.
    this.version(5).stores({
      // `unsynced_flag` is a 0/1 mirror of `unsynced` — Dexie cannot index a
      // boolean, and the stalled-log banner needs a keyed lookup, not a scan.
      rods_days_cache: 'log_date, operator_id, unsynced_flag',
    }).upgrade(async (tx) => {
      await tx.table('rods_days_cache').toCollection().modify((row: RodsDayCacheEntry) => {
        row.unsynced = row.unsynced ?? false;
        row.unsynced_flag = row.unsynced ? 1 : 0;
        row.version = row.version ?? 0;
        row.local_certified_at = row.local_certified_at ?? null;
        row.sync_rejected = row.sync_rejected ?? false;
        row.sync_stalled = row.sync_stalled ?? false;
      });
      await tx.table('rods_events_cache').toCollection().modify((row: RodsEventCacheEntry) => {
        row.unsynced = row.unsynced ?? false;
        row.version = row.version ?? 0;
      });
    });
    // v6 — backfill period_start_time on drafts minted before newLocalRodsDay
    // existed. Those rows omit the field entirely, so the first preflight after
    // a round-trip reports a difference against the server's '00:00:00'
    // default in a field the driver never touched.
    //
    // modify() the ONE field, never put() the row. A whole-row write here would
    // be built from whatever shape this build believes the entry has, and would
    // silently drop `unsynced`, `local_certified_at` or any field a later
    // version adds — on a device whose only copy of a signed federal record is
    // this table.
    this.version(6).stores({}).upgrade(async (tx) => {
      await tx.table('rods_days_cache').toCollection().modify((row: RodsDayCacheEntry) => {
        if (row.day && (row.day.period_start_time === undefined || row.day.period_start_time === null)) {
          row.day.period_start_time = RODS_PERIOD_START_DEFAULT;
        }
      });
    });
  }
}

export const roadsideDb = new RoadsideDb();

export async function readLocalMeta(): Promise<LocalMeta | undefined> {
  try {
    return await roadsideDb.local_meta.get('identity');
  } catch {
    return undefined;
  }
}

export async function readManifest(): Promise<RoadsideManifest | undefined> {
  try {
    return await roadsideDb.roadside_manifest.get('current');
  } catch {
    return undefined;
  }
}

/** Ask the browser to keep this origin's storage across eviction pressure. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* not supported — nothing to do */
  }
}