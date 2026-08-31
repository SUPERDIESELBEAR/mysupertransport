import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import { createPgFake, PROFILE_ID } from '@/test/helpers/pgFake';
import {
  departingSummary, episodeCount, isDeparting,
} from '@/lib/departing';
import {
  evaluateHold, isBelowThreshold, releasePathFor, rmDeductionDue,
  SETTLEMENT_SETTINGS_DEFAULTS, SETTLEMENT_SETTING_KEYS, SETTLEMENT_STATUS_LABELS,
} from '@/lib/settlementConfig';
import {
  hasUnsettledWork, IGNORED_ACTIVE_PREDICATES, selectSettlementPopulation,
  type UnsettledWork,
} from '@/lib/settlementPopulation';

/**
 * MODULE 4 PASS 1 — SETTLEMENT FOUNDATION.
 *
 * The departing flag is the legitimate control for the intent that produced
 * six lease_terminations rows in error. It must behave like parked (auditable
 * episodes, reversible, staff-only) and must never touch lease_terminations.
 *
 * The population rule is asserted here because it is the rule most likely to
 * be "helpfully" narrowed later by someone adding `is_active` to it.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('settlement live checks did not run', [
    'No PGHOST, so the settlement tables, configuration row and RPC hardening',
    'could not be read from the live catalog.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the settlement schema and its grants.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

const fake = createPgFake();
const holder = globalThis as unknown as { __pgFake: { client: unknown } };
holder.__pgFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__pgFake.client; },
}));
beforeEach(() => fake.reset());

/* ------------------------------------------------------------------ */
/* Part A — the departing flag                                         */
/* ------------------------------------------------------------------ */

describe('departing — set, clear, and the episode record', () => {
  it('set then clear records the actor and BOTH events; clearing erases nothing', async () => {
    const supabase = fake.client as any;

    await supabase.rpc('set_operator_departing', {
      _operator_id: 'op-1', _note: 'mentioned going back to company driving', _expected_date: '2026-09-30',
    });
    const op = fake.tables.operators[0];
    expect(op.is_departing).toBe(true);
    expect(op.departing_expected_date).toBe('2026-09-30');
    expect(op.departing_by).toBe(PROFILE_ID); // profile id, never auth.uid()

    await supabase.rpc('clear_operator_departing', { _operator_id: 'op-1', _note: null });
    expect(fake.tables.operators[0].is_departing).toBe(false);
    expect(fake.tables.operators[0].departing_at).toBeNull();

    const events = fake.tables.operator_departing_events;
    expect(events.map(e => e.action)).toEqual(['flagged', 'cleared']);
    expect(events.every(e => e.changed_by === PROFILE_ID)).toBe(true);
    // The episode survives the clear.
    expect(events[0].note).toBe('mentioned going back to company driving');
    expect(episodeCount(events as any)).toBe(1);
  });

  it('writes no lease_terminations row — it is not a termination', async () => {
    const supabase = fake.client as any;
    await supabase.rpc('set_operator_departing', { _operator_id: 'op-1', _note: null, _expected_date: null });
    expect(fake.tables.lease_terminations ?? []).toHaveLength(0);
  });

  it('keeps the driver active and dispatchable — it changes behaviour, not eligibility', async () => {
    const supabase = fake.client as any;
    await supabase.rpc('set_operator_departing', { _operator_id: 'op-1', _note: null, _expected_date: null });
    const op = fake.tables.operators[0];
    expect(op.is_active).toBe(true);
    expect(op.excluded_from_dispatch).toBe(false);
    expect(op.is_parked).toBe(false);
  });

  it('reads as a suspicion, with or without a date', () => {
    expect(isDeparting({ is_departing: true })).toBe(true);
    expect(isDeparting(null)).toBe(false);
    expect(departingSummary({ is_departing: true, departing_expected_date: null })).toBe('no expected date');
    expect(departingSummary({ is_departing: true, departing_expected_date: '2026-09-30' }))
      .toContain('expected Sep 30, 2026');
  });
});

