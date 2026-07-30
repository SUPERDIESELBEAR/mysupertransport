/**
 * The single writer for a keyed day's offline cache.
 *
 * Pass A had two generators: hydration rendered a PDF from server rows, and the
 * certification UI rendered its own copy for upload. Two generators means two
 * chances to drift, and the officer-facing copy was always the one that could
 * silently fall behind. Both paths now call this, so what the driver certified,
 * what is uploaded, and what an officer sees at the roadside are the same bytes.
 *
 * Must not import the Supabase client: hydration hands it rows it already
 * fetched, and the certification path hands it rows it built locally. Fetching
 * is the caller's job.
 */
import { renderRodsDay } from '@/lib/eld/renderRodsDay';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import { roadsideDb, type SignatureOrigin } from './db';
import { signatureKeyForDay } from './prune';

export interface EnsureDayCachedInput {
  day: RodsDay;
  events: RodsEvent[];
  driverName: string;
  /** Rendered into the PDF and shown by the native roadside render. */
  signatureDataUrl: string | null;
  /**
   * Where the signature came from. 'local_pending_upload' is never pruned at
   * any age — offline it is the only copy of part of a signed federal record.
   */
  signatureOrigin: SignatureOrigin;
  /**
   * False when the PDF exists only on this device. Pruning skips un-uploaded
   * PDFs unconditionally, so a queued certification cannot be evicted before
   * the sync queue has drained it.
   */
  uploaded: boolean;
}

export interface EnsureDayCachedResult {
  bytes: ArrayBuffer;
  signatureKey: string | null;
}

/**
 * Render and cache one keyed day: structured rows, signature, and PDF bytes.
 * Idempotent — re-running for the same day overwrites in place.
 *
 * PRECEDENCE — who wins when the device and the server both have a copy.
 * This writer does not decide; hydration does, and it decides by this rule.
 * Written down because someone will touch this code without the context.
 *
 * Always fetch the certified row for (operator_id, log_date) FIRST, then
 * compare ids. Never query by the cached rods_day_id and infer absence from an
 * empty result: an amendment sets the cached row to 'superseded' in the same
 * transaction that certifies its replacement.
 *
 * In evaluation order:
 *
 * 1. Local 'certified', certify_rods_day not yet succeeded → LOCAL WINS
 *    ABSOLUTELY. Never overwritten by hydration, for any reason. The signed
 *    PDF and its structured rows are the record; the server has not seen it.
 * 2. No certified row for that date at all → the certification was never
 *    applied or was rejected. That is the rejection path, not a cache
 *    divergence. A certified row that exists but is not the cached one falls
 *    through to 3/4.
 * 3. A different certified row exists for the date, and either its
 *    supersedes_day_id points at the cached row or the cached row is now
 *    'superseded' → legitimate amendment or document replacement. SERVER WINS;
 *    replace the local copy including bytes. Not a divergence. A superseded
 *    local copy must never keep rendering at roadside, however the
 *    supersession happens to be recorded.
 * 4. Different id, no supersession relationship → genuine anomaly. Flag as a
 *    divergence, keep both copies, overwrite nothing.
 * 5. Same id, local certified and synced → SERVER WINS as a refresh, not a
 *    replacement. The day is immutable server-side, so the two should be
 *    identical; differences are a bug, not a normal state (see divergence.ts).
 * 6. Local draft → server wins.
 *
 * Note on certified_at: the server stamps it when the queued certification
 * replays, which for an offline certification is hours or days after signing.
 * The certify handler therefore writes the RPC's returned row back into
 * rods_days_cache, so cache and server match by construction and the
 * comparison stays honest. `local_certified_at` records the real signing time
 * and is never compared.
 */
export async function ensureDayCached(input: EnsureDayCachedInput): Promise<EnsureDayCachedResult> {
  const { day, events, driverName, signatureDataUrl, signatureOrigin, uploaded } = input;
  const cachedAt = new Date().toISOString();

  let signatureKey: string | null = null;
  if (signatureDataUrl) {
    signatureKey = signatureKeyForDay(day.operator_id, day.log_date);
    await roadsideDb.signature_images.put({
      key: signatureKey,
      data_url: signatureDataUrl,
      // A downloaded copy is by definition already on the server.
      uploaded: signatureOrigin === 'downloaded_cache' ? true : uploaded,
      origin: signatureOrigin,
      cached_at: cachedAt,
    });
  }

  // Both structured stores commit together. A kill between them would leave a
  // day with header data and no segments, which renders as an empty grid
  // instead of falling back to the PDF embed.
  await roadsideDb.transaction(
    'rw',
    roadsideDb.rods_days_cache,
    roadsideDb.rods_events_cache,
    async () => {
      await roadsideDb.rods_days_cache.put({
        log_date: day.log_date, operator_id: day.operator_id, day, cached_at: cachedAt,
      });
      await roadsideDb.rods_events_cache.put({
        rods_day_id: day.id, log_date: day.log_date, events, cached_at: cachedAt,
      });
    },
  );

  const blob = await renderRodsDay({ day, events, driverName, signatureDataUrl });
  const bytes = await blob.arrayBuffer();
  await roadsideDb.rods_pdfs.put({
    log_date: day.log_date,
    operator_id: day.operator_id,
    bytes,
    mime: 'application/pdf',
    uploaded,
    cached_at: cachedAt,
  });

  return { bytes, signatureKey };
}

/** Mark a cached day's PDF as uploaded once the sync queue has drained it. */
export async function markDayPdfUploaded(logDate: string): Promise<void> {
  const existing = await roadsideDb.rods_pdfs.get(logDate);
  if (existing) await roadsideDb.rods_pdfs.put({ ...existing, uploaded: true });
}
