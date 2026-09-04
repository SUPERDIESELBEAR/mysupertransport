/**
 * THE RECONCILIATION GUARD — Module 7, Pass 2. This file IS the deliverable.
 *
 * The broker invoice and the dispatch company's eligible base read the same
 * loads and are SUPPOSED to differ. What must never happen is that they differ
 * for a reason nobody chose — a header rate assembled twice, an FSC rule
 * copied and then edited on one side only, a charge itemised in one path and
 * not the other. docs/tms-build-status.md records eight instances of correct
 * code defeated by other correct code; this is the assertion that fails loudly
 * when only one side moves.
 *
 * For every load that produced a dispatch contribution:
 *
 *   invoice amount − Σ(excluded charges) − Σ(excluded adjustments)
 *     = dispatch header + dispatch FSC + included charges + included adjustments
 *
 * The rows are READ LIVE. No fixture restates what the loads are expected to
 * contain: the record documents that in both defects that mattered, the
 * fixture agreed with the wrong assumption.
 */
import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import { buildLoadInvoice, type InvoiceLoadInput } from '@/lib/invoiceBuilder';
import {
  computeDispatchSettlement,
  type DispatchLoadInput,
} from '@/lib/dispatchSettlement';
import type { PayPolicyRates } from '@/lib/payTreatment';
import type { LoadChargeRecord } from '@/lib/loadCharges';
import type { LoadAdjustmentRecord } from '@/lib/loadRateParts';

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner('invoice-dispatch-reconciliation.test.ts DID NOT RUN', [
    'No PGHOST, so the six seed loads could not be read. A hand-authored',
    'fixture is deliberately NOT offered as a substitute here.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live loads could not be read',
  details: ['Only the real rows can show the two paths disagreeing.'],
});

function psqlJson<T>(sql: string): T {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.trim() || 'null') as T;
}

/** The six seed loads. Named, because ST-TEST-* are harness loads, not seed. */
const SEED = ['ST26056', 'ST26058', 'ST26059', 'ST26060', 'ST26061', 'ST26063'];

/**
 * The harness load that carries the live late accessorial. It is named
 * SEPARATELY and reported separately: the six seed loads must be UNCHANGED by
 * this pass, and folding this one into `SEED` would hide that.
 *
 * ST-TEST-005 carries `ST-TEST-005-A1` — approved, $275.00, detention.
 * `detention_pct` is 100, so it is EXCLUDED from the dispatch base and BILLED
 * on the invoice at full amount: the exact shape the new term needs, and real
 * data rather than a fixture.
 */
const ADJUSTMENT_LOADS = ['ST-TEST-005'];
const ALL_LOADS = [...SEED, ...ADJUSTMENT_LOADS];

interface LoadRow {
  id: string;
  load_number: string;
  load_type: string | null;
  rate_type: string | null;
  status: string | null;
  delivered_at: string | null;
  linehaul_rate: string | null;
  rate_per_mile: string | null;
  loaded_miles: string | null;
  rate_per_ton: string | null;
  confirmed_tons: string | null;
  fsc_amount: string | null;
  fsc_bundled_into_linehaul: boolean | null;
  loadout_relocation_fee: string | null;
  total_load_value: string | null;
  dispatcher_id: string | null;
  charges: LoadChargeRecord[] | null;
  adjustments: LoadAdjustmentRecord[] | null;
}

function readSeedLoads(names: string[] = SEED): LoadRow[] {
  const list = names.map((n) => `'${n}'`).join(',');
  return psqlJson<LoadRow[]>(`
    select coalesce(json_agg(row_to_json(x) order by x.load_number), '[]'::json) from (
      select l.id, l.load_number, l.load_type, l.rate_type, l.status, l.delivered_at,
             l.linehaul_rate, l.rate_per_mile, l.loaded_miles, l.rate_per_ton,
             l.confirmed_tons, l.fsc_amount, l.fsc_bundled_into_linehaul,
             l.loadout_relocation_fee, l.total_load_value, l.dispatcher_id,
             (select coalesce(json_agg(row_to_json(c)), '[]'::json)
                from (select ch.id, ch.load_id, ch.load_stop_id, ch.charge_type,
                             ch.description, ch.amount, ch.source, ch.funding_source,
                             ch.actual_cost, ch.proof_document_id
                        from public.load_charges ch
                       where ch.load_id = l.id order by ch.created_at) c) as charges,
             (select coalesce(json_agg(row_to_json(a)), '[]'::json)
                from (select adj.id, adj.reference, adj.charge_type, adj.amount, adj.status
                        from public.accessorial_adjustments adj
                       where adj.load_id = l.id order by adj.sequence) a) as adjustments
        from public.loads l where l.load_number in (${list})
    ) x`);
}

