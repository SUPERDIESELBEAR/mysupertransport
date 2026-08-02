/**
 * §7 — migration of 395.34(a)(1) malfunction notices off localStorage and onto
 * the sync queue.
 *
 * Imports the Supabase client, so it is reachable only from the runner — never
 * from /roadside's import graph.
 *
 * The single rule that shapes every branch below: a pending notice in
 * localStorage may be the only copy of a signed federal document that exists
 * anywhere. Nothing here deletes bytes it has not first confirmed are stored
 * somewhere else, and nothing here silently swallows an entry it cannot read.
 */
import { supabase } from '@/integrations/supabase/client';
import { roadsideDb } from '../db';
import { enqueue, getEntry } from './store';
import { raiseSyncAlert } from './alerts';

const PENDING_PREFIX = 'eld_pending_notice_';
const STATE_PREFIX = 'eld_notice_drain_state_';
const CORRUPT_PREFIX = 'eld_notice_drain_corrupt_';

/** Orphan alert arms. They are an OR — whichever is reached first fires. */
const ORPHAN_DEFERRALS = 5;
const ORPHAN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface NoticeDrainSummary {
  alreadyDelivered: number;
  uploadOnly: number;
  migrated: number;
  deferredOffline: number;
  deferredMissing: number;
  corrupt: number;
}

// ---------------------------------------------------------------- local state

interface DrainState {
  deferrals: number;
  first_deferred_at: string | null;
  alerted_missing: boolean;
}

/**
 * Corrupt entries get their own flag, keyed on the localStorage key rather than
 * on an event id they may not contain, and separate from `alerted_missing`.
 * Sharing one flag would let whichever alert fires first suppress the other.
 */
interface CorruptState {
  alerted_corrupt: boolean;
  first_seen_at: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
}

function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ decoding

interface DecodedNotice {
  eventId: string;
  operatorId: string;
  pdfBytes: ArrayBuffer;
  signatureBase64: string | null;
  savedAt: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Throws on anything unusable: bad JSON, a missing eventId/operatorId, or a
 * pdf body that will not base64-decode. Callers must treat a throw as branch 5
 * and must not touch any field of the entry — there may not be one.
 */
function decodeNotice(raw: string | null): DecodedNotice {
  if (!raw) throw new Error('empty pending-notice value');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const eventId = typeof parsed.eventId === 'string' ? parsed.eventId : '';
  const operatorId = typeof parsed.operatorId === 'string' ? parsed.operatorId : '';
  if (!eventId) throw new Error('pending notice has no eventId');
  if (!operatorId) throw new Error('pending notice has no operatorId');
  const pdfBase64 = typeof parsed.pdfBase64 === 'string' ? parsed.pdfBase64 : '';
  if (!pdfBase64) throw new Error('pending notice has no pdf body');
  const pdfBytes = base64ToArrayBuffer(pdfBase64); // throws on undecodable base64
  if (!pdfBytes.byteLength) throw new Error('pending notice pdf body is empty');
  const signatureBase64 =
    typeof parsed.signatureBase64 === 'string' && parsed.signatureBase64
      ? parsed.signatureBase64
      : null;
  return {
    eventId,
    operatorId,
    pdfBytes,
    signatureBase64,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
  };
}

// ------------------------------------------------------- deterministic ids

/** Fixed namespace for notice sync ids. Never change it: ids must be stable. */
const NAMESPACE = 'a4f1c9de-6b3d-5f0a-9c21-7e8b2d4a6c10';

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * RFC 4122 v5 (SHA-1) uuid over (namespace, `${eventId}:${kind}`). Deterministic
 * so that re-running the drain — on every app start — cannot produce a second
 * upload or a second carrier email for the same notice.
 */
export async function noticeSyncId(eventId: string, kind: string): Promise<string> {
  const name = new TextEncoder().encode(`${eventId}:${kind}`);
  const ns = uuidBytes(NAMESPACE);
  const input = new Uint8Array(ns.length + name.length);
  input.set(ns, 0);
  input.set(name, ns.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
  ].join('-');
}

export function noticeSignatureKey(eventId: string): string {
  return `notice:${eventId}`;
}

// ------------------------------------------------------------------- writes

async function cacheBytes(notice: DecodedNotice): Promise<void> {
  await roadsideDb.notice_pdfs.put({
    event_id: notice.eventId,
    bytes: notice.pdfBytes,
    cached_at: new Date().toISOString(),
  });
  if (notice.signatureBase64) {
    await roadsideDb.signature_images.put({
      key: noticeSignatureKey(notice.eventId),
      data_url: `data:image/png;base64,${notice.signatureBase64}`,
      uploaded: false,
      // Explicit at the write site. These bytes are the only copy until the
      // upload lands, which is what exempts them from pruning at any age.
      origin: 'local_pending_upload',
      cached_at: new Date().toISOString(),
    });
  }
}

/**
 * Enqueue the byte uploads (and optionally the send), then confirm every row
 * reads back out of Dexie before the localStorage copy is released.
 * Returns false when any read-back is missing — the key then stays put.
 */
async function enqueueAndConfirm(
  notice: DecodedNotice, opts: { includeSend: boolean },
): Promise<boolean> {
  const base = `${notice.operatorId}/${notice.eventId}`;
  const ids: string[] = [];

  const pdfId = await noticeSyncId(notice.eventId, 'upload_notice_pdf');
  await enqueue({
    id: pdfId,
    kind: 'upload_notice_pdf',
    payload: {
      operator_id: notice.operatorId, event_id: notice.eventId, path: `${base}/notice.pdf`,
    },
    client_timestamp: notice.savedAt,
  });
  ids.push(pdfId);

  if (notice.signatureBase64) {
    const sigId = await noticeSyncId(notice.eventId, 'upload_notice_signature');
    await enqueue({
      id: sigId,
      kind: 'upload_notice_signature',
      payload: {
        operator_id: notice.operatorId,
        key: noticeSignatureKey(notice.eventId),
        path: `${base}/signature.png`,
      },
      client_timestamp: notice.savedAt,
    });
    ids.push(sigId);
  }

  if (opts.includeSend) {
    const sendId = await noticeSyncId(notice.eventId, 'send_notice');
    await enqueue({
      id: sendId,
      kind: 'send_notice',
      payload: { operator_id: notice.operatorId, event_id: notice.eventId },
      depends_on: [...ids],
      client_timestamp: notice.savedAt,
    });
    ids.push(sendId);
  }

  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await getEntry(id))) return false;
  }
  return true;
}

