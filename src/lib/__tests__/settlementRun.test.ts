/**
 * MODULE 4, PASS 4 — the run: gather, compute, store.
 *
 * These tests guard the three rules that make a stored settlement trustworthy:
 * gathering decides nothing, the whole result is stored, and once stored a
 * settlement is read rather than recomputed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gatherSettlementRun, previewFromGathered, runPayload } from '@/lib/settlementRun';

/* eslint-disable @typescript-eslint/no-explicit-any */

const PERIOD_ANCHOR = '2026-08-14'; // inside Wed 12 – Tue 18 Aug 2026
const OP_LOADS = '11111111-1111-4111-8111-111111111111';
const OP_DEDUCTIONS_ONLY = '22222222-2222-4222-8222-222222222222';
const OP_QUIET = '33333333-3333-4333-8333-333333333333';

function fakeClient(tables: Record<string, any[]>) {
  const builder = (rows: any[]) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain, not: () => chain, is: () => chain, gte: () => chain, lte: () => chain, lt: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return chain;
  };
  return {
    from: (t: string) => builder(tables[t] ?? []),
    rpc: async () => ({ data: false, error: null }),
  };
}

const baseTables = () => ({
  settlement_settings: [{
    minimum_net_pay_threshold: 100, hold_buffer: 500, equipment_value_per_driver: 1200,
    rm_deposit_target: 2000, rm_weekly_deduction: 200, work_week_start_dow: 3,
  }],
  pay_policies: [{ id: 'p1', is_company_default: true, linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72 }],
  pay_policy_assignments: [],
  settlement_line_items: [],
  settlements: [],
  fuel_transactions: [],
  cash_advances: [],
  rm_deposits: [],
  operators: [
    { id: OP_LOADS, first_name: 'Held', last_name: 'Driver', is_departing: false },
    { id: OP_DEDUCTIONS_ONLY, first_name: 'Debt', last_name: 'Only', is_departing: false },
    { id: OP_QUIET, first_name: 'Quiet', last_name: 'Week', is_departing: false },
  ],
  deductions: [],
  loads: [],
});

describe('gathering decides nothing', () => {
  it('hands the engine a claim-held, paperwork-short load instead of dropping it', async () => {
    const t: any = baseTables();
    t.loads = [{
      id: 'load-1', load_number: 'ST-HOLD', load_type: 'standard', operator_id: OP_LOADS,
      delivered_at: '2026-08-14T18:00:00Z', rate_type: 'flat', linehaul_rate: 1000,
      load_charges: [], load_documents: [], document_exceptions: [],
      claim_flags: [{ id: 'c1', flag_level: 'hold', is_active: true, resolved_at: null, claim_type: 'damaged_goods' }],
    }];
    const run = await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR);
    const g = run.operators.find(o => o.operatorId === OP_LOADS)!;
    expect(g.input.loads.map(l => l.loadNumber)).toEqual(['ST-HOLD']);
    expect(g.input.loads[0].claims?.[0].flagLevel).toBe('hold');

    // The ENGINE, not the gathering layer, is what withholds it.
    const preview = previewFromGathered(run);
    const row = preview.rows.find(r => r.operatorId === OP_LOADS)!;
    expect(row.computed.withheldLoads.map(w => w.loadNumber)).toContain('ST-HOLD');
  });

  it('skips a load already carried on a stored settlement line', async () => {
    const t: any = baseTables();
    t.loads = [{
      id: 'load-1', load_number: 'ST-DONE', load_type: 'standard', operator_id: OP_LOADS,
      delivered_at: '2026-08-14T18:00:00Z', rate_type: 'flat', linehaul_rate: 1000,
      load_charges: [], load_documents: [], document_exceptions: [], claim_flags: [],
    }];
    t.settlement_line_items = [{ source_table: 'loads', source_id: 'load-1' }];
    const run = await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR);
    expect(run.operators.find(o => o.operatorId === OP_LOADS)).toBeUndefined();
  });
});

