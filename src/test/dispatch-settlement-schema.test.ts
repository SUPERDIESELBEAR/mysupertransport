import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * MODULE 4 — DISPATCH COMPANY SETTLEMENT, PASS 1: SCHEMA ONLY.
 *
 * This file asserts the SHAPE, not the arithmetic: no computation function,
 * no line-item writer and no UI exist yet. Everything here is read from the
 * live catalog, because a migration file records an intention and the catalog
 * records the outcome — the two have diverged before.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('dispatch settlement schema checks did not run', [
    'No PGHOST, so the dispatch settlement tables, constraints, RLS, grants',
    'and immutability behaviour could not be read from the live catalog.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the dispatch settlement schema.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

/** Runs SQL expected to FAIL; returns the error text. */
function psqlExpectError(sql: string): string {
  try {
    execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    return `${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
  throw new Error('expected the statement to be refused, but it succeeded');
}

const TABLES = [
  'dispatch_settlements',
  'dispatch_settlement_line_items',
  'dispatch_settlement_load_contributions',
  'dispatch_settlement_charge_verdicts',
  'dispatch_deductions',
  'dispatch_settlement_rates',
  'dispatch_settlement_rates_history',
];

const TABLE_LIST = TABLES.map(t => `'${t}'`).join(', ');


const FUNCTIONS = [
  'dispatch_settlement_writer_active',
  'enforce_dispatch_settlement_immutability',
  'enforce_dispatch_settlement_child_immutability',
  'apply_dispatch_settlement_void',
];

describe('dispatch settlement — the enum is its own', () => {
  itLive('has exactly draft, approved, paid, void — settlement_status is NOT reused', () => {
    const members = psql(`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'dispatch_settlement_status' ORDER BY e.enumsortorder`);
    expect(members).toEqual(['draft', 'approved', 'paid', 'void']);
  });
});

describe('dispatch settlement — tables and columns', () => {
  itLive('every table exists', () => {
    const found = psql(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename LIKE 'dispatch\\_%' ORDER BY 1`);
    for (const t of TABLES) expect(found).toContain(t);
  });

  itLive('dispatch_settlements carries the money columns, the rates as applied, and attribution', () => {
    const cols = psql(`SELECT column_name || ':' || data_type || ':' || is_nullable
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name='dispatch_settlements' ORDER BY 1`);
    const expected = [
      'approved_at:timestamp with time zone:YES',
      'approved_by:uuid:YES',
      'computed_at:timestamp with time zone:YES',
      'created_at:timestamp with time zone:NO',
      'created_by:uuid:YES',
      'deductions_amount:numeric:NO',
      'dispatch_fee:numeric:NO',
      'dispatch_pct:numeric:NO',
      'eligible_base:numeric:NO',
      'factoring_pct:numeric:NO',
      'factoring_reduction:numeric:NO',
      'id:uuid:NO',
      'net_amount:numeric:NO',
      'notes:text:YES',
      'paid_at:timestamp with time zone:YES',
      'payee_key:text:NO',
      'period_month:date:NO',
      'reduced_base:numeric:NO',
      'status:USER-DEFINED:NO',
      'updated_at:timestamp with time zone:NO',
      'updated_by:uuid:YES',
      'void_reason:text:YES',
    ];
    expect(cols).toEqual(expected);
  });

  itLive('line items are signed amounts with explicit references, never free text', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dispatch_settlement_line_items' ORDER BY 1`);
    expect(cols).toEqual([
      'amount', 'created_at', 'created_by', 'deduction_id', 'description',
      'dispatch_settlement_id', 'dispatcher_id', 'id', 'line_type', 'load_id',
    ]);
  });

  itLive('the exclusion reason is a constrained column, not text to be parsed', () => {
    const check = psql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname = 'dispatch_charge_verdicts_reason_check'`).join(' ');
    expect(check).toContain('pct_100');
    expect(check).toContain('reimbursement_class');
    const presence = psql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname = 'dispatch_charge_verdicts_reason_presence_check'`).join(' ');
    expect(presence).toContain('exclusion_reason IS NOT NULL');
  });

  itLive('the frozen-attribution decision is recorded on the column itself', () => {
    const comment = psql(`SELECT col_description('public.dispatch_settlement_line_items'::regclass,
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.dispatch_settlement_line_items'::regclass
        AND attname='dispatcher_id'))`).join(' ');
    expect(comment).toContain('FROZEN ATTRIBUTION');
    expect(comment).toContain('set_load_dispatcher');
  });
});

