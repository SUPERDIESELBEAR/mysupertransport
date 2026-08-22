import { supabase } from '@/integrations/supabase/client';
import type { ClassificationKey } from '@/lib/revisedRateCon';

/**
 * What a classification does to the driver's settlement, read from the pay
 * policy in force rather than hardcoded.
 *
 * The treatment is a DESCRIPTOR, not a number, on purpose. Every class today
 * settles as a percentage of the line, but that is a property of today's
 * classes, not of the display. A class whose treatment is not a percentage —
 * a reimbursement paid at cost with any excess kept as company margin — returns
 * its own wording and every call site renders it unchanged.
 */
export type PayTreatment =
  | { kind: 'percentage'; pct: number; label: string }
  | { kind: 'at_cost'; label: string }
  | { kind: 'unknown'; label: null };

export interface PayPolicyRates {
  id: string;
  name: string;
  linehaul_pct: number;
  fsc_pct: number;
  detention_pct: number;
  layover_pct: number;
  stopoff_pct: number;
  lumper_reimbursement_pct: number;
  tonu_pct: number;
  other_accessorial_pct: number;
}

const POLICY_COLUMNS =
  'id, name, linehaul_pct, fsc_pct, detention_pct, layover_pct, stopoff_pct, '
  + 'lumper_reimbursement_pct, tonu_pct, other_accessorial_pct';

/** Percentage column backing each classification. */
const PCT_FIELD: Record<ClassificationKey, keyof PayPolicyRates> = {
  linehaul: 'linehaul_pct',
  fsc: 'fsc_pct',
  detention: 'detention_pct',
  stopoff: 'stopoff_pct',
  lumper: 'lumper_reimbursement_pct',
  layover: 'layover_pct',
  tonu: 'tonu_pct',
  other: 'other_accessorial_pct',
};

const trimPct = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));

/** The settlement consequence of a classification, or unknown when no policy loaded. */
export function payTreatment(
  klass: ClassificationKey,
  policy: PayPolicyRates | null,
): PayTreatment {
  if (!policy) return { kind: 'unknown', label: null };
  const pct = Number(policy[PCT_FIELD[klass]]);
  if (!Number.isFinite(pct)) return { kind: 'unknown', label: null };
  return { kind: 'percentage', pct, label: `${trimPct(pct)}% to driver` };
}

/**
 * The policy in force for a load: the driver's own assignment where one is
 * effective today, otherwise the company default. Returns null rather than a
 * guess when neither is readable — the UI then shows no percentage at all.
 */
export async function fetchEffectivePayPolicy(
  operatorId: string | null | undefined,
): Promise<PayPolicyRates | null> {
  if (operatorId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('pay_policy_assignments')
      .select(`pay_policy_id, effective_start_date, effective_end_date, pay_policies(${POLICY_COLUMNS})`)
      .eq('operator_id', operatorId)
      .lte('effective_start_date', today)
      .order('effective_start_date', { ascending: false });

    const active = (data ?? []).find(row =>
      !row.effective_end_date || String(row.effective_end_date) >= today);
    const policy = active?.pay_policies as PayPolicyRates | null | undefined;
    if (policy) return policy;
  }

  const { data: def } = await supabase
    .from('pay_policies')
    .select(POLICY_COLUMNS)
    .eq('is_company_default', true)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (def as unknown as PayPolicyRates | null) ?? null;
}