describe('a recurring deduction is due every period, a one-time deduction once', () => {
  const THIS_PERIOD = '2026-08-12'; // Wed of the week PERIOD_ANCHOR falls in
  const PRIOR_PERIOD = '2026-08-05';
  const recurring = (id: string) => ({ id, operator_id: OP_DEDUCTIONS_ONLY, label: 'R&M Deposit', amount: 200, is_active: true, is_recurring: true, start_payday: null, end_payday: null });
  const oneTime = (id: string) => ({ id, operator_id: OP_DEDUCTIONS_ONLY, label: 'Uniform', amount: 75, is_active: true, is_recurring: false, start_payday: null, end_payday: null });
  const dedOf = async (t: any) => {
    const run = await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR);
    return run.operators.find(o => o.operatorId === OP_DEDUCTIONS_ONLY)?.input.deductions ?? [];
  };

  it('charges a recurring deduction again after it settled in a PRIOR period', async () => {
    const t: any = baseTables();
    t.deductions = [recurring('d1')];
    t.settlement_line_items = [{ source_table: 'deductions', source_id: 'd1', settlements: { period_start: PRIOR_PERIOD } }];
    expect((await dedOf(t)).map((d: any) => d.id)).toEqual(['d1']);
  });

  it('does not charge a recurring deduction twice inside the SAME period', async () => {
    const t: any = baseTables();
    t.deductions = [recurring('d1')];
    t.settlement_line_items = [{ source_table: 'deductions', source_id: 'd1', settlements: { period_start: THIS_PERIOD } }];
    expect(await dedOf(t)).toEqual([]);
  });

  it('never charges a one-time deduction twice, however old the settlement', async () => {
    const t: any = baseTables();
    t.deductions = [oneTime('d2')];
    t.settlement_line_items = [{ source_table: 'deductions', source_id: 'd2', settlements: { period_start: PRIOR_PERIOD } }];
    expect(await dedOf(t)).toEqual([]);
  });

  it('keeps a driver whose only unsettled item is a recurring deduction in the population', async () => {
    const t: any = baseTables();
    t.deductions = [recurring('d1')];
    t.settlement_line_items = [{ source_table: 'deductions', source_id: 'd1', settlements: { period_start: PRIOR_PERIOD } }];
    const run = await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR);
    expect(previewFromGathered(run).rows.map(r => r.operatorId)).toContain(OP_DEDUCTIONS_ONLY);
  });
});



describe('the population rule', () => {
  it('includes a driver with only deductions and excludes a driver with nothing', async () => {
    const t: any = baseTables();
    t.deductions = [{ id: 'd1', operator_id: OP_DEDUCTIONS_ONLY, label: 'Insurance', amount: 75, is_active: true, start_payday: null, end_payday: null }];
    const run = await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR);
    const ids = previewFromGathered(run).rows.map(r => r.operatorId);
    expect(ids).toContain(OP_DEDUCTIONS_ONLY);
    expect(ids).not.toContain(OP_QUIET);
  });

  it('does not consult any active-operator predicate', () => {
    const src = readFileSync('src/lib/settlementRun.ts', 'utf8');
    for (const forbidden of ['is_active', 'excluded_from_dispatch', 'fully_onboarded', 'is_parked', 'lease_terminations', 'account_status']) {
      // `is_active` appears only on deductions, never on operators.
      const operatorScoped = new RegExp(`operators[^)]*${forbidden}`);
      expect(src).not.toMatch(operatorScoped);
    }
  });
});

