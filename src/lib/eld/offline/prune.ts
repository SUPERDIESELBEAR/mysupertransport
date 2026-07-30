/**
 * Cache pruning for the roadside store.
 *
 * Split out of hydrate.ts so it can be tested without pulling the Supabase
 * client into the test graph. Two rules, and they are not negotiable:
 *   1. Never prune anything the current manifest references.
 *   2. Never prune a local-only artifact that has not been uploaded yet, at
 *      any age — it is the only copy.
 */
import { roadsideDb, type RoadsideManifest } from './db';
import { divergenceHeldDates } from './divergence';

export const PRUNE_AFTER_DAYS = 14;

export function pruneCutoffIso(now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PRUNE_AFTER_DAYS);
  return cutoff.toISOString();
}

export async function pruneRoadsideCache(
  manifest: RoadsideManifest,
  now: Date = new Date(),
): Promise<void> {
  const keep = new Set(manifest.days.map((d) => d.log_date));
  // A flagged day keeps both copies until the divergence is resolved — or for
  // 30 days, whichever comes first (see divergenceHeldDates).
  for (const d of await divergenceHeldDates(now)) keep.add(d);
  const cutoffIso = pruneCutoffIso(now);
  const stale = (logDate: string, cachedAt: string) => !keep.has(logDate) && cachedAt <= cutoffIso;

  for (const p of await roadsideDb.rods_pdfs.toArray()) {
    if (!p.uploaded) continue; // local-only: never pruned
    if (stale(p.log_date, p.cached_at)) await roadsideDb.rods_pdfs.delete(p.log_date);
  }

  for (const d of await roadsideDb.rods_documents.toArray()) {
    if (stale(d.log_date, d.cached_at)) await roadsideDb.rods_documents.delete(d.log_date);
  }

  // The two structured stores prune together, by day, so a pruned day can
  // never leave a header with no segments behind.
  for (const d of await roadsideDb.rods_days_cache.toArray()) {
    if (!stale(d.log_date, d.cached_at)) continue;
    await roadsideDb.transaction('rw', roadsideDb.rods_days_cache, roadsideDb.rods_events_cache, async () => {
      await roadsideDb.rods_days_cache.delete(d.log_date);
      await roadsideDb.rods_events_cache.where('log_date').equals(d.log_date).delete();
    });
  }
  // Orphaned event rows (day row already gone) go too.
  for (const e of await roadsideDb.rods_events_cache.toArray()) {
    if (!stale(e.log_date, e.cached_at)) continue;
    if (await roadsideDb.rods_days_cache.get(e.log_date)) continue;
    await roadsideDb.rods_events_cache.delete(e.rods_day_id);
  }

  // Downloaded signatures are copies of server records and prune normally.
  // Locally signed, not-yet-uploaded ones are exempt permanently.
  for (const s of await roadsideDb.signature_images.toArray()) {
    if (s.origin === 'local_pending_upload') continue;
    if (s.cached_at > cutoffIso) continue;
    if (s.key.split(':').some((part) => keep.has(part))) continue;
    await roadsideDb.signature_images.delete(s.key);
  }
}

/** Signature cache key for a certified day. Encodes the log date so pruning can honour the manifest. */
export function signatureKeyForDay(operatorId: string, logDate: string): string {
  return `rods:${operatorId}:${logDate}`;
}