describe('dispatch settlement — constraints', () => {
  itLive('every named CHECK and UNIQUE is present', () => {
    const names = psql(`SELECT conname FROM pg_constraint
      WHERE connamespace='public'::regnamespace AND conname LIKE 'dispatch\\_%' ORDER BY 1`);
    for (const n of [
      'dispatch_settlements_period_month_first_check',
      'dispatch_settlements_payee_key_check',
      'dispatch_settlements_void_reason_check',
      'dispatch_settlements_payee_period_key',
      'dispatch_settlement_line_items_line_type_check',
      'dispatch_settlement_line_items_one_off_load_check',
      'dispatch_settlement_line_items_load_base_load_check',
      'dispatch_settlement_contributions_load_uniq',
      'dispatch_deductions_window_check',
      'dispatch_settlement_rates_window_check',
    ]) expect(names).toContain(n);
  });

  itLive('one load_base line per load per settlement — a partial unique index', () => {
    const def = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname='public'
      AND indexname='dispatch_settlement_line_items_load_base_uniq'`).join(' ');
    expect(def).toContain('UNIQUE');
    expect(def).toContain('dispatch_settlement_id, load_id');
    expect(def).toContain("line_type = 'load_base'");
  });

  itLive('a settled load cannot be deleted — ON DELETE RESTRICT, deliberately', () => {
    const def = psql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname='dispatch_settlement_line_items_load_id_fkey'`).join(' ');
    expect(def).toContain('ON DELETE RESTRICT');
    const comment = psql(`SELECT obj_description(oid, 'pg_constraint') FROM pg_constraint
      WHERE conname='dispatch_settlement_line_items_load_id_fkey'`).join(' ');
    expect(comment).toContain('VOIDING');
  });
});

