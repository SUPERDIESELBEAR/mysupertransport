import { supabase } from '@/integrations/supabase/client';
import type { ClassificationKey } from '@/lib/revisedRateCon';

/**
 * Charges on a load, and the reimbursement facts dispatch confirms during it.
 *
 * A reimbursement pays back what was actually spent, to whoever spent it. Any
 * difference between what the broker pays and what was spent is company
 * revenue. That makes three facts necessary and none of them knowable at parse
 * time: a rate confirmation saying "driver pays $30 on site" states a
 * requirement, not an outcome.
 */

export type FundingSource = 'driver' | 'company';

export interface LoadChargeRecord {
  id: string;
  load_id: string;
  load_stop_id: string | null;
  charge_type: string;
  description: string | null;
  amount: number | string | null;
  source: string | null;
  funding_source: FundingSource | null;
  actual_cost: number | string | null;
  proof_document_id: string | null;
}

const CHARGE_COLUMNS =
  'id, load_id, load_stop_id, charge_type, description, amount, source, '
  + 'funding_source, actual_cost, proof_document_id';

export async function fetchLoadCharges(loadId: string): Promise<LoadChargeRecord[]> {
  const { data, error } = await supabase
    .from('load_charges')
    .select(CHARGE_COLUMNS)
    .eq('load_id', loadId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as unknown as LoadChargeRecord[];
}

/** The classification key a stored charge_type maps to for pay purposes. */
export const chargeClassification = (chargeType: string): ClassificationKey =>
  (['linehaul', 'fsc', 'detention', 'stopoff', 'lumper', 'layover', 'tonu',
    'reimbursement', 'other'].includes(chargeType)
    ? chargeType
    : 'other') as ClassificationKey;

export interface ReimbursementFacts {
  funding_source: FundingSource | '';
  actual_cost: string;
  proof_document_id: string;
}

/**
 * Which of the three reimbursement facts are still missing, in the wording the
 * card shows. Nothing blocks on these in Module 2 — the settlement hold is
 * Phase 2 — but an unconfirmed reimbursement must never look settled.
 */
export function missingReimbursementFacts(charge: LoadChargeRecord): string[] {
  const missing: string[] = [];
  if (!charge.funding_source) missing.push('funding source');
  if (charge.actual_cost === null || charge.actual_cost === undefined || charge.actual_cost === '') {
    missing.push('actual cost');
  }
  if (!charge.proof_document_id) missing.push('proof document');
  return missing;
}

/** Writes the reimbursement facts back. Empty strings clear the field. */
export async function saveReimbursementFacts(
  chargeId: string, facts: ReimbursementFacts,
): Promise<void> {
  const { error } = await supabase
    .from('load_charges')
    .update({
      funding_source: facts.funding_source || null,
      actual_cost: facts.actual_cost.trim() === '' ? null : Number(facts.actual_cost),
      proof_document_id: facts.proof_document_id || null,
    } as never)
    .eq('id', chargeId);
  if (error) throw error;
}

export const FUNDING_SOURCE_LABELS: Record<FundingSource, string> = {
  driver: 'Driver paid out of pocket',
  company: 'Company funded (Comdata / MultiService)',
};

/** Plain statement of what each funding source means for the driver's pay. */
export const FUNDING_SOURCE_MEANING: Record<FundingSource, string> = {
  driver: 'Driver-funded: the driver is reimbursed the actual cost on their settlement.',
  company: 'Company-funded: this is company revenue and does not appear on the driver’s settlement.',
};

/**
 * Entering a charge by hand.
 *
 * These go through narrow RPCs rather than `update_load_with_stops`, which
 * DELETEs every charge on the load and re-inserts the array it is given. A
 * single addition through that path would re-key every surviving row and
 * silently break `detention_claims.resulting_charge_id` and proof-document
 * links. One row in, one row changed, and the change history and
 * `total_load_value` are written server-side.
 */
export interface ChargeEntryInput {
  chargeType: string;
  amount: string;
  description: string;
  reason: string;
  funding_source: FundingSource | '';
  actual_cost: string;
  proof_document_id: string;
}

const rpcArgs = (input: ChargeEntryInput) => ({
  p_charge_type: input.chargeType,
  p_amount: Number(input.amount),
  p_reason: input.reason,
  p_description: input.description.trim() || null,
  p_funding_source: input.funding_source || null,
  p_actual_cost: input.actual_cost.trim() === '' ? null : Number(input.actual_cost),
  p_proof_document_id: input.proof_document_id || null,
});

export async function addLoadCharge(
  loadId: string, input: ChargeEntryInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_load_charge', {
    p_load_id: loadId, ...rpcArgs(input),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateLoadCharge(
  chargeId: string, input: ChargeEntryInput,
): Promise<void> {
  const { error } = await supabase.rpc('update_load_charge', {
    p_charge_id: chargeId, ...rpcArgs(input),
  });
  if (error) throw new Error(error.message);
}

export async function deleteLoadCharge(chargeId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('delete_load_charge', {
    p_charge_id: chargeId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/** Load statuses whose money is fixed — no charge may be entered against them. */
export const MONEY_FIXED_STATUSES = [
  'invoiced', 'factored', 'paid', 'settled', 'closed',
] as const;

export const isMoneyFixed = (status: string | null | undefined): boolean =>
  !!status && (MONEY_FIXED_STATUSES as readonly string[]).includes(status);

