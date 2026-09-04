/**
 * MODULE 4, PASS 4 — the settlement RUN: gather, compute, store.
 *
 * Three layers, deliberately separate:
 *
 *   GATHERING  collects rows. It decides nothing. It does NOT drop a load with
 *              a claim hold or missing paperwork, because the engine owns those
 *              rules and a filtering gathering layer could silently disagree
 *              with it — the same reasoning already recorded for claim holds in
 *              docs/tms-build-status.md.
 *   COMPUTE    is `computeSettlement`, untouched by this pass.
 *   STORE      is `store_settlement_run`, a single definer RPC that writes the
 *              settlement, EVERY line item and EVERY withheld load in one
 *              transaction, with the actor recorded.
 *
 * POPULATION is the recorded rule, read through `selectSettlementPopulation`:
 * anyone with unsettled work in the period. No `is_active`, no parked, no
 * departing, no `excluded_from_dispatch`, no `fully_onboarded`, no
 * `lease_terminations`.
 *
 * Once stored, a settlement is READ, never recomputed. Nothing in the driver's
 * path imports this module.
 */
import { computeSettlement, type ComputedSettlement, type SettlementComputeInput, type SettlementLoadInput, type SettlementAdjustmentInput } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS, type SettlementSettings } from '@/lib/settlementConfig';
import { workPeriodForDate, deliveredInPeriod, carrierDateOf, type WorkPeriod } from '@/lib/settlementPeriod';
import { hasUnsettledWork, populationReasons, type UnsettledWork } from '@/lib/settlementPopulation';
import type { PayPolicyRates } from '@/lib/payTreatment';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * A READ THAT FAILED IS NOT AN EMPTY RESULT.
 *
 * Every gather read feeds a dollar figure, an exclusion set or a guard, and a
 * swallowed error moves money in a direction nobody chose: an empty
 * `settlement_line_items` re-deducts every fuel transaction the driver has ever
 * had, an empty `loads` underpays, and a failed `equipment_outstanding` releases
 * a departing driver's equipment hold. The run throws instead, naming the read.
 */
export class SettlementReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementReadError';
  }
}

function reasonText(cause: unknown): string {
  if (cause == null) return 'unknown cause';
  if (typeof cause === 'string') return cause;
  const c = cause as { message?: string; code?: string; details?: string };
  return [c.code, c.message ?? String(cause), c.details].filter(Boolean).join(' — ');
}

function readFailure(label: string, cause: unknown, operatorId?: string): SettlementReadError {
  const who = operatorId ? ` for operator ${operatorId}` : '';
  return new SettlementReadError(
    `Settlement run aborted: the read of ${label}${who} FAILED (${reasonText(cause)}). `
    + 'This is a failure, not an empty result — no settlement was produced.',
  );
}

/** Rows from a list read, or a throw. Never a silent empty array. */
function rowsOf(res: { data?: unknown; error?: unknown } | null | undefined, label: string): any[] {
  if (!res) throw readFailure(label, 'the query returned no response object');
  if (res.error) throw readFailure(label, res.error);
  return (res.data ?? []) as any[];
}

/** A single optional row, or a throw. `null` means genuinely absent. */
function rowOf(res: { data?: unknown; error?: unknown } | null | undefined, label: string): any | null {
  if (!res) throw readFailure(label, 'the query returned no response object');
  if (res.error) throw readFailure(label, res.error);
  return (res.data ?? null) as any | null;
}


export interface GatheredOperator {
  operatorId: string;
  operatorName: string;
  input: SettlementComputeInput;
  work: UnsettledWork;
  reasons: string[];
}

export interface GatheredRun {
  period: WorkPeriod;
  settings: SettlementSettings;
  operators: GatheredOperator[];
  /** Settlements that already exist for this period, keyed by operator. */
  existing: Record<string, { id: string; status: string; net_amount: number }>;
}

export interface PreviewRow {
  operatorId: string;
  operatorName: string;
  computed: ComputedSettlement;
  reasons: string[];
  /** A settlement already stored for this operator and period, if any. */
  existing: { id: string; status: string; net_amount: number } | null;
}

export interface RunPreview {
  period: WorkPeriod;
  rows: PreviewRow[];
}

/* ------------------------------------------------------------------ */
/* Gathering                                                           */
/* ------------------------------------------------------------------ */