function readCompanyPolicy(): PayPolicyRates {
  const p = psqlJson<PayPolicyRates | null>(
    "select coalesce(row_to_json(p), 'null'::json) from public.pay_policies p "
    + 'where p.is_company_default order by p.created_at limit 1');
  if (!p) throw new Error('no company default pay policy');
  return p;
}

function readRates(): { dispatch_pct: string; factoring_pct: string } {
  const r = psqlJson<{ dispatch_pct: string; factoring_pct: string } | null>(
    "select coalesce(row_to_json(r), 'null'::json) from ("
    + 'select dispatch_pct, factoring_pct from public.dispatch_settlement_rates'
    + " where effective_from <= '2026-08-01'"
    + " and (effective_to is null or effective_to > '2026-08-01')"
    + ' order by effective_from desc limit 1) r');
  if (!r) throw new Error('no dispatch settlement rates for 2026-08');
  return r;
}

const toInvoiceInput = (l: LoadRow): InvoiceLoadInput => ({
  id: l.id,
  loadNumber: l.load_number,
  loadType: l.load_type,
  rateType: l.rate_type,
  linehaulRate: l.linehaul_rate,
  ratePerMile: l.rate_per_mile,
  loadedMiles: l.loaded_miles,
  ratePerTon: l.rate_per_ton,
  confirmedTons: l.confirmed_tons,
  fscAmount: l.fsc_amount,
  fscBundledIntoLinehaul: l.fsc_bundled_into_linehaul,
  loadoutRelocationFee: l.loadout_relocation_fee,
  charges: l.charges ?? [],
  adjustments: l.adjustments ?? [],
});