describe('the whole result is stored, not the total', () => {
  it('carries every line item and every withheld reason into the payload', async () => {
    const t: any = baseTables();
    t.loads = [{
      id: 'load-1', load_number: 'ST-PAY', load_type: 'standard', operator_id: OP_LOADS,
      delivered_at: '2026-08-14T18:00:00Z', rate_type: 'flat', linehaul_rate: 1000,
      load_charges: [], load_documents: [{ document_type: 'pod' }, { document_type: 'bol' }],
      document_exceptions: [], claim_flags: [],
    }, {
      id: 'load-2', load_number: 'ST-HELD', load_type: 'standard', operator_id: OP_LOADS,
      delivered_at: '2026-08-15T18:00:00Z', rate_type: 'flat', linehaul_rate: 500,
      load_charges: [], load_documents: [], document_exceptions: [],
      claim_flags: [{ id: 'c1', flag_level: 'hold', is_active: true, resolved_at: null }],
    }];
    const rows = previewFromGathered(await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR)).rows;
    const payload = runPayload(rows) as any[];
    const p = payload.find(x => x.operator_id === OP_LOADS)!;
    expect(p.lines.length).toBe(rows.find(r => r.operatorId === OP_LOADS)!.computed.lines.length);
    expect(p.lines.every((l: any) => l.line_type && l.description)).toBe(true);
    expect(p.withheld.some((w: any) => w.reason_code === 'claim_hold')).toBe(true);
    expect(p.net_amount).toBe(rows.find(r => r.operatorId === OP_LOADS)!.computed.netAmount);
  });
});

describe('a settlement is a statement, not a live calculation', () => {
  const dir = 'src/components/operator/MySettlements';
  /** Comments are stripped: a doc line naming the engine is not a call to it. */
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => ({ f, src: stripComments(readFileSync(join(dir, f), 'utf8')) }));

  it('the driver view never calls the engine or the run', () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/settlementEngine/);
      expect(src, f).not.toMatch(/computeSettlement/);
      expect(src, f).not.toMatch(/settlementRun/);
      expect(src, f).not.toMatch(/settlementPopulation/);
    }
  });

  it('the driver view reads stored rows', () => {
    const all = sources.map(s => s.src).join('\n');
    expect(all).toMatch(/from\('settlements'\)/);
    expect(all).toMatch(/settlement_line_items/);
    expect(all).toMatch(/settlement_withheld_loads/);
  });

  it('a pay policy edit cannot reach a stored settlement', () => {
    const all = sources.map(s => s.src).join('\n');
    expect(all).not.toMatch(/pay_policies/);
    expect(all).not.toMatch(/linehaul_pct/);
  });
});

describe('the writer', () => {
  const sql = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join('supabase/migrations', f), 'utf8'))
    .filter(s => s.includes('store_settlement_run'))
    .join('\n');

  it('refuses an existing settlement rather than silently overwriting', () => {
    expect(sql).toMatch(/refused_existing/);
    expect(sql).toMatch(/p_mode = 'refuse'/);
  });

  it('refuses to recompute a PAID settlement even in replace mode', () => {
    expect(sql).toMatch(/status = 'paid'/);
    expect(sql).toMatch(/PAID and cannot be recomputed/);
  });

  it('records the actor through current_profile_id and is management-only', () => {
    expect(sql).toMatch(/public\.current_profile_id\(\)/);
    expect(sql).not.toMatch(/v_actor uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/Only management or owner may run a settlement/);
  });

  it('carries the four standing definer guarantees', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public', 'extensions'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.store_settlement_run[^\n]*FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.store_settlement_run[^\n]*FROM anon/);
  });
});

/**
 * A READ THAT FAILED IS NOT AN EMPTY RESULT.
 *
 * Each of these reads feeds a dollar figure, an exclusion set or a guard. The
 * previous shape turned a failed read into `[]`, `null` or `false`, which
 * quietly moved money — the equipment case RELEASED a hold that exists to stop
 * paying a driver who still holds company equipment.
 */
