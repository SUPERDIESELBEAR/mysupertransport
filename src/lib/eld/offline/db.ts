/**
 * Offline store for Roadside Presentation Mode.
 *
 * Everything an officer sees at the roadside is read from here. This module
 * must never import the Supabase client, directly or transitively — see
 * src/lib/eld/offline/__tests__/roadsideImportGraph.test.ts, which walks the
 * real import graph from the /roadside entry and fails if it can reach it.
 */
import Dexie, { type Table } from 'dexie';
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
   * Whether the browser could actually decode this as an image. Probed at
   * hydration, never inferred from the MIME type: Chrome cannot decode HEIC
   * even though the MIME type says image/heic.
   */
  renderable: boolean;
  /** Display-only JPEG re-encode. The original above stays the record. */
  display_bytes: ArrayBuffer | null;
  display_mime: string | null;
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
  cached_at: string;
}

export interface RodsEventCacheEntry {
  rods_day_id: string;
  log_date: string;
  events: RodsEvent[];
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
  | 'create_eld_document_day'
  | 'replace_rods_document'
  | 'upload_notice_pdf'
  | 'upload_notice_signature'
  | 'send_notice'
  | 'upload_merged_packet'
  | 'send_officer_email';

export type SyncStatus = 'pending' | 'in_flight' | 'succeeded' | 'failed' | 'rejected';
export type SyncErrorClass = 'network' | 'server' | 'rejected';

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