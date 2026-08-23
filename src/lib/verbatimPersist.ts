import { supabase } from '@/integrations/supabase/client';
import type { VerbatimVerification } from '@/lib/verbatimVerify';

/**
 * Files the verdicts for a load's verbatim captures on the load itself.
 *
 * Scoping this to the review session was the earlier mistake: the capture is
 * stored on the load forever, so how it was judged has to be stored beside it.
 * Six months on, "this span was hand-repaired because the model reproduced the
 * PDF's pilcrow" is the only thing that explains why the load text and the
 * document's text layer disagree.
 */
export async function saveVerbatimVerification(
  loadId: string,
  records: VerbatimVerification[] | null | undefined,
): Promise<void> {
  if (!loadId || !records?.length) return;
  const { error } = await supabase.rpc('set_load_verbatim_verification', {
    p_load_id: loadId,
    p_records: records as never,
  });
  if (error) throw error;
}