export async function loadSettlementSettings(sb: Client): Promise<SettlementSettings> {
  const res = await sb.from('settlement_settings').select('*').maybeSingle();
  const data = rowOf(res, 'settlement_settings');
  // No row is a genuine absence and the shipped defaults stand. A FAILED read
  // has already thrown above: it never silently becomes the defaults.
  if (!data) return SETTLEMENT_SETTINGS_DEFAULTS;
  return {
    minimum_net_pay_threshold: num(data.minimum_net_pay_threshold),
    hold_buffer: num(data.hold_buffer),
    equipment_value_per_driver: num(data.equipment_value_per_driver),
    rm_deposit_target: num(data.rm_deposit_target),
    rm_weekly_deduction: num(data.rm_weekly_deduction),
    work_week_start_dow: num(data.work_week_start_dow),
  };
}

const DAY = 86_400_000;
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/**
 * Every row the engine could need, for the whole period, for every operator.
 * Nothing is dropped on the way in.
 */
export async function gatherSettlementRun(sb: Client, anchorDate: string): Promise<GatheredRun> {
  const settings = await loadSettlementSettings(sb);
  const period = workPeriodForDate(anchorDate, settings.work_week_start_dow);

  // Widened by a day at each end because `delivered_at` is an instant and the
  // period is a set of CARRIER-ZONE dates; the exact test is `deliveredInPeriod`.
  const fromIso = `${shift(period.periodStart, -1)}T00:00:00Z`;
  const toIso = `${shift(period.periodEnd, 2)}T00:00:00Z`;

  const [loadRes, existingRes, alreadySettledRes, policyRes, assignRes] = await Promise.all([
    sb.from('loads')
      .select('id, load_number, load_type, operator_id, delivered_at, rate_type, linehaul_rate, '
        + 'rate_per_mile, loaded_miles, rate_per_ton, confirmed_tons, estimated_tons, fsc_amount, '
        + 'fsc_bundled_into_linehaul, loadout_relocation_fee, '
        + 'load_charges(id, charge_type, description, amount, funding_source, actual_cost), '
        + 'load_documents(document_type, photo_label), '
        + 'document_exceptions(document_type, status, photo_label), '
        + 'claim_flags(id, flag_level, is_active, resolved_at, claim_type)')
      .not('operator_id', 'is', null)
      .not('delivered_at', 'is', null)
      .gte('delivered_at', fromIso)
      .lt('delivered_at', toIso),
    sb.from('settlements')
      .select('id, operator_id, status, net_amount')
      .eq('period_start', period.periodStart),
    sb.from('settlement_line_items').select('source_table, source_id, settlements(period_start)'),
    sb.from('pay_policies').select('*').eq('is_company_default', true).maybeSingle(),
    sb.from('pay_policy_assignments')
      .select('operator_id, effective_start_date, effective_end_date, pay_policies(*)'),
  ]);

  /**
   * Two exclusion sets, because "already settled" means two different things.
   *
   * A load, a fuel transaction and a ONE-TIME deduction are each settled once
   * and never again: for those, ANY line item anywhere is disqualifying, which
   * is what `settledSourcesEver` carries.
   *
   * A RECURRING deduction is due EVERY period inside its start_payday /
   * end_payday window. Excluding it because it appeared on some earlier
   * settlement charged it once and never again — it also dropped a driver whose
   * only unsettled item was that deduction out of the population entirely.
   * For those the question is only "was it already charged on THIS period",
   * which is `settledSourcesThisPeriod`.
   */
  const settledSourcesEver = new Set<string>();
  const settledSourcesThisPeriod = new Set<string>();
  for (const r of rowsOf(alreadySettledRes, 'settlement_line_items')) {
    if (!r.source_id) continue;
    const key = `${r.source_table}:${r.source_id}`;
    settledSourcesEver.add(key);
    const s = Array.isArray(r.settlements) ? r.settlements[0] : r.settlements;
    if (s?.period_start === period.periodStart) settledSourcesThisPeriod.add(key);
  }
  const settledSources = settledSourcesEver;


  const companyPolicy = rowOf(policyRes, 'pay_policies (company default)') as PayPolicyRates | null;

  const driverPolicies: Record<string, PayPolicyRates> = {};
  for (const a of rowsOf(assignRes, 'pay_policy_assignments')) {
    const startsOk = !a.effective_start_date || a.effective_start_date <= period.periodEnd;
    const endsOk = !a.effective_end_date || a.effective_end_date >= period.periodStart;
    if (startsOk && endsOk && a.pay_policies) driverPolicies[a.operator_id] = a.pay_policies as PayPolicyRates;
  }

  const loadsByOperator: Record<string, SettlementLoadInput[]> = {};
  for (const l of rowsOf(loadRes, 'loads')) {
    if (!deliveredInPeriod(l.delivered_at, period)) continue;
    if (settledSources.has(`loads:${l.id}`)) continue;
    (loadsByOperator[l.operator_id] ??= []).push({
      id: l.id,
      loadNumber: l.load_number,
      loadType: l.load_type,
      deliveredAt: l.delivered_at,
      charges: (l.load_charges ?? []) as any[],
      rateType: l.rate_type,
      linehaulRate: l.linehaul_rate,
      ratePerMile: l.rate_per_mile,
      loadedMiles: l.loaded_miles,
      ratePerTon: l.rate_per_ton,
      confirmedTons: l.confirmed_tons,
      estimatedTons: l.estimated_tons,
      fscAmount: l.fsc_amount,
      fscBundledIntoLinehaul: l.fsc_bundled_into_linehaul,
      loadoutRelocationFee: l.loadout_relocation_fee,
      documents: (l.load_documents ?? []) as any[],
      exceptions: (l.document_exceptions ?? []) as any[],
      // NOT pre-filtered. Every claim row travels to the engine, which decides.
      claims: ((l.claim_flags ?? []) as any[]).map(c => ({
        id: c.id,
        flagLevel: c.flag_level,
        isActive: c.is_active,
        resolvedAt: c.resolved_at,
        claimType: c.claim_type,
      })),
    });
  }

  const [fuelRes, dedRes, advRes, rmRes, priorRes, operatorRes, adjRes] = await Promise.all([
    sb.from('fuel_transactions')
      .select('id, operator_id, total_amount, fuel_discount_amount, invoice_no, invoice_date')
      .not('operator_id', 'is', null)
      .gte('invoice_date', period.periodStart)
      .lte('invoice_date', period.periodEnd),
    sb.from('deductions').select('id, operator_id, label, amount, is_active, is_recurring, start_payday, end_payday').eq('is_active', true),
    sb.from('cash_advances').select('id, operator_id, remaining_balance, repayment_status'),
    sb.from('rm_deposits').select('id, operator_id, current_balance, target_amount, weekly_deduction, is_paused'),
    sb.from('settlements')
      .select('operator_id, carry_forward_out, period_start')
      .lt('period_start', period.periodStart)
      .order('period_start', { ascending: false }),
    sb.from('operators').select('id, is_departing, applications(first_name, last_name)'),
    // APPROVED late accessorial adjustments, bounded by the APPROVAL instant.
    // The period bound is INDEPENDENT of the exclusion set on purpose: the
    // recorded fuel defect showed that when an exclusion set is a filter's
    // only bound, losing it removes the bound entirely. Losing this one can
    // only re-touch adjustments approved inside the week being run.
    sb.from('accessorial_adjustments')
      .select('id, reference, load_id, charge_type, description, amount, funding_source, '
        + 'actual_cost, approved_at, status, settlement_id, loads(operator_id, load_number)')
      .eq('status', 'approved')
      .is('settlement_id', null)
      .gte('approved_at', fromIso)
      .lt('approved_at', toIso),
  ]);

  // Each read is checked HERE, once, before anything derives a figure from it.
  const fuelRows = rowsOf(fuelRes, 'fuel_transactions');
  const dedRows = rowsOf(dedRes, 'deductions');
  const advRows = rowsOf(advRes, 'cash_advances');

  /**
   * TWO INDEPENDENT LOCKS on a late adjustment, and they catch different
   * things.
   *
   * `settledSourcesEver` is the SETTLE-ONCE key (never the period-scoped set —
   * an adjustment is not a recurring deduction). It catches an adjustment
   * whose settlement line item exists even though its own row was never
   * stamped: a write-back that failed after the line landed, or a row whose
   * pointers were cleared. It is the money's own record.
   *
   * `settlement_id IS NULL` catches the opposite: a row the writer DID stamp
   * whose line item has since been deleted with the settlement it belonged to.
   * It also keeps the read narrow at the database rather than in memory.
   *
   * Either lock alone leaves a double-pay window open; the pair does not.
   */
  const adjustmentsByOperator: Record<string, SettlementAdjustmentInput[]> = {};
  for (const a of rowsOf(adjRes, 'accessorial_adjustments')) {
    if (a.status !== 'approved' || a.settlement_id) continue;
    const approvedOn = carrierDateOf(a.approved_at);
    if (!approvedOn || approvedOn < period.periodStart || approvedOn > period.periodEnd) continue;
    if (settledSourcesEver.has(`accessorial_adjustments:${a.id}`)) continue;
    const load = Array.isArray(a.loads) ? a.loads[0] : a.loads;
    const operatorId = load?.operator_id;
    if (!operatorId) continue;
    (adjustmentsByOperator[operatorId] ??= []).push({
      id: a.id,
      reference: a.reference,
      loadNumber: load?.load_number ?? null,
      chargeType: a.charge_type,
      amount: num(a.amount),
      description: a.description,
      fundingSource: a.funding_source,
      actualCost: a.actual_cost,
    });
  }

  const operators = (rowsOf(operatorRes, 'operators'));
  const nameOf = (id: string) => {
    const a = operators.find(x => x.id === id)?.applications;
    const app = Array.isArray(a) ? a[0] : a;
    return app ? `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || id : id;
  };

  const carryForward: Record<string, number> = {};
  for (const s of rowsOf(priorRes, 'settlements (prior periods, carry-forward)')) {
    if (carryForward[s.operator_id] === undefined) carryForward[s.operator_id] = num(s.carry_forward_out);
  }

  const rmByOperator: Record<string, any> = {};
  for (const r of rowsOf(rmRes, 'rm_deposits')) rmByOperator[r.operator_id] = r;

  const existing: GatheredRun['existing'] = {};
  for (const s of rowsOf(existingRes, 'settlements (existing for this period)')) {
    existing[s.operator_id] = { id: s.id, status: s.status, net_amount: num(s.net_amount) };
  }

  const candidateIds = new Set<string>([
    ...Object.keys(loadsByOperator),
    ...(fuelRows).map(f => f.operator_id),
    ...(dedRows).map(d => d.operator_id),
    ...(advRows).filter(a => num(a.remaining_balance) > 0).map(a => a.operator_id),
    ...Object.keys(carryForward).filter(id => carryForward[id] < 0),
    ...Object.keys(rmByOperator),
    // An approved adjustment ALONE brings a driver into the run.
    ...Object.keys(adjustmentsByOperator),
  ].filter(Boolean));

  const gathered: GatheredOperator[] = [];

  for (const operatorId of candidateIds) {
    const loads = loadsByOperator[operatorId] ?? [];

    const fuel = (fuelRows)
      .filter(f => f.operator_id === operatorId && !settledSources.has(`fuel_transactions:${f.id}`))
      .map(f => {
        const discount = Math.abs(num(f.fuel_discount_amount));
        return {
          id: f.id,
          grossAmount: num(f.total_amount) + discount,
          discountAmount: discount,
          description: `Fuel — invoice ${f.invoice_no} (${f.invoice_date})`,
        };
      });

    const deductions = (dedRows)
      .filter(d => d.operator_id === operatorId
        && (!d.start_payday || d.start_payday <= period.payday)
        && (!d.end_payday || d.end_payday >= period.payday)
        // Recurring: only a line item on THIS period disqualifies it, so it is
        // charged again every period its window covers. One-time: any line item
        // anywhere disqualifies it, so it is never charged twice.
        && !(d.is_recurring
          ? settledSourcesThisPeriod.has(`deductions:${d.id}`)
          : settledSourcesEver.has(`deductions:${d.id}`)))
      .map(d => ({ id: d.id, label: d.label, amount: num(d.amount), sourceTable: 'deductions' as const }));


    const advanceBalance = (advRows)
      .filter(a => a.operator_id === operatorId)
      .reduce((t, a) => t + num(a.remaining_balance), 0);

    const rmRow = rmByOperator[operatorId] ?? null;
    const rmDeposit = rmRow
      ? {
          id: rmRow.id,
          currentBalance: num(rmRow.current_balance),
          targetAmount: rmRow.target_amount == null ? null : num(rmRow.target_amount),
          weeklyDeduction: rmRow.weekly_deduction == null ? null : num(rmRow.weekly_deduction),
          isPaused: Boolean(rmRow.is_paused),
        }
      : null;

    const rmShortfall = rmDeposit && !rmDeposit.isPaused
      ? Math.max(0, (rmDeposit.targetAmount ?? settings.rm_deposit_target) - rmDeposit.currentBalance)
      : 0;

    const carryIn = carryForward[operatorId] ?? 0;
    const operatorRow = operators.find(o => o.id === operatorId);

    // A hold is a claim about the physical world. It must be traceable to a
    // row, so "cannot be determined" is a FAILED RUN, never a default — in
    // either direction. Defaulting false released the hold; defaulting true
    // would invent one on evidence nobody read.
    let equipmentOutstanding: boolean;
    try {
      const { data, error } = await sb.rpc('equipment_outstanding', { _operator_id: operatorId });
      if (error) throw readFailure('equipment_outstanding RPC', error, operatorId);
      if (typeof data !== 'boolean') {
        throw readFailure(
          'equipment_outstanding RPC',
          `returned ${data === null ? 'null' : typeof data} instead of a boolean`,
          operatorId,
        );
      }
      equipmentOutstanding = data;
    } catch (e) {
      if (e instanceof SettlementReadError) throw e;
      throw readFailure('equipment_outstanding RPC', e, operatorId);
    }


    const work: UnsettledWork = {
      operatorId,
      deliveredLoadCount: loads.length,
      undeductedFuelCount: fuel.length,
      outstandingAdvanceBalance: advanceBalance,
      negativeCarryForward: carryIn < 0 ? Math.abs(carryIn) : 0,
      rmDeductionDue: Math.min(rmShortfall, rmDeposit?.weeklyDeduction ?? settings.rm_weekly_deduction),
      otherDeductionsDue: deductions.reduce((t, d) => t + d.amount, 0),
    };

    gathered.push({
      operatorId,
      operatorName: nameOf(operatorId),
      work,
      reasons: populationReasons(work),
      input: {
        operatorId,
        periodAnchorDate: period.periodStart,
        settings,
        companyPolicy,
        driverPolicy: driverPolicies[operatorId] ?? null,
        loads,
        fuel,
        deductions,
        // Cash advances are a POPULATION trigger only: no repayment schedule is
        // recorded anywhere, and inventing one here would be the gathering layer
        // making a pay rule. Recorded as an open item.
        advances: [],
        rmDeposit,
        carryForwardIn: carryIn,
        isDeparting: operatorRow?.is_departing === true,
        equipmentOutstanding,
      },
    });
  }

  return { period, settings, operators: gathered, existing };
}

/* ------------------------------------------------------------------ */
/* Preview — computed, shown, and not yet written                      */
/* ------------------------------------------------------------------ */

export function previewFromGathered(run: GatheredRun): RunPreview {
  const rows: PreviewRow[] = [];
  for (const g of run.operators) {
    if (!hasUnsettledWork(g.work)) continue;
    rows.push({
      operatorId: g.operatorId,
      operatorName: g.operatorName,
      computed: computeSettlement(g.input),
      reasons: g.reasons,
      existing: run.existing[g.operatorId] ?? null,
    });
  }
  rows.sort((a, b) => a.operatorName.localeCompare(b.operatorName));
  return { period: run.period, rows };
}

export async function previewSettlementRun(sb: Client, anchorDate: string): Promise<RunPreview> {
  return previewFromGathered(await gatherSettlementRun(sb, anchorDate));
}

/* ------------------------------------------------------------------ */
/* Storing                                                             */
/* ------------------------------------------------------------------ */

export type RunMode = 'refuse' | 'replace';

/** The payload shape the RPC reads. Every line and every withheld load travels. */
export function runPayload(rows: PreviewRow[]): unknown[] {
  return rows.map(r => ({
    operator_id: r.operatorId,
    status: r.computed.status,
    gross_amount: r.computed.grossAmount,
    deductions_amount: r.computed.deductionsAmount,
    net_amount: r.computed.netAmount,
    carry_forward_in: r.computed.carryForwardIn,
    carry_forward_out: r.computed.carryForwardOut,
    hold_reason: r.computed.holdReason,
    lines: r.computed.lines.map(l => ({
      line_type: l.lineType,
      amount: l.amount,
      description: l.description,
      source_table: l.sourceTable,
      source_id: l.sourceId,
    })),
    withheld: [
      ...r.computed.withheldLoads.flatMap(w => w.reasons.map(reason => ({
        load_id: w.loadId,
        load_number: w.loadNumber,
        reason_code: reason.code,
        message: reason.message,
        outstanding: reason.outstanding,
      }))),
      ...r.computed.pendingScaleTicketLoads.map(w => ({
        load_id: w.loadId,
        load_number: w.loadNumber,
        reason_code: 'scale_ticket',
        message: w.reason,
        outstanding: w.outstanding,
      })),
    ],
  }));
}

export interface StoreResultRow {
  operator_id: string;
  settlement_id: string;
  outcome: 'created' | 'replaced' | 'refused_existing';
  net?: number;
  status?: string;
  existing_net?: number;
  existing_status?: string;
}

export async function storeSettlementRun(
  sb: Client,
  preview: RunPreview,
  rows: PreviewRow[],
  mode: RunMode = 'refuse',
): Promise<{ results: StoreResultRow[] }> {
  const { data, error } = await sb.rpc('store_settlement_run', {
    p_period_start: preview.period.periodStart,
    p_period_end: preview.period.periodEnd,
    p_payday: preview.period.payday,
    p_runs: runPayload(rows),
    p_mode: mode,
  });
  if (error) throw error;
  return { results: ((data as any)?.results ?? []) as StoreResultRow[] };
}
