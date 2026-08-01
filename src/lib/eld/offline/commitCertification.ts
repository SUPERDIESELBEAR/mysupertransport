/**
 * Commits a certification to the device, atomically, and hands the network
 * work to the sync queue.
 *
 * Ordering is the whole point of this module:
 *
 *   1. The caller renders the signature and the PDF FIRST, outside any
 *      transaction. Writing the local lock before the artifacts exist meant a
 *      render failure left a day locked on the device with nothing behind it.
 *   2. ONE Dexie transaction then writes the bytes, the local certification
 *      lock, the queue chain and the rebuilt roadside manifest. A driver
 *      stopped seconds after signing must never see a packet that disagrees
 *      with the screen they just signed on.
 *
 * Supabase is never imported here: this runs offline, and /roadside reads what
 * it writes.
 */
import { roadsideDb, type RoadsideManifest } from './db';
import { putCachedDay, putCachedEvents, flushEmptySegmentAlerts, type EmptySegmentsDetected } from './cache';
import { signatureKeyForDay } from './prune';
import { buildManifest } from './manifestBuild';
import { newSyncId, type EnqueueInput } from './queue/store';
import { assertSmallPayload } from './queue/types';
import { raiseSyncAlert } from './queue/alerts';
import {
  sha256Hex, SIGNATURE_INVALID_MESSAGE, type SignatureValidation,
} from '@/lib/eld/signatureIntegrity';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';

/**
 * How old a validation result may be when it reaches this function. The
 * caller validates immediately before rendering; anything beyond this means
 * the result was carried across some other flow and no longer describes the
 * bytes about to be committed.
 */
const VALIDATION_MAX_AGE_MS = 10 * 60 * 1000;

export interface CommitCertificationInput {
  operatorId: string;
  logDate: string;
  /** The day as signed, including the typed legal name. */
  day: RodsDay;
  events: RodsEvent[];
  legalName: string;
  signatureDataUrl: string;
  /**
   * REQUIRED, and re-checked here by digest rather than re-run: the pixel pass
   * happens once, at the caller, but this function is the lock-writer and must
   * not take the invariant on trust. A missing signature is what makes a
   * certified §395.8 record invalid, so it is refused where the record is
   * committed, not where it is drawn.
   */
  signatureValidation: SignatureValidation;
  pdfBytes: ArrayBuffer;
  signaturePath: string;
  pdfPath: string;
  deviceInfo: string;
  /** Stable across retries of the same signing attempt. */
  token: string;
  /** Amendment change record. Empty for an original certification. */
  changes: unknown[];
}

export interface CommitCertificationResult {
  /** Wall-clock moment the driver signed, as recorded on the device. */
  localCertifiedAt: string;
  certifyEntryId: string;
  manifest: RoadsideManifest;
}

/**
 * Draft entries for this day that have not drained yet. The certification must
 * depend on them: replaying certify_rods_day against a server row that never
 * received the driver's last header edit certifies the wrong record.
 */
async function pendingDraftIds(logDate: string): Promise<string[]> {
  const open = await roadsideDb.sync_queue
    .filter((e) => (e.status === 'pending' || e.status === 'in_flight')
      && (e.kind === 'save_draft_day' || e.kind === 'save_draft_segments')
      && e.payload?.log_date === logDate)
    .toArray();
  return open.map((e) => e.id);
}

function queueEntry(input: EnqueueInput & { id: string }) {
  assertSmallPayload(input.kind, input.payload);
  const now = new Date().toISOString();
  return {
    id: input.id,
    kind: input.kind,
    payload: input.payload,
    depends_on: input.depends_on ?? [],
    coalesce_key: input.coalesce_key ?? null,
    attempts: 0,
    next_attempt_at: now,
    status: 'pending' as const,
    last_error: null,
    last_error_class: null,
    client_timestamp: now,
    created_at: now,
    updated_at: now,
  };
}

export async function commitCertification(
  input: CommitCertificationInput,
): Promise<CommitCertificationResult> {
  const {
    operatorId, logDate, day, events, legalName, signatureDataUrl, pdfBytes,
    signaturePath, pdfPath, deviceInfo, token, changes, signatureValidation,
  } = input;

  // Refuse before anything is written. Cheap checks first, then the digest —
  // no pixel work, so this costs a hash of a string we already hold.
  if (!signatureValidation || signatureValidation.ok !== true) {
    throw new Error(SIGNATURE_INVALID_MESSAGE);
  }
  if (signatureValidation.byte_length <= 0) {
    throw new Error(SIGNATURE_INVALID_MESSAGE);
  }
  const checkedAt = Date.parse(signatureValidation.checked_at ?? '');
  if (!Number.isFinite(checkedAt) || Math.abs(Date.now() - checkedAt) > VALIDATION_MAX_AGE_MS) {
    throw new Error(SIGNATURE_INVALID_MESSAGE);
  }
  const actualDigest = await sha256Hex(signatureDataUrl);
  if (actualDigest !== signatureValidation.digest) {
    // The result describes different bytes than the ones being committed.
    throw new Error(SIGNATURE_INVALID_MESSAGE);
  }

  const localCertifiedAt = new Date().toISOString();
  const signatureKey = signatureKeyForDay(operatorId, logDate);
  const dependsOnDrafts = await pendingDraftIds(logDate);

  const sigEntryId = newSyncId();
  const pdfEntryId = newSyncId();
  const certifyEntryId = newSyncId();

  const signedDay = {
    ...day,
    certification_legal_name: legalName,
    certification_signature_path: signaturePath,
    pdf_path: pdfPath,
    certification_signature_validation: signatureValidation,
  } as RodsDay;

  // Every store the transaction touches — including the ones buildManifest
  // reads — has to be declared. Dexie throws on a table the outer transaction
  // did not name, and that throw would land after the driver signed.
  // Scoped to this call, not module state: an abort throws past the flush
  // below, and a concurrent hydration cannot drain this value.
  let emptySegments: EmptySegmentsDetected | null = null;
  const manifest = await roadsideDb.transaction(
    'rw',
    [
      roadsideDb.rods_days_cache,
      roadsideDb.rods_events_cache,
      roadsideDb.rods_pdfs,
      roadsideDb.signature_images,
      roadsideDb.rods_documents,
      roadsideDb.roadside_manifest,
      roadsideDb.local_meta,
      roadsideDb.sync_queue,
    ],
    async () => {
      await roadsideDb.signature_images.put({
        key: signatureKey,
        data_url: signatureDataUrl,
        uploaded: false,
        // Exempts these bytes from pruning until they reach Storage: they are
        // the only copy of the driver's signature in existence.
        origin: 'local_pending_upload',
        cached_at: localCertifiedAt,
      });
      await roadsideDb.rods_pdfs.put({
        log_date: logDate,
        operator_id: operatorId,
        bytes: pdfBytes,
        mime: 'application/pdf',
        uploaded: false,
        cached_at: localCertifiedAt,
      });

      const existing = await roadsideDb.rods_days_cache.get(logDate);
      await putCachedDay({
        log_date: logDate,
        operator_id: operatorId,
        day: signedDay,
        // The lock the editor honours immediately. It is device-local: the
        // office copy is not certified until the queue drains, but the driver
        // must not be able to edit a log they have already signed.
        local_certified_at: localCertifiedAt,
        unsynced: true,
        version: (existing?.version ?? 0) + 1,
        sync_rejected: false,
        sync_stalled: false,
      });
      ({ emptySegments } = await putCachedEvents({
        rods_day_id: signedDay.id,
        log_date: logDate,
        operator_id: operatorId,
        provenance: 'local_certification',
        day_status: signedDay.status,
        // The server row stays 'draft' until the queue drains; this is what
        // makes a locally signed day certified for the purposes of the guard.
        local_certified_at: localCertifiedAt,
        events,
        unsynced: true,
        version: (existing?.version ?? 0) + 1,
      }));

      await roadsideDb.sync_queue.bulkPut([
        queueEntry({
          id: sigEntryId,
          kind: 'upload_signature',
          payload: { key: signatureKey, path: signaturePath, log_date: logDate },
        }),
        queueEntry({
          id: pdfEntryId,
          kind: 'upload_rods_pdf',
          payload: { log_date: logDate, path: pdfPath },
        }),
        queueEntry({
          id: certifyEntryId,
          kind: 'certify_rods_day',
          // Artifacts first, drafts before that: the RPC records paths, so it
          // must not run until the bytes are actually in Storage.
          depends_on: [...dependsOnDrafts, sigEntryId, pdfEntryId],
          payload: {
            day_id: signedDay.id,
            log_date: logDate,
            legal_name: legalName.trim(),
            signature_path: signaturePath,
            pdf_path: pdfPath,
            device_info: deviceInfo,
            token,
            changes,
            signature_validation: signatureValidation,
          },
        }),
      ]);

      const built = await buildManifest({ mode: 'upsert-day', operatorId, logDate });
      await roadsideDb.roadside_manifest.put(built);
      return built;
    },
  );

  await flushEmptySegmentAlerts(emptySegments);
  return { localCertifiedAt, certifyEntryId, manifest };
}
