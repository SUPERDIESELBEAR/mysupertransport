/**
 * MODULE 4 (dispatch), PASS 4 — gather, compute, store.
 *
 * Three layers, the same separation the driver run uses:
 *
 *   GATHERING  collects rows for the month and decides nothing. It does NOT
 *              drop a TONU or a cancelled load: eligibility is section 4.1 and
 *              belongs to `computeDispatchSettlement`. A filtering gathering
 *              layer could silently disagree with the engine, and a load that
 *              never arrives cannot be reported as ineligible either.
 *   COMPUTE    is `computeDispatchSettlement` (Pass 3), untouched here.
 *   STORE      is `public.compute_dispatch_settlement`, the single writer.
 *
 * WHERE THE COMPUTATION LIVES — the money is computed HERE, in TypeScript, and
 * the RPC persists what it is handed. The alternative — re-deriving section 4
 * in PL/pgSQL — would put the rules in two languages, which is the eighth
 * recorded failure pattern in docs/tms-build-status.md ("correct code
 * overridden by other correct code"). What stops a caller persisting figures
 * the rules would not produce is that the RPC is a REFUSING check, never a
 * producing one:
 *
 *   - it reads the rates itself from `dispatch_settlement_rates` and refuses a
 *     payload whose rates differ;
 *   - it re-adds the payload's own parts and refuses any total that does not
 *     follow from them to the cent;
 *   - it re-tests eligibility against `loads` and refuses a contribution for an
 *     ineligible load, or a payload that OMITS an eligible one.
 *
 * A guard may refuse. It may never produce a figure. That is the line that
 * keeps one representation of the rules while still not trusting the client.
 */
import {
  computeDispatchSettlement,
  type DispatchDeductionInput,
  type DispatchLoadInput,
  type DispatchSettlementInput,
  type DispatchSettlementResult,
} from '@/lib/dispatchSettlement';
import { pctColumnForClassification, type PayPolicyRates } from '@/lib/payTreatment';
import { monthOf } from '@/lib/settlementPeriod';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** First day of a 'YYYY-MM', as the `period_month` the schema stores. */
export function periodMonthDate(month: string): string {
  return `${month}-01`;
}

/**
 * A UTC window guaranteed to contain every instant that could fall inside the
 * month when read in the CARRIER zone. Deliberately loose at both ends: the
 * exact test is `inCalendarMonth`, inside the engine.
 */
function monthWindow(month: string): { fromIso: string; toIso: string } {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1) - 86_400_000;
  const end = Date.UTC(y, m, 1) + 2 * 86_400_000;
  return { fromIso: new Date(start).toISOString(), toIso: new Date(end).toISOString() };
}

export interface GatheredDispatchMonth {
  input: DispatchSettlementInput;
  /** A settlement already stored for this month, if any. */
  existing: { id: string; status: string; net_amount: number } | null;
}

/**
 * Every row the computation could need for the month. Nothing is dropped on
 * the way in.
 */
