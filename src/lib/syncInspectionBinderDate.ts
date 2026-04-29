/**
 * Auto-populate the "Periodic DOT Inspections" binder doc's `expires_at`
 * (which now stores the inspection date) from the latest record in
 * `truck_dot_inspections` for the same operator.
 *
 * Vehicle Hub is the source of truth: when binder and Vehicle Hub disagree
 * the binder is updated to match the Vehicle Hub `inspection_date`.
 *
 * Returns:
 *  - matched: true when the binder's stored date came from (or already matches)
 *    the latest Vehicle Hub record — callers use this to show the "Auto-synced"
 *    indicator.
 *  - changed: true when this call wrote a new date into the binder, so callers
 *    can refresh.
 *  - syncedAt: ISO timestamp of when the sync was verified.
 *  - vhDate: the Vehicle Hub date the binder is now in sync with (when matched).
 */
import { supabase } from '@/integrations/supabase/client';

const DOC_NAME = 'Periodic DOT Inspections';

export interface InspectionSyncResult {
  matched: boolean;
  changed: boolean;
  syncedAt: string | null;
  vhDate: string | null;
}

const NO_MATCH: InspectionSyncResult = { matched: false, changed: false, syncedAt: null, vhDate: null };

export async function syncInspectionBinderDateFromVehicleHub(
  driverUserId: string,
): Promise<InspectionSyncResult> {
  if (!driverUserId) return NO_MATCH;

  // 1. Find the binder doc row for this driver
  const { data: doc } = await supabase
    .from('inspection_documents')
    .select('id, expires_at')
    .eq('scope', 'per_driver')
    .eq('driver_id', driverUserId)
    .eq('name', DOC_NAME)
    .maybeSingle();
  if (!doc?.id) return NO_MATCH;

  // 2. Resolve operator row id for this driver
  const { data: op } = await supabase
    .from('operators')
    .select('id')
    .eq('user_id', driverUserId)
    .maybeSingle();
  if (!op?.id) return NO_MATCH;

  // 3. Latest Vehicle Hub inspection date for this operator
  const { data: latest } = await supabase
    .from('truck_dot_inspections')
    .select('inspection_date')
    .eq('operator_id', op.id)
    .order('inspection_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const vhDate = latest?.inspection_date as string | null | undefined;
  if (!vhDate) return NO_MATCH;

  const syncedAt = new Date().toISOString();

  // 4. Skip write if binder already matches Vehicle Hub — but still report match
  if (doc.expires_at === vhDate) {
    return { matched: true, changed: false, syncedAt, vhDate };
  }

  // 5. Write Vehicle Hub date into binder
  const { error } = await supabase
    .from('inspection_documents')
    .update({ expires_at: vhDate })
    .eq('id', doc.id);
  if (error) {
    console.warn('[syncInspectionBinderDate] update failed', error);
    return NO_MATCH;
  }
  return { matched: true, changed: true, syncedAt, vhDate };
}