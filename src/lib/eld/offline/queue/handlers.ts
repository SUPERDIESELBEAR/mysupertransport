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
import { roadsideDb, type SyncKind } from '../db';

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

export const HANDLERS: Record<SyncKind, SyncHandler> = {
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
   */
  async certify_rods_day(payload) {
    const { error } = await supabase.rpc('certify_rods_day', {
      _day_id: str(payload, 'day_id'),
      _legal_name: str(payload, 'legal_name'),
      _signature_path: str(payload, 'signature_path'),
      _pdf_path: str(payload, 'pdf_path'),
      _device_info: str(payload, 'device_info'),
      p_certification_token: str(payload, 'token'),
    });
    if (error) throw new Error(error.message);
  },

  async create_eld_document_day(payload) {
    const carrier = payload.carrier;
    if (!carrier || typeof carrier !== 'object') {
      throw new Error('Sync payload is missing the carrier snapshot.');
    }
    const { error } = await supabase.rpc('create_eld_document_day', {
      p_operator_id: str(payload, 'operator_id'),
      p_log_date: str(payload, 'log_date'),
      p_source_document_path: str(payload, 'source_document_path'),
      p_carrier: carrier as never,
      p_certification_token: str(payload, 'token'),
    });
    if (error) throw new Error(error.message);
  },

  async replace_rods_document(payload) {
    const { error } = await supabase.rpc('replace_rods_document', {
      _day_id: str(payload, 'day_id'),
      _new_path: str(payload, 'new_path'),
      _reason: str(payload, 'reason'),
      p_certification_token: str(payload, 'token'),
    });
    if (error) throw new Error(error.message);
  },

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
    const { error } = await supabase.functions.invoke('send-eld-malfunction-notice', {
      body: { event_id: str(payload, 'event_id') },
    });
    if (error) throw new Error(error.message ?? 'Notice delivery failed.');
  },

  async upload_merged_packet(payload) {
    const packetId = str(payload, 'packet_id');
    const path = str(payload, 'path');
    const packet = await roadsideDb.merged_packets.get(packetId);
    if (!packet) throw new Error(`No merged packet ${packetId} on this device.`);
    await putBytes(ELD_NOTICE_BUCKET, path, packet.bytes, packet.mime || 'application/pdf');
  },

  async send_officer_email(payload) {
    const { error } = await supabase.functions.invoke('send-officer-packet', {
      body: {
        event_id: optStr(payload, 'event_id'),
        operator_id: str(payload, 'operator_id'),
        packet_path: str(payload, 'packet_path'),
        to_email: str(payload, 'to_email'),
        officer_name: optStr(payload, 'officer_name'),
        agency: optStr(payload, 'agency'),
        included_dates: Array.isArray(payload.included_dates) ? payload.included_dates : [],
      },
    });
    if (error) throw new Error(error.message ?? 'Officer email failed.');
  },
};