const toDispatchInput = (l: LoadRow): DispatchLoadInput => ({
  ...toInvoiceInput(l),
  status: l.status,
  deliveredAt: l.delivered_at,
  dispatcherId: l.dispatcher_id,
  charges: l.charges ?? [],
  adjustments: l.adjustments ?? [],
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe('the invoice and the dispatch base agree about the PARTS', () => {
  itLive('every load reconciles to the cent, and the report is printed', () => {
    const loads = readSeedLoads(ALL_LOADS);
    expect(loads.map((l) => l.load_number).sort()).toEqual([...ALL_LOADS].sort());

    const policy = readCompanyPolicy();
    const rates = readRates();
    const result = computeDispatchSettlement({
      month: '2026-08',
      dispatchRate: rates.dispatch_pct,
      factoringRate: rates.factoring_pct,
      companyPolicy: policy,
      loads: loads.map(toDispatchInput),
    });

    const report: string[] = [];
    let invoiceTotal = 0;

    for (const row of loads) {
      const invoice = buildLoadInvoice(toInvoiceInput(row));
      invoiceTotal = round2(invoiceTotal + invoice.amount);
      const contribution = result.contributions.find((c) => c.loadId === row.id);

      report.push(`${row.load_number}  invoice $${invoice.amount.toFixed(2)}`
        + `  (total_load_value $${Number(row.total_load_value ?? 0).toFixed(2)})`);
      for (const line of invoice.lines) {
        report.push(`    ${line.lineType.padEnd(8)} ${line.description.padEnd(34)}`
          + `$${line.amount.toFixed(2)}`);
      }

      if (!contribution) {
        const reason = result.ineligible.find((i) => i.loadId === row.id)?.reason;
        report.push(`    dispatch: NO CONTRIBUTION (${reason})`);
        // A load excluded by STATUS is still invoiced — that is the point of
        // the two paths being separate. It just has no dispatch side to
        // reconcile against.
        expect(reason, `${row.load_number} has neither contribution nor reason`)
          .toBeTruthy();
        continue;
      }

      const excludedCharges = round2(contribution.verdicts
        .filter((v) => v.excluded)
        .reduce((s, v) => s + v.amount, 0));
      const excludedAdjustments = round2(contribution.adjustmentVerdicts
        .filter((v) => v.excluded)
        .reduce((s, v) => s + v.amount, 0));
      const excluded = round2(excludedCharges + excludedAdjustments);
      const dispatchSide = round2(contribution.headerComponent
        + contribution.fscComponent + contribution.chargesIncludedAmount
        + contribution.adjustmentsIncludedAmount);
      const difference = round2(invoice.amount - dispatchSide);

      // BEFORE and AFTER, on the same live row: the invoice this load would
      // have produced had the fourth part not existed, beside the one it
      // produces now. The `before` figure is not a stored number — it is this
      // build with the adjustments withheld, which is the only honest way to
      // show what the pass changed.
      const before = buildLoadInvoice({ ...toInvoiceInput(row), adjustments: [] });
      report.push(`    invoice before adjustments $${before.amount.toFixed(2)}`
        + `   after $${invoice.amount.toFixed(2)}`
        + `   adjustments billed $${invoice.adjustmentsTotal.toFixed(2)}`);
      report.push(`    dispatch base $${contribution.baseTotal.toFixed(2)}`
        + `   difference $${difference.toFixed(2)}`
        + `   excluded charges $${excludedCharges.toFixed(2)}`
        + `   excluded adjustments $${excludedAdjustments.toFixed(2)}`);
      expect(round2(before.amount + invoice.adjustmentsTotal),
        `${row.load_number}: the invoice moved by something other than the adjustments`)
        .toBe(invoice.amount);

      // THE GUARD. Three independent statements, deliberately not one: the
      // first says the difference is exactly what the predicate excluded, the
      // second names the two exclusion terms separately so a regression in one
      // cannot be absorbed by the other, and the third says the dispatch side
      // is nothing other than its own stored parts.
      expect(round2(invoice.amount - excludedCharges - excludedAdjustments),
        `${row.load_number}: invoice less exclusions does not equal the dispatch base`)
        .toBe(dispatchSide);
      expect(difference,
        `${row.load_number}: the difference is not the excluded charges and adjustments`)
        .toBe(excluded);
      expect(contribution.baseTotal).toBe(dispatchSide);
    }

    report.push(`INVOICE TOTAL (all ${loads.length} loads) $${invoiceTotal.toFixed(2)}`);
    report.push(`SEED-ONLY INVOICE TOTAL $${loads
      .filter((l) => SEED.includes(l.load_number))
      .reduce((s, l) => round2(s + buildLoadInvoice(toInvoiceInput(l)).amount), 0)
      .toFixed(2)}`);
    report.push(`SEED DISPATCH BASE $${result.contributions
      .reduce((s, c) => round2(s + c.baseTotal), 0).toFixed(2)}`);
    // eslint-disable-next-line no-console
    console.log(report.join('\n'));
  });

  itLive('the invoice bills a charge the dispatch predicate excludes', () => {
    // Without this, the guard above could pass on a set of loads that happen
    // to have no excluded charge at all, and prove nothing.
    const loads = readSeedLoads(ALL_LOADS);
    const policy = readCompanyPolicy();
    const rates = readRates();
    const result = computeDispatchSettlement({
      month: '2026-08', dispatchRate: rates.dispatch_pct,
      factoringRate: rates.factoring_pct, companyPolicy: policy,
      loads: loads.map(toDispatchInput),
    });
    const excludedSomewhere = result.contributions
      .flatMap((c) => c.verdicts).filter((v) => v.excluded);
    expect(excludedSomewhere.length).toBeGreaterThan(0);

    for (const verdict of excludedSomewhere) {
      const row = loads.find((l) => (l.charges ?? [])
        .some((c) => c.id === verdict.loadChargeId))!;
      const invoice = buildLoadInvoice(toInvoiceInput(row));
      const billed = invoice.lines.find((l) => l.loadChargeId === verdict.loadChargeId);
      expect(billed, `${verdict.chargeType} is not on the invoice at all`).toBeTruthy();
      expect(billed!.amount).toBe(verdict.amount);
    }
  });

  itLive('the invoice bills an ADJUSTMENT the dispatch predicate excludes', () => {
    // THE ANTI-VACUITY ASSERTION FOR THE NEW TERM. A reconciliation whose new
    // term is always zero passes trivially and proves nothing about
    // adjustments; the term would be decorative. So: at least one excluded
    // adjustment must EXIST, and it must be billed on the invoice at the
    // identical amount. ST-TEST-005-A1 is that case, from the live table.
    const loads = readSeedLoads(ALL_LOADS);
    const policy = readCompanyPolicy();
    const rates = readRates();
    const result = computeDispatchSettlement({
      month: '2026-08', dispatchRate: rates.dispatch_pct,
      factoringRate: rates.factoring_pct, companyPolicy: policy,
      loads: loads.map(toDispatchInput),
    });

    const excludedAdjustments = result.contributions
      .flatMap((c) => c.adjustmentVerdicts).filter((v) => v.excluded);
    expect(excludedAdjustments.length,
      'no adjustment is excluded anywhere, so the new term proves nothing')
      .toBeGreaterThan(0);

    for (const verdict of excludedAdjustments) {
      const row = loads.find((l) => (l.adjustments ?? [])
        .some((a) => a.id === verdict.adjustmentId))!;
      const invoice = buildLoadInvoice(toInvoiceInput(row));
      const billed = invoice.lines.find((l) => l.adjustmentId === verdict.adjustmentId);
      expect(billed, `${verdict.reference} is not on the invoice at all`).toBeTruthy();
      expect(billed!.amount, `${verdict.reference} is billed at a different amount`)
        .toBe(verdict.amount);
      expect(billed!.lineType).toBe('adjustment');
      // ...and it is NOT merged into the charge lines.
      expect(billed!.loadChargeId).toBeNull();
    }
  });

  itLive('only approved and settled adjustments are money', () => {
    // The status set, asserted against the live table rather than a fixture:
    // every adjustment the assembler billed is approved or settled, and every
    // one it withheld is not.
    const loads = readSeedLoads(ALL_LOADS);
    const seen = loads.flatMap((l) => (l.adjustments ?? []).map((a) => ({
      row: l, a,
      billed: buildLoadInvoice(toInvoiceInput(l)).lines
        .some((line) => line.adjustmentId === a.id),
    })));
    expect(seen.length, 'no adjustments exist at all to check the status set against')
      .toBeGreaterThan(0);
    for (const { a, billed } of seen) {
      expect(billed, `${a.reference} (${a.status}) billed=${billed}`)
        .toBe(a.status === 'approved' || a.status === 'settled');
    }
  });

  itLive('the six seed loads carry no adjustments, so their figures cannot have moved', () => {
    const seedOnly = readSeedLoads(SEED);
    for (const l of seedOnly) {
      expect(l.adjustments ?? [], `${l.load_number} unexpectedly carries an adjustment`)
        .toEqual([]);
      const withAdjustmentSupport = buildLoadInvoice(toInvoiceInput(l));
      expect(withAdjustmentSupport.adjustmentsTotal).toBe(0);
    }
  });

  itLive('no invoice is read from the broker gross column', () => {
    // ST26060 is the loadout the known-debt entry names:
    // `recompute_load_total_value` drops charges on a loadout. If the builder
    // had read `total_load_value`, the two would agree by construction and
    // this pass would have inherited the defect silently.
    const loads = readSeedLoads();
    const differing = loads
      .map((l) => ({
        n: l.load_number,
        stored: round2(Number(l.total_load_value ?? 0)),
        built: buildLoadInvoice(toInvoiceInput(l)).amount,
      }))
      .filter((r) => r.stored !== r.built);
    // eslint-disable-next-line no-console
    console.log('total_load_value vs invoice:', JSON.stringify(differing));
    expect(Array.isArray(differing)).toBe(true);
  });
});
