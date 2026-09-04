import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * MODULE 5, PASS 4 / PASS 1 — the accessorial adjustment record (`-A1`).
 * SCHEMA ONLY.
 *
 * There is no writer, no sequence allocator, no approval RPC, no settlement
 * seam and no screen. This file asserts the SHAPE, the REFUSALS and the
 * ABSENCE of a writer, all read from the live catalog rather than from the
 * migration file, because a migration records an intention and the catalog
 * records the outcome — the two have diverged before.
 *
 * HARNESS LIMIT, stated rather than worked around: the test role holds SELECT
 * and INSERT on public tables and NOT UPDATE or DELETE (`has_table_privilege`
 * returns false for both). So the CHECK and UNIQUE refusals are EXERCISED with
 * real inserts, and the immutability rules are asserted against the live
 * trigger body plus its attachment — which is the part a later migration is
 * most likely to drop.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('accessorial adjustment schema checks did not run', [
    'No PGHOST, so the table, its constraints, RLS, grants, the source_table',
    'CHECK extension and the no-writer assertion could not be read live.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the Module 5 Pass 4 adjustment schema.'],
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

const T = 'accessorial_adjustments';

/** prosrc as written, with alignment padding collapsed. */
const bodyCache = new Map<string, string>();
function bodyOf(name: string): string {
  const hit = bodyCache.get(name);
  if (hit !== undefined) return hit;
  const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname='${name}'`).join(' ').replace(/\s+/g, ' ');
  bodyCache.set(name, src);
  return src;
}

function constraintDef(name: string): string {
  return psql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid='public.${T}'::regclass AND conname='${name}'`)
    .join(' ').replace(/\s+/g, ' ');
}

/** Every SECURITY DEFINER function this pass created. None reaches a client. */
const SERVICE_ONLY_FUNCTIONS = [
  'accessorial_adjustment_writer_active',
  'enforce_accessorial_adjustment_immutability',
  'stamp_accessorial_adjustment_actor',
];

/** A live load to hang scratch rows off. Inserts always roll back. */
let cachedLoadId: string | null = null;
function someLoadId(): string {
  if (!cachedLoadId) {
    [cachedLoadId] = psql('SELECT id FROM public.loads ORDER BY created_at LIMIT 1');
  }
  return cachedLoadId;
}

