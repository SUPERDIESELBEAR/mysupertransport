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

export function resolveDiscountPassthrough(
  override: boolean | null | undefined,
  companyDefault: boolean | null | undefined,
): boolean {
  return override == null ? Boolean(companyDefault) : override;
}

/** The company default policy's value. Staff-only read; drivers never call it. */
export async function fetchCompanyDiscountPassthrough(): Promise<boolean | null> {
  const { data } = await supabase
    .from('pay_policies')
    .select('fuel_discount_passthrough')
    .eq('is_company_default', true)
    .maybeSingle();
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
