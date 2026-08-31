/**
 * THE SETTLEMENT ENGINE — Module 4, Pass 2.
 *
 * PURE. No supabase, no React, no queries. It takes rows and returns a
 * settlement, so the arithmetic can be tested without a database. The RPC that
 * persists the result is a separate thin layer.
 *
 * Every rule here comes from docs/tms-build-status.md, "Settlement rules — the
 * authoritative record", and the Module 4 Pass 1 section. Nothing is
 * hardcoded that the doc says is configuration:
 *
 *  - pay percentages and pay classes come from the pay policy in force,
 *    resolved company default → driver-specific → load-specific, nearest wins
 *    (section 1);
 *  - period attribution is by DELIVERY date in the carrier timezone
 *    (section 2), via src/lib/settlementPeriod.ts;
 *  - the per-load paperwork hold calls `evaluateLoadPaperwork` and never
 *    re-derives what a load owes (section 8);
 *  - the hold formula, the minimum net pay and the R&M target and weekly
 *    figure are read from settlement settings, never from a literal
 *    (Pass 1, "Configuration").
 *
 * EVERY AMOUNT IS A LINE ITEM. A settlement is a list a driver can reconcile
 * against his own records, not a total with a note. Each line carries its
 * type, a signed amount, a description and a reference to the row it came
 * from. The net is the sum of the lines — there is no second path to it.
 */
import { chargeClassification, type LoadChargeRecord } from '@/lib/loadCharges';
import { AWAITING_SCALE_TICKET_EXPLANATION, AWAITING_SCALE_TICKET_LABEL } from '@/lib/perTonScale';
import { payClassOf, type PayPolicyRates } from '@/lib/payTreatment';
import {
  evaluateLoadPaperwork,
  type PaperworkDocumentInput,
  type PaperworkExceptionInput,
} from '@/lib/loadPaperwork';
import type { SettlementSettings, SettlementStatus } from '@/lib/settlementConfig';
import { workPeriodForDate, type WorkPeriod } from '@/lib/settlementPeriod';

/* ------------------------------------------------------------------ */
/* Line items                                                          */
/* ------------------------------------------------------------------ */

export type SettlementLineType =
  | 'load_pay' | 'accessorial' | 'reimbursement' | 'fuel' | 'cash_advance'
  | 'deduction' | 'rm_deposit' | 'carry_forward' | 'adjustment';

export type SettlementSourceTable =
  | 'loads' | 'fuel_transactions' | 'deductions' | 'deduction_installments'
  | 'cash_advances' | 'rm_deposits' | 'settlements';

