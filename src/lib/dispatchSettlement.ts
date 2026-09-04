/**
 * THE DISPATCH COMPANY SETTLEMENT — Module 4 (dispatch), Pass 3.
 *
 * PURE. No supabase client, no React, no queries, no globals. It takes rows and
 * returns a result, exactly as `computeSettlement` does on the driver side.
 * Nothing here writes anything: the writer, the RPC and the UI are Pass 4.
 *
 * Every rule comes from docs/tms-build-status.md, "Settlement rules — the
 * authoritative record", section 4. Section references appear against each
 * step so a reader can check the code against the record rather than against
 * another reading of the code.
 *
 * WHAT IS SHARED, AND WHY IT IS CALLED RATHER THAN RESTATED
 * Section 4.7 accepted two settlement systems ON THE CONDITION that the
 * genuinely shared logic is called by both paths:
 *
 *   - percentage resolution → `pctForClassification` (payTreatment.ts)
 *   - pay class             → `payClassOf`           (payTreatment.ts)
 *   - period attribution    → `inCalendarMonth`      (settlementPeriod.ts)
 *
 * This module names no percentage column and does no month arithmetic of its
 * own; the three-layer caller test asserts both.
 */
import type { LoadChargeRecord } from '@/lib/loadCharges';
import {
  assembleLoadRateParts,
  type LoadAdjustmentPart,
  type LoadAdjustmentRecord,
  type LoadChargePart,
  type LoadRateBasis,
} from '@/lib/loadRateParts';
import { payClassOf, pctForClassification, type PayPolicyRates } from '@/lib/payTreatment';
import type { ClassificationKey } from '@/lib/revisedRateCon';
import { carrierDateOf, inCalendarMonth } from '@/lib/settlementPeriod';

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** The rate columns come from `LoadRateBasis`, the shape the invoice also reads. */
export interface DispatchLoadInput extends LoadRateBasis {
  id: string;
  loadNumber: string;
  /** `loads.status`. TONU and cancelled are excluded BY STATUS (section 4.1). */
  status: string | null;
  /** Instant of delivery. Attributed in the CARRIER timezone, never locally. */
  deliveredAt: string | null;
  /** Who BOOKED the load. Visibility only; nullable (section 4.6). */
  dispatcherId: string | null;
  charges: LoadChargeRecord[];
  /** Late accessorials. Filtered to money-bearing by the shared assembler. */
  adjustments?: LoadAdjustmentRecord[] | null;
  /** Load-specific pay policy override, when one is in force. */
  policyOverride?: PayPolicyRates | null;
}


/** A flat monthly deduction — DAT, phone service (section 4.5). */
export interface DispatchDeductionInput {
  id: string;
  label: string;
  amount: number | string;
}

/** A per-settlement one-off. The record requires it to carry a load reference. */
export interface DispatchOneOffInput {
  label: string;
  amount: number | string;
  loadId: string | null;
}

export interface DispatchSettlementInput {
  /** 'YYYY-MM', the calendar month being settled. */
  month: string;
  /** The rates in force. Both configurable; neither hardcoded (section 4.8). */
  dispatchRate: number | string;
  factoringRate: number | string;
  companyPolicy: PayPolicyRates | null;
  loads: DispatchLoadInput[];
  deductions?: DispatchDeductionInput[];
  oneOffs?: DispatchOneOffInput[];
}

/* ------------------------------------------------------------------ */
/* Diagnostic output — enough to populate the Pass 4 tables            */
/* ------------------------------------------------------------------ */

export type ChargeExclusionReason = 'pct_100' | 'reimbursement_class';

/** One row of `dispatch_settlement_charge_verdicts`. */
export interface DispatchChargeVerdict {
  loadChargeId: string;
  chargeType: string;
  classification: ClassificationKey;
  amount: number;
  excluded: boolean;
  exclusionReason: ChargeExclusionReason | null;
  /** The percentage that decided it, or null when it could not be resolved. */
  resolvedPct: number | null;
}

/**
 * The verdict on ONE late accessorial adjustment. A separate type from
 * `DispatchChargeVerdict` for the same reason the parts are separate: the
 * supplemental invoice depends on telling a late accessorial from an original
 * charge, and one shape carrying both loses that the first time someone
 * filters it.
 */
export interface DispatchAdjustmentVerdict {
  adjustmentId: string;
  reference: string | null;
  chargeType: string;
  classification: ClassificationKey;
  amount: number;
  excluded: boolean;
  exclusionReason: ChargeExclusionReason | null;
  resolvedPct: number | null;
}

/** One row of `dispatch_settlement_load_contributions`. */
export interface DispatchLoadContribution {
  loadId: string;
  loadNumber: string;
  loadType: string | null;
  rateType: string | null;
  deliveredAt: string | null;
  /** The delivery date read in the carrier timezone. */
  carrierDeliveryDate: string;
  dispatcherId: string | null;
  payPolicyId: string | null;
  headerComponent: number;
  fscComponent: number;
  chargesIncludedAmount: number;
  chargesExcludedAmount: number;
  adjustmentsIncludedAmount: number;
  adjustmentsExcludedAmount: number;
  baseTotal: number;
  verdicts: DispatchChargeVerdict[];
  adjustmentVerdicts: DispatchAdjustmentVerdict[];
}