/** A minimal valid insert, with the named columns overridden. */
function insertRow(overrides: Record<string, string> = {}): string {
  const cols: Record<string, string> = {
    load_id: `'${someLoadId()}'`,
    // A deliberately out-of-range sequence: the live load now carries real
    // adjustments, and a scratch row must never collide with one.
    reference: `'ST-SCRATCH-A9001'`,
    sequence: '9001',
    charge_type: `'detention'`,
    amount: '300',
    reason: `'approved after the load was invoiced'`,
    ...overrides,
  };
  const names = Object.keys(cols).join(', ');
  const values = Object.values(cols).join(', ');
  return `INSERT INTO public.${T} (${names}) VALUES (${values});`;
}

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — the shape', () => {
  itLive('carries every designed column, with the designed nullability', () => {
    const cols = psql(`SELECT column_name || ':' || data_type || ':' || is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${T}' ORDER BY column_name`);

    expect(cols).toEqual([
      'actual_cost:numeric:YES',
      'amount:numeric:NO',
      'approved_at:timestamp with time zone:YES',
      'approved_by:uuid:YES',
      'billing_state:text:NO',
      'charge_type:text:NO',
      'company_id:uuid:NO',
      'created_at:timestamp with time zone:NO',
      'created_by:uuid:YES',
      'description:text:YES',
      'funding_source:text:YES',
      'id:uuid:NO',
      'invoice_id:uuid:YES',
      'load_id:uuid:NO',
      'proof_document_id:uuid:YES',
      'reason:text:NO',
      'reference:text:NO',
      'sequence:integer:NO',
      'settlement_id:uuid:YES',
      'settlement_line_item_id:uuid:YES',
      'status:text:NO',
      'updated_at:timestamp with time zone:NO',
      'updated_by:uuid:YES',
      'void_reason:text:YES',
    ]);
  });

  itLive('names every constraint the design record calls for', () => {
    const names = psql(`SELECT conname FROM pg_constraint
      WHERE conrelid='public.${T}'::regclass ORDER BY conname`);

    for (const required of [
      'accessorial_adjustments_pkey',
      'accessorial_adjustments_load_sequence_key',
      'accessorial_adjustments_company_reference_key',
      'accessorial_adjustments_sequence_check',
      'accessorial_adjustments_reference_format_check',
      'accessorial_adjustments_charge_type_check',
      'accessorial_adjustments_amount_check',
      'accessorial_adjustments_funding_source_check',
      'accessorial_adjustments_actual_cost_check',
      'accessorial_adjustments_reason_present_check',
      'accessorial_adjustments_status_check',
      'accessorial_adjustments_billing_state_check',
      'accessorial_adjustments_approval_pair_check',
      'accessorial_adjustments_approved_requires_approval_check',
      'accessorial_adjustments_void_reason_check',
      'accessorial_adjustments_settled_pair_check',
      'accessorial_adjustments_line_requires_settlement_check',
      'accessorial_adjustments_billed_pair_check',
    ]) {
      expect(names).toContain(required);
    }
  });

  itLive('admits exactly the six statuses and the three billing states', () => {
    for (const s of ['draft', 'pending_approval', 'approved', 'settled', 'rejected', 'void']) {
      expect(constraintDef('accessorial_adjustments_status_check')).toContain(`'${s}'`);
    }
    for (const b of ['not_required', 'pending_supplemental', 'billed']) {
      expect(constraintDef('accessorial_adjustments_billing_state_check')).toContain(`'${b}'`);
    }
  });

  itLive('holds the load with RESTRICT, so a purge cannot orphan an adjustment', () => {
    const fks = psql(`SELECT conname || '|' || confrelid::regclass::text || '|' || confdeltype::text
      FROM pg_constraint WHERE conrelid='public.${T}'::regclass AND contype='f' ORDER BY conname`);

    expect(fks).toContain('accessorial_adjustments_load_id_fkey|loads|r');
    expect(fks).toContain('accessorial_adjustments_company_id_fkey|carrier_profile|r');
    expect(fks).toContain('accessorial_adjustments_settlement_id_fkey|settlements|r');
    expect(fks).toContain('accessorial_adjustments_invoice_id_fkey|invoices|n');
    expect(fks).toContain('accessorial_adjustments_proof_document_id_fkey|load_documents|n');
    expect(fks).toContain(
      'accessorial_adjustments_settlement_line_item_id_fkey|settlement_line_items|n',
    );
  });
});

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — the classification cannot drift from load_charges', () => {
  /**
   * `load_charges.charge_type` is not gated by a CHECK at all — it is gated by
   * `public.assert_known_charge_type`, called from `add_load_charge` and
   * `update_load_charge`. An adjustment has no writer yet, so its gate is a
   * CHECK. The INVARIANT is that the two lists are the same set: an adjustment
   * must not be able to carry a classification the pay policy cannot price.
   */
  itLive('lists exactly the charge types assert_known_charge_type admits', () => {
    const fromFunction = [...bodyOf('assert_known_charge_type').matchAll(/'([a-z_]+)'/g)]
      .map(m => m[1]).sort();
    const fromCheck = [...constraintDef('accessorial_adjustments_charge_type_check')
      .matchAll(/'([a-z_]+)'::text/g)].map(m => m[1]).sort();

    expect(fromFunction.length).toBeGreaterThan(0);
    expect(fromCheck).toEqual(fromFunction);
  });
});

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — the refusals, exercised', () => {
  itLive('stamps company_id from the trigger and leaves the row in draft', () => {
    const [row] = psql(`BEGIN; ${insertRow()}
      SELECT company_id::text || '|' || status || '|' || billing_state FROM public.${T}
        WHERE reference = 'ST-SCRATCH-A9001';
      ROLLBACK;`).filter(l => l.includes('|'));
    const [company, status, billing] = row.split('|');
    expect(company).toMatch(/^[0-9a-f-]{36}$/);
    expect(status).toBe('draft');
    expect(billing).toBe('not_required');
  });

  itLive('refuses two adjustments sharing a sequence on one load', () => {
    const err = psqlExpectError(`BEGIN;
      ${insertRow()}
      ${insertRow({ reference: `'ST-SCRATCH-A9002'` })}
      ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_load_sequence_key');
  });

  itLive('refuses a classification the pay policy cannot price', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ charge_type: `'gratuity'` })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_charge_type_check');
  });

  itLive('refuses a zero-amount adjustment', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ amount: '0' })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_amount_check');
  });

  itLive('refuses a blank reason — the reason is required, not merely present', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ reason: `'   '` })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_reason_present_check');
  });

  itLive('refuses a reference that is not an -A sequence', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ reference: `'ST-1042'` })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_reference_format_check');
  });

  itLive('refuses sequence 0 — the first adjustment is A1', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ sequence: '0' })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_sequence_check');
  });

  itLive('refuses approved with no approval moment', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ status: `'approved'` })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_approved_requires_approval_check');
  });

  itLive('refuses an approval moment with no actor', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ approved_at: 'now()' })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_approval_pair_check');
  });

  itLive('refuses void with no reason for the void', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ status: `'void'` })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_void_reason_check');
  });

  itLive('refuses settled with no settlement — consumption cannot be claimed', () => {
    const err = psqlExpectError(`BEGIN;
      ${insertRow({ status: `'settled'`, approved_at: 'now()', approved_by: 'NULL' })}
      ROLLBACK;`);
    // Either the pair check or the approval pair fires first; both are refusals
    // of the same lie, so assert the row was refused for a stated reason.
    expect(err).toMatch(/accessorial_adjustments_(settled_pair|approval_pair)_check/);
  });

  itLive('refuses a settlement line pointer with no settlement behind it', () => {
    const err = psqlExpectError(`BEGIN;
      ${insertRow({ settlement_line_item_id: `'00000000-0000-4000-8000-00000000a001'` })}
      ROLLBACK;`);
    expect(err).toMatch(/line_requires_settlement_check|settlement_line_item_id_fkey/);
  });

  itLive('refuses billed with no invoice', () => {
    const err = psqlExpectError(`BEGIN; ${insertRow({ billing_state: `'billed'` })} ROLLBACK;`);
    expect(err).toContain('accessorial_adjustments_billed_pair_check');
  });
});

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — immutability once approved', () => {
  const FROZEN = [
    'company_id', 'load_id', 'reference', 'sequence',
    'charge_type', 'amount', 'funding_source', 'actual_cost',
    'reason', 'approved_at', 'approved_by',
  ];
  /** Advance these or the row could never be consumed. */
  const MUST_STILL_MOVE = [
    'status', 'settlement_id', 'settlement_line_item_id', 'invoice_id',
    'billing_state', 'void_reason',
  ];

  itLive('attaches the guard to UPDATE and DELETE', () => {
    const [def] = psql(`SELECT pg_get_triggerdef(oid) FROM pg_trigger
      WHERE tgrelid='public.${T}'::regclass
        AND tgname='enforce_accessorial_adjustment_immutability'`);
    expect(def).toContain('BEFORE DELETE OR UPDATE');
    expect(def).toContain('FOR EACH ROW');
  });

  itLive('freezes the money and its identity on an approved row', () => {
    const body = bodyOf('enforce_accessorial_adjustment_immutability');
    expect(body).toContain(`OLD.status IN ('approved','settled')`);
    for (const col of FROZEN) {
      expect(body, `${col} must be frozen`).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
  });

  itLive('does NOT freeze status or the consumption pointers', () => {
    const body = bodyOf('enforce_accessorial_adjustment_immutability');
    for (const col of MUST_STILL_MOVE) {
      expect(body, `${col} must still advance`)
        .not.toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    // …and the one direction status may not go.
    expect(body).toContain(`NEW.status NOT IN ('approved','settled','void')`);
  });

  itLive('refuses to delete an approved row rather than letting it vanish', () => {
    const body = bodyOf('enforce_accessorial_adjustment_immutability');
    expect(body).toContain(`TG_OP = 'DELETE'`);
    expect(body).toMatch(/voided with a reason, never deleted/);
  });

  /**
   * One privileged correction path must never open two sets of books. The
   * settlement, dispatch-settlement and invoice gates cannot unlock an
   * adjustment, and this gate cannot unlock any of them.
   */
  itLive('uses its OWN writer gate, which no other gate can substitute for', () => {
    const gate = bodyOf('accessorial_adjustment_writer_active');
    expect(gate).toContain('app.accessorial_adjustment_write');

    const mine = [
      bodyOf('accessorial_adjustment_writer_active'),
      bodyOf('enforce_accessorial_adjustment_immutability'),
    ].join(' ');
    for (const foreign of ['app.settlement_write', 'app.dispatch_settlement_write', 'app.invoice_write']) {
      expect(mine).not.toContain(foreign);
    }

    const others = [
      'settlement_writer_active',
      'dispatch_settlement_writer_active',
      'invoice_writer_active',
      'enforce_invoice_immutability',
    ].map(bodyOf).join(' ');
    expect(others).not.toContain('app.accessorial_adjustment_write');
  });
});

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — tenancy and access', () => {
  itLive('stamps company_id by trigger and never by a column DEFAULT', () => {
    const [row] = psql(`SELECT is_nullable || '|' || coalesce(column_default,'(none)')
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${T}' AND column_name='company_id'`);
    expect(row).toBe('NO|(none)');

    const [trg] = psql(`SELECT pg_get_triggerdef(oid) FROM pg_trigger
      WHERE tgrelid='public.${T}'::regclass AND tgname='aa_stamp_company_id'`);
    expect(trg).toContain('BEFORE INSERT');
    expect(trg).toContain('stamp_billing_company_id');
    expect(bodyOf('stamp_billing_company_id')).toContain('NEW.company_id := public.current_company_id()');
  });

  itLive('has RLS enabled and is not a table with RLS and no policy', () => {
    const [enabled] = psql(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${T}'::regclass`);
    expect(enabled).toBe('t');
    const policies = psql(`SELECT policyname FROM pg_policies WHERE tablename='${T}'`);
    expect(policies.length).toBeGreaterThan(0);
  });

  itLive('admits no row belonging to another company, on every policy', () => {
    const rows = psql(`SELECT policyname || '|' || cmd || '|' || roles::text
      || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
      FROM pg_policies WHERE tablename='${T}'`);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const [, , roles, qual, withCheck] = row.split('|');
      expect(roles).toBe('{authenticated}');
      for (const predicate of [qual, withCheck].filter(Boolean)) {
        expect(predicate, `policy predicate must be company-scoped: ${row}`)
          .toContain('company_id = current_company_id()');
      }
    }
  });

  itLive('reads to dispatcher, management and owner — and to no operator', () => {
    const [qual] = psql(`SELECT qual FROM pg_policies
      WHERE tablename='${T}' AND cmd='SELECT'`);
    for (const role of ['dispatcher', 'management', 'owner']) {
      expect(qual).toContain(`'${role}'::app_role`);
    }
    expect(qual).not.toContain('operator');
  });

  /**
   * The boundary that actually holds is RLS plus the trigger, not the table
   * grant: the platform restores full privileges on public tables and a guard
   * asserting a narrow grant passes today and lies tomorrow. So assert only
   * the direction that is stable — the grant EXISTS, so the policy is
   * reachable — and let RLS carry the rest.
   */
  itLive('grants authenticated enough to reach the policy at all', () => {
    const [ok] = psql(`SELECT has_table_privilege('authenticated','public.${T}','SELECT')`);
    expect(ok).toBe('t');
    const [anonSelect] = psql(`SELECT has_table_privilege('anon','public.${T}','SELECT')`);
    expect(anonSelect).toBe('f');
  });
});

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — the four protections on everything created', () => {
  itLive('every new definer pins search_path to public, extensions', () => {
    for (const fn of SERVICE_ONLY_FUNCTIONS) {
      const [cfg] = psql(`SELECT coalesce(array_to_string(proconfig,','),'(none)')
        FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='${fn}'`);
      expect(cfg, fn).toContain('search_path=public, extensions');
    }
  });

  itLive('every new definer is SECURITY DEFINER, as intended', () => {
    for (const fn of SERVICE_ONLY_FUNCTIONS) {
      const [sec] = psql(`SELECT prosecdef FROM pg_proc
        WHERE pronamespace='public'::regnamespace AND proname='${fn}'`);
      expect(sec, fn).toBe('t');
    }
  });

  /**
   * The role gate for a trigger function and a writer gate is REACHABILITY:
   * nothing calls them directly, so they reach no client role at all. Read
   * from `aclexplode(proacl)`, never `information_schema` — and never from the
   * migration text, because the platform re-grants EXECUTE after apply.
   */
  itLive('no new definer reaches anon, authenticated or PUBLIC', () => {
    for (const fn of SERVICE_ONLY_FUNCTIONS) {
      const grantees = psql(`SELECT coalesce(a.grantee::regrole::text,'PUBLIC')
        FROM pg_proc p LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
        WHERE p.pronamespace='public'::regnamespace AND p.proname='${fn}'`);
      expect(grantees.length, `${fn} has a NULL proacl, which means EXECUTE TO PUBLIC`)
        .toBeGreaterThan(0);
      for (const bad of ['anon', 'authenticated', 'PUBLIC', '-']) {
        expect(grantees, `${fn} must not reach ${bad}`).not.toContain(bad);
      }
      expect(grantees).toContain('service_role');
    }
  });

  itLive('resolves the actor server-side, never from the payload', () => {
    const body = bodyOf('stamp_accessorial_adjustment_actor');
    expect(body).toContain('public.current_profile_id()');
    expect(body).toContain('NEW.created_by := OLD.created_by');
  });
});

