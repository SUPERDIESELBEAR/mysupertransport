import { supabase } from '@/integrations/supabase/client';
import { uploadToBucket } from '@/lib/uploadWithAuth';

/**
 * Offline-safe notice delivery.
 *
 * The client owns getting the PDF into Storage. Until `notice_uploaded_at` is
 * set the server must never try to email the notice — there is nothing to send.
 */

const STORAGE_PREFIX = 'eld_pending_notice_';
export const ELD_NOTICE_BUCKET = 'eld-notices';

export type PendingNotice = {
  eventId: string;
  operatorId: string;
  pdfBase64: string;
  signatureBase64: string | null;
  savedAt: string;
};

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function savePendingNotice(notice: PendingNotice) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${notice.eventId}`, JSON.stringify(notice));
  } catch {
    /* storage full — the hourly job will flag the stuck notice to management */
  }
}

export function clearPendingNotice(eventId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${eventId}`);
  } catch { /* ignore */ }
}

export function listPendingNotices(): PendingNotice[] {
  const out: PendingNotice[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try { out.push(JSON.parse(raw) as PendingNotice); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return out;
}

async function deliverOne(notice: PendingNotice): Promise<boolean> {
  const base = `${notice.operatorId}/${notice.eventId}`;
  const pdfPath = `${base}/notice.pdf`;

  const pdfUpload = await uploadToBucket(
    ELD_NOTICE_BUCKET,
    pdfPath,
    base64ToBlob(notice.pdfBase64, 'application/pdf'),
    { upsert: true, contentType: 'application/pdf' },
  );
  if (pdfUpload.error) return false;

  if (notice.signatureBase64) {
    await uploadToBucket(
      ELD_NOTICE_BUCKET,
      `${base}/signature.png`,
      base64ToBlob(notice.signatureBase64, 'image/png'),
      { upsert: true, contentType: 'image/png' },
    );
  }

  // Only now may the carrier email be attempted.
  const { error } = await supabase
    .from('eld_malfunction_events')
    .update({ notice_pdf_path: pdfPath, notice_uploaded_at: new Date().toISOString() })
    .eq('id', notice.eventId)
    .is('notice_uploaded_at', null);
  if (error) return false;

  clearPendingNotice(notice.eventId);

  // Best effort — the hourly job retries any upload that has no send yet.
  try {
    await supabase.functions.invoke('send-eld-malfunction-notice', {
      body: { event_id: notice.eventId },
    });
  } catch { /* retried server-side */ }

  return true;
}

/** Retry every stored notice. Safe to call repeatedly (on app foreground). */
export async function flushPendingNotices(): Promise<number> {
  const pending = listPendingNotices();
  if (!pending.length) return 0;
  let delivered = 0;
  for (const notice of pending) {
    // eslint-disable-next-line no-await-in-loop
    if (await deliverOne(notice)) delivered += 1;
  }
  return delivered;
}