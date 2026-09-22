/**
 * A DRIVER'S OWN LINEHAUL PERCENTAGE — one resolver, project-wide.
 *
 * PER-DRIVER PAY, PASS 3 (design 2026-09-22, option (c)).
 *
 * P38: a settlement pays a driver's LINEHAUL from HIS percentage; every other
 * rate — fuel surcharge, detention, layover, TONU, stop-off, lumper and the rest
 * — keeps resolving from the COMPANY pay policy version in force. That is why
 * this module overrides exactly ONE column and nothing else: a later
 * company-wide change to detention must still reach every driver.
 *
 * P41: the percentage is dated. `operator_linehaul_pct_versions` holds one
 * current version per driver plus closed history, so a past work week is always
 * paid at the rate in force FOR THAT WEEK — the settlement resolves against its
 * own `period_start`, never against today.
 *
 * `operators.pay_percentage` is a convenience MIRROR of the current version (the
 * earnings forecast reads it and nothing else). It is never the authority here:
 * a settlement for a past week would read the wrong number from it.
 */
import { pctForClassification, withLinehaulPct, type PayPolicyRates } from '@/lib/payTreatment';
import { companyPolicyVersionQuery } from '@/lib/payPolicyVersion';

/* eslint-disable @typescript-eslint/no-explicit-any */
type LinehaulClient = any;

/** One row of the driver's dated linehaul history, as the readers need it. */
export interface OperatorLinehaulVersionRow {
  /**
   * The version's own id. A settlement line records it (Pass 4), so "why was he
   * paid this percentage" is answered by the row that set it rather than by a
   * figure with no provenance.
   */
  id?: string | null;
  operator_id: string;
  pct: number | string;
  effective_from: string;
  effective_to: string | null;
}

/** His percentage on the date read for, and the version it was read from. */
export interface ResolvedOperatorLinehaul {
  pct: number;
  versionId: string | null;
}

export interface LinehaulReadResult {
  data: OperatorLinehaulVersionRow[] | null;
  error: unknown;
}

/**
 * Every driver's version in force on `asOf`, in one read.
 *
 * Returns the builder rather than the rows so each call site keeps its own error
 * handling — a failed read of a pay rate must never degrade into "no override",
 * which would silently pay the company rate instead of his.
 */
export function operatorLinehaulVersionsQuery(
  sb: LinehaulClient,
  asOf: string,
): PromiseLike<LinehaulReadResult> {
  return sb
    .from('operator_linehaul_pct_versions')
    .select('id, operator_id, pct, effective_from, effective_to')
    .lte('effective_from', asOf)
    .or(`effective_to.is.null,effective_to.gte.${asOf}`) as PromiseLike<LinehaulReadResult>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * operator id → his percentage on the date the rows were read for.
 *
 * One current version per driver is a database constraint, and the date window
 * is applied by the query, so a second row for the same driver would be a defect
 * rather than a choice to make here: the later `effective_from` wins, which is
 * the same tie-break the company resolver uses.
 */
export function linehaulByOperator(
  rows: OperatorLinehaulVersionRow[],
): Record<string, ResolvedOperatorLinehaul> {
  const bestFrom: Record<string, string> = {};
  const out: Record<string, ResolvedOperatorLinehaul> = {};
  for (const r of rows) {
    const pct = num(r.pct);
    if (pct === null || !r.operator_id) continue;
    if (bestFrom[r.operator_id] && bestFrom[r.operator_id] > r.effective_from) continue;
    bestFrom[r.operator_id] = r.effective_from;
    out[r.operator_id] = { pct, versionId: r.id ?? null };
  }
  return out;
}

/** The percentages alone, for callers that record nothing. */
export function linehaulPctByOperator(
  rows: OperatorLinehaulVersionRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [operatorId, resolved] of Object.entries(linehaulByOperator(rows))) {
    out[operatorId] = resolved.pct;
  }
  return out;
}

/**
 * THE resolver: the driver's percentage in force on the date, else the company
 * version's linehaul share. Null only when neither can be read — in which case
 * the caller pays nothing rather than guessing, exactly as
 * `pctForClassification` already does.
 */
export function resolveLinehaulPct(
  operatorPct: number | null | undefined,
  companyPolicy: PayPolicyRates | null,
): number | null {
  if (operatorPct !== null && operatorPct !== undefined && Number.isFinite(operatorPct)) {
    return operatorPct;
  }
  return pctForClassification('linehaul', companyPolicy);
}

/**
 * The policy a load is priced with, with ONLY the linehaul share replaced by the
 * driver's own. Returned as a policy so every downstream reader — the header
 * linehaul line, a `linehaul`-classified charge, a late linehaul adjustment —
 * pays his rate from one substitution, and no consumer re-derives a column.
 */
export function policyWithOperatorLinehaul(
  policy: PayPolicyRates | null,
  operatorPct: number | null | undefined,
): PayPolicyRates | null {
  if (!policy) return policy;
  if (operatorPct === null || operatorPct === undefined || !Number.isFinite(operatorPct)) {
    return policy;
  }
  return withLinehaulPct(policy, operatorPct);
}

/** Staff-screen/builder read of one driver's effective rate on a specific date. */
export async function fetchEffectiveOperatorLinehaul(
  sb: LinehaulClient,
  operatorId: string,
  asOf: string,
): Promise<{ pct: number; source: 'driver_version' | 'company_policy'; versionId: string | null; effectiveFrom: string | null } | null> {
  const [versionsRes, policyRes] = await Promise.all([
    sb.from('operator_linehaul_pct_versions')
      .select('id, operator_id, pct, effective_from, effective_to')
      .eq('operator_id', operatorId)
      .lte('effective_from', asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    companyPolicyVersionQuery<PayPolicyRates>(sb, asOf),
  ]);
  if (versionsRes.error) throw versionsRes.error;
  if (policyRes.error) throw policyRes.error;
  const driver = versionsRes.data as OperatorLinehaulVersionRow | null;
  if (driver) return { pct: Number(driver.pct), source: 'driver_version', versionId: driver.id ?? null, effectiveFrom: driver.effective_from };
  const policy = policyRes.data as (PayPolicyRates & { id?: string; effective_from?: string | null }) | null;
  const pct = resolveLinehaulPct(null, policy);
  return pct === null ? null : { pct, source: 'company_policy', versionId: policy?.id ?? null, effectiveFrom: policy?.effective_from ?? null };
}
