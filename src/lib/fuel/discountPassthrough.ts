/**
 * WHO SEES A FUEL DISCOUNT — one resolution order, shared.
 *
 * The settlement engine reads the per-driver setting FIRST and falls back to
 * the company default policy. Every driver-facing surface has to answer the
 * same question the same way, because a driver who is not receiving the
 * discount must see NO reference to one existing — not a line, not a column,
 * not a total. This module holds that one rule so no surface can invent a
 * second one.
 *
 * It resolves a SETTING. It computes no money.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchCompanyPolicyVersion, todayAsOf } from '@/lib/payPolicyVersion';

export function resolveDiscountPassthrough(
  override: boolean | null | undefined,
  companyDefault: boolean | null | undefined,
): boolean {
  return override == null ? Boolean(companyDefault) : override;
}

/** The company default policy's value. Staff-only read; drivers never call it. */
export async function fetchCompanyDiscountPassthrough(): Promise<boolean | null> {
  // PASS 1 — the version in force TODAY, through the one shared resolver.
  // The switch itself is NOT versioned (P41: only the percentages are), but it
  // is read OFF a policy row, so which row answers still has to be the right one.
  const data = await fetchCompanyPolicyVersion<{ fuel_discount_passthrough: boolean | null }>(
    supabase, todayAsOf(), 'fuel_discount_passthrough');
  return data?.fuel_discount_passthrough ?? null;
}

/** The effective setting for one driver, from a staff screen. */
export async function fetchOperatorDiscountPassthrough(operatorId: string): Promise<boolean> {
  const [op, company] = await Promise.all([
    supabase.from('operators')
      .select('fuel_discount_passthrough_override')
      .eq('id', operatorId).maybeSingle(),
    fetchCompanyDiscountPassthrough(),
  ]);
  return resolveDiscountPassthrough(
    (op.data as { fuel_discount_passthrough_override?: boolean | null } | null)
      ?.fuel_discount_passthrough_override,
    company,
  );
}