/** A load that never entered the base, and why (section 4.1). */
export type IneligibleReason =
  | 'no_delivered_at' | 'outside_month' | 'status_tonu' | 'status_cancelled';

export interface DispatchIneligibleLoad {
  loadId: string;
  loadNumber: string;
  reason: IneligibleReason;
  deliveredAt: string | null;
  carrierDeliveryDate: string;
  status: string | null;
}

export interface DispatcherAttribution {
  /** null is the explicit UNATTRIBUTED bucket. It is always present. */
  dispatcherId: string | null;
  base: number;
  loadIds: string[];
}

export type DispatchLineType = 'dispatch_fee' | 'deduction' | 'one_off';

export interface DispatchSettlementLine {
  lineType: DispatchLineType;
  /** Signed. Positive is owed to the dispatch company, negative deducts. */
  amount: number;
  description: string;
  loadId: string | null;
  deductionId: string | null;
}

export interface DispatchSettlementResult {
  month: string;
  dispatchRate: number;
  factoringRate: number;
  eligibleBase: number;
  factoringReduction: number;
  reducedBase: number;
  dispatchFee: number;
  deductionsAmount: number;
  netAmount: number;
  lines: DispatchSettlementLine[];
  contributions: DispatchLoadContribution[];
  ineligible: DispatchIneligibleLoad[];
  /** Sums to `eligibleBase`; the null bucket is always present (section 4.6). */
  byDispatcher: DispatcherAttribution[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ */
/* 4.1 Eligibility                                                     */
/* ------------------------------------------------------------------ */

function ineligibleReason(load: DispatchLoadInput, month: string): IneligibleReason | null {
  const status = String(load.status ?? '');
  // Excluded BY STATUS, never by the presence of a TONU charge.
  if (status === 'tonu') return 'status_tonu';
  if (status === 'cancelled') return 'status_cancelled';
  if (!load.deliveredAt) return 'no_delivered_at';
  if (!inCalendarMonth(load.deliveredAt, month)) return 'outside_month';
  return null;
}

/* ------------------------------------------------------------------ */
/* 4.2 The header base, built FROM PARTS — SHARED with the invoice     */
/* ------------------------------------------------------------------ */

/*
 * The header/FSC assembly is no longer written here. It lives in
 * `src/lib/loadRateParts.ts` and is called by BOTH this engine and
 * `buildLoadInvoice`, so the two can never disagree about what a load is made
 * of. What stays here, and stays dispatch-only, is the §4.3 predicate below.
 */


/* ------------------------------------------------------------------ */
/* 4.3 The exclusion predicate                                         */
/* ------------------------------------------------------------------ */

interface ExclusionDecision {
  excluded: boolean;
  exclusionReason: ChargeExclusionReason | null;
  resolvedPct: number | null;
}

/**
 * §4.3 ITSELF, and the ONLY copy of it. A charge part and an adjustment part
 * are judged by this same function — not by a generalised predicate and not by
 * a second copy. It takes the two things the rule actually reads, so there is
 * nowhere for a caller-specific branch to appear inside it.
 */
function exclusionDecision(
  classification: ClassificationKey,
  policy: PayPolicyRates | null,
): ExclusionDecision {
  const resolvedPct = pctForClassification(classification, policy);

  // (b) first, so a reimbursement records the class rather than a percentage
  // that had nothing to do with the decision.
  if (payClassOf(classification, policy) === 'reimbursement') {
    return { excluded: true, exclusionReason: 'reimbursement_class', resolvedPct };
  }
  // (a) the percentage the policy in force assigns to the classification, read
  // through the shared resolver. NOT read from the pay-class map.
  if (resolvedPct === 100) {
    return { excluded: true, exclusionReason: 'pct_100', resolvedPct };
  }
  return { excluded: false, exclusionReason: null, resolvedPct };
}

function verdictFor(
  part: LoadChargePart,
  policy: PayPolicyRates | null,
): DispatchChargeVerdict {
  return {
    loadChargeId: part.chargeId,
    chargeType: part.chargeType,
    classification: part.classification,
    amount: part.amount,
    ...exclusionDecision(part.classification, policy),
  };
}

/** The SAME predicate, unchanged, applied to a late accessorial. */
function adjustmentVerdictFor(
  part: LoadAdjustmentPart,
  policy: PayPolicyRates | null,
): DispatchAdjustmentVerdict {
  return {
    adjustmentId: part.adjustmentId,
    reference: part.reference,
    chargeType: part.chargeType,
    classification: part.classification,
    amount: part.amount,
    ...exclusionDecision(part.classification, policy),
  };
}


/* ------------------------------------------------------------------ */
/* The computation                                                     */
/* ------------------------------------------------------------------ */

export function computeDispatchSettlement(
  input: DispatchSettlementInput,
): DispatchSettlementResult {
  const dispatchRate = num(input.dispatchRate);
  const factoringRate = num(input.factoringRate);

  const contributions: DispatchLoadContribution[] = [];
  const ineligible: DispatchIneligibleLoad[] = [];

  for (const load of input.loads) {
    const reason = ineligibleReason(load, input.month);
    if (reason) {
      ineligible.push({
        loadId: load.id, loadNumber: load.loadNumber, reason,
        deliveredAt: load.deliveredAt,
        carrierDeliveryDate: carrierDateOf(load.deliveredAt),
        status: load.status ?? null,
      });
      continue;
    }

    const policy = load.policyOverride ?? input.companyPolicy;
    // The SAME parts the invoice bills. Only the predicate below differs.
    const parts = assembleLoadRateParts(load, load.charges, load.adjustments);
    const verdicts = parts.chargeParts.map(p => verdictFor(p, policy));
    const adjustmentVerdicts = parts.adjustmentParts
      .map(p => adjustmentVerdictFor(p, policy));
    const chargesIncludedAmount = round2(
      verdicts.filter(v => !v.excluded).reduce((s, v) => s + v.amount, 0));
    const chargesExcludedAmount = round2(
      verdicts.filter(v => v.excluded).reduce((s, v) => s + v.amount, 0));
    const adjustmentsIncludedAmount = round2(
      adjustmentVerdicts.filter(v => !v.excluded).reduce((s, v) => s + v.amount, 0));
    const adjustmentsExcludedAmount = round2(
      adjustmentVerdicts.filter(v => v.excluded).reduce((s, v) => s + v.amount, 0));
    const headerComponent = parts.headerComponent;
    const fscComponent = parts.fscComponent;


    contributions.push({
      loadId: load.id,
      loadNumber: load.loadNumber,
      loadType: load.loadType ?? null,
      rateType: load.rateType ?? null,
      deliveredAt: load.deliveredAt,
      carrierDeliveryDate: carrierDateOf(load.deliveredAt),
      dispatcherId: load.dispatcherId ?? null,
      payPolicyId: policy?.id ?? null,
      headerComponent,
      fscComponent,
      chargesIncludedAmount,
      chargesExcludedAmount,
      adjustmentsIncludedAmount,
      adjustmentsExcludedAmount,
      baseTotal: round2(
        headerComponent + fscComponent + chargesIncludedAmount + adjustmentsIncludedAmount),
      verdicts,
      adjustmentVerdicts,
    });
  }

  const eligibleBase = round2(contributions.reduce((s, c) => s + c.baseTotal, 0));

  // 4.5, in order. Factoring is a REDUCTION OF THE BASE, not a deduction.
  const factoringReduction = round2(eligibleBase * (factoringRate / 100));
  const reducedBase = round2(eligibleBase - factoringReduction);
  const dispatchFee = round2(reducedBase * (dispatchRate / 100));

  const lines: DispatchSettlementLine[] = [{
    lineType: 'dispatch_fee',
    amount: dispatchFee,
    description: `Dispatch fee — ${input.month}`,
    loadId: null,
    deductionId: null,
  }];

  for (const d of input.deductions ?? []) {
    lines.push({
      lineType: 'deduction', amount: -round2(num(d.amount)),
      description: d.label, loadId: null, deductionId: d.id,
    });
  }
  for (const o of input.oneOffs ?? []) {
    lines.push({
      lineType: 'one_off', amount: -round2(num(o.amount)),
      description: o.label, loadId: o.loadId ?? null, deductionId: null,
    });
  }

  const deductionsAmount = round2(
    lines.filter(l => l.lineType !== 'dispatch_fee')
      .reduce((s, l) => s + Math.abs(l.amount), 0));
  const netAmount = round2(lines.reduce((s, l) => s + l.amount, 0));

  // 4.6 attribution — visibility only, and the null bucket always exists so
  // the breakdown sums to the total whether or not any load lacks a booker.
  const buckets = new Map<string, DispatcherAttribution>();
  buckets.set('', { dispatcherId: null, base: 0, loadIds: [] });
  for (const c of contributions) {
    const key = c.dispatcherId ?? '';
    const bucket = buckets.get(key)
      ?? { dispatcherId: c.dispatcherId, base: 0, loadIds: [] };
    bucket.base = round2(bucket.base + c.baseTotal);
    bucket.loadIds.push(c.loadId);
    buckets.set(key, bucket);
  }

  return {
    month: input.month,
    dispatchRate,
    factoringRate,
    eligibleBase,
    factoringReduction,
    reducedBase,
    dispatchFee,
    deductionsAmount,
    netAmount,
    lines,
    contributions,
    ineligible,
    byDispatcher: [...buckets.values()],
  };
}
