import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * MODULE 7 — BILLING & INVOICING, PASS 1: SCHEMA ONLY.
 *
 * There is no invoice builder, no writer RPC, no payment posting logic and no
 * screen. This file asserts the SHAPE and the refusals, all read from the live
 * catalog rather than from the migration file, because a migration records an
 * intention and the catalog records the outcome — the two have diverged before.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('billing schema checks did not run', [
    'No PGHOST, so the Module 7 tables, constraints, RLS, grants, tenancy',
    'column and immutability behaviour could not be read from the live catalog.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the Module 7 billing schema.'],
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
  'ar_aging_snapshots',
  'invoice_batches',
  'invoice_line_items',
  'invoices',
  'payments',
];
const TABLE_LIST = TABLES.map(t => `'${t}'`).join(', ');

/**
 * Every new Module 7 SECURITY DEFINER function EXCEPT current_company_id().
 * None of these reaches a client role: they are triggers and a gate.
 */
const SERVICE_ONLY_FUNCTIONS = [
  'enforce_ar_aging_snapshot_append_only',
  'enforce_invoice_immutability',
  'enforce_invoice_line_immutability',
  'invoice_writer_active',
  'stamp_billing_company_id',
  'stamp_invoice_actors',
];

/** prosrc as written, with the alignment padding collapsed. */
function bodyOf(name: string): string {
  return psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname='${name}'`).join(' ').replace(/\s+/g, ' ');
}

/** A scratch invoice number no real invoice will collide with. */
const SCRATCH = '00000000-0000-4000-8000-0000000b7000';

// ---------------------------------------------------------------------------

describe('billing — the enums are their own', () => {
  itLive('invoice_status is its own type and is NOT settlement_status reused', () => {
    const members = psql(`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'invoice_status' ORDER BY e.enumsortorder`);
    expect(members).toEqual(['open', 'partial', 'paid', 'short_paid', 'written_off']);
  });

  itLive('invoice_billing_path names the two paths a broker can be billed by', () => {
    const members = psql(`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'invoice_billing_path' ORDER BY e.enumsortorder`);
    expect(members).toEqual(['factored', 'direct']);
  });
});

describe('billing — tables and columns', () => {
  itLive('every table exists', () => {
    const found = psql(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename IN (${TABLE_LIST}) ORDER BY 1`);
    expect(found).toEqual(TABLES);
  });

  itLive('invoices carries the load, the broker snapshot, the money and four attributed moments', () => {
    const cols = psql(`SELECT column_name || ':' || data_type || ':' || is_nullable
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name='invoices' ORDER BY 1`);
    expect(cols).toEqual([
      'amount:numeric:NO',
      'batch_id:uuid:YES',
      'billing_path:USER-DEFINED:NO',
      'broker_billing_email_snapshot:text:YES',
      'broker_id:uuid:YES',
      'broker_name_snapshot:text:YES',
      'company_id:uuid:NO',
      'created_at:timestamp with time zone:NO',
      'created_by:uuid:YES',
      'id:uuid:NO',
      'invoice_number:text:NO',
      'load_id:uuid:NO',
      'notes:text:YES',
      'paid_at:timestamp with time zone:YES',
      'paid_by:uuid:YES',
      'purchased_at:timestamp with time zone:YES',
      'purchased_by:uuid:YES',
      'reconciled_at:timestamp with time zone:YES',
      'reconciled_by:uuid:YES',
      'short_pay_reason:text:YES',
      'status:USER-DEFINED:NO',
      'submitted_at:timestamp with time zone:YES',
      'submitted_by:uuid:YES',
      'updated_at:timestamp with time zone:NO',
      'updated_by:uuid:YES',
    ]);
  });

  itLive('payments records what ARRIVED, split into gross, fee, reserve and deposit', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments' ORDER BY 1`);
    for (const c of ['gross_amount', 'fee_amount', 'reserve_amount', 'net_deposited',
      'source', 'received_at', 'invoice_id', 'reference']) {
      expect(cols, c).toContain(c);
    }
  });

  itLive('ar_aging_snapshots carries a date, a bucket, a balance and a count', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ar_aging_snapshots' ORDER BY 1`);
    for (const c of ['snapshot_date', 'bucket', 'open_balance', 'invoice_count', 'broker_id']) {
      expect(cols, c).toContain(c);
    }
  });

  /**
   * A submitted invoice is immutable, so a company boundary added later could
   * never be backfilled onto rows the database itself refuses to update. The
   * column is therefore NOT NULL from the first migration, on an empty table,
   * where it costs nothing.
   */
  itLive('EVERY billing table carries a NOT NULL company_id', () => {
    const rows = psql(`SELECT table_name || '|' || is_nullable || '|' || coalesce(column_default,'')
      FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN (${TABLE_LIST}) AND column_name='company_id' ORDER BY 1`);
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows) {
      const [table, nullable, def] = row.split('|');
      expect(nullable, `${table}.company_id nullability`).toBe('NO');
      // Deliberately NOT a column DEFAULT: a default is evaluated as the
      // CALLER, which made tenancy a per-role EXECUTE grant problem and, worse,
      // let a caller assert its own company by simply supplying the column.
      expect(def, `${table}.company_id must not be defaulted`).toBe('');
    }
  });

  itLive('company_id is stamped by a trigger on every billing table, and overrides the caller', () => {
    const triggers = psql(`SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace
        AND t.tgname = 'aa_stamp_billing_company_id' ORDER BY 1`);
    expect(triggers).toEqual(TABLES);
    // Assignment is unconditional — no coalesce, so a supplied value is replaced.
    const src = bodyOf('stamp_billing_company_id');
    expect(src).toContain('NEW.company_id := public.current_company_id();');
    expect(src).not.toContain('coalesce(NEW.company_id');
  });

  itLive('company_id points at carrier_profile and RESTRICTS its deletion', () => {
    const fks = psql(`SELECT c.conrelid::regclass::text || '|' || c.confdeltype::text
      FROM pg_constraint c JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype='f' AND a.attname='company_id'
        AND c.confrelid = 'public.carrier_profile'::regclass
        AND c.conrelid::regclass::text IN (${TABLES.map(t => `'${t}'`).join(', ')})
      ORDER BY 1`);
    expect(fks).toEqual(TABLES.map(t => `${t}|r`));
  });
});

