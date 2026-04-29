/**
 * Auto-populate the "Periodic DOT Inspections" binder doc's `expires_at`
 * (which now stores the inspection date) from the latest record in
 * `truck_dot_inspections` for the same operator.
 *
 * - No-op if there is no per-driver binder doc, no operator row, or no
 *   Vehicle Hub inspection record.
 * - Only writes when the latest Vehicle Hub `inspection_date` is newer than
 *   what the binder currently shows (Vehicle Hub wins on disagreement).
 * - Returns true when a write occurred, so callers can refresh.
 */
import { supabase } from '@/integrations/supabase/client';

const DOC_NAME = 'Periodic DOT Inspections';

export async function syncInspectionBinderDateFromVehicleHub(
  driverUserId: string,
): Promise<boolean> {
  if (!driverUserId) return false;

  // 1. Find the binder doc row for this driver
  const { data: doc } = await supabase
    .from('inspection_documents')
    .select('id, expires_at')
    .eq('scope', 'per_driver')
    .eq('driver_id', driverUserId)
    .eq('name', DOC_NAME)
    .maybeSingle();
  if (!doc?.id) return false;

  // 2. Resolve operator row id for this driver
  const { data: op } = await supabase
    .from('operators')
    .select('id')
    .eq('user_id', driverUserId)
    .maybeSingle();
  if (!op?.id) return false;

  // 3. Latest Vehicle Hub inspection date for this operator
  const { data: latest } = await supabase
    .from('truck_dot_inspections')
    .select('inspection_date')
    .eq('operator_id', op.id)
    .order('inspection_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const vhDate = latest?.inspection_date as string | null | undefined;
  if (!vhDate) return false;

  // 4. Skip if binder already matches Vehicle Hub
  if (doc.expires_at === vhDate) return false;

  // 5. Write Vehicle Hub date into binder
  const { error } = await supabase
    .from('inspection_documents')
    .update({ expires_at: vhDate })
    .eq('id', doc.id);
  if (error) {
    console.warn('[syncInspectionBinderDate] update failed', error);
    return false;
  }
  return true;
}