export async function gatherDispatchMonth(
  sb: Client,
  month: string,
): Promise<GatheredDispatchMonth> {
  const { fromIso, toIso } = monthWindow(month);
  const monthStart = periodMonthDate(month);

  const [loadRes, rateRes, dedRes, policyRes, assignRes, existingRes] = await Promise.all([
    sb.from('loads')
      .select('id, load_number, load_type, status, operator_id, delivered_at, rate_type, '
        + 'linehaul_rate, rate_per_mile, loaded_miles, rate_per_ton, confirmed_tons, '
        + 'fsc_amount, fsc_bundled_into_linehaul, loadout_relocation_fee, dispatcher_id, '
        + 'load_charges(id, load_id, load_stop_id, charge_type, description, amount, source, '
        + 'funding_source, actual_cost, proof_document_id)')
      .not('delivered_at', 'is', null)
      .gte('delivered_at', fromIso)
      .lt('delivered_at', toIso),
    sb.from('dispatch_settlement_rates')
      .select('dispatch_pct, factoring_pct, effective_from, effective_to')
      .lte('effective_from', monthStart)
      .order('effective_from', { ascending: false }),
    sb.from('dispatch_deductions')
      .select('id, label, amount, is_active, effective_from, effective_to')
      .eq('is_active', true)
      .lte('effective_from', monthStart),
    sb.from('pay_policies').select('*').eq('is_company_default', true).maybeSingle(),
    sb.from('pay_policy_assignments')
      .select('operator_id, effective_start_date, effective_end_date, pay_policies(*)'),
    sb.from('dispatch_settlements')
      .select('id, status, net_amount')
      .eq('period_month', monthStart)
      .maybeSingle(),
  ]);

  const rateRow = (rateRes.data ?? []).find((r: any) =>
    !r.effective_to || String(r.effective_to) > monthStart);
  if (!rateRow) {
    throw new Error(`No dispatch settlement rates are effective for ${month}.`);
  }

  const companyPolicy = (policyRes.data ?? null) as PayPolicyRates | null;

  // A driver-level policy assignment governs the charges on that driver's
  // loads, because the exclusion predicate reads "the pay policy IN FORCE".
  const driverPolicies: Record<string, PayPolicyRates> = {};
  for (const a of assignRes.data ?? []) {
    const startsOk = !a.effective_start_date || String(a.effective_start_date) <= monthStart;
    const endsOk = !a.effective_end_date || String(a.effective_end_date) >= monthStart;
    if (startsOk && endsOk && a.pay_policies) {
      driverPolicies[a.operator_id] = a.pay_policies as PayPolicyRates;
    }
  }

  const loads: DispatchLoadInput[] = (loadRes.data ?? []).map((l: any) => ({
    id: l.id,
    loadNumber: l.load_number,
    loadType: l.load_type,
    rateType: l.rate_type,
    status: l.status,
    deliveredAt: l.delivered_at,
    linehaulRate: l.linehaul_rate,
    ratePerMile: l.rate_per_mile,
    loadedMiles: l.loaded_miles,
    ratePerTon: l.rate_per_ton,
    confirmedTons: l.confirmed_tons,
    fscAmount: l.fsc_amount,
    fscBundledIntoLinehaul: l.fsc_bundled_into_linehaul,
    loadoutRelocationFee: l.loadout_relocation_fee,
    dispatcherId: l.dispatcher_id,
    charges: l.load_charges ?? [],
    policyOverride: l.operator_id ? driverPolicies[l.operator_id] ?? null : null,
  }));

  const deductions: DispatchDeductionInput[] = (dedRes.data ?? [])
    .filter((d: any) => !d.effective_to || String(d.effective_to) > monthStart)
    .map((d: any) => ({ id: d.id, label: d.label, amount: d.amount }));

  return {
    input: {
      month,
      dispatchRate: rateRow.dispatch_pct,
      factoringRate: rateRow.factoring_pct,
      companyPolicy,
      loads,
      deductions,
    },
    existing: existingRes.data
      ? {
          id: existingRes.data.id,
          status: existingRes.data.status,
          net_amount: num(existingRes.data.net_amount),
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* The persisted line set                                              */
/* ------------------------------------------------------------------ */

export interface PersistedDispatchLine {
  line_type: 'load_base' | 'factoring_reduction' | 'dispatch_fee' | 'flat_deduction' | 'one_off';
  amount: number;
  description: string;
  load_id: string | null;
  /** FROZEN attribution — a copy taken at compute time (column comment). */
  dispatcher_id: string | null;
  deduction_id: string | null;
}

/**
 * Every stored total also exists as a line. `dispatch_settlements` carries six
 * numeric columns and this is the other representation of the same truth:
 *
 *   eligible_base       = Σ load_base
 *   factoring_reduction = −Σ factoring_reduction
 *   dispatch_fee        =  Σ dispatch_fee
 *   deductions_amount   = −Σ (flat_deduction + one_off)
 *   net_amount          =  Σ (dispatch_fee + flat_deduction + one_off)
 *
 * `load_base` and `factoring_reduction` are the workings, not money owed, so
 * they are deliberately OUTSIDE the net sum. The RPC refuses a payload where
 * any of the five identities fails.
 */
export function persistedDispatchLines(
  result: DispatchSettlementResult,
): PersistedDispatchLine[] {
  const lines: PersistedDispatchLine[] = [];

  for (const c of result.contributions) {
    lines.push({
      line_type: 'load_base',
      amount: c.baseTotal,
      description: `Load ${c.loadNumber} — eligible base`,
      load_id: c.loadId,
      dispatcher_id: c.dispatcherId,
      deduction_id: null,
    });
  }

  lines.push({
    line_type: 'factoring_reduction',
    amount: -result.factoringReduction,
    description: `Factoring reduction — ${result.factoringRate}% of eligible base`,
    load_id: null,
    dispatcher_id: null,
    deduction_id: null,
  });

  for (const l of result.lines) {
    if (l.lineType === 'dispatch_fee') {
      lines.push({
        line_type: 'dispatch_fee',
        amount: l.amount,
        description: l.description,
        load_id: null,
        dispatcher_id: null,
        deduction_id: null,
      });
    } else if (l.lineType === 'deduction') {
      lines.push({
        line_type: 'flat_deduction',
        amount: l.amount,
        description: l.description,
        load_id: null,
        dispatcher_id: null,
        deduction_id: l.deductionId,
      });
    } else {
      lines.push({
        line_type: 'one_off',
        amount: l.amount,
        description: l.description,
        load_id: l.loadId,
        dispatcher_id: null,
        deduction_id: null,
      });
    }
  }

  return lines;
}

/** The payload the writer is handed. Snake case: it is read in SQL. */
export function dispatchSettlementPayload(result: DispatchSettlementResult) {
  return {
    month: result.month,
    dispatch_pct: result.dispatchRate,
    factoring_pct: result.factoringRate,
    eligible_base: result.eligibleBase,
    factoring_reduction: result.factoringReduction,
    reduced_base: result.reducedBase,
    dispatch_fee: result.dispatchFee,
    deductions_amount: result.deductionsAmount,
    net_amount: result.netAmount,
    lines: persistedDispatchLines(result),
    contributions: result.contributions.map(c => ({
      load_id: c.loadId,
      load_number: c.loadNumber,
      load_type: c.loadType ?? 'standard',
      rate_type: c.rateType ?? 'flat',
      delivered_at: c.deliveredAt,
      carrier_delivery_date: c.carrierDeliveryDate || null,
      header_component: c.headerComponent,
      fsc_component: c.fscComponent,
      charges_included_amount: c.chargesIncludedAmount,
      charges_excluded_amount: c.chargesExcludedAmount,
      base_total: c.baseTotal,
      pay_policy_id: c.payPolicyId,
      dispatcher_id: c.dispatcherId,
      verdicts: c.verdicts.map(v => ({
        load_charge_id: v.loadChargeId,
        charge_type: v.chargeType,
        classification: v.classification,
        amount: v.amount,
        excluded: v.excluded,
        exclusion_reason: v.exclusionReason,
        resolved_pct: v.resolvedPct,
        pct_column: pctColumnForClassification(v.classification),
      })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The five identities, asserted on the client too                     */
/* ------------------------------------------------------------------ */

export interface TotalsCheck {
  ok: boolean;
  problems: string[];
}

/** Independent re-addition of the lines against the stored totals. */
export function checkTotalsEqualLines(
  totals: {
    eligible_base: number; factoring_reduction: number; reduced_base: number;
    dispatch_fee: number; deductions_amount: number; net_amount: number;
  },
  lines: Array<{ line_type: string; amount: number | string }>,
): TotalsCheck {
  const sum = (type: string) =>
    round2(lines.filter(l => l.line_type === type).reduce((s, l) => s + num(l.amount), 0));

  const base = sum('load_base');
  const factoring = -sum('factoring_reduction');
  const fee = sum('dispatch_fee');
  const deductions = -(sum('flat_deduction') + sum('one_off'));
  const net = round2(fee + sum('flat_deduction') + sum('one_off'));

  const problems: string[] = [];
  const eq = (label: string, fromLines: number, stored: number) => {
    if (round2(fromLines) !== round2(num(stored))) {
      problems.push(`${label}: lines ${round2(fromLines)} vs stored ${round2(num(stored))}`);
    }
  };
  eq('eligible_base', base, totals.eligible_base);
  eq('factoring_reduction', factoring, totals.factoring_reduction);
  eq('reduced_base', round2(base - factoring), totals.reduced_base);
  eq('dispatch_fee', fee, totals.dispatch_fee);
  eq('deductions_amount', deductions, totals.deductions_amount);
  eq('net_amount', net, totals.net_amount);

  return { ok: problems.length === 0, problems };
}

/** The per-dispatcher breakdown must sum to the eligible base (section 4.6). */
export function checkAttributionSums(result: DispatchSettlementResult): TotalsCheck {
  const total = round2(result.byDispatcher.reduce((s, b) => s + b.base, 0));
  const hasUnattributed = result.byDispatcher.some(b => b.dispatcherId === null);
  const problems: string[] = [];
  if (total !== round2(result.eligibleBase)) {
    problems.push(`attribution ${total} vs eligible base ${round2(result.eligibleBase)}`);
  }
  if (!hasUnattributed) problems.push('no explicit unattributed bucket');
  return { ok: problems.length === 0, problems };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export type DispatchRunMode = 'refuse' | 'replace';

export interface DispatchStoreOutcome {
  outcome: 'created' | 'replaced' | 'refused_existing';
  settlement_id: string;
  month: string;
  net?: number;
  existing_net?: number;
  existing_status?: string;
}

/**
 * The one writer. The month, the mode and the computed result go in; nothing
 * else does. The actor is stamped server-side from `current_profile_id()`.
 */
export async function storeDispatchSettlement(
  sb: Client,
  result: DispatchSettlementResult,
  mode: DispatchRunMode = 'refuse',
): Promise<DispatchStoreOutcome> {
  const payload = dispatchSettlementPayload(result);
  const local = checkTotalsEqualLines(
    {
      eligible_base: result.eligibleBase,
      factoring_reduction: result.factoringReduction,
      reduced_base: result.reducedBase,
      dispatch_fee: result.dispatchFee,
      deductions_amount: result.deductionsAmount,
      net_amount: result.netAmount,
    },
    payload.lines,
  );
  if (!local.ok) {
    // Loud, before the round trip. The RPC refuses this too; failing here says
    // which identity broke without reading a database error.
    throw new Error(`Dispatch settlement totals do not equal its lines: ${local.problems.join('; ')}`);
  }

  const { data, error } = await sb.rpc('compute_dispatch_settlement', {
    p_month: periodMonthDate(result.month),
    p_result: payload,
    p_mode: mode,
  });
  if (error) throw error;
  return data as DispatchStoreOutcome;
}

/** Gather, compute, and return both — no write. */
export async function previewDispatchMonth(
  sb: Client,
  month: string,
): Promise<{ result: DispatchSettlementResult; existing: GatheredDispatchMonth['existing'] }> {
  const gathered = await gatherDispatchMonth(sb, month);
  return { result: computeDispatchSettlement(gathered.input), existing: gathered.existing };
}

/** The month an instant settles in, carrier zone. Re-exported, never re-derived. */
export const dispatchMonthOf = monthOf;
