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
  'stamp_dispatch_settlement_actors',
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
      // B5 part two (2026-09-15) added company_id NOT NULL to every dispatch
      // settlement table. It is tenancy, not money: no amount column changed.
      'company_id:uuid:NO',
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
      'paid_by:uuid:YES',
      'payee_key:text:NO',
      'period_month:date:NO',
      'reduced_base:numeric:NO',
      'status:USER-DEFINED:NO',
      'updated_at:timestamp with time zone:NO',
      'updated_by:uuid:YES',
      'void_reason:text:YES',
      'voided_by:uuid:YES',
    ];
    expect(cols).toEqual(expected);
  });

  itLive('line items are signed amounts with explicit references, never free text', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dispatch_settlement_line_items' ORDER BY 1`);
    expect(cols).toEqual([
      // company_id: B5 part two (2026-09-15), tenancy only.
      'amount', 'company_id', 'created_at', 'created_by', 'deduction_id', 'description',
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
      // B5 part two (2026-09-15) re-scoped this key per company: the table
      // constraint dispatch_settlements_payee_period_key was replaced by the
      // unique index dispatch_settlements_company_payee_period_uniq, asserted
      // in its own test below. One payee, one month, PER COMPANY — unchanged
      // in meaning for a single carrier.
      'dispatch_settlement_line_items_line_type_check',
      'dispatch_settlement_line_items_one_off_load_check',
      'dispatch_settlement_line_items_load_base_load_check',
      'dispatch_settlement_contributions_load_uniq',
      'dispatch_deductions_window_check',
      'dispatch_settlement_rates_window_check',
    ]) expect(names).toContain(n);
  });

  // P34 (2026-09-21): scoped to LIVE rows, so kept voided settlements can sit
  // beside the month's one live settlement.
  itLive('one LIVE payee settlement per month, per company — the re-scoped unique key', () => {
    const def = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname='public'
      AND indexname='dispatch_settlements_company_payee_period_live_uniq'`).join(' ');
    expect(def).toContain('UNIQUE');
    expect(def).toContain('company_id, payee_key, period_month');
    expect(def).toMatch(/WHERE \(?status <> 'void'/);
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
    // PERMISSIVE only. Restrictive-batch 1 (2026-09-16) added the
    // `tenant_isolation` RESTRICTIVE policy to three of these tables; a
    // restrictive policy GRANTS nothing — it can only subtract rows — so it is
    // not a role-admission clause and must not be read as one here. The
    // restrictive shape is asserted in tenancy-resolver.test.ts.
    // 2026-09-21 PERMISSIONS FOUNDATION — one deliberate exception, named here so
    // it cannot be smuggled in: `dispatch_settlements_view_permission` is a
    // SELECT-only policy reading `has_permission('settlement.view')`. P2 gives the
    // dispatcher the READ of the dispatch company settlement; the CHANGE side is
    // untouched and still management|owner through the FOR ALL policy below. The
    // role literals are not in the predicate at all — the roles holding the grant
    // are rows in `role_permissions` — so the assertions below cannot be applied
    // to it. Its shape is asserted separately, immediately after.
    const PERMISSION_GATED = 'dispatch_settlements_view_permission';
    const policies = psql(`SELECT tablename || '|' || policyname || '|' || coalesce(qual,'') || coalesce(with_check,'')
      FROM pg_policies WHERE schemaname='public' AND tablename IN (${TABLE_LIST})
        AND permissive = 'PERMISSIVE' AND policyname <> '${PERMISSION_GATED}'`);
    expect(policies.length).toBeGreaterThanOrEqual(TABLES.length);
    for (const p of policies) {
      expect(p).toContain('management');
      expect(p).toContain('owner');
      expect(p).not.toContain("'operator'");
      expect(p).not.toContain("'dispatcher'");
    }

    const gated = psql(`SELECT cmd || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'NO-CHECK')
      FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_settlements'
        AND policyname = '${PERMISSION_GATED}'`);
    expect(gated).toHaveLength(1);
    const [cmd, using, check] = gated[0].split('|');
    expect(cmd).toBe('SELECT');
    expect(check).toBe('NO-CHECK');
    expect(using).toContain("has_permission('settlement.view'");
    expect(using).toMatch(/\(\s*SELECT/);
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
    // company_id: B5 part two (2026-09-15), tenancy only.
    expect(cols).toEqual(['changed_at', 'changed_by', 'company_id', 'field', 'id',
      'new_value', 'previous_value']);
  });
});

/**
 * Since B5 part two (2026-09-15) every dispatch settlement table carries
 * company_id NOT NULL, stamped by stamp_tenant_company_id(). That trigger
 * refuses any row whose company it cannot resolve, which is what these
 * fixtures used to hit: they were reaching a 42501 refusal BEFORE the CHECK or
 * UNIQUE they exist to prove.
 *
 * They now write the way a real service-role writer writes — the way the edge
 * functions do: the service_role claim, plus an EXPLICIT company_id read from
 * carrier_profile's single row. Chosen over borrowing a staff member's JWT
 * because these are schema tests: they should not fail the day one particular
 * person's company_members row changes. No money expectation is touched.
 */
const AS_SERVICE_ROLE = `SET LOCAL request.jwt.claims = '{"role":"service_role"}';`;

/**
 * SUPERTRANSPORT, named explicitly by its USDOT number.
 *
 * `(SELECT id FROM public.carrier_profile)` used to stand here. That is a bare
 * scalar subquery over the whole table: correct while one carrier exists, and
 * SQLSTATE 21000 ("more than one row returned by a subquery used as an
 * expression") the day a second carrier row is inserted — a failure that would
 * read as a dispatch settlement defect rather than as this fixture's fault.
 * `usdot_number` carries a globally unique index, so this stays a single row.
 */
const SUPERTRANSPORT_USDOT = '2309365';
const CO = `(SELECT id FROM public.carrier_profile WHERE usdot_number = '${SUPERTRANSPORT_USDOT}')`;

describe('dispatch settlement — the fixture carrier', () => {
  itLive(`carrier_profile holds exactly one row for USDOT ${SUPERTRANSPORT_USDOT}`, () => {
    const rows = psql(`SELECT id FROM public.carrier_profile WHERE usdot_number = '${SUPERTRANSPORT_USDOT}'`);
    // Said plainly, because every fixture below writes as this carrier: without
    // this row the inserts fail on a NOT NULL company_id and the message names
    // the column, not the missing carrier.
    expect(rows, `No carrier_profile row with usdot_number = ${SUPERTRANSPORT_USDOT}. `
      + 'The dispatch settlement fixtures write as SUPERTRANSPORT and cannot run without it.').toHaveLength(1);
  });
});

describe('dispatch settlement — behaviour the schema must refuse', () => {
  itLive('period_month must be the first of a month', () => {
    const err = psqlExpectError(`BEGIN; ${AS_SERVICE_ROLE} INSERT INTO public.dispatch_settlements
      (company_id, period_month, factoring_pct, dispatch_pct)
      VALUES (${CO}, '2026-03-15', 2, 5); ROLLBACK;`);
    expect(err).toContain('dispatch_settlements_period_month_first_check');
  });

  itLive('a second settlement for the same payee and month is refused', () => {
    const err = psqlExpectError(`BEGIN; ${AS_SERVICE_ROLE}
      INSERT INTO public.dispatch_settlements (company_id, period_month, factoring_pct, dispatch_pct)
        VALUES (${CO}, '2099-01-01', 2, 5);
      INSERT INTO public.dispatch_settlements (company_id, period_month, factoring_pct, dispatch_pct)
        VALUES (${CO}, '2099-01-01', 2, 5);
      ROLLBACK;`);
    // Re-scoped per company by B5 part two: the unique INDEX now raises.
    expect(err).toContain('dispatch_settlements_company_payee_period_live_uniq');
  });

  itLive('a payee other than the dispatch company is refused — this table has one vendor', () => {
    const err = psqlExpectError(`BEGIN; ${AS_SERVICE_ROLE} INSERT INTO public.dispatch_settlements
      (company_id, period_month, payee_key, factoring_pct, dispatch_pct)
      VALUES (${CO}, '2099-01-01', 'someone_else', 2, 5); ROLLBACK;`);
    expect(err).toContain('dispatch_settlements_payee_key_check');
  });

  itLive('a load_base line without a load is refused', () => {
    const err = psqlExpectError(`BEGIN; ${AS_SERVICE_ROLE}
      INSERT INTO public.dispatch_settlements (id, company_id, period_month, factoring_pct, dispatch_pct)
        VALUES ('00000000-0000-4000-8000-00000000d001', ${CO}, '2099-01-01', 2, 5);
      INSERT INTO public.dispatch_settlement_line_items
        (dispatch_settlement_id, company_id, line_type, amount, description)
        VALUES ('00000000-0000-4000-8000-00000000d001', ${CO}, 'load_base', 100, 'x');
      ROLLBACK;`);
    expect(err).toContain('dispatch_settlement_line_items_load_base_load_check');
  });

  itLive('an excluded charge with no reason is refused, and a reason with no exclusion too', () => {
    const err = psqlExpectError(`BEGIN; ${AS_SERVICE_ROLE}
      INSERT INTO public.dispatch_settlements (id, company_id, period_month, factoring_pct, dispatch_pct)
        VALUES ('00000000-0000-4000-8000-00000000d002', ${CO}, '2099-01-01', 2, 5);
      INSERT INTO public.dispatch_settlement_load_contributions
        (id, dispatch_settlement_id, company_id, load_id, load_number, load_type, rate_type)
        SELECT '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000d002',
               ${CO}, id, 'X', 'standard', 'flat' FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.dispatch_settlement_charge_verdicts
        (contribution_id, company_id, charge_type, classification, amount, excluded)
        VALUES ('00000000-0000-4000-8000-00000000d003', ${CO}, 'lumper', 'revenue', 100, true);
      ROLLBACK;`);
    expect(err).toContain('dispatch_charge_verdicts_reason_presence_check');
  });

  /**
   * The paid-immutability and void rules cannot be exercised from this harness:
   * the test role holds SELECT and INSERT only on every public table, so no
   * UPDATE or DELETE can be issued from here. They were verified privileged on
   * 2026-09-03 against scratch months 2099-02 through 2099-05, since purged,
   * and RE-VERIFIED on 2026-09-21 under P34 in a transaction that rolled back —
   * void without a reason refused; void with a reason kept every line item and
   * contribution, stamped `voided_at`; the month recomputed beside the voided
   * row; void of a `paid` row refused for the owner and for management alike.
   * What this file can prove is that the triggers carrying those rules are
   * attached, which is the part a later migration is most likely to drop.
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

  /**
   * P34 (owner, 2026-09-21) — voiding KEEPS the record. This test was the
   * mirror image before that decision: it asserted the trigger DELETED the
   * breakdown and zeroed the totals. Both halves are inverted deliberately,
   * because a migration that quietly restored the deletes would destroy the
   * history this decision exists to keep.
   */
  itLive('the void rule keeps and stamps the breakdown — in the trigger, not in a caller', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='apply_dispatch_settlement_void'`).join(' ');
    expect(src).not.toContain('DELETE FROM public.dispatch_settlement_line_items');
    expect(src).not.toContain('DELETE FROM public.dispatch_settlement_load_contributions');
    expect(src).toContain('UPDATE public.dispatch_settlement_line_items');
    expect(src).toContain('UPDATE public.dispatch_settlement_load_contributions');
    expect(src).toContain('voided_at = now()');

    const immut = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='enforce_dispatch_settlement_immutability'`).join(' ');
    // The totals are no longer zeroed: a voided settlement keeps its figures.
    for (const kept of ['eligible_base', 'factoring_reduction', 'reduced_base',
      'dispatch_fee', 'deductions_amount', 'net_amount']) {
      expect(immut, kept).not.toContain(`NEW.${kept} := 0`);
    }
    // P28 revised: the refusal is absolute and names no role.
    expect(immut).toContain('cannot be voided');
    expect(immut).not.toMatch(/has_role|has_permission/);
    expect(immut).toContain('requires a reason');
  });

  /**
   * P34 — one LIVE settlement per month, any number of voided ones beside it.
   * The uniqueness rule is the whole mechanism: without the partial predicate a
   * kept voided row would block the recompute it exists to allow.
   */
  itLive('uniqueness is scoped to LIVE settlements only', () => {
    const idx = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname='public'
      AND tablename='dispatch_settlements' AND indexname LIKE '%payee_period%'`).join(' ');
    expect(idx).toContain('UNIQUE');
    expect(idx).toContain('company_id');
    expect(idx).toContain('payee_key');
    expect(idx).toContain('period_month');
    expect(idx).toMatch(/WHERE \(?status <> 'void'/);
  });

  /** The writer must never take a voided row for the month's existing one. */
  itLive('the writer looks up the live settlement only', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='compute_dispatch_settlement'`).join(' ');
    expect(src).toMatch(/status <> 'void'/);
  });

  /** The kept rows carry their own mark, so a reader never has to infer it. */
  itLive('both child tables carry a voided_at stamp', () => {
    const cols = psql(`SELECT table_name || '.' || column_name
      FROM information_schema.columns WHERE table_schema='public'
        AND column_name='voided_at'
        AND table_name IN ('dispatch_settlement_line_items',
                           'dispatch_settlement_load_contributions') ORDER BY 1`);
    expect(cols).toEqual([
      'dispatch_settlement_line_items.voided_at',
      'dispatch_settlement_load_contributions.voided_at',
    ]);
  });

  /**
   * PASS 1 asserted that NO computation function existed. PASS 4 (2026-09-03)
   * added exactly one — `compute_dispatch_settlement` — and the assertion is
   * kept rather than deleted, now naming it. The point was never "nothing
   * exists"; it was "there is no SECOND writer". A month written by two paths
   * is how a stored statement stops matching the rules that produced it.
   */
  itLive('exactly one writer exists, and it is compute_dispatch_settlement', () => {
    const fns = psql(`SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND (proname LIKE '%dispatch_settlement%' OR proname LIKE 'store_dispatch%') ORDER BY 1`);
    expect(fns.sort()).toEqual([...FUNCTIONS, 'compute_dispatch_settlement'].sort());
  });

  /**
   * The writer's grant is DELIBERATELY different from the four trigger/void
   * functions above: those reach no client role at all, this one is called by
   * management from the browser and so must be executable by `authenticated`.
   * What keeps that safe is inside the body, not in the grant.
   */
  itLive('the writer is authenticated-executable, pinned, and never reaches anon', () => {
    const row = psql(`SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
        || '|' || coalesce(array_to_string(p.proacl, ' '), '')
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname = 'compute_dispatch_settlement'`).join('');
    const [secdef, config, acl] = row.split('|');
    expect(secdef).toBe('true');
    expect(config).toContain('search_path=public, extensions');
    expect(acl).toContain('authenticated=X');
    expect(acl).not.toContain('anon=X');
    expect(acl).not.toMatch(/(^|\s)=X/); // no PUBLIC grant
  });

  itLive('the writer refuses rather than produces — it gates, re-adds and re-tests', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='compute_dispatch_settlement'`).join(' ');
    // gate
    expect(src).toContain("has_role(auth.uid(), 'management'::app_role)");
    expect(src).toContain("has_role(auth.uid(), 'owner'::app_role)");
    // actor stamped server-side, never taken from the caller
    expect(src).toContain('public.current_profile_id()');
    // rates read here, not trusted
    expect(src).toContain('FROM public.dispatch_settlement_rates');
    expect(src).toContain('do not match the rates in force');
    // the arithmetic is re-added
    expect(src).toContain('do not equal its lines');
    // eligibility re-tested in BOTH directions
    expect(src).toContain('omits eligible load');
    expect(src).toContain('includes ineligible load');
    // a paid month is never recomputed
    expect(src).toContain('cannot be recomputed');
  });
});