describe('dispatch settlement — security', () => {
  itLive('RLS is enabled on every table', () => {
    const off = psql(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'dispatch\\_%' AND c.relkind='r'
      AND c.relrowsecurity = false`);
    expect(off).toEqual([]);
  });

  itLive('management and owner only — no operator or dispatcher reads the dispatch company settlement', () => {
    const policies = psql(`SELECT tablename || '|' || policyname || '|' || coalesce(qual,'') || coalesce(with_check,'')
      FROM pg_policies WHERE schemaname='public' AND tablename IN (${TABLE_LIST})`);
    expect(policies.length).toBeGreaterThanOrEqual(TABLES.length);
    for (const p of policies) {
      expect(p).toContain('management');
      expect(p).toContain('owner');
      expect(p).not.toContain("'operator'");
      expect(p).not.toContain("'dispatcher'");
    }
  });

  itLive('grants reach authenticated and service_role, never anon', () => {
    // relacl, not information_schema: the views hide grants the current role is
    // not party to, and this harness role is party to almost none of them.
    const grants = psql(`SELECT c.relname || '|' || a.grantee::regrole::text || '|' || a.privilege_type
      FROM pg_class c JOIN LATERAL aclexplode(c.relacl) a ON true
      WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${TABLE_LIST})
        AND a.grantee::regrole::text IN ('anon','authenticated','service_role')`);
    expect(grants.filter(g => g.includes('|anon|'))).toEqual([]);
    for (const t of TABLES) {
      expect(grants.some(g => g.startsWith(`${t}|authenticated|`)), `${t} authenticated`).toBe(true);
      expect(grants.some(g => g.startsWith(`${t}|service_role|`)), `${t} service_role`).toBe(true);
    }
  });

  itLive('all four DEFINER protections on every function created by this pass', () => {
    // The ACL is the proof, not the REVOKE statement: the platform re-grants
    // EXECUTE to anon and authenticated after a migration applies.
    const rows = psql(`SELECT p.proname || '|' || p.prosecdef::text || '|'
        || coalesce(array_to_string(p.proconfig, ' '), '') || '|'
        || coalesce((SELECT string_agg(DISTINCT a.grantee::regrole::text, ',')
                     FROM aclexplode(p.proacl) a), 'PUBLIC')
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND p.proname IN (${FUNCTIONS.map(f => `'${f}'`).join(', ')}) ORDER BY 1`);
    expect(rows.map(r => r.split('|')[0])).toEqual([...FUNCTIONS].sort());
    for (const row of rows) {
      const [fn, secdef, config, grantees] = row.split('|');
      expect(secdef, `${fn} SECURITY DEFINER`).toBe('true');
      expect(config, `${fn} search_path`).toContain('search_path=public, extensions');
      expect(grantees, `${fn} must not be PUBLIC-executable`).not.toBe('PUBLIC');
      expect(grantees, `${fn} anon`).not.toContain('anon');
      expect(grantees, `${fn} authenticated`).not.toContain('authenticated');
      expect(grantees, `${fn} service_role`).toContain('service_role');
    }
  });


  itLive('the dispatch write gate is its own — it cannot be unlocked by the driver-side guard', () => {
    const body = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='dispatch_settlement_writer_active'`).join(' ');
    expect(body).toContain('app.dispatch_settlement_write');
    // The driver-side guard reads a different setting; neither key can open the
    // other gate.
    expect(body).not.toContain('app.settlement_write"');
    for (const fn of ['enforce_dispatch_settlement_immutability',
      'enforce_dispatch_settlement_child_immutability']) {
      const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
        AND proname='${fn}'`).join(' ');
      expect(src).toContain('public.dispatch_settlement_writer_active()');
      expect(src).not.toContain('public.settlement_writer_active()');
    }
  });
});


describe('dispatch settlement — the rates are versioned and seeded, never hardcoded', () => {
  itLive('exactly one open rate row: 5% dispatch, 2% factoring, from 2026-01-01', () => {
    const rows = psql(`SELECT dispatch_pct || '|' || factoring_pct || '|' || effective_from || '|' || coalesce(effective_to::text,'open')
      FROM public.dispatch_settlement_rates ORDER BY effective_from`);
    expect(rows).toEqual(['5.00|2.00|2026-01-01|open']);
  });

  itLive('the history table mirrors settlement_settings_history', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public'
      AND table_name='dispatch_settlement_rates_history' ORDER BY 1`);
    expect(cols).toEqual(['changed_at', 'changed_by', 'field', 'id', 'new_value', 'previous_value']);
  });
});

