/**
 * Clean-up for the artifacts a REPLAYED certification uploaded.
 *
 * When a certification is retried, the client uploads a fresh signature and a
 * fresh PDF before calling the RPC. Paths are timestamped per attempt
 * (`signature-<Date.now()>.png`, `log-<Date.now()>.pdf`), so the second
 * attempt writes to new keys and the server row keeps the FIRST attempt's
 * paths. Those second-attempt objects are orphans and should go.
 *
 * Two rules make this safe:
 *
 * 1. Delete only the paths THIS attempt uploaded, captured before the RPC
 *    call. Never the paths on the returned row — on a replay those belong to
 *    the certification that actually stands, and deleting them would destroy
 *    the signature on a certified federal record.
 * 2. Assert it anyway. If a path we are about to delete equals `pdf_path` or
 *    `certification_signature_path` on the returned row, the naming scheme has
 *    gone deterministic, the second upload overwrote the first, and the "orphan"
 *    is the record's only copy. Skip and log.
 *
 * Best effort throughout: a storage failure must never turn a successful
 * replay into an error the driver sees.
 */
import { supabase } from '@/integrations/supabase/client';
import { RODS_BUCKET } from '@/lib/eld/rodsTypes';

type ReturnedRow =
  | (Record<string, unknown> & {
      pdf_path?: string | null;
      certification_signature_path?: string | null;
    })
  | null
  | undefined;

export async function deleteReplayOrphans(
  row: ReturnedRow,
  uploadedPaths: Array<string | null | undefined>,
): Promise<void> {
  try {
    const live = new Set(
      [row?.pdf_path, row?.certification_signature_path].filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      ),
    );

    const orphans: string[] = [];
    for (const path of uploadedPaths) {
      if (!path) continue;
      if (live.has(path)) {
        console.warn(
          '[rods] replay orphan skipped: path is on the certified row, not an orphan',
          path,
        );
        continue;
      }
      orphans.push(path);
    }
    if (orphans.length === 0) return;

    const { error } = await supabase.storage.from(RODS_BUCKET).remove(orphans);
    if (error) console.warn('[rods] replay orphan cleanup failed', error.message);
  } catch (err) {
    console.warn('[rods] replay orphan cleanup threw', err);
  }
}
