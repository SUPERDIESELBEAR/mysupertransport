/**
 * One handler per SyncKind. Each takes the entry payload — which holds only
 * byte-store keys — reads the bytes from Dexie, and performs exactly one
 * server-side effect. Handlers throw on failure; classification and retry
 * scheduling belong to the runner.
 */
import { supabase } from '@/integrations/supabase/client';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { RODS_BUCKET } from '@/lib/eld/rodsTypes';
import { ELD_NOTICE_BUCKET } from '@/lib/eld/pendingNotice';
import { deleteReplayOrphans } from '@/lib/eld/rodsReplayOrphans';
import { assertRowsAffected } from '@/lib/eld/rodsWrite';
import { announceIfSuppressed } from '@/lib/eld/demoSuppression';
import type { RodsDay } from '@/lib/eld/rodsTypes';
import { roadsideDb, type SyncKind } from '../db';
import { markDaySynced, putCachedDay } from '../cache';

type Payload = Record<string, unknown>;

function str(payload: Payload, key: string): string {
  const v = payload[key];
  if (typeof v !== 'string' || !v) throw new Error(`Sync payload is missing "${key}".`);
  return v;
}

function optStr(payload: Payload, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' && v ? v : null;
}

async function putBytes(
  bucket: string, path: string, bytes: ArrayBuffer, contentType: string,
): Promise<void> {
  const { error } = await uploadToBucket(
    bucket, path, new Blob([bytes], { type: contentType }), { upsert: true, contentType },
  );
  if (error) throw new Error(error.message ?? 'Upload failed.');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
  const bin = atob(b64 ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export type SyncHandler = (payload: Payload) => Promise<void>;

/**
 * Write the row the RPC returned back into the day cache.
 *
 * certified_at is server-set at replay time, which for an offline
 * certification is hours or days after the driver signed. Without this
 * write-back the cache would hold the signing time and every offline
 * certification would flag as a divergence on the next hydration. The real
 * signing time is preserved separately in local_certified_at.
 *
 * `replayed` is stripped first. It is a property of the CALL, not of the day,
 * and has no business sitting on the local copy of a federal record. It would
 * not trip compareKeyedDay — that fingerprints certified_at, the four totals
 * and segment count — but a phantom field on a §395.8 record is still wrong.
 */
async function cacheReturnedDay(data: unknown): Promise<void> {
  const { replayed: _replayed, ...rest } =
    (data ?? {}) as Record<string, unknown> & { replayed?: boolean };
  const day = rest as unknown as RodsDay | null;
  if (!day?.id || !day.log_date) return;
  const existing = await roadsideDb.rods_days_cache.get(day.log_date);
  await putCachedDay({
    log_date: day.log_date,
    operator_id: day.operator_id,
    day,
    local_certified_at:
      existing?.local_certified_at ?? existing?.day?.certified_at ?? null,
    // The server has now confirmed this exact row, so the device is no longer
    // ahead — but only for the version that was sent. A newer local edit keeps
    // its own flag; see markDaySynced.
    unsynced: false,
    version: existing?.version ?? 0,
    sync_rejected: false,
    sync_stalled: existing?.sync_stalled ?? false,
  });
}

export const HANDLERS: Record<SyncKind, SyncHandler> = {
  /**
   * Deliver an office-facing sync alert.
   *
   * The RPC resolves the caller's operator from auth.uid() and refuses a
   * payload that names someone else, so a compromised client cannot raise
   * alerts about other drivers. It also owns the dedupe: one OPEN alert per
   * (operator, date, kind), with a recurrence bumping last_seen_at and the
   * occurrence count rather than creating a duplicate.
   */
  async raise_sync_alert(payload) {
    const { error } = await supabase.rpc('raise_eld_sync_alert', {
      // Null is a real value here: an unattributable alert. The RPC accepts it
      // and routes the fan-out to Management with no driver name.
      p_operator_id: optStr(payload, 'operator_id'),
      p_kind: str(payload, 'alert_kind'),
      p_log_date: optStr(payload, 'log_date'),
      p_detail: optStr(payload, 'detail') ?? '',
    });
    if (error) throw error;
  },

  /**
   * Replay one day's header from the cache to the server.
   *
   * The payload carries KEYS, never the row: the entry may replay days after
   * the driver typed, and by then the cache — not the payload — is what the
   * driver has been looking at. Reading it here is what makes coalescing safe
   * and what makes the queue the single owner of draft writes.
   */
  async save_draft_day(payload) {
    const logDate = str(payload, 'log_date');
    const version = Number(payload.version ?? 0);
    const cached = await roadsideDb.rods_days_cache.get(logDate);
    if (!cached) throw new Error(`No cached day for ${logDate}. Nothing to save.`);
    // The driver certified since this entry was queued; the certify entry
    // carries the final state and the row is about to lock. Nothing to do.
    if (cached.day.status === 'certified' && cached.day.locked) return;

    const res = await supabase
      .from('rods_days')
      .upsert(cached.day as never, { onConflict: 'id' })
      .select('id');
    assertRowsAffected(res, {
      table: 'rods_days', operation: 'offline draft save', dayId: cached.day.id, logDate,
    });
    await markDaySynced(logDate, version);
  },

  /**
   * Replay one day's duty-status entries. Delete-then-insert, because the
   * driver's segment list is a whole statement about the 24 hours: a partial
   * merge can leave a gap or an overlap that certify_rods_day then refuses.
   */
  async save_draft_segments(payload) {
    const logDate = str(payload, 'log_date');
    const dayId = str(payload, 'day_id');
    const version = Number(payload.version ?? 0);
    const cached = await roadsideDb.rods_events_cache.get(dayId);
    if (!cached) throw new Error(`No cached entries for ${logDate}. Nothing to save.`);

    const { error: delErr } = await supabase.from('rods_events').delete().eq('rods_day_id', dayId);
    if (delErr) throw new Error(delErr.message);
    if (cached.events.length) {
      const res = await supabase.from('rods_events').insert(cached.events.map((e) => ({
        rods_day_id: dayId,
        start_minute: e.start_minute,
        end_minute: e.end_minute,
        duty_status: e.duty_status,
        city: e.city,
        state: e.state,
        remarks: e.remarks,
        is_short_period: e.is_short_period,
      })) as never).select('id');
      assertRowsAffected(res, {
        table: 'rods_events', operation: 'offline segment save', dayId, logDate,
      });
    }
    await markDaySynced(logDate, version);
  },

  /** Upload the locally rendered day PDF, then mark the cached copy uploaded. */
  async upload_rods_pdf(payload) {
    const logDate = str(payload, 'log_date');
    const path = str(payload, 'path');
    const entry = await roadsideDb.rods_pdfs.get(logDate);
    if (!entry) throw new Error(`No cached PDF for ${logDate}. Nothing to upload.`);
    await putBytes(RODS_BUCKET, path, entry.bytes, entry.mime || 'application/pdf');
    await roadsideDb.rods_pdfs.update(logDate, { uploaded: true });
  },

  async upload_signature(payload) {
    const key = str(payload, 'key');
    const path = str(payload, 'path');
    const entry = await roadsideDb.signature_images.get(key);
    if (!entry) throw new Error(`No cached signature for ${key}. Nothing to upload.`);
    const { error } = await uploadToBucket(
      RODS_BUCKET, path, dataUrlToBlob(entry.data_url),
      { upsert: true, contentType: 'image/png' },
    );
    if (error) throw new Error(error.message ?? 'Signature upload failed.');
    await roadsideDb.signature_images.update(key, { uploaded: true });
  },

  /**
   * Tokened certification. A replay of the same token returns the existing row
   * as a no-op server-side, so this is safe to retry without inspecting state.
   *
   * `changes` is the amendment change record, computed by the caller before
   * enqueueing and filed by the RPC in the same transaction as the
   * certification. It must ride in the payload: the queue may replay hours
   * after the driver signed, on a device that no longer holds the original
   * log, so the diff cannot be recomputed here.
   */
  async certify_rods_day(payload) {
    const raw = payload.changes;
    const changes = Array.isArray(raw) ? raw : [];
    const sentSignaturePath = str(payload, 'signature_path');
    const sentPdfPath = str(payload, 'pdf_path');
    const { data, error } = await supabase.rpc('certify_rods_day', {
      _day_id: str(payload, 'day_id'),
      _legal_name: str(payload, 'legal_name'),
      _signature_path: sentSignaturePath,
      _pdf_path: sentPdfPath,
      _device_info: str(payload, 'device_info'),
      p_certification_token: str(payload, 'token'),
      p_changes: changes as never,
      // Recorded on the row so the office can tell a pixel-checked signature
      // from one only structurally checked. Null for entries queued by a
      // client that predates the check.
      p_signature_validation: (payload.signature_validation ?? null) as never,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | (Record<string, unknown> & { replayed?: boolean; log_date?: string })
      | null;
    const replayed = row?.replayed === true;

    if (replayed) {
      // The office already has this certification from an earlier attempt.
      // Cheap check first: if the cached copy is already the certified row
      // there is nothing to write back.
      const cached = row?.log_date
        ? await roadsideDb.rods_days_cache.get(row.log_date)
        : undefined;
      if (!cached?.day?.certified_at) await cacheReturnedDay(row);
      await deleteReplayOrphans(row, [sentSignaturePath, sentPdfPath]);
      return;
    }
    await cacheReturnedDay(row);
  },

  // `create_eld_document_day` and `replace_rods_document` had handlers here and
  // no enqueue site. Both RPCs were dropped on 2026-08-18 along with the
  // driver-facing upload modal that was their only caller — zero
  // record_source = 'eld_document' rows existed. The column, its CHECK value
  // and the P0019/P0045/P0046 guards remain, so a staff-side filing path is an
  // additive change. See docs/deferred-removals.md.
  /**
   * 395.34(a)(1) notice PDF. `notice_uploaded_at` is stamped only after the
   * bytes land, because the server must never try to email a notice that has
   * no file behind it. The `.is(null)` guard keeps a replay from moving the
   * recorded upload time forward.
   */
  async upload_notice_pdf(payload) {
    const eventId = str(payload, 'event_id');
    const path = str(payload, 'path');
    const entry = await roadsideDb.notice_pdfs.get(eventId);
    if (!entry) throw new Error(`No cached notice PDF for event ${eventId}.`);
    await putBytes(ELD_NOTICE_BUCKET, path, entry.bytes, 'application/pdf');
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({ notice_pdf_path: path, notice_uploaded_at: new Date().toISOString() })
      .eq('id', eventId)
      .is('notice_uploaded_at', null);
    if (error) throw new Error(error.message);
  },

  async upload_notice_signature(payload) {
    const key = str(payload, 'key');
    const path = str(payload, 'path');
    const entry = await roadsideDb.signature_images.get(key);
    if (!entry) throw new Error(`No cached notice signature for ${key}.`);
    const { error } = await uploadToBucket(
      ELD_NOTICE_BUCKET, path, dataUrlToBlob(entry.data_url),
      { upsert: true, contentType: 'image/png' },
    );
    if (error) throw new Error(error.message ?? 'Signature upload failed.');
    await roadsideDb.signature_images.update(key, { uploaded: true });
  },

  /**
   * Carrier delivery of the notice. Enqueued only when notice_sent_at is null
   * (see the drain), and the edge function is itself idempotent per event, so
   * a retry cannot restart the 8-day clock with a second timestamp.
   */
  async send_notice(payload) {
    const { data, error } = await supabase.functions.invoke('send-eld-malfunction-notice', {
      body: { event_id: str(payload, 'event_id') },
    });
    if (error) throw new Error(error.message ?? 'Notice delivery failed.');
    announceIfSuppressed(data, 'The ELD malfunction notice to the carrier was held back.');
  },

  async upload_merged_packet(payload) {
    const packetId = str(payload, 'packet_id');
    const path = str(payload, 'path');
    const packet = await roadsideDb.merged_packets.get(packetId);
    if (!packet) throw new Error(`No merged packet ${packetId} on this device.`);
    await putBytes(ELD_NOTICE_BUCKET, path, packet.bytes, packet.mime || 'application/pdf');
  },

  /**
   * Officer delivery.
   *
   * `entry_id` is this queue entry's own client-generated uuid, and it is what
   * the server dedupes on: a retry of this entry is a no-op, while a second
   * officer on the same day is a different entry and goes out.
   */
  async send_officer_email(payload) {
    const { data, error } = await supabase.functions.invoke('send-officer-packet', {
      body: {
        entry_id: str(payload, 'entry_id'),
        operator_id: str(payload, 'operator_id'),
        storage_path: str(payload, 'packet_path'),
        officer_email: str(payload, 'to_email'),
        officer_name: optStr(payload, 'officer_name'),
        window_start: str(payload, 'window_start'),
        window_end: str(payload, 'window_end'),
        included_dates: Array.isArray(payload.included_dates) ? payload.included_dates : [],
        dispositions: Array.isArray(payload.dispositions) ? payload.dispositions : [],
        downsampled_pass: payload.downsampled_pass ?? null,
        link_mode: payload.link_mode === true,
      },
    });
    if (error) throw new Error(error.message ?? 'Officer email failed.');
    announceIfSuppressed(
      data,
      'The officer packet email and the carrier copy were held back.',
    );
  },

  /**
   * File the audit record of an authorized unlock.
   *
   * The RPC resolves the caller's operator from auth.uid() and refuses a
   * payload naming anybody else, dedupes on the client-generated
   * `idempotency_key` so a retried entry returns the existing row instead of
   * filing a second unlock, and notifies Management in the same transaction.
   *
   * Transport failure retries forever: this kind is cascade-exempt and never
   * exhausts its attempt budget, because the office learning late that a
   * signed log was reopened is recoverable and never learning it is not.
   */
  async record_unlock(payload) {
    const { error } = await supabase.rpc('record_rods_unlock', {
      p_operator_id: str(payload, 'operator_id'),
      p_rods_day_id: optStr(payload, 'rods_day_id'),
      p_log_date: str(payload, 'log_date'),
      p_unlocked_at: str(payload, 'unlocked_at'),
      p_local_certified_at: optStr(payload, 'local_certified_at'),
      p_cancelled_entry_ids: (Array.isArray(payload.cancelled_entry_ids)
        ? payload.cancelled_entry_ids : []) as never,
      p_cancelled_states: (payload.cancelled_states ?? {}) as never,
      p_reason: str(payload, 'reason'),
      p_device_info: optStr(payload, 'device_info'),
      p_idempotency_key: str(payload, 'idempotency_key'),
    });
    if (error) throw error;
  },

  /**
   * File the server-side divergence record, and write the returned row id back
   * into the local record so a later acknowledgement can name it directly.
   *
   * Cascade-exempt and retried forever for the same reason as `record_unlock`:
   * the office learning late that a certified day disagrees with its copy is
   * recoverable, never learning it is not.
   */
  async record_divergence(payload) {
  const logDate = str(payload, 'log_date');
  const { data, error } = await supabase.rpc('record_rods_divergence', {
    p_operator_id: str(payload, 'operator_id'),
    p_log_date: logDate,
    p_local_row_id: optStr(payload, 'local_row_id'),
    p_server_row_id: optStr(payload, 'server_row_id'),
    p_differing_fields: (Array.isArray(payload.differing_fields)
      ? payload.differing_fields : []) as never,
    p_local_values: (payload.local_values ?? {}) as never,
    p_server_values: (payload.server_values ?? {}) as never,
    p_detected_at: str(payload, 'detected_at'),
    p_device_info: optStr(payload, 'device_info'),
    p_idempotency_key: str(payload, 'idempotency_key'),
  });
  if (error) throw error;
  const serverId = typeof data === 'string' ? data : null;
  if (serverId) {
    const local = await roadsideDb.rods_divergences.get(logDate);
    if (local) await roadsideDb.rods_divergences.put({ ...local, server_id: serverId });
    }
  },

  /**
   * Propagate a device-side resolution.
   *
   * The row is named by id when the report has already drained, and resolved by
   * (operator, date) when it has not — the two entries can drain in either order
   * on a device that came back online mid-sequence. A row that does not exist
   * server-side yet is a no-op success, not a failure: the report entry is still
   * queued and this device will re-issue the acknowledgement after it lands.
   *
   * `ack_pending` is cleared only once the server has the resolution. Until then
   * hydration treats the local acknowledgement as authoritative.
   */
  async acknowledge_divergence(payload) {
  const logDate = str(payload, 'log_date');
  const operatorId = str(payload, 'operator_id');
  let serverId = optStr(payload, 'divergence_id');

  if (!serverId) {
    const { data, error } = await supabase
      .from('rods_divergences')
      .select('id')
      .eq('operator_id', operatorId)
      .eq('log_date', logDate)
      .eq('acknowledged', false)
      .order('detected_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    serverId = data?.[0]?.id ?? null;
  }

  if (serverId) {
    const { error } = await supabase.rpc('acknowledge_rods_divergence', {
      p_divergence_id: serverId,
      p_reason: str(payload, 'reason'),
    });
    if (error) throw error;
  }

  const local = await roadsideDb.rods_divergences.get(logDate);
  if (local) {
    await roadsideDb.rods_divergences.put({
      ...local,
      ack_pending: 0,
        server_id: serverId ?? local.server_id ?? null,
      });
    }
  },
  };