function releaseKeys(key: string, eventId: string): void {
  removeKey(key);
  // Drop the sibling state so records cannot accumulate and a stale
  // alerted_missing cannot suppress a legitimate alert for a later notice.
  removeKey(`${STATE_PREFIX}${eventId}`);
  removeKey(`${CORRUPT_PREFIX}${key}`);
}

// ------------------------------------------------------------------- branches

async function handleDeferredMissing(eventId: string, operatorId: string | null): Promise<void> {
  const stateKey = `${STATE_PREFIX}${eventId}`;
  const prev = readJson<DrainState>(stateKey);
  const state: DrainState = {
    deferrals: (prev?.deferrals ?? 0) + 1,
    first_deferred_at: prev?.first_deferred_at ?? new Date().toISOString(),
    alerted_missing: prev?.alerted_missing ?? false,
  };

  const agedOut = state.first_deferred_at
    ? Date.now() - Date.parse(state.first_deferred_at) >= ORPHAN_AGE_MS
    : false;

  if (!state.alerted_missing && (state.deferrals >= ORPHAN_DEFERRALS || agedOut)) {
    state.alerted_missing = true;
    await raiseSyncAlert({
      kind: 'notice_orphaned',
      // The decoded notice knows its operator, so this one IS attributable.
      operator_id: operatorId,
      detail:
        `Pending malfunction notice for event ${eventId} has no matching event row on the `
        + `server after ${state.deferrals} attempt(s) since ${state.first_deferred_at}. `
        + 'The signed notice exists only on the driver\'s device.',
    });
  }
  writeJson(stateKey, state);
}

/**
 * Branch 5. Receives only the raw localStorage key and the decode error — it
 * must never dereference a field of an entry that failed to parse, because a
 * corrupt entry may have no eventId at all. The flag is therefore keyed on the
 * localStorage key, which is always available: keying on eventId would produce
 * one shared `..._undefined` record and suppress every corrupt alert after the
 * first.
 */