describe('dispatch settlement — behaviour the schema must refuse', () => {
  itLive('period_month must be the first of a month', () => {
    const err = psqlExpectError(`BEGIN; INSERT INTO public.dispatch_settlements
      (period_month, factoring_pct, dispatch_pct) VALUES ('2026-03-15', 2, 5); ROLLBACK;`);
    expect(err).toContain('dispatch_settlements_period_month_first_check');
  });

  itLive('a second settlement for the same payee and month is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.dispatch_settlements (period_month, factoring_pct, dispatch_pct)
        VALUES ('2099-01-01', 2, 5);
      INSERT INTO public.dispatch_settlements (period_month, factoring_pct, dispatch_pct)
        VALUES ('2099-01-01', 2, 5);
      ROLLBACK;`);
    expect(err).toContain('dispatch_settlements_payee_period_key');
  });

  itLive('a payee other than the dispatch company is refused — this table has one vendor', () => {
    const err = psqlExpectError(`BEGIN; INSERT INTO public.dispatch_settlements
      (period_month, payee_key, factoring_pct, dispatch_pct)
      VALUES ('2099-01-01', 'someone_else', 2, 5); ROLLBACK;`);
    expect(err).toContain('dispatch_settlements_payee_key_check');
  });

  itLive('a load_base line without a load is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.dispatch_settlements (id, period_month, factoring_pct, dispatch_pct)
        VALUES ('00000000-0000-4000-8000-00000000d001', '2099-01-01', 2, 5);
      INSERT INTO public.dispatch_settlement_line_items
        (dispatch_settlement_id, line_type, amount, description)
        VALUES ('00000000-0000-4000-8000-00000000d001', 'load_base', 100, 'x');
      ROLLBACK;`);
    expect(err).toContain('dispatch_settlement_line_items_load_base_load_check');
  });

  itLive('an excluded charge with no reason is refused, and a reason with no exclusion too', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.dispatch_settlements (id, period_month, factoring_pct, dispatch_pct)
        VALUES ('00000000-0000-4000-8000-00000000d002', '2099-01-01', 2, 5);
      INSERT INTO public.dispatch_settlement_load_contributions
        (id, dispatch_settlement_id, load_id, load_number, load_type, rate_type)
        SELECT '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000d002',
               id, 'X', 'standard', 'flat' FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.dispatch_settlement_charge_verdicts
        (contribution_id, charge_type, classification, amount, excluded)
        VALUES ('00000000-0000-4000-8000-00000000d003', 'lumper', 'revenue', 100, true);
      ROLLBACK;`);
    expect(err).toContain('dispatch_charge_verdicts_reason_presence_check');
  });

  /**
   * The paid-immutability and void rules cannot be exercised from this harness:
   * the test role holds SELECT and INSERT only on every public table, so no
   * UPDATE or DELETE can be issued from here. They were verified privileged on
   * 2026-09-03 against scratch months 2099-02 through 2099-05, since purged —
   * void without a reason, update/delete/child-change/void of a `paid` row all
   * refused; void with a reason cleared the lines and zeroed the totals; a
   * settled load refused deletion and was released by the void. What this file
   * can prove is that the triggers carrying those rules are attached, which is
   * the part a later migration is most likely to drop.
   */
  itLive('the immutability triggers are attached to every table that carries the rules', () => {
    const triggers = psql(`SELECT c.relname || '|' || t.tgname
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
        AND c.relname IN (${TABLE_LIST}) ORDER BY 1`);
    expect(triggers).toContain('dispatch_settlements|enforce_dispatch_settlement_immutability');
    expect(triggers).toContain('dispatch_settlements|apply_dispatch_settlement_void');
    expect(triggers).toContain('dispatch_settlement_line_items|enforce_dispatch_settlement_line_immutability');
    expect(triggers).toContain(
      'dispatch_settlement_load_contributions|enforce_dispatch_settlement_contribution_immutability');
  });

  itLive('the void rule erases the breakdown and zeroes the totals — in the trigger, not in a caller', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='apply_dispatch_settlement_void'`).join(' ');
    expect(src).toContain('DELETE FROM public.dispatch_settlement_line_items');
    expect(src).toContain('DELETE FROM public.dispatch_settlement_load_contributions');
    const immut = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='enforce_dispatch_settlement_immutability'`).join(' ');
    for (const zeroed of ['eligible_base', 'factoring_reduction', 'reduced_base',
      'dispatch_fee', 'deductions_amount', 'net_amount']) {
      expect(immut, zeroed).toContain(`NEW.${zeroed} := 0`);
    }
    expect(immut).toContain('cannot be voided');
  });

  itLive('no computation function, no line-item writer and no UI exist yet', () => {
    const fns = psql(`SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND (proname LIKE '%dispatch_settlement%' OR proname LIKE 'store_dispatch%') ORDER BY 1`);
    expect(fns.sort()).toEqual([...FUNCTIONS].sort());
  });
});

