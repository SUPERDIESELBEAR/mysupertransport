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

/* ------------------------------------------------------------------ */
/* READ — a stored month, read back exactly as it was written          */
/* ------------------------------------------------------------------ */

/**
 * MODULE 4 (dispatch), PASS 5 — the read side.
 *
 * Nothing here recomputes. Every figure returned comes off
 * `dispatch_settlements` and its children, because the one job of the screen
 * that displays this is to show whether the STORED figure is right. A screen
 * that recomputes for display can only ever agree with itself.
 *
 * The only arithmetic performed is a RE-ADDITION of the stored lines
 * (`checkTotalsEqualLines`) and of the stored per-dispatcher breakdown. Both
 * are checks on stored rows, not derivations from `loads`.
 */
export interface StoredDispatchLine {
  id: string;
  line_type: string;
  amount: number;
  description: string;
  load_id: string | null;
  dispatcher_id: string | null;
}

export interface StoredDispatchVerdict {
  id: string;
  charge_type: string;
  classification: string;
  amount: number;
  excluded: boolean;
  exclusion_reason: string | null;
  resolved_pct: number | null;
  pct_column: string | null;
}

export interface StoredDispatchContribution {
  id: string;
  load_id: string;
  load_number: string;
  load_type: string;
  rate_type: string;
  delivered_at: string | null;
  carrier_delivery_date: string | null;
  header_component: number;
  fsc_component: number;
  charges_included_amount: number;
  charges_excluded_amount: number;
  charges_excluded_count: number;
  base_total: number;
  dispatcher_id: string | null;
  verdicts: StoredDispatchVerdict[];
}

export interface StoredDispatchSettlement {
  id: string;
  period_month: string;
  status: 'draft' | 'approved' | 'paid' | 'void';
  /** The rates AS STORED on the row — what was applied, not what is configured. */
  dispatch_pct: number;
  factoring_pct: number;
  eligible_base: number;
  factoring_reduction: number;
  reduced_base: number;
  dispatch_fee: number;
  deductions_amount: number;
  net_amount: number;
  computed_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  void_reason: string | null;
  updated_at: string | null;
  computed_by_name: string | null;
  approved_by_name: string | null;
  paid_by_name: string | null;
  voided_by_name: string | null;
}

export interface DispatcherBucket {
  dispatcherId: string | null;
  name: string;
  base: number;
  loads: number;
}

export interface StoredDispatchMonth {
  settlement: StoredDispatchSettlement;
  lines: StoredDispatchLine[];
  contributions: StoredDispatchContribution[];
  /** From the FROZEN `dispatcher_id` on the stored `load_base` lines. */
  byDispatcher: DispatcherBucket[];
  byDispatcherTotal: number;
  /** Re-addition of the stored lines against the stored totals. */
  totalsCheck: TotalsCheck;
  /** The breakdown must sum to the stored eligible base (section 4.6). */
  attributionCheck: TotalsCheck;
  /** The rates configured TODAY, for the "these can differ" note. Never used in a figure. */
  currentRates: { dispatch_pct: number; factoring_pct: number } | null;
}

const dispatcherLabel = (p: any): string =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unnamed dispatcher';