async function handleCorrupt(key: string, err: unknown): Promise<void> {
  const flagKey = `${CORRUPT_PREFIX}${key}`;
  const prev = readJson<CorruptState>(flagKey);
  if (prev?.alerted_corrupt) return;
  const message = err instanceof Error ? err.message : String(err);
  await raiseSyncAlert({
    kind: 'notice_drain_corrupt',
    // Genuinely unattributable: the entry failed to decode, so it has no
    // operator to name. Explicit null routes it to Management's bell rather
    // than being counted as undeliverable and lost.
    operator_id: null,
    detail:
      `Unreadable pending malfunction notice at localStorage key "${key}" (${message}). `
      + 'The entry has been left in place; its bytes may be the only copy of a signed notice.',
  });
  writeJson(flagKey, {
    alerted_corrupt: true,
    first_seen_at: prev?.first_seen_at ?? new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------- drain

function pendingKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PENDING_PREFIX)) keys.push(key);
    }
  } catch { /* ignore */ }
  return keys;
}

/**
 * Migrate every pending notice. Idempotent, so it is safe on every app start
 * and from each of the runner's triggers.
 */
export async function drainPendingNotices(): Promise<NoticeDrainSummary> {
  const summary: NoticeDrainSummary = {
    alreadyDelivered: 0, uploadOnly: 0, migrated: 0,
    deferredOffline: 0, deferredMissing: 0, corrupt: 0,
  };
  if (typeof localStorage === 'undefined') return summary;

  for (const key of pendingKeys()) {
    let notice: DecodedNotice;
    try {
      notice = decodeNotice(localStorage.getItem(key));
    } catch (err) {
      // Branch 5 — nothing about this entry is trustworthy, including its id.
      summary.corrupt += 1;
      console.warn('[eld-notice-drain] corrupt pending notice left in place', key);
      // eslint-disable-next-line no-await-in-loop
      await handleCorrupt(key, err);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('eld_malfunction_events')
      .select('id, notice_sent_at, notice_uploaded_at')
      .eq('id', notice.eventId)
      .maybeSingle();

    if (error) {
      // Branch 3 — transient. Deliberately does NOT count toward the orphan
      // alert: a week offline must never look like a missing event row.
      summary.deferredOffline += 1;
      console.warn('[eld-notice-drain] deferred: event unreadable (network)', notice.eventId);
      continue;
    }

    if (!data) {
      // Branch 4 — the query succeeded and the row is genuinely absent.
      summary.deferredMissing += 1;
      console.warn('[eld-notice-drain] deferred: event not found on server', notice.eventId);
      // eslint-disable-next-line no-await-in-loop
      await handleDeferredMissing(notice.eventId);
      continue;
    }

    const sent = Boolean(data.notice_sent_at);
    const uploaded = Boolean(data.notice_uploaded_at);

    if (sent && uploaded) {
      // Branch 1a — delivered and stored. Storage holds the bytes, so the
      // local copy is redundant and may go.
      summary.alreadyDelivered += 1;
      console.info('[eld-notice-drain] notice already delivered and stored', notice.eventId);
      releaseKeys(key, notice.eventId);
      continue;
    }

    if (sent && !uploaded) {
      // Branch 1b — emailed, but the bytes never reached Storage. This
      // localStorage copy is the only copy of the evidence. Upload only:
      // re-sending would restart the carrier's 8-day clock.
      // eslint-disable-next-line no-await-in-loop
      await cacheBytes(notice);
      // eslint-disable-next-line no-await-in-loop
      const ok = await enqueueAndConfirm(notice, { includeSend: false });
      summary.uploadOnly += 1;
      console.info(
        '[eld-notice-drain] notice sent but never stored — uploading bytes only', notice.eventId,
      );
      if (ok) releaseKeys(key, notice.eventId);
      continue;
    }

    // Branch 2 — not sent. Full migration: bytes then send, dependency-ordered.
    // eslint-disable-next-line no-await-in-loop
    await cacheBytes(notice);
    // eslint-disable-next-line no-await-in-loop
    const ok = await enqueueAndConfirm(notice, { includeSend: true });
    summary.migrated += 1;
    console.info('[eld-notice-drain] migrated notice to sync queue', notice.eventId);
    if (ok) releaseKeys(key, notice.eventId);
  }

  return summary;
}