export interface SettlementLine {
  lineType: SettlementLineType;
  /** Signed. Positive pays the driver, negative deducts. */
  amount: number;
  description: string;
  sourceTable: SettlementSourceTable | null;
  sourceId: string | null;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface SettlementLoadInput {
  id: string;
  loadNumber: string;
  loadType: string;
  /** Instant of delivery. Attributed in the carrier timezone, never locally. */
  deliveredAt: string | null;
  charges: LoadChargeRecord[];
  /**
   * HEADER RATES. The base money on a load does NOT live in `load_charges` —
   * `loads` carries it in columns, and `recompute_load_total_value` sums
   * header base + unbundled FSC + charges. The engine reads the same halves
   * from the same source, and never converts a header into a charge row: that
   * would double-count the broker-facing total.
   */
  rateType?: string | null;
  linehaulRate?: number | string | null;
  ratePerMile?: number | string | null;
  loadedMiles?: number | string | null;
  ratePerTon?: number | string | null;
  /**
   * What the scale ticket says actually crossed the scale. AUTHORITATIVE for a
   * per-ton load; see `perTonScale.ts`. Absent means unscaled, and the engine
   * pays no linehaul at all rather than paying on a guess.
   */
  confirmedTons?: number | string | null;
  /** What everyone thought before loading. Never pays a driver. */
  estimatedTons?: number | string | null;
  fscAmount?: number | string | null;
  /**
   * NULL and true both mean bundled — the SQL defaults it with
   * `coalesce(..., true)`. A bundled FSC is already inside the linehaul rate
   * and must never be paid a second time.
   */
  fscBundledIntoLinehaul?: boolean | null;
  loadoutRelocationFee?: number | string | null;
  documents?: PaperworkDocumentInput[] | null;
  exceptions?: PaperworkExceptionInput[] | null;
  /**
   * Load-specific pay policy override — the nearest of the three levels.
   * Absent for almost every load.
   */
  policyOverride?: PayPolicyRates | null;
  /**
   * Management released this load into the settlement despite incomplete
   * paperwork. The hold is automatic; the release is the deliberate act
   * (section 8). Actor and reason are recorded by the persisting layer.
   */
  paperworkReleased?: boolean;
  paperworkReleaseReason?: string | null;
}

export interface SettlementFuelInput {
  id: string;
  /**
   * What the fuel cost BEFORE any negotiated discount. `fuel_transactions`
   * stores `total_amount` already net of the (negative) discount, so the
   * gross is total − discount. Kept explicit here so the deduction and the
   * discount are never entangled.
   */
  grossAmount: number;
  /** Magnitude of the discount, always positive. Zero when there was none. */
  discountAmount?: number;
  description?: string;
}

export interface SettlementDeductionInput {
  id: string;
  label: string;
  amount: number;
  sourceTable?: Extract<SettlementSourceTable, 'deductions' | 'deduction_installments'>;
  /** "payment 2 of 6" and the like, appended to the description. */
  installmentNote?: string | null;
}

export interface SettlementAdvanceInput {
  id: string;
  label?: string;
  /** Amount recovered on this settlement. */
  repaymentAmount: number;
}

export interface RmDepositState {
  id: string | null;
  currentBalance: number;
  /** Null falls back to settlement settings. */
  targetAmount?: number | null;
  weeklyDeduction?: number | null;
  isPaused?: boolean;
}

export interface SettlementComputeInput {
  operatorId: string;
  /** Any carrier-zone date inside the week being settled. */
  periodAnchorDate: string;
  settings: SettlementSettings;
  /** Company default policy — the outermost of the three override levels. */
  companyPolicy: PayPolicyRates | null;
  /** Driver-specific assignment, when one is effective. Beats the default. */
  driverPolicy?: PayPolicyRates | null;
  loads: SettlementLoadInput[];
  fuel?: SettlementFuelInput[];
  deductions?: SettlementDeductionInput[];
  advances?: SettlementAdvanceInput[];
  rmDeposit?: RmDepositState | null;
  /**
   * Signed carry-forward from a prior period. Negative is a debt the driver
   * still owes; it is real and it follows him (Pass 1, population rule).
   */
  carryForwardIn?: number;
  /** Departing flag — the only condition under which the hold formula applies. */
  isDeparting?: boolean;
  /** Derived fact from `equipment_outstanding(operator_id)`. */
  equipmentOutstanding?: boolean;
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export interface WithheldLoad {
  loadId: string;
  loadNumber: string;
  /** Shown to the driver. A short check with no explanation is the failure mode. */
  reason: string;
  outstanding: string[];
}

export interface ComputedSettlement {
  operatorId: string;
  period: WorkPeriod;
  lines: SettlementLine[];
  /** Sum of the positive (earning) lines. */
  grossAmount: number;
  /** Sum of the negative lines, as a positive number. */
  deductionsAmount: number;
  /** Sum of every line, signed. Can be negative. */
  netAmount: number;
  carryForwardIn: number;
  carryForwardOut: number;
  status: SettlementStatus;
  holdReason: string | null;
  withheldLoads: WithheldLoad[];
  /**
   * Per-ton loads valued at zero linehaul because no scale ticket has been
   * recorded. Distinct from `withheldLoads`: the load's accessorials still
   * pay, only the tonnage-based linehaul waits for the ticket.
   */
  pendingScaleTicketLoads: WithheldLoad[];
  /** Loads counted this period, whether or not they were withheld. */
  consideredLoadIds: string[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const PCT_FIELD = {
  linehaul: 'linehaul_pct',
  fsc: 'fsc_pct',
  detention: 'detention_pct',
  stopoff: 'stopoff_pct',
  lumper: 'lumper_reimbursement_pct',
  layover: 'layover_pct',
  tonu: 'tonu_pct',
  reimbursement: 'other_accessorial_pct',
  other: 'other_accessorial_pct',
} as const;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The three override levels, resolved strictly nearest-wins:
 * company default → driver-specific → load-specific (section 1).
 */
export function resolveEffectivePolicy(
  companyPolicy: PayPolicyRates | null,
  driverPolicy?: PayPolicyRates | null,
  loadPolicy?: PayPolicyRates | null,
): PayPolicyRates | null {
  return loadPolicy ?? driverPolicy ?? companyPolicy ?? null;
}

/**
 * The base money that lives in `loads` columns rather than in `load_charges`.
 *
 * Mirrors `recompute_load_total_value` exactly — same base by rate type, same
 * bundled-FSC test, same tons column — so the driver-facing figure and the
 * broker-facing total are two readings of one set of numbers. Each header
 * becomes its OWN line so a driver sees linehaul and FSC separately.
 */
function headerRateLines(
  load: SettlementLoadInput,
  policy: PayPolicyRates | null,
): { lines: Array<{ lineType: SettlementLineType; amount: number; description: string }>; pendingScaleTicket: boolean } {
  const out: Array<{ lineType: SettlementLineType; amount: number; description: string }> = [];
  let pendingScaleTicket = false;
  const pctOf = (klass: keyof typeof PCT_FIELD): number | null => {
    const pct = policy ? Number(policy[PCT_FIELD[klass]]) : NaN;
    return Number.isFinite(pct) ? pct : null;
  };

  if (load.loadType === 'loadout') {
    // A $0 relocation fee pays $0. The trailer use IS the value.
    const fee = num(load.loadoutRelocationFee);
    const pct = pctOf('linehaul');
    const amount = pct === null ? 0 : round2(fee * (pct / 100));
    if (amount) {
      out.push({ lineType: 'load_pay', amount, description: 'Trailer relocation fee' });
    }
    return { lines: out, pendingScaleTicket };
  }

  let base = 0;
  let label = 'Linehaul';
  switch (String(load.rateType ?? 'flat')) {
    case 'per_mile':
      base = num(load.ratePerMile) * num(load.loadedMiles);
      label = 'Linehaul (per mile)';
      break;
    case 'per_ton': {
      // ONLY the confirmed figure pays. `estimated_tons` keeps the broker-facing
      // total alive in flight; it never reaches a driver's check, because the
      // correction once the ticket lands would be an adjustment and no
      // adjustment path exists yet.
      const confirmed = load.confirmedTons;
      if (confirmed === null || confirmed === undefined || confirmed === '') {
        pendingScaleTicket = true;
        base = 0;
      } else {
        base = num(load.ratePerTon) * num(confirmed);
      }
      label = 'Linehaul (per ton, from scale ticket)';
      break;
    }
    default:
      base = num(load.linehaulRate);
      break;
  }
  const linehaulPct = pctOf('linehaul');
  const linehaul = linehaulPct === null ? 0 : round2(base * (linehaulPct / 100));
  if (linehaul) out.push({ lineType: 'load_pay', amount: linehaul, description: label });

  // Bundled (true OR null) means the FSC is already inside the linehaul rate.
  const bundled = load.fscBundledIntoLinehaul ?? true;
  if (!bundled) {
    const fscPct = pctOf('fsc');
    const fsc = fscPct === null ? 0 : round2(num(load.fscAmount) * (fscPct / 100));
    if (fsc) out.push({ lineType: 'load_pay', amount: fsc, description: 'Fuel surcharge' });
  }

  return { lines: out, pendingScaleTicket };
}

function lineTypeForCharge(klass: keyof typeof PCT_FIELD, isReimbursement: boolean): SettlementLineType {
  if (isReimbursement) return 'reimbursement';
  return klass === 'linehaul' ? 'load_pay' : 'accessorial';
}

/* ------------------------------------------------------------------ */
/* The calculation                                                     */
/* ------------------------------------------------------------------ */

export function computeSettlement(input: SettlementComputeInput): ComputedSettlement {
  const {
    operatorId, periodAnchorDate, settings, companyPolicy, driverPolicy,
    loads = [], fuel = [], deductions = [], advances = [],
    rmDeposit = null, carryForwardIn = 0,
    isDeparting = false, equipmentOutstanding = false,
  } = input;

  const period = workPeriodForDate(periodAnchorDate, settings.work_week_start_dow);
  const lines: SettlementLine[] = [];
  const withheldLoads: WithheldLoad[] = [];
  const pendingScaleTicketLoads: WithheldLoad[] = [];

  /* --- Loads ------------------------------------------------------- */
  for (const load of loads) {
    const paperwork = evaluateLoadPaperwork(load.loadType, load.documents, load.exceptions);
    if (!paperwork.complete && !load.paperworkReleased) {
      const outstanding = paperwork.outstandingRequired.map(r => r.label);
      withheldLoads.push({
        loadId: load.id,
        loadNumber: load.loadNumber,
        reason: `Withheld from this settlement — paperwork outstanding: ${outstanding.join(', ')}.`,
        outstanding,
      });
      continue;
    }

    const policy = resolveEffectivePolicy(companyPolicy, driverPolicy, load.policyOverride);
    const releaseNote = !paperwork.complete && load.paperworkReleased
      ? ` (released${load.paperworkReleaseReason ? `: ${load.paperworkReleaseReason}` : ''})`
      : '';

    const header0 = headerRateLines(load, policy);
    if (header0.pendingScaleTicket) {
      pendingScaleTicketLoads.push({
        loadId: load.id,
        loadNumber: load.loadNumber,
        reason: AWAITING_SCALE_TICKET_EXPLANATION,
        outstanding: [AWAITING_SCALE_TICKET_LABEL],
      });
    }
    for (const header of header0.lines) {
      lines.push({
        lineType: header.lineType,
        amount: header.amount,
        description: `Load ${load.loadNumber} — ${header.description}${releaseNote}`,
        sourceTable: 'loads',
        sourceId: load.id,
      });
    }

    for (const charge of load.charges) {
      const klass = chargeClassification(charge.charge_type);

      if (policy && payClassOf(klass, policy) === 'reimbursement') {
        // Reimbursements pay ACTUAL cost, and only to whoever spent it.
        if (charge.funding_source !== 'driver') continue;
        const cost = num(charge.actual_cost);
        if (!cost) continue;
        lines.push({
          lineType: 'reimbursement',
          amount: round2(cost),
          description: `Load ${load.loadNumber} — ${charge.description || charge.charge_type} reimbursed at cost${releaseNote}`,
          sourceTable: 'loads',
          sourceId: load.id,
        });
        continue;
      }

      const pct = policy ? Number(policy[PCT_FIELD[klass]]) : NaN;
      if (!Number.isFinite(pct)) continue;
      const amount = round2(num(charge.amount) * (pct / 100));
      if (!amount) continue;
      lines.push({
        lineType: lineTypeForCharge(klass, false),
        amount,
        description: `Load ${load.loadNumber} — ${charge.description || charge.charge_type}${releaseNote}`,
        sourceTable: 'loads',
        sourceId: load.id,
      });
    }
  }

  /* --- Fuel -------------------------------------------------------- */
  // The discount is its OWN line when pass-through is on for this driver, never
  // netted into the fuel deduction: a driver who earned it must be able to see
  // what it is worth. When pass-through is off he sees nothing about it at all
  // and the fuel deduction is the same gross figure either way.
  const passthrough = Boolean(
    (driverPolicy ?? companyPolicy)?.fuel_discount_passthrough,
  );
  for (const tx of fuel) {
    const gross = round2(num(tx.grossAmount));
    if (gross) {
      lines.push({
        lineType: 'fuel',
        amount: -gross,
        description: tx.description || 'Fuel purchases',
        sourceTable: 'fuel_transactions',
        sourceId: tx.id,
      });
    }
    const discount = round2(Math.abs(num(tx.discountAmount)));
    if (passthrough && discount) {
      lines.push({
        lineType: 'fuel',
        amount: discount,
        description: 'Fuel discount passed through',
        sourceTable: 'fuel_transactions',
        sourceId: tx.id,
      });
    }
  }

  /* --- Cash advances ----------------------------------------------- */
  for (const advance of advances) {
    const amount = round2(num(advance.repaymentAmount));
    if (!amount) continue;
    lines.push({
      lineType: 'cash_advance',
      amount: -Math.abs(amount),
      description: advance.label || 'Cash advance repayment',
      sourceTable: 'cash_advances',
      sourceId: advance.id,
    });
  }

  /* --- Deductions --------------------------------------------------- */
  for (const d of deductions) {
    const amount = round2(num(d.amount));
    if (!amount) continue;
    lines.push({
      lineType: 'deduction',
      amount: -Math.abs(amount),
      description: d.installmentNote ? `${d.label} — ${d.installmentNote}` : d.label,
      sourceTable: d.sourceTable ?? 'deductions',
      sourceId: d.id,
    });
  }

  /* --- Repair & Maintenance Deposit --------------------------------- */
  // Always the full name, never the forbidden legal shorthand. Auto-stops at
  // target and never overshoots on the final week: the last contribution is
  // exactly the shortfall.
  const rmTarget = num(rmDeposit?.targetAmount ?? settings.rm_deposit_target);
  const rmWeekly = num(rmDeposit?.weeklyDeduction ?? settings.rm_weekly_deduction);
  const rmBalance = num(rmDeposit?.currentBalance);
  let rmContribution = 0;
  if (rmDeposit && !rmDeposit.isPaused && rmBalance < rmTarget) {
    rmContribution = round2(Math.min(rmWeekly, rmTarget - rmBalance));
    if (rmContribution > 0) {
      lines.push({
        lineType: 'rm_deposit',
        amount: -rmContribution,
        description: `Repair & Maintenance Deposit — building to $${rmTarget.toFixed(2)}`,
        sourceTable: 'rm_deposits',
        sourceId: rmDeposit.id,
      });
    }
  }

  /* --- Carry-forward ------------------------------------------------ */
  const carryIn = round2(num(carryForwardIn));
  if (carryIn) {
    lines.push({
      lineType: 'carry_forward',
      amount: carryIn,
      description: carryIn < 0
        ? 'Balance carried forward from a prior period'
        : 'Credit carried forward from a prior period',
      sourceTable: 'settlements',
      sourceId: null,
    });
  }

  /* --- Totals -------------------------------------------------------- */
  const grossAmount = round2(lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const deductionsAmount = round2(
    Math.abs(lines.filter(l => l.amount < 0).reduce((s, l) => s + l.amount, 0)),
  );
  const netAmount = round2(grossAmount - deductionsAmount);

  /* --- Status --------------------------------------------------------- */
  // held  ⟺  is_departing AND (net + rm balance − equipment exposure) < hold_buffer
  const equipmentExposure = equipmentOutstanding ? num(settings.equipment_value_per_driver) : 0;
  const rmBalanceAfter = round2(rmBalance + rmContribution);
  const coverage = round2(netAmount + rmBalanceAfter - equipmentExposure);

  let status: SettlementStatus = 'paid';
  let holdReason: string | null = null;

  if (isDeparting && coverage < num(settings.hold_buffer)) {
    status = 'held';
    holdReason = equipmentOutstanding
      ? 'Payment held pending return of company equipment.'
      : 'Payment held while the driver is departing and coverage is below the buffer.';
  } else if (netAmount < num(settings.minimum_net_pay_threshold)) {
    // Includes a negative settlement: it is COMPUTED, marked, and rolls
    // forward. A driver with only deductions is never skipped.
    status = 'below_threshold';
  }

  const carryForwardOut = status === 'below_threshold' ? netAmount : 0;

  return {
    operatorId,
    period,
    lines,
    grossAmount,
    deductionsAmount,
    netAmount,
    carryForwardIn: carryIn,
    carryForwardOut,
    status,
    holdReason,
    withheldLoads,
    pendingScaleTicketLoads,
    consideredLoadIds: loads.map(l => l.id),
  };
}