/** Read one stored month. Returns null when the month has never been computed. */
export async function readStoredDispatchMonth(
  sb: Client,
  month: string,
): Promise<StoredDispatchMonth | null> {
  const monthStart = periodMonthDate(month);

  const { data: row, error } = await sb
    .from('dispatch_settlements')
    .select('*')
    .eq('period_month', monthStart)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const [lineRes, contribRes, rateRes, profileRes] = await Promise.all([
    sb.from('dispatch_settlement_line_items')
      .select('id, line_type, amount, description, load_id, dispatcher_id')
      .eq('dispatch_settlement_id', row.id)
      .order('line_type', { ascending: true }),
    sb.from('dispatch_settlement_load_contributions')
      .select('id, load_id, load_number, load_type, rate_type, delivered_at, '
        + 'carrier_delivery_date, header_component, fsc_component, charges_included_amount, '
        + 'charges_excluded_amount, base_total, dispatcher_id, '
        + 'dispatch_settlement_charge_verdicts(id, charge_type, classification, amount, '
        + 'excluded, exclusion_reason, resolved_pct, pct_column)')
      .eq('dispatch_settlement_id', row.id)
      .order('load_number', { ascending: true }),
    sb.from('dispatch_settlement_rates')
      .select('dispatch_pct, factoring_pct, effective_from, effective_to')
      .order('effective_from', { ascending: false })
      .limit(1),
    sb.from('profiles').select('id, first_name, last_name'),
  ]);

  const profiles = new Map<string, any>((profileRes.data ?? []).map((p: any) => [p.id, p]));

  const lines: StoredDispatchLine[] = (lineRes.data ?? []).map((l: any) => ({
    id: l.id,
    line_type: l.line_type,
    amount: num(l.amount),
    description: l.description,
    load_id: l.load_id,
    dispatcher_id: l.dispatcher_id,
  }));

  const contributions: StoredDispatchContribution[] = (contribRes.data ?? []).map((c: any) => {
    const verdicts: StoredDispatchVerdict[] = (c.dispatch_settlement_charge_verdicts ?? [])
      .map((v: any) => ({
        id: v.id,
        charge_type: v.charge_type,
        classification: v.classification,
        amount: num(v.amount),
        excluded: !!v.excluded,
        exclusion_reason: v.exclusion_reason,
        resolved_pct: v.resolved_pct === null || v.resolved_pct === undefined
          ? null : num(v.resolved_pct),
        pct_column: v.pct_column,
      }));
    return {
      id: c.id,
      load_id: c.load_id,
      load_number: c.load_number,
      load_type: c.load_type,
      rate_type: c.rate_type,
      delivered_at: c.delivered_at,
      carrier_delivery_date: c.carrier_delivery_date,
      header_component: num(c.header_component),
      fsc_component: num(c.fsc_component),
      charges_included_amount: num(c.charges_included_amount),
      charges_excluded_amount: num(c.charges_excluded_amount),
      charges_excluded_count: verdicts.filter(v => v.excluded).length,
      base_total: num(c.base_total),
      dispatcher_id: c.dispatcher_id,
      verdicts,
    };
  });

  // The breakdown is built from the FROZEN attribution on the stored lines, not
  // from `loads.dispatcher_id`, which may have been corrected since.
  const buckets = new Map<string, DispatcherBucket>();
  for (const l of lines.filter(l => l.line_type === 'load_base')) {
    const key = l.dispatcher_id ?? '';
    const b = buckets.get(key) ?? {
      dispatcherId: l.dispatcher_id,
      name: l.dispatcher_id ? dispatcherLabel(profiles.get(l.dispatcher_id)) : 'Unattributed',
      base: 0,
      loads: 0,
    };
    b.base = round2(b.base + l.amount);
    b.loads += 1;
    buckets.set(key, b);
  }
  // Section 4.6: the unattributed bucket is always shown, even when empty.
  if (!buckets.has('')) {
    buckets.set('', { dispatcherId: null, name: 'Unattributed', base: 0, loads: 0 });
  }
  const byDispatcher = Array.from(buckets.values())
    .sort((a, b) => (a.dispatcherId === null ? 1 : b.dispatcherId === null ? -1 : b.base - a.base));
  const byDispatcherTotal = round2(byDispatcher.reduce((s, b) => s + b.base, 0));

  const settlement: StoredDispatchSettlement = {
    id: row.id,
    period_month: row.period_month,
    status: row.status,
    dispatch_pct: num(row.dispatch_pct),
    factoring_pct: num(row.factoring_pct),
    eligible_base: num(row.eligible_base),
    factoring_reduction: num(row.factoring_reduction),
    reduced_base: num(row.reduced_base),
    dispatch_fee: num(row.dispatch_fee),
    deductions_amount: num(row.deductions_amount),
    net_amount: num(row.net_amount),
    computed_at: row.computed_at,
    approved_at: row.approved_at,
    paid_at: row.paid_at,
    void_reason: row.void_reason,
    updated_at: row.updated_at,
    computed_by_name: row.created_by ? dispatcherLabel(profiles.get(row.created_by)) : null,
    approved_by_name: row.approved_by ? dispatcherLabel(profiles.get(row.approved_by)) : null,
    paid_by_name: row.paid_by ? dispatcherLabel(profiles.get(row.paid_by)) : null,
    voided_by_name: row.voided_by ? dispatcherLabel(profiles.get(row.voided_by)) : null,
  };

  const totalsCheck = checkTotalsEqualLines(
    {
      eligible_base: settlement.eligible_base,
      factoring_reduction: settlement.factoring_reduction,
      reduced_base: settlement.reduced_base,
      dispatch_fee: settlement.dispatch_fee,
      deductions_amount: settlement.deductions_amount,
      net_amount: settlement.net_amount,
    },
    lines,
  );

  const attributionProblems: string[] = [];
  if (byDispatcherTotal !== round2(settlement.eligible_base)) {
    attributionProblems.push(
      `breakdown ${byDispatcherTotal} vs eligible base ${round2(settlement.eligible_base)}`);
  }

  const rateRow = (rateRes.data ?? [])[0];

  return {
    settlement,
    lines,
    contributions,
    byDispatcher,
    byDispatcherTotal,
    totalsCheck: settlement.status === 'void' ? { ok: true, problems: [] } : totalsCheck,
    attributionCheck: {
      ok: attributionProblems.length === 0,
      problems: attributionProblems,
    },
    currentRates: rateRow
      ? { dispatch_pct: num(rateRow.dispatch_pct), factoring_pct: num(rateRow.factoring_pct) }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* The months a person may choose between                              */
/* ------------------------------------------------------------------ */

export interface DispatchMonthOption {
  /** 'YYYY-MM' */
  month: string;
  /** 'August 2026' */
  label: string;
  /** A settlement row exists for this month. */
  hasSettlement: boolean;
  /** The stored status, when there is a row. */
  status: string | null;
  /** Delivered loads sit in this month (carrier zone), settled or not. */
  deliveredLoads: number;
}

/**
 * The months worth offering, newest first.
 *
 * Two sources, and NEITHER is an open-ended range of empty months:
 *  1. every month that HAS a stored settlement — the things that exist;
 *  2. recent months (a rolling 13-month window) with at least one delivered
 *     load and no settlement yet — the ones somebody would come here to
 *     compute. The delivery month is read in the CARRIER zone through
 *     `monthOf`, exactly as the engine attributes a load.
 *
 * This reads `loads` only to decide WHICH MONTHS TO LIST. No figure on the
 * screen comes from it.
 */
export async function listDispatchMonths(sb: Client): Promise<DispatchMonthOption[]> {
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));

  const [settRes, loadRes] = await Promise.all([
    sb.from('dispatch_settlements')
      .select('period_month, status')
      .order('period_month', { ascending: false }),
    sb.from('loads')
      .select('delivered_at')
      .not('delivered_at', 'is', null)
      .gte('delivered_at', windowStart.toISOString()),
  ]);
  if (settRes.error) throw settRes.error;
  if (loadRes.error) throw loadRes.error;

  const byMonth = new Map<string, DispatchMonthOption>();
  const put = (month: string): DispatchMonthOption => {
    let o = byMonth.get(month);
    if (!o) {
      o = { month, label: monthLabel(month), hasSettlement: false, status: null, deliveredLoads: 0 };
      byMonth.set(month, o);
    }
    return o;
  };

  for (const row of (settRes.data ?? []) as any[]) {
    const month = String(row.period_month).slice(0, 7);
    const o = put(month);
    o.hasSettlement = true;
    o.status = row.status ?? null;
  }
  for (const row of (loadRes.data ?? []) as any[]) {
    const month = monthOf(row.delivered_at);
    if (!month) continue;
    put(month).deliveredLoads += 1;
  }

  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

/** 'YYYY-MM' → 'August 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * The month the screen opens on.
 *
 * The screen exists to CHECK a settlement, not to trigger one, so it opens on
 * the most recent month that HAS one. Only when none has ever been stored does
 * it fall back to the most recent COMPLETED month with delivered loads, and
 * failing that to last month. It never opens on the current month, which is
 * always incomplete and would show a figure nobody should act on.
 */
export function defaultDispatchMonth(
  options: DispatchMonthOption[],
  today: Date = new Date(),
): string {
  const current = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const stored = options.find(o => o.hasSettlement);
  if (stored) return stored.month;
  const completed = options.find(o => o.month < current && o.deliveredLoads > 0);
  if (completed) return completed.month;
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return prev.toISOString().slice(0, 7);
}