/**
 * MODULE 4 (dispatch), Pass 5b — the actor gap on approve / paid / void.
 *
 * Before this pass `approved_by` existed but NOTHING wrote it: no trigger and
 * no writer referenced the column, so approval attribution was as absent as
 * payment and void attribution. All three are now stamped by one trigger.
 */
describe('dispatch settlement — who approved, paid and voided it', () => {
  itLive('paid_by and voided_by exist and point at profiles, nulling on delete', () => {
    const cols = psql(`SELECT column_name || '|' || data_type || '|' || is_nullable
      FROM information_schema.columns WHERE table_schema='public'
        AND table_name='dispatch_settlements'
        AND column_name IN ('approved_by','paid_by','voided_by') ORDER BY 1`);
    expect(cols).toEqual([
      'approved_by|uuid|YES', 'paid_by|uuid|YES', 'voided_by|uuid|YES',
    ]);
    const fks = psql(`SELECT a.attname || '->' || cf.relname || '|' || c.confdeltype::text
      FROM pg_constraint c
      JOIN pg_class cf ON cf.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.conrelid = 'public.dispatch_settlements'::regclass AND c.contype = 'f'
        AND a.attname IN ('approved_by','paid_by','voided_by') ORDER BY 1`);
    expect(fks).toEqual([
      'approved_by->profiles|n', 'paid_by->profiles|n', 'voided_by->profiles|n',
    ]);
  });

  itLive('the stamping trigger is attached before update', () => {
    const rows = psql(`SELECT t.tgname || '|' || t.tgtype::int
      FROM pg_trigger t WHERE NOT t.tgisinternal
        AND t.tgrelid = 'public.dispatch_settlements'::regclass
        AND t.tgname = 'stamp_dispatch_settlement_actors'`);
    expect(rows).toHaveLength(1);
    // 2 = BEFORE, 16 = UPDATE, 1 = ROW
    expect(Number(rows[0].split('|')[1]) & 2).toBe(2);
    expect(Number(rows[0].split('|')[1]) & 16).toBe(16);
  });

  itLive('every actor comes from current_profile_id, and a client value is discarded', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='stamp_dispatch_settlement_actors'`).join(' ');
    expect(src).toContain('public.current_profile_id()');
    expect(src).not.toContain('auth.uid()');
    // whatever the client sent is overwritten with the stored value first
    expect(src).toContain('NEW.approved_by := OLD.approved_by');
    expect(src).toContain('NEW.paid_by := OLD.paid_by');
    expect(src).toContain('NEW.voided_by := OLD.voided_by');
    // then only the transition earns the stamp
    expect(src).toContain("NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'");
    expect(src).toContain("NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid'");
    expect(src).toContain("NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void'");
  });

  itLive('the stamping function is definer, pinned, and reaches no client role', () => {
    const row = psql(`SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
        || '|' || coalesce(array_to_string(p.proacl, ' '), '')
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND p.proname='stamp_dispatch_settlement_actors'`).join('');
    const [secdef, config, acl] = row.split('|');
    expect(secdef).toBe('true');
    expect(config).toContain('search_path=public, extensions');
    expect(acl).not.toContain('authenticated=X');
    expect(acl).not.toContain('anon=X');
    expect(acl).not.toMatch(/(^|\s)=X/);
  });
});