describe('departing is invisible to the driver', () => {
  const OPERATOR_SURFACES = [
    'src/pages/operator',
    'src/components/operator',
    'src/hooks/useOperatorHome.ts',
    'src/lib/operatorHome.ts',
    'src/roadside',
  ];

  function walk(p: string): string[] {
    if (!fs.existsSync(p)) return [];
    const st = fs.statSync(p);
    if (st.isFile()) return [p];
    return fs.readdirSync(p).flatMap(f => walk(path.join(p, f)));
  }

  it('no operator-portal file reads any departing column, RPC or component', () => {
    const offenders: string[] = [];
    const forbidden = /(is_departing|departing_note|departing_expected_date|departing_at|departing_by|operator_departing_events|set_operator_departing|clear_operator_departing|DepartingBadge|DepartingControl)/;
    for (const surface of OPERATOR_SURFACES) {
      for (const file of walk(surface)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        if (forbidden.test(text)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the word "departing" never reaches a driver-facing string', () => {
    const offenders: string[] = [];
    for (const surface of OPERATOR_SURFACES) {
      for (const file of walk(surface)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        if (/\bdeparting\b/i.test(fs.readFileSync(file, 'utf8'))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Part D — the population rule                                        */
/* ------------------------------------------------------------------ */

const emptyWork = (operatorId: string): UnsettledWork => ({
  operatorId,
  deliveredLoadCount: 0,
  undeductedFuelCount: 0,
  outstandingAdvanceBalance: 0,
  negativeCarryForward: 0,
  rmDeductionDue: 0,
  otherDeductionsDue: 0,
});

describe('the population rule', () => {
  it('includes a driver with ONLY deductions and no revenue — the debt is real', () => {
    const work = { ...emptyWork('op-debt'), otherDeductionsDue: 250 };
    expect(hasUnsettledWork(work)).toBe(true);
    expect(selectSettlementPopulation([work])).toEqual(['op-debt']);
  });

  it('includes each trigger on its own', () => {
    expect(hasUnsettledWork({ ...emptyWork('a'), deliveredLoadCount: 1 })).toBe(true);
    expect(hasUnsettledWork({ ...emptyWork('a'), undeductedFuelCount: 1 })).toBe(true);
    expect(hasUnsettledWork({ ...emptyWork('a'), outstandingAdvanceBalance: 1 })).toBe(true);
    expect(hasUnsettledWork({ ...emptyWork('a'), negativeCarryForward: 1 })).toBe(true);
    expect(hasUnsettledWork({ ...emptyWork('a'), rmDeductionDue: 200 })).toBe(true);
    expect(hasUnsettledWork(emptyWork('a'))).toBe(false);
  });

  it('has nowhere to pass an eligibility flag in — is_active, parked, departing and the rest', () => {
    const src = fs.readFileSync('src/lib/settlementPopulation.ts', 'utf8');
    // The names appear only in the documented "ignored" list, never in a predicate.
    const body = src.slice(src.indexOf('export function hasUnsettledWork'));
    for (const flag of IGNORED_ACTIVE_PREDICATES) {
      expect(body).not.toContain(flag);
    }
    const withFlags = { ...emptyWork('op-x'), deliveredLoadCount: 1 } as UnsettledWork & Record<string, unknown>;
    withFlags.is_active = false;
    withFlags.is_parked = true;
    withFlags.is_departing = true;
    withFlags.excluded_from_dispatch = true;
    // A departed driver still settles; a parked driver still settles.
    expect(selectSettlementPopulation([withFlags])).toEqual(['op-x']);
  });
});

/* ------------------------------------------------------------------ */
/* Parts C and E — configuration and the three non-payment states      */
/* ------------------------------------------------------------------ */

describe('configuration', () => {
  it('carries all six values, and they are fallbacks not rules', () => {
    expect([...SETTLEMENT_SETTING_KEYS].sort()).toEqual([
      'equipment_value_per_driver', 'hold_buffer', 'minimum_net_pay_threshold',
      'rm_deposit_target', 'rm_weekly_deduction', 'work_week_start_dow',
    ]);
    expect(SETTLEMENT_SETTINGS_DEFAULTS).toEqual({
      minimum_net_pay_threshold: 100,
      hold_buffer: 500,
      equipment_value_per_driver: 1200,
      rm_deposit_target: 2000,
      rm_weekly_deduction: 200,
      work_week_start_dow: 3,
    });
  });

  it('is read from the row, so editing the row changes the answer', async () => {
    const supabase = fake.client as any;
    await supabase.from('settlement_settings').update({ hold_buffer: 900 }).eq('singleton', true);
    const { data } = await supabase.from('settlement_settings').select('*');
    const settings = { ...SETTLEMENT_SETTINGS_DEFAULTS, hold_buffer: Number(data[0].hold_buffer) };
    expect(settings.hold_buffer).toBe(900);
    // Same driver, same numbers, different answer — because the row changed.
    const input = {
      isDeparting: true, netAmount: 400, rmDepositBalance: 200,
      equipmentOutstanding: false,
    };
    expect(evaluateHold({ ...input, settings: SETTLEMENT_SETTINGS_DEFAULTS }).held).toBe(false);
    expect(evaluateHold({ ...input, settings }).held).toBe(true);
  });

  it('no settlement number is hardcoded outside the config module', () => {
    const files = ['src/lib/settlementPopulation.ts', 'src/pages/management/SettlementSettingsPage.tsx'];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text).not.toMatch(/\b(2000|1200|500)\b\s*[;,)]/);
    }
  });
});

describe('the hold formula: net + R&M − equipment < buffer', () => {
  const settings = { hold_buffer: 500, equipment_value_per_driver: 1200 };

  it('only a departing driver can be held', () => {
    expect(evaluateHold({
      isDeparting: false, netAmount: 0, rmDepositBalance: 0,
      equipmentOutstanding: true, settings,
    }).held).toBe(false);
  });

  it('R&M offsets the exposure — it is the driver\u2019s money and it covers you', () => {
    // net 400, no deposit, equipment out: 400 − 1200 = −800 < 500 → held.
    expect(evaluateHold({
      isDeparting: true, netAmount: 400, rmDepositBalance: 0,
      equipmentOutstanding: true, settings,
    })).toMatchObject({ held: true, coverage: -800, exposure: 1200 });

    // Same week, deposit at target: 400 + 2000 − 1200 = 1200 ≥ 500 → not held.
    expect(evaluateHold({
      isDeparting: true, netAmount: 400, rmDepositBalance: 2000,
      equipmentOutstanding: true, settings,
    })).toMatchObject({ held: false, coverage: 1200 });
  });

  it('equipment counts only while it is out', () => {
    const returned = evaluateHold({
      isDeparting: true, netAmount: 400, rmDepositBalance: 0,
      equipmentOutstanding: false, settings,
    });
    expect(returned.exposure).toBe(0);
    expect(returned.held).toBe(true); // 400 < 500, still short of the buffer
  });

  it('held means computed and visible — the number exists and only payment waits', () => {
    const d = evaluateHold({
      isDeparting: true, netAmount: 1400, rmDepositBalance: 0,
      equipmentOutstanding: true, settings,
    });
    expect(d.held).toBe(true);
    expect(d.coverage).toBe(200);
    expect(d.reason).toMatch(/return of company equipment/i);
  });
});

describe('below_threshold and held are distinct, with distinct release paths', () => {
  it('below threshold is about size, not about departing', () => {
    expect(isBelowThreshold(80, { minimum_net_pay_threshold: 100 })).toBe(true);
    expect(isBelowThreshold(80, { minimum_net_pay_threshold: 100 }, true)).toBe(false);
    expect(isBelowThreshold(120, { minimum_net_pay_threshold: 100 })).toBe(false);
  });

  it('each state has its own named release path', () => {
    expect(releasePathFor('below_threshold')).toBe('authorize_below_threshold_payment');
    expect(releasePathFor('held')).toBe('release_settlement_hold');
    expect(releasePathFor('paid')).toBeNull();
  });

  it('uses the established vocabulary', () => {
    expect(SETTLEMENT_STATUS_LABELS.paid).toBe('PAID');
    expect(SETTLEMENT_STATUS_LABELS.processing).toBe('PROCESSING');
    expect(SETTLEMENT_STATUS_LABELS.upcoming).toBe('UPCOMING');
  });
});

describe('Repair & Maintenance Deposit', () => {
  const settings = { rm_deposit_target: 2000, rm_weekly_deduction: 200 };

  it('auto-stops at target and auto-resumes after a withdrawal', () => {
    expect(rmDeductionDue({ current_balance: 2000 }, settings)).toBe(0);
    expect(rmDeductionDue({ current_balance: 1400 }, settings)).toBe(200);
    // Never overshoot the target on the last week.
    expect(rmDeductionDue({ current_balance: 1950 }, settings)).toBe(50);
    // A withdrawal drops the balance; the deduction resumes on its own.
    expect(rmDeductionDue({ current_balance: 900 }, settings)).toBe(200);
  });
});

describe('forbidden vocabulary', () => {
  it('no source or migration string says "escrow" or "holdback"', () => {
    const roots = ['src', 'supabase/migrations'];
    // The ICA legal text says the deposit is NOT an escrow account. That
    // sentence is the contract's and stays.
    const allowed = new Set(['src/components/ica/ICADocumentView.tsx']);
    const offenders: string[] = [];
    const walk = (p: string): string[] => {
      const st = fs.statSync(p);
      if (st.isFile()) return [p];
      return fs.readdirSync(p).flatMap(f => walk(path.join(p, f)));
    };
    for (const root of roots) {
      for (const file of walk(root)) {
        if (!/\.(ts|tsx|sql)$/.test(file)) continue;
        if (allowed.has(file)) continue;
        if (file.endsWith('settlement-foundation.test.ts')) continue;
        if (/escrow|holdback/i.test(fs.readFileSync(file, 'utf8'))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Live schema                                                         */
/* ------------------------------------------------------------------ */

describe('settlement foundation — live schema', () => {
  itLive('every Pass 1 table exists', () => {
    const names = psql(`
      select table_name from information_schema.tables
      where table_schema='public' and table_name in (
        'settlements','settlement_line_items','deductions','deduction_installments',
        'rm_deposits','rm_deposit_transactions','cash_advances',
        'settlement_settings','settlement_settings_history','operator_departing_events')
      order by 1`);
    expect(names).toEqual([
      'cash_advances', 'deduction_installments', 'deductions', 'operator_departing_events',
      'rm_deposit_transactions', 'rm_deposits', 'settlement_line_items', 'settlement_settings',
      'settlement_settings_history', 'settlements',
    ]);
  });

  itLive('the status enum carries exactly the five states', () => {
    const labels = psql(`
      select e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'settlement_status' order by e.enumsortorder`);
    expect(labels).toEqual(['upcoming', 'processing', 'paid', 'held', 'below_threshold']);
  });

  itLive('the configuration row exists with the six documented defaults', () => {
    const row = psql(`
      select minimum_net_pay_threshold||'|'||hold_buffer||'|'||equipment_value_per_driver||'|'||
             rm_deposit_target||'|'||rm_weekly_deduction||'|'||work_week_start_dow
      from public.settlement_settings`);
    expect(row).toEqual(['100.00|500.00|1200.00|2000.00|200.00|3']);
  });

  itLive('departing columns live on operators and no live row is both departing and inactive', () => {
    const cols = psql(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='operators'
        and column_name like 'departing%' or (table_name='operators' and column_name='is_departing')
      order by column_name`);
    expect(cols.sort()).toEqual(['departing_at', 'departing_by', 'departing_expected_date', 'departing_note', 'is_departing']);
    expect(psql(`select count(*) from public.operators where is_departing = true and is_active = false`)[0]).toBe('0');
  });

  itLive('the new definer functions are hardened', () => {
    const rows = psql(`
      select p.proname || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig,','),'') ||
             '|' || coalesce(array_to_string(p.proacl,','),'')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in (
        'set_operator_departing','clear_operator_departing',
        'authorize_below_threshold_payment','release_settlement_hold',
        'record_settlement_settings_change')
      order by p.proname`);
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row).toContain('|true|');
      expect(row).toContain('search_path=public, extensions');
      expect(row).not.toMatch(/(^|,)=X\//);
      expect(row).not.toContain('anon=X/');
    }
    // A trigger function needs no runtime grant at all.
    const trigger = rows.find(r => r.startsWith('record_settlement_settings_change'));
    expect(trigger).not.toContain('authenticated=X/');
  });

  itLive('settlement data is closed to operators — every policy is management or owner', () => {
    const open = psql(`
      select tablename || '.' || policyname
      from pg_policies
      where schemaname='public'
        and tablename in ('settlements','settlement_line_items','deductions','deduction_installments',
                          'rm_deposits','rm_deposit_transactions','cash_advances')
        and coalesce(qual,'') !~ 'management'
      order by 1`);
    expect(open).toEqual([]);
  });

  itLive('every new table is reachable through the Data API', () => {
    const missing = psql(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r'
        and c.relname in ('settlements','settlement_line_items','deductions','deduction_installments',
                          'rm_deposits','rm_deposit_transactions','cash_advances',
                          'settlement_settings','settlement_settings_history','operator_departing_events')
        and not has_table_privilege('authenticated', c.oid, 'SELECT')
      order by 1`);
    expect(missing).toEqual([]);
  });
});