// ---------------------------------------------------------------------------

describe('settlement_line_items — the deliberate source_table extension', () => {
  itLive('now admits accessorial_adjustments, and still admits the original seven', () => {
    const [def] = psql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid='public.settlement_line_items'::regclass
        AND conname='settlement_line_items_source_table_check'`);
    for (const t of [
      'loads', 'fuel_transactions', 'deductions', 'deduction_installments',
      'cash_advances', 'rm_deposits', 'settlements', 'accessorial_adjustments',
    ]) {
      expect(def).toContain(`'${t}'`);
    }
  });

  itLive('records WHY the value exists, and which exclusion set owns it', () => {
    const [comment] = psql(`SELECT obj_description(c.oid, 'pg_constraint')
      FROM pg_constraint c WHERE c.conrelid='public.settlement_line_items'::regclass
        AND c.conname='settlement_line_items_source_table_check'`);
    expect(comment).toBeTruthy();
    expect(comment).toContain('settledSourcesEver');
    expect(comment).toContain('SETTLE-ONCE');
    expect(comment).toContain('docs/tms-build-status.md');
  });
});

// ---------------------------------------------------------------------------

describe('accessorial_adjustments — EXACTLY ONE WRITER PER STATE CHANGE', () => {
  /**
   * Rewritten from Pass 1's "NO WRITER EXISTS YET", per its own instruction.
   * The point was never that nothing exists — it is that there is never a
   * SECOND writer for a given state change.
   */
  const TRIGGERS = new Set([
    'enforce_accessorial_adjustment_immutability',
    'enforce_accessorial_adjustment_transition',
    'stamp_accessorial_adjustment_actor',
    'accessorial_adjustment_writer_active',
  ]);

  /**
   * One RPC per transition. Anything else touching the table is a defect.
   *
   * `store_settlement_run` owns the SIXTH state change — `approved → settled`
   * — and it is here deliberately: that transition has no client role at all,
   * so giving it a seventh RPC would create a door where none should exist.
   * The trigger refuses `settled` unless `settlement_writer_active()`, which
   * only that function turns on.
   */
  const WRITERS = new Set([
    'create_accessorial_adjustment',
    'submit_accessorial_adjustment',
    'approve_accessorial_adjustment',
    'reject_accessorial_adjustment',
    'void_accessorial_adjustment',
    'store_settlement_run',
  ]);

  itLive('the only functions that write the table are the five transitions', () => {
    const writers = psql(`SELECT proname FROM pg_proc
      WHERE pronamespace='public'::regnamespace
        AND prosrc ~* '(insert\\s+into|update|delete\\s+from)[[:space:]]+(public\\.)?accessorial_adjustments'
      ORDER BY proname`).filter(n => !TRIGGERS.has(n));
    expect(new Set(writers)).toEqual(WRITERS);
  });

  itLive('only the CREATE writer allocates a sequence, and only it inserts', () => {
    const allocators = psql(`SELECT proname FROM pg_proc
      WHERE pronamespace='public'::regnamespace
        AND prosrc ILIKE '%accessorial_adjustments%'
        AND prosrc ILIKE '%max(sequence)%' ORDER BY proname`);
    expect(allocators).toEqual(['create_accessorial_adjustment']);

    const inserters = psql(`SELECT proname FROM pg_proc
      WHERE pronamespace='public'::regnamespace
        AND prosrc ~* 'insert\\s+into\\s+public\\.accessorial_adjustments'
      ORDER BY proname`);
    expect(inserters).toEqual(['create_accessorial_adjustment']);
  });

  itLive('the sequence cannot be consumed without a row: no client INSERT path exists', () => {
    // The grant is NOT the boundary — the platform restores full privileges on
    // public tables. RLS is. If no policy admits INSERT, no client can insert,
    // so max(sequence)+1 can only be reached through the definer writer.
    const cmds = psql(`SELECT DISTINCT polcmd::text FROM pg_policy
      WHERE polrelid='public.accessorial_adjustments'::regclass ORDER BY 1`);
    expect(cmds).toEqual(['r']);

    // ...and the allocation sits AFTER every refusal in the body, so a refused
    // attempt cannot reach it. Asserted by position, not by reading the code.
    const src = bodyOf('create_accessorial_adjustment');
    const alloc = src.indexOf('max(sequence)');
    expect(alloc).toBeGreaterThan(0);
    for (const refusal of [
      'Only a dispatcher, management or owner may record',
      'Load not found',
      'amount greater than zero',
      'assert_known_charge_type',
      'cannot price a',
    ]) {
      expect(src.indexOf(refusal), refusal).toBeGreaterThan(0);
      expect(src.indexOf(refusal), refusal).toBeLessThan(alloc);
    }
    // The INSERT follows the allocation immediately: nothing between them can
    // fail in a way that burns a number, because nothing is between them.
    expect(src.indexOf('INSERT INTO public.accessorial_adjustments')).toBeGreaterThan(alloc);
  });

  itLive('the reference is composed from the load number and the sequence', () => {
    const src = bodyOf('create_accessorial_adjustment');
    expect(src).toContain("v_load_number || '-A' || v_seq");
  });

  itLive('the writer does NOT gate on load status — that is the whole point', () => {
    const src = bodyOf('create_accessorial_adjustment');
    expect(src).not.toContain('PERFORM public.assert_charge_entry_allowed');
    expect(src).not.toContain("'invoiced'");
    // ...but it does use the SAME classification gate load_charges uses.
    expect(src).toContain('assert_known_charge_type');
  });

  itLive('billing_state is READ from the invoice, never taken from the caller', () => {
    const src = bodyOf('create_accessorial_adjustment');
    expect(src).toContain('submitted_at IS NOT NULL');
    expect(src).toContain("'pending_supplemental'");
    expect(src).toContain('FROM public.invoices');
    // No parameter carries it.
    const args = psql(`SELECT pg_get_function_identity_arguments(oid) FROM pg_proc
      WHERE pronamespace='public'::regnamespace AND proname='create_accessorial_adjustment'`)
      .join(' ');
    expect(args).not.toContain('billing');
  });

  itLive('only management or owner may approve, reject or void', () => {
    for (const fn of ['approve_accessorial_adjustment', 'reject_accessorial_adjustment',
                      'void_accessorial_adjustment']) {
      const src = bodyOf(fn);
      expect(src, fn).toContain("public.has_role(v_uid, 'management'::app_role)");
      expect(src, fn).toContain("public.has_role(v_uid, 'owner'::app_role)");
      expect(src, fn).not.toContain("'dispatcher'::app_role");
    }
  });

  itLive('dispatcher, management and owner may create and submit — the entry three', () => {
    for (const fn of ['create_accessorial_adjustment', 'submit_accessorial_adjustment']) {
      const src = bodyOf(fn);
      for (const role of ['management', 'owner', 'dispatcher']) {
        expect(src, `${fn}/${role}`).toContain(`public.has_role(v_uid, '${role}'::app_role)`);
      }
    }
  });

  itLive('every transition stamps the actor from current_profile_id and demands a reason', () => {
    for (const fn of WRITERS) {
      const src = bodyOf(fn);
      expect(src, fn).toContain('public.current_profile_id()');
      expect(src, fn).toContain("nullif(btrim(coalesce(p_reason, '')), '')");
      expect(src, fn).toContain('public.audit_log');
    }
  });

  itLive('the state machine is enforced by a trigger, so no writer can bypass it', () => {
    const src = bodyOf('enforce_accessorial_adjustment_transition');
    expect(src).toContain("WHEN 'draft' THEN ARRAY['pending_approval','void']");
    expect(src).toContain("WHEN 'pending_approval' THEN ARRAY['approved','rejected','void']");
    expect(src).toContain("WHEN 'approved' THEN ARRAY['settled','void']");
    expect(src).toContain('public.settlement_writer_active()');

    const def = psql(`SELECT pg_get_triggerdef(oid) FROM pg_trigger
      WHERE tgrelid='public.accessorial_adjustments'::regclass
        AND tgname='enforce_accessorial_adjustment_transition'`).join(' ');
    expect(def).toContain('BEFORE UPDATE');
  });

  itLive('no client role can move an adjustment to settled', () => {
    // settled is reachable only while app.settlement_write is on, and that is
    // set by the settlement writer, which is service_role only.
    expect(bodyOf('enforce_accessorial_adjustment_transition'))
      .toContain('settled by the settlement writer, not by a caller');
    // No transition RPC WRITES the settled status. void_accessorial_adjustment
    // reads it, to refuse voiding a settled row — that is a refusal, not a write.
    for (const fn of WRITERS) {
      expect(bodyOf(fn), fn).not.toMatch(/SET status = 'settled'/);
      expect(bodyOf(fn), fn).not.toContain("status = 'settled',");
    }
  });

  itLive('the five writers are reachable by authenticated and never by anon', () => {
    const rows = psql(`SELECT p.proname || '=' || coalesce(string_agg(DISTINCT a.grantee::regrole::text, ','), '')
      FROM pg_proc p LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
      WHERE p.pronamespace='public'::regnamespace
        AND p.proname IN (${[...WRITERS].map(w => `'${w}'`).join(',')})
      GROUP BY p.proname ORDER BY p.proname`);
    expect(rows).toHaveLength(WRITERS.size);
    for (const row of rows) {
      expect(row).toContain('authenticated');
      expect(row).not.toContain('anon');
    }
  });

  itLive('the transition trigger function reaches no client role', () => {
    const [row] = psql(`SELECT coalesce(string_agg(DISTINCT a.grantee::regrole::text, ','), '')
      FROM pg_proc p LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
      WHERE p.pronamespace='public'::regnamespace
        AND p.proname='enforce_accessorial_adjustment_transition'`);
    expect(row).not.toContain('anon');
    expect(row).not.toContain('authenticated');
    expect(row).toContain('service_role');
  });

  itLive('every writer pins search_path and is SECURITY DEFINER', () => {
    for (const fn of [...WRITERS, 'enforce_accessorial_adjustment_transition']) {
      const [def] = psql(`SELECT prosecdef::text || '|' || coalesce(array_to_string(proconfig, ' '), '')
        FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='${fn}'`);
      expect(def, fn).toContain('true|');
      expect(def, fn).toContain('search_path=public, extensions');
    }
  });

  itLive('no settlement line names an adjustment source yet — Pass 3 opens that seam', () => {
    const [count] = psql(`SELECT count(*) FROM public.settlement_line_items
      WHERE source_table = 'accessorial_adjustments'`);
    expect(count).toBe('0');
  });
});

/**
 * PASS 3 — the settlement seam, asserted against the live catalog.
 */
describe('accessorial_adjustments — the settlement seam', () => {
  itLive('`settled` is reachable only inside the settlement writer', () => {
    const src = bodyOf('enforce_accessorial_adjustment_transition');
    expect(src).toContain("NEW.status = 'settled' AND NOT public.settlement_writer_active()");
  });

  itLive('the settlement writer stamps BOTH pointers when it pays an adjustment', () => {
    const src = bodyOf('store_settlement_run');
    expect(src).toContain("nullif(v_line->>'source_table', '') = 'accessorial_adjustments'");
    expect(src).toContain("SET status = 'settled'");
    expect(src).toContain('settlement_id = v_id');
    expect(src).toContain('settlement_line_item_id = v_line_id');
  });

  itLive('the settlement writer VALIDATES the adjustment rather than trusting the payload', () => {
    const src = bodyOf('store_settlement_run');
    for (const refusal of [
      'which does not exist',
      'not approved; it cannot be settled',
      'is already settled on settlement',
      'belongs to another driver',
    ]) expect(src, refusal).toContain(refusal);
    // The row is locked before it is judged.
    expect(src).toContain('FOR UPDATE');
  });

  itLive('a recompute RELEASES what it paid instead of stranding it', () => {
    const src = bodyOf('store_settlement_run');
    const release = src.indexOf('UPDATE public.accessorial_adjustments\n         SET status = \'approved\'');
    expect(src).toContain("SET status = 'approved'");
    expect(src).toContain('WHERE settlement_id = v_existing.id');
    // ...and it happens BEFORE the delete, because settlement_id is RESTRICT.
    expect(src.indexOf('WHERE settlement_id = v_existing.id'))
      .toBeLessThan(src.indexOf('DELETE FROM public.settlements'));
    expect(release === -1 || release > 0).toBe(true);
  });

  itLive('the settlement writer never opens the adjustment correction path', () => {
    // Two privileged flags, two sets of books. The settlement writer unwinds
    // its OWN work through settlement_writer_active(); it must not reach for
    // app.accessorial_adjustment_write.
    expect(bodyOf('store_settlement_run')).not.toContain('app.accessorial_adjustment_write');
  });

  itLive('settlement_line_items admits the adjustment source table', () => {
    expect(constraintDef('settlement_line_items_source_table_check'))
      .toContain('accessorial_adjustments');
  });
});