describe('a failed read aborts the run', () => {
  const failingClient = (tables: any, failTable: string, rpc?: () => Promise<any>) => {
    const err = { code: '42501', message: `permission denied for table ${failTable}` };
    const builder = (t: string, rows: any[]) => {
      const failed = t === failTable;
      const chain: any = {
        select: () => chain,
        eq: () => chain, not: () => chain, is: () => chain, gte: () => chain, lte: () => chain, lt: () => chain,
        order: () => chain,
        maybeSingle: async () => (failed ? { data: null, error: err } : { data: rows[0] ?? null, error: null }),
        then: (res: any, rej: any) =>
          Promise.resolve(failed ? { data: null, error: err } : { data: rows, error: null }).then(res, rej),
      };
      return chain;
    };
    return {
      from: (t: string) => builder(t, tables[t] ?? []),
      rpc: rpc ?? (async () => ({ data: false, error: null })),
    };
  };

  const withOneLoad = () => {
    const t: any = baseTables();
    t.loads = [{
      id: 'load-1', load_number: 'ST-1', load_type: 'standard', operator_id: OP_LOADS,
      delivered_at: '2026-08-14T18:00:00Z', rate_type: 'flat', linehaul_rate: 1000,
      load_charges: [], load_documents: [], document_exceptions: [], claim_flags: [],
    }];
    return t;
  };

  const cases: [string, string][] = [
    ['loads', 'loads'],
    ['settlement_line_items', 'settlement_line_items'],
    ['pay_policies', 'pay_policies'],
    ['pay_policy_assignments', 'pay_policy_assignments'],
    ['fuel_transactions', 'fuel_transactions'],
    ['deductions', 'deductions'],
    ['cash_advances', 'cash_advances'],
    ['rm_deposits', 'rm_deposits'],
    ['operators', 'operators'],
    ['accessorial_adjustments', 'accessorial_adjustments'],
    ['settlement_settings', 'settlement_settings'],
  ];

  for (const [label, table] of cases) {
    it(`throws, naming the read, when ${label} fails`, async () => {
      await expect(gatherSettlementRun(failingClient(withOneLoad(), table), PERIOD_ANCHOR))
        .rejects.toThrow(new RegExp(`${label}[\\s\\S]*FAILED|FAILED[\\s\\S]*${label}`));
    });
  }

  it('throws when the equipment_outstanding RPC returns an error', async () => {
    const sb = failingClient(withOneLoad(), '__none__',
      async () => ({ data: null, error: { code: '42501', message: 'permission denied for function equipment_outstanding' } }));
    await expect(gatherSettlementRun(sb, PERIOD_ANCHOR)).rejects.toThrow(/equipment_outstanding[\s\S]*FAILED/);
  });

  it('throws when the equipment_outstanding RPC throws', async () => {
    const sb = failingClient(withOneLoad(), '__none__', async () => { throw new Error('network down'); });
    await expect(gatherSettlementRun(sb, PERIOD_ANCHOR)).rejects.toThrow(/equipment_outstanding[\s\S]*FAILED/);
  });

  it('throws when the equipment_outstanding RPC returns null instead of a boolean', async () => {
    const sb = failingClient(withOneLoad(), '__none__', async () => ({ data: null, error: null }));
    await expect(gatherSettlementRun(sb, PERIOD_ANCHOR)).rejects.toThrow(/instead of a boolean/);
  });

  it('names the operator on an equipment failure, so the run can be traced', async () => {
    const sb = failingClient(withOneLoad(), '__none__', async () => ({ data: undefined, error: null }));
    await expect(gatherSettlementRun(sb, PERIOD_ANCHOR)).rejects.toThrow(new RegExp(OP_LOADS));
  });

  it('a genuinely empty week still gathers, with no operators and no throw', async () => {
    const run = await gatherSettlementRun(failingClient(baseTables(), '__none__'), PERIOD_ANCHOR);
    expect(run.operators).toEqual([]);
    expect(run.settings.equipment_value_per_driver).toBe(1200);
  });

  it('an equipment hold still applies when the RPC genuinely says true', async () => {
    const t = withOneLoad();
    t.operators = t.operators.map((o: any) => o.id === OP_LOADS ? { ...o, is_departing: true } : o);
    const sb = failingClient(t, '__none__', async () => ({ data: true, error: null }));
    const run = await gatherSettlementRun(sb, PERIOD_ANCHOR);
    const g = run.operators.find(o => o.operatorId === OP_LOADS)!;
    expect(g.input.equipmentOutstanding).toBe(true);
    expect(previewFromGathered(run).rows.find(r => r.operatorId === OP_LOADS)!.computed.status).toBe('held');
  });
});