describe('billing — behaviour the schema must refuse', () => {
  itLive('a SECOND invoice for the same load is refused by the database, not by a builder', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount)
        SELECT id, 'SCRATCH-1', 'direct', 100 FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount)
        SELECT id, 'SCRATCH-2', 'direct', 100 FROM public.loads ORDER BY created_at LIMIT 1;
      ROLLBACK;`);
    expect(err).toContain('invoices_load_key');
  });

  itLive('purchased_at on a DIRECT invoice is refused — only a factor purchases', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount, submitted_at, purchased_at)
        SELECT id, 'SCRATCH-3', 'direct', 100, now(), now() FROM public.loads ORDER BY created_at LIMIT 1;
      ROLLBACK;`);
    expect(err).toContain('invoices_purchased_requires_factored_check');
  });

  itLive('a payment date before submission is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount, submitted_at, paid_at)
        SELECT id, 'SCRATCH-4', 'factored', 100, now(), now() - interval '5 days'
        FROM public.loads ORDER BY created_at LIMIT 1;
      ROLLBACK;`);
    expect(err).toContain('invoices_lifecycle_order_check');
  });

  itLive('an actor without the moment it acted on is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount, paid_by)
        SELECT id, 'SCRATCH-5', 'factored', 100, (SELECT id FROM public.profiles LIMIT 1)
        FROM public.loads ORDER BY created_at LIMIT 1;
      ROLLBACK;`);
    expect(err).toContain('invoices_actor_requires_timestamp_check');
  });

  /**
   * A short pay closes a balance with less money than was billed. Doing that
   * without a stated reason erases the dispute, which is the only record that
   * the shortfall was ever contested.
   */
  itLive('short_paid without a stated reason is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount, status)
        SELECT id, 'SCRATCH-6', 'factored', 100, 'short_paid'
        FROM public.loads ORDER BY created_at LIMIT 1;
      ROLLBACK;`);
    expect(err).toContain('invoices_short_pay_reason_check');
  });

  /**
   * The deposit is not an independent number to be typed in. If gross, fee and
   * reserve do not add back up to it, one of the four was mis-keyed and the
   * remittance no longer reconciles.
   */
  itLive('a deposit that is not gross less fee less reserve is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (id, load_id, invoice_number, billing_path, amount)
        SELECT '${SCRATCH}', id, 'SCRATCH-7', 'factored', 1000
        FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.payments (invoice_id, source, gross_amount, fee_amount, reserve_amount, net_deposited)
        VALUES ('${SCRATCH}', 'factor', 1000, 20, 0, 999);
      ROLLBACK;`);
    expect(err).toContain('payments_net_identity_check');
  });

  itLive('a bucket outside the four aging windows is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.ar_aging_snapshots (snapshot_date, bucket, open_balance)
        VALUES ('2099-01-01', '120_plus', 10);
      ROLLBACK;`);
    expect(err).toContain('ar_aging_snapshots_bucket_check');
  });

  itLive('a second snapshot for the same day, broker and bucket is refused', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.ar_aging_snapshots (snapshot_date, bucket, open_balance)
        VALUES ('2099-01-01', '0_30', 10);
      INSERT INTO public.ar_aging_snapshots (snapshot_date, bucket, open_balance)
        VALUES ('2099-01-01', '0_30', 20);
      ROLLBACK;`);
    expect(err).toContain('ar_aging_snapshots_daily_uniq');
  });

  itLive('a linehaul line may not carry a charge reference, and a charge line must name its type', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (id, load_id, invoice_number, billing_path, amount)
        SELECT '${SCRATCH}', id, 'SCRATCH-8', 'factored', 1000
        FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.invoice_line_items (invoice_id, line_type, amount, charge_type)
        VALUES ('${SCRATCH}', 'linehaul', 1000, 'lumper');
      ROLLBACK;`);
    expect(err).toContain('invoice_line_items_charge_reference_check');
  });

  /**
   * The one immutability rule this harness CAN exercise: the test role holds
   * SELECT and INSERT only on every public table, so no UPDATE or DELETE can be
   * issued from here — but the line trigger fires BEFORE INSERT too, and adding
   * a line to an already-submitted invoice is exactly the drift that silently
   * changes what a broker was told they owe.
   */
  itLive('a line CANNOT be added to an invoice that has already been submitted', () => {
    const err = psqlExpectError(`BEGIN;
      INSERT INTO public.invoices (id, load_id, invoice_number, billing_path, amount, submitted_at)
        SELECT '${SCRATCH}', id, 'SCRATCH-9', 'factored', 1000, now()
        FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.invoice_line_items (invoice_id, line_type, amount)
        VALUES ('${SCRATCH}', 'linehaul', 1000);
      ROLLBACK;`);
    expect(err).toContain('SUBMITTED');
    expect(err).toContain('immutable');
  });

  itLive('a line CAN be added while the invoice is still a draft', () => {
    const rows = psql(`BEGIN;
      INSERT INTO public.invoices (id, load_id, invoice_number, billing_path, amount)
        SELECT '${SCRATCH}', id, 'SCRATCH-10', 'factored', 1000
        FROM public.loads ORDER BY created_at LIMIT 1;
      INSERT INTO public.invoice_line_items (invoice_id, line_type, amount)
        VALUES ('${SCRATCH}', 'linehaul', 1000);
      SELECT count(*)::text FROM public.invoice_line_items WHERE invoice_id = '${SCRATCH}';
      ROLLBACK;`);
    expect(rows).toContain('1');
  });
});

describe('billing — the immutability rules are attached', () => {
  /**
   * The UPDATE and DELETE halves cannot be exercised from this harness (the
   * test role has no UPDATE or DELETE privilege anywhere). What this file can
   * prove is that the triggers carrying those rules are ATTACHED and that the
   * rules are inside them — that is the part a later migration is most likely
   * to drop.
   */
  itLive('every billing immutability trigger is attached to the table that carries its rule', () => {
    const triggers = psql(`SELECT c.relname || '|' || t.tgname
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace
        AND c.relname IN (${TABLE_LIST}) ORDER BY 1`);
    expect(triggers).toContain('invoices|enforce_invoice_immutability');
    expect(triggers).toContain('invoices|stamp_invoice_actors');
    expect(triggers).toContain('invoice_line_items|enforce_invoice_line_immutability');
    expect(triggers).toContain('ar_aging_snapshots|enforce_ar_aging_snapshot_append_only');
  });

  /**
   * Trigger order matters and is alphabetical within a timing. The frozen-column
   * comparison must run BEFORE the actor stamp, or the stamp's own writes would
   * be read as caller-supplied changes.
   */
  itLive('the immutability check sorts before the actor stamp', () => {
    expect('enforce_invoice_immutability' < 'stamp_invoice_actors').toBe(true);
  });

  itLive('freezing covers identity and money, and deliberately NOT status or payment dates', () => {
    const src = bodyOf('enforce_invoice_immutability');
    for (const frozen of ['company_id', 'load_id', 'broker_id', 'invoice_number',
      'billing_path', 'amount', 'batch_id', 'submitted_at']) {
      expect(src, frozen).toContain(`NEW.${frozen} IS DISTINCT FROM OLD.${frozen}`);
    }
    // A receivable that cannot record its own payment is not a receivable.
    for (const mutable of ['status', 'paid_at', 'reconciled_at', 'short_pay_reason']) {
      expect(src, mutable).not.toContain(`NEW.${mutable} IS DISTINCT FROM OLD.${mutable}`);
    }
    // A submitted invoice is a document someone else holds; it is not deleted.
    expect(src).toContain('cannot be deleted');
  });

  /**
   * The gate is DELIBERATELY its own. app.invoice_write must not unlock a
   * driver settlement and app.settlement_write must not unlock an invoice —
   * one privileged correction path should never open two sets of books.
   */
  itLive('the billing writer gate is its own setting and shares nothing with settlement', () => {
    const src = bodyOf('invoice_writer_active');
    expect(src).toContain('app.invoice_write');
    expect(src).not.toContain('app.settlement_write');
    expect(src).not.toContain('app.dispatch_settlement_write');

    const guards = bodyOf('enforce_invoice_immutability') + ' ' + bodyOf('enforce_invoice_line_immutability');
    expect(guards).toContain('public.invoice_writer_active()');
    expect(guards).not.toContain('dispatch_settlement_writer_active');
  });

  itLive('the actor is resolved server-side and a client-supplied value is discarded', () => {
    const src = bodyOf('stamp_invoice_actors');
    expect(src).toContain('public.current_profile_id()');
    for (const col of ['submitted_by', 'purchased_by', 'paid_by', 'reconciled_by']) {
      expect(src, col).toContain(`NEW.${col} := OLD.${col}`);
    }
  });

  itLive('an aging snapshot can never be edited or deleted', () => {
    const src = bodyOf('enforce_ar_aging_snapshot_append_only');
    expect(src).toContain('append only');
    // No escape hatch: not even the writer gate reopens a snapshot.
    expect(src).not.toContain('invoice_writer_active');
  });
});

describe('billing — access', () => {
  itLive('RLS is enabled on every billing table and each has a policy', () => {
    const rows = psql(`SELECT c.relname || '|' || c.relrowsecurity::text || '|' ||
        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::text
      FROM pg_class c WHERE c.relnamespace='public'::regnamespace
        AND c.relname IN (${TABLE_LIST}) ORDER BY 1`);
    expect(rows).toEqual(TABLES.map(t => `${t}|true|1`));
  });

  /**
   * Billing is management and owner only. A dispatcher books the load; what the
   * broker is charged, what the factor took and what is outstanding are not his
   * to see. An operator's isolation is absolute here — there is no operator
   * predicate to get wrong because there is no operator access at all.
   */
  itLive('every policy names management and owner, scopes to the company, and names no other role', () => {
    const policies = psql(`SELECT c.relname || '|' || p.polname || '|' ||
        pg_get_expr(p.polqual, p.polrelid) || '|' ||
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') || '|' ||
        (SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
           FROM unnest(p.polroles) x JOIN pg_roles r ON r.oid = x)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${TABLE_LIST}) ORDER BY 1`);
    expect(policies).toHaveLength(TABLES.length);
    for (const row of policies) {
      const [table, , using, check, roles] = row.split('|');
      expect(roles, `${table} roles`).toBe('authenticated');
      for (const expr of [using, check]) {
        expect(expr, `${table} predicate`).toContain("'management'");
        expect(expr, `${table} predicate`).toContain("'owner'");
        expect(expr, `${table} tenancy`).toContain('current_company_id()');
        expect(expr, `${table} must not reach dispatcher`).not.toContain("'dispatcher'");
        expect(expr, `${table} must not reach operator`).not.toContain("'operator'");
      }
    }
  });

  itLive('anon reaches no billing table', () => {
    const grants = psql(`SELECT c.relname || '|' || a.privilege_type
      FROM pg_class c, aclexplode(c.relacl) a
      WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${TABLE_LIST})
        AND a.grantee = 'anon'::regrole ORDER BY 1`);
    expect(grants).toEqual([]);
  });

  /**
   * A finding worth writing down rather than fighting: the platform re-grants
   * the FULL privilege set on every public table to `authenticated` after each
   * migration. The narrower SELECT/INSERT grant this pass issued on
   * `ar_aging_snapshots` did not survive, and re-revoking it would not survive
   * the next migration either — every existing immutable table
   * (`dispatch_settlements`, `settlement_line_items`, `load_change_history`)
   * carries the same full set for the same reason.
   *
   * So the append-only rule is enforced by the TRIGGER, not by the grant, and
   * this test asserts the boundary that actually holds: the table is reachable
   * only through RLS, and no billing table reaches `anon`.
   */
  itLive('authenticated reaches every billing table only through RLS, never through a grant alone', () => {
    const grants = psql(`SELECT c.relname FROM pg_class c, aclexplode(c.relacl) a
      WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${TABLE_LIST})
        AND a.grantee = 'authenticated'::regrole AND a.privilege_type = 'SELECT' ORDER BY 1`);
    expect(grants).toEqual(TABLES);

    // Which is only safe because RLS is FORCED on by the policy check above and
    // the append-only refusal lives in a trigger the grant cannot bypass.
    const appendOnlyTrigger = psql(`SELECT t.tgname FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgrelid = 'public.ar_aging_snapshots'::regclass
        AND t.tgname = 'enforce_ar_aging_snapshot_append_only'`);
    expect(appendOnlyTrigger).toHaveLength(1);
  });

  itLive('the trigger and gate functions are definer, pinned, and reach NO client role', () => {
    const rows = psql(`SELECT p.proname || '|' || p.prosecdef::text || '|' ||
        coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
        coalesce(array_to_string(p.proacl, ' '), '')
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND p.proname IN (${SERVICE_ONLY_FUNCTIONS.map(f => `'${f}'`).join(', ')}) ORDER BY 1`);
    expect(rows.map(r => r.split('|')[0])).toEqual(SERVICE_ONLY_FUNCTIONS);
    for (const row of rows) {
      const [name, secdef, config, acl] = row.split('|');
      expect(secdef, name).toBe('true');
      expect(config, name).toContain('search_path=public, extensions');
      expect(acl, name).not.toContain('authenticated=X');
      expect(acl, name).not.toContain('anon=X');
      expect(acl, name).not.toMatch(/(^|\s)=X/); // no PUBLIC grant
    }
  });

  /**
   * The one Module 7 function authenticated MUST be able to execute: it is a
   * column DEFAULT and a policy expression, and both are evaluated as the
   * CALLER. It takes no argument and returns one uuid that is the same for
   * everyone today.
   */
  itLive('current_company_id is executable by authenticated but never by anon or PUBLIC', () => {
    const row = psql(`SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
        || '|' || coalesce(array_to_string(p.proacl, ' '), '')
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND p.proname='current_company_id'`).join('');
    const [secdef, config, acl] = row.split('|');
    expect(secdef).toBe('true');
    expect(config).toContain('search_path=public, extensions');
    expect(acl).toContain('authenticated=X');
    expect(acl).not.toContain('anon=X');
    expect(acl).not.toMatch(/(^|\s)=X/);
  });
});

describe('billing — no writer exists yet', () => {
  /**
   * Pass 1 is schema only. The assertion is kept and named when a writer
   * arrives, exactly as the dispatch settlement file did: the point is never
   * "nothing exists", it is "there is no SECOND writer".
   */
  itLive('no invoice builder or payment poster has been added', () => {
    const fns = psql(`SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND (proname LIKE '%invoice%' OR proname LIKE '%ar_aging%'
           OR proname LIKE 'post_payment%' OR proname LIKE 'record_payment%') ORDER BY 1`);
    expect(fns.sort()).toEqual([
      'enforce_ar_aging_snapshot_append_only',
      'enforce_invoice_immutability',
      'enforce_invoice_line_immutability',
      'invoice_writer_active',
      'stamp_invoice_actors',
    ]);
  });

  /**
   * The two 2% figures. The factor's fee is a fact read off the remittance, not
   * a percentage recomputed from the dispatch rate table — otherwise a rate
   * change would silently restate what was already deposited.
   */
  itLive('the coupling between the dispatch factoring rate and the recorded fee is written down', () => {
    const comment = psql(`SELECT col_description('public.dispatch_settlement_rates'::regclass,
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.dispatch_settlement_rates'::regclass
        AND attname='factoring_pct'))`).join(' ');
    expect(comment).toContain('payments.fee_amount');
    expect(comment).toContain('TWO things must change');

    const feeComment = psql(`SELECT col_description('public.payments'::regclass,
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.payments'::regclass
        AND attname='fee_amount'))`).join(' ');
    expect(feeComment).toContain('NEVER recomputed');
  });
});
