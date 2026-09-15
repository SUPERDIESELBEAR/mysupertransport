import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * TENANCY STEP 1 — `company_members` and the resolver.
 *
 * Read from the live catalog, not from the migration file: a migration records
 * an intention, the catalog records the outcome, and these two have diverged in
 * this project before.
 *
 * What went wrong and what this file exists to stop recurring: for one week
 * `current_company_id()` was `SELECT id FROM carrier_profile ORDER BY created_at
 * LIMIT 1`. It ignored `auth.uid()` entirely and returned the same company to
 * every caller. It was correct only because `carrier_profile` held one row —
 * right answer, wrong reason, and untestable once a second company exists.
 */
vi.setConfig({ testTimeout: 60_000 });

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('tenancy resolver checks did not run', [
    'No PGHOST, so the resolver body, its protections, the membership rows and',
    'the fail-closed behaviour could not be read live.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the tenancy resolver and company_members.'],
});

/**
 * The pooler drops roughly one connection per long run with
 * `(EAUTHQUERY) auth_query secret check timed out`. That is a CONNECTION
 * failure, never a SQL result, so it is retried; any other failure — including
 * a real `ERROR:` from Postgres — is rethrown untouched.
 */
function psql(sql: string): string[] {
  for (let attempt = 0; ; attempt++) {
    try {
      return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        .split('\n').map(l => l.trim()).filter(Boolean);
    } catch (e) {
      const text = String((e as { stderr?: Buffer }).stderr ?? '') + String(e);
      if (attempt >= 2 || !text.includes('EAUTHQUERY')) throw e;
    }
  }
}

/** The six tables stamped in B2 plus the two singleton carriers from B3. */
const B2_B3_STAMPED = [
  'brokers', 'equipment_items', 'facilities', 'loads', 'operators',
  'owner_transfers', 'pay_policies', 'user_roles',
] as const;

/**
 * BATCH B5 PART ONE — the two carrier-data singletons. `email_send_state` is
 * NOT here: the record declares its `CHECK (id = 1)` deliberately GLOBAL
 * infrastructure keyed to the shared sending domain.
 */
const B5_SINGLETONS = ['carrier_signature_settings', 'settlement_settings'] as const;

/**
 * Declared GLOBAL — no `company_id`, ever. A table with no column and no
 * declaration is indistinguishable from one that was missed, so the
 * declaration lives here as an assertion, not only in prose.
 */
const GLOBAL_TABLES = [
  'applications', 'application_correction_requests', 'application_correction_fields',
  'application_document_history', 'application_interview_notes',
  'application_resume_tokens', 'application_invites', 'application_revision_attachments',
  'profiles', 'carrier_profile', 'resource_documents', 'resource_history',
  'release_notes', 'eld_device_models', 'eld_revoked_list_checks',
  'revert_courtesy_email_defaults',
  'email_unsubscribe_tokens', 'suppressed_emails',
] as const;

/**
 * DEFERRED, not global: eight content tables await the product-versus-carrier
 * split. Six were deferred 2026-09-14; `email_templates` and `message_templates`
 * joined them by the owner's fifth decision the same day, which SUPERSEDES the
 * earlier GLOBAL declaration for `email_templates`. `notification_role_defaults`
 * left the GLOBAL list by the owner's first decision (PER-CARRIER) and is now
 * asserted in the B5 part two block instead.
 */
const DEFERRED_TABLES = [
  'faq', 'faq_history', 'services', 'service_resources', 'staff_help_knowledge',
  'pipeline_config', 'email_templates', 'message_templates',
] as const;

/**
 * BATCH B5 PART TWO, GROUP A — the eleven per-carrier settings tables plus
 * `inspection_binder_order`. Every one of them is a leak if global: one
 * carrier's DOT consultant, insurance contact, plate pool, load-number series,
 * dispatcher pay rate or notification defaults applied to another carrier.
 */
const B5B_SETTINGS = [
  'company_settings', 'fleet_settings', 'load_number_config',
  'dot_consultant_email_settings', 'insurance_email_settings',
  'carrier_notification_settings', 'inspection_program_settings',
  'pei_cadence_settings', 'dispatch_settlement_rates', 'mo_plates',
  'notification_role_defaults', 'inspection_binder_order',
] as const;

/**
 * BATCH B5 PART TWO, GROUP B — the settlement family. Every one carries an
 * immutability lock, so the column was added by the approved
 * DEFAULT-then-DROP-DEFAULT route, which fires no row trigger. No lock was
 * suspended.
 */
const B5B_SETTLEMENTS = [
  'settlements', 'settlement_line_items', 'settlement_withheld_loads',
  'dispatch_settlements', 'dispatch_settlement_line_items',
  'dispatch_settlement_load_contributions', 'dispatch_settlement_charge_verdicts',
] as const;


/**
 * BATCH B5 GROUP C (2026-09-15) — the plain staff-written remainder, plus
 * `equipment_serial_conflict_dismissals`, which was held out of B4 for having
 * rows. Group C1 took the standard nullable -> backfill -> NOT NULL route.
 * Group C2 carries UPDATE-firing history/derivation triggers, so it took the
 * approved constant-DEFAULT-then-DROP route rather than run a row UPDATE that
 * would have written spurious history rows. No trigger was suspended; the
 * derivation check below is what proves the constant was right.
 */
const B5C_PLAIN = [
  'cert_reminders', 'claim_flag_history', 'document_version_history',
  'equipment_assignments', 'equipment_serial_conflict_dismissals',
  'mo_plate_assignments', 'truck_maintenance_records', 'load_references',
  'load_reference_citations', 'parser_diagnostics', 'rate_con_ingest_queue',
] as const;

const B5C_TRIGGERED = [
  'active_dispatch', 'claim_flags', 'lease_terminations', 'load_charges',
  'truck_dot_inspections', 'truck_owners',
] as const;

/**
 * BATCH B6 GROUP 1 (2026-09-15) — the ELD / RODS hours-of-service set, the
 * first driver-written batch. rods_days / rods_events carry certification
 * locks and rods_divergences is append-only, so the three populated tables
 * took the constant-DEFAULT-then-DROP route: a backfill UPDATE on a certified
 * federal record is not a thing this project does. The derivation assertion
 * below is what proves the constant was right.
 */
const B6_ELD_RODS = [
  'rods_days', 'rods_events', 'rods_amendments', 'rods_divergences',
  'rods_correction_requests', 'rods_unlock_events', 'blank_log_acknowledgments',
  'eld_extension_requests', 'eld_malfunction_events', 'eld_devices',
] as const;

/**
 * B6 GROUP 2 (part) — the driver-written DOCUMENT tables. `operator_documents`
 * and `document_acknowledgments` are absent on purpose: a truck owner writes
 * both and resolves NO company, so a NOT NULL column would refuse his upload.
 */
const B6_DOCUMENTS = [
  'driver_vault_documents', 'driver_uploads', 'load_documents',
  'equipment_receipts', 'document_exceptions',
  // Held back on 2026-09-15 until the resolver learned its third source
  // (truck_owners), then migrated the same day in the truck-owner pass.
  'operator_documents', 'document_acknowledgments',
] as const;

/**
 * B6 GROUP 3 (2026-09-15) — the driver-written remainder: messaging, the
 * service library, forecasts, onboarding/ICA, roadside, preferences.
 * Twenty-eight take the generic `aa_stamp_tenant_company_id`.
 */
const B6_GROUP3_GENERIC = [
  'message_threads', 'thread_participants', 'message_reactions', 'messages',
  'message_notification_throttle', 'service_resource_bookmarks',
  'service_resource_completions', 'service_resource_views', 'service_help_requests',
  'roadside_stops', 'roadside_stop_documents', 'roadside_stop_violations',
  'documents', 'ica_driver_acknowledgments', 'ica_contracts',
  'notification_preferences', 'staff_ui_preferences', 'user_view_preferences',
  'operator_broadcast_recipients', 'onboard_assignment_sheets',
  'onboard_assignment_sheet_items', 'onboarding_status',
  'operator_offboarding_steps', 'contractor_pay_setup',
  'forecast_deductions', 'forecast_expenses', 'forecast_loads', 'load_stops',
] as const;

/**
 * The three history tables in Group 3 are written by SECURITY DEFINER logging
 * triggers, which run with no auth.uid(), so the generic resolver stamp would
 * refuse them. Each derives the company from its PARENT row instead.
 */
const B6_GROUP3_PARENT_DERIVED = {
  load_status_history: 'aa_stamp_company_from_load',
  load_change_history: 'aa_stamp_company_from_load',
  dispatch_status_history: 'aa_stamp_company_from_operator',
} as const;




/**
 * BATCH B4 — the 31 tables that held no rows. Empty means no backfill could
 * fail, which is why they went first; it does not make the column optional, so
 * every one of them is asserted the same way as a populated table.
 */
const B4_TABLES = [
  'broker_contacts', 'broker_do_not_load_history', 'broker_documents',
  'broker_factoring_history', 'broker_notes', 'cash_advances', 'company_documents',
  'deduction_installments', 'deductions', 'detention_claims', 'dispatch_deductions',
  'dispatch_settlement_rates_history', 'document_send_log',
  'driver_staff_contact_suppressions', 'driver_staff_contacts', 'ica_amendment_units',
  'ica_amendments', 'inspection_cycles', 'inspection_program_payments',
  'pandadoc_documents', 'pay_policy_assignments', 'rm_deposit_transactions',
  'rm_deposits', 'settlement_settings_history', 'staff_email_overrides',
  'staff_help_messages', 'staff_help_threads', 'staff_messaging_settings',
  'truck_plate_history', 'truck_state_permits', 'vacant_units',
] as const;

function resolverDef(): string {
  return psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_company_id'`).join('\n');
}

describe('current_company_id — the four protections', () => {
  itLive('resolves from company_members keyed on auth.uid(), not from carrier_profile', () => {
    const def = resolverDef();
    expect(def).toContain('company_members');
    expect(def).toContain('auth.uid()');
    // The defect being guarded: the old body read the first carrier row.
    expect(def).not.toMatch(/FROM\s+public\.carrier_profile/i);
    expect(def).not.toMatch(/ORDER BY created_at\s+LIMIT 1/i);
  });

  itLive('is SECURITY DEFINER with a pinned search_path', () => {
    const [row] = psql(`SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'current_company_id'`);
    const [secdef, config] = row.split('|');
    expect(secdef).toBe('true');
    expect(config).toContain('search_path=public');
  });

  itLive('FAILS CLOSED — the ONLY three sources are membership, own operator row, own truck_owners row', () => {
    // Comments are stripped: the body's own comment NAMES the protections, and
    // asserting against commentary would pass on a function that says the right
    // thing and does the wrong one — the exact shape of the defect being guarded.
    const code = resolverDef().replace(/--[^\n]*/g, '');
    // 2026-09-14: driver tenancy. 2026-09-15: truck-owner tenancy. A COALESCE
    // now exists, but it may only fall from membership to the caller's OWN
    // operator row and then his OWN truck_owners row — never to a carrier.
    expect(code).not.toMatch(/carrier_profile/i);
    const sources = code.match(/FROM\s+public\.(\w+)/gi) ?? [];
    expect(sources.map(s => s.split('.')[1].toLowerCase()).sort())
      .toEqual(['company_members', 'operators', 'truck_owners']);
    // Both non-membership branches are keyed on the caller, not open.
    expect(code).toMatch(/operators\s+o\s+WHERE\s+o\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(code).toMatch(/truck_owners\s+t\s+WHERE\s+t\.user_id\s*=\s*auth\.uid\(\)/i);
    // No third fallback smuggled into the COALESCE.
    expect((code.match(/coalesce/gi) ?? []).length).toBe(1);
  });

  itLive('MEMBERSHIP FIRST — the membership branch precedes the operator branch', () => {
    // One person (the owner) is both a member and an operator. Their two
    // companies are identical today, so DATA cannot distinguish precedence;
    // only the body's order can, which is why it is asserted structurally.
    const code = resolverDef().replace(/--[^\n]*/g, '');
    expect(code.indexOf('company_members')).toBeGreaterThan(-1);
    expect(code.indexOf('company_members')).toBeLessThan(code.search(/public\.operators/i));
  });

  /**
   * Reasoned allowlist: policies that scope on `current_company_id()` WITHOUT a
   * role test. Each entry must confer no capability beyond reading the caller's
   * own company identity. Nothing that touches money, loads or settlements may
   * be added here.
   */
  const COMPANY_SCOPED_WITHOUT_ROLE = [
    // Read-only carrier identity. A DRIVER must read it — carrierIdentity.ts
    // blocks certifying a log without the cached carrier name, USDOT and
    // terminal address. Writes to this table still require management/owner.
    'carrier_profile | Callers read only their own carrier profile',
    // Staff-gated, but through `is_staff(auth.uid())` rather than `has_role`,
    // which is what the query above matches on. Read-only: the typed name,
    // title and signature image of the caller's own carrier. Every write policy
    // on this table still requires management or owner.
    'carrier_signature_settings | Staff can view carrier signature settings',
  ];


  itLive('no billing policy admits a caller merely because a company resolves', () => {
    // The resolver widened WHO resolves. It must not widen WHAT anyone may do:
    // every company-scoped policy must ALSO test a staff role, unless it is on
    // the reasoned allowlist above.
    const offenders = psql(`SELECT tablename || ' | ' || policyname FROM pg_policies
      WHERE schemaname = 'public'
        AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%current_company_id%'
        AND (coalesce(qual,'') || coalesce(with_check,'')) NOT LIKE '%has_role%'
      ORDER BY 1`).filter(r => !COMPANY_SCOPED_WITHOUT_ROLE.includes(r));
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  itLive('the allowlisted policies are SELECT-only', () => {
    for (const entry of COMPANY_SCOPED_WITHOUT_ROLE) {
      const [table, name] = entry.split(' | ');
      const cmds = psql(`SELECT cmd FROM pg_policies WHERE schemaname = 'public'
        AND tablename = '${table}' AND policyname = '${name}'`);
      expect(cmds, entry).toEqual(['SELECT']);
    }
  });




  itLive('is not reachable by anon or PUBLIC, only by signed-in roles', () => {
    const grantees = psql(`SELECT DISTINCT grantee FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public' AND routine_name = 'current_company_id'`);
    expect(grantees).not.toContain('PUBLIC');
    expect(grantees).not.toContain('anon');
  });
});

describe('company_members — membership is not a user assertion', () => {
  itLive('has RLS on, no user-writable policy, and no INSERT/UPDATE/DELETE grant to authenticated', () => {
    const rls = psql(`SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.company_members'::regclass`);
    expect(rls).toEqual(['true']);

    const writable = psql(`SELECT policyname || '|' || cmd FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'company_members' AND cmd <> 'SELECT'`);
    expect(writable).toEqual([]);

    const privs = psql(`SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'company_members' AND grantee = 'authenticated'
      ORDER BY privilege_type`);
    expect(privs.filter(p => p !== 'SELECT')).toEqual([]);
  });

  itLive('is unique on (user_id, company_id) and points at carrier_profile', () => {
    const cons = psql(`SELECT conname || '|' || contype::text || '|' || coalesce(confrelid::regclass::text, '')
      FROM pg_constraint WHERE conrelid = 'public.company_members'::regclass ORDER BY conname`);
    expect(cons.some(c => c.includes('|u|'))).toBe(true);
    expect(cons.some(c => c.endsWith('|f|carrier_profile'))).toBe(true);
  });

  itLive('holds a row for the owner, so the owner never loses billing access', () => {
    const [count] = psql(`SELECT count(*)::text FROM public.company_members cm
      JOIN public.user_roles ur ON ur.user_id = cm.user_id AND ur.role = 'owner'`);
    expect(Number(count)).toBeGreaterThan(0);
  });

  /**
   * HARNESS LIMIT, stated rather than worked around: this role may not call
   * `current_company_id()` directly (`permission denied for function
   * current_company_id` — only `authenticated` and `service_role` hold EXECUTE)
   * and may not `SET ROLE authenticated`. So the resolver's answer is observed
   * where it actually matters — through the definer stamp trigger on a real
   * insert. Both probes run inside a transaction that is rolled back.
   */
  itLive('a session with no membership cannot write a billing row — the stamp is NULL and refused', () => {
    let err = '';
    try {
      execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN;
        SELECT set_config('request.jwt.claims',
          json_build_object('sub', '00000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')::text, true);
        INSERT INTO public.invoices (load_id, invoice_number, billing_path, amount)
        VALUES ((SELECT l.id FROM public.loads l
                  WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.load_id = l.id) LIMIT 1),
                'ST-SCRATCH-TENANCY', 'factored', 1);
        ROLLBACK;`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const x = e as { stderr?: string; stdout?: string };
      err = `${x.stderr ?? ''}${x.stdout ?? ''}`;
    }
    expect(err).toContain('null value in column "company_id"');
    expect(err).toContain('violates not-null constraint');
  });

  itLive('a member IS stamped with that member’s company, and a supplied company is overridden', () => {
    const [stamped] = psql(`BEGIN;
      SELECT set_config('request.jwt.claims',
        json_build_object('sub', (SELECT user_id FROM public.company_members ORDER BY created_at LIMIT 1),
                          'role', 'authenticated')::text, true);
      INSERT INTO public.invoices (company_id, load_id, invoice_number, billing_path, amount)
      VALUES ((SELECT id FROM public.carrier_profile ORDER BY created_at LIMIT 1),
              (SELECT l.id FROM public.loads l
                WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.load_id = l.id) LIMIT 1),
              'ST-SCRATCH-TENANCY', 'factored', 1)
      RETURNING company_id::text;
      ROLLBACK;`).filter(l => /^[0-9a-f-]{36}$/.test(l));
    const [expected] = psql(`SELECT company_id::text FROM public.company_members ORDER BY created_at LIMIT 1`);
    expect(stamped).toBe(expected);
  });
});


/**
 * CROSS-TENANT READ IN A FEDERAL RECORD PATH (2026-09-13).
 *
 * `recompute_eld_extension_projection` used to read the terminal timezone with
 * `SELECT home_terminal_timezone FROM carrier_profile LIMIT 1` and then
 * `COALESCE(v_tz, 'America/Chicago')`. With two companies that stamps one
 * company's timezone onto the other's §395.8 record, changing when a driver's
 * hours are calculated to have started. It now resolves the timezone from the
 * USDOT snapshotted on the event itself and REFUSES when it cannot — the same
 * fail-closed shape as the step-1 resolver.
 */
describe('recompute_eld_extension_projection — the record’s own company, or refusal', () => {
  const projectionDef = () => psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recompute_eld_extension_projection'`).join('\n');

  itLive('does not read the first carrier row and does not default the timezone', () => {
    const code = projectionDef().replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/FROM\s+public\.carrier_profile\s+LIMIT\s+1/i);
    expect(code).not.toMatch(/COALESCE\s*\(\s*v_tz/i);
    expect(code).not.toContain("'America/Chicago'");
  });

  itLive('resolves the carrier by the USDOT snapshotted on the event, and RAISEs when it cannot', () => {
    const code = projectionDef();
    expect(code).toMatch(/carrier_usdot/);
    expect(code).toMatch(/usdot_number\s*=/i);
    // Two refusals: no snapshot, and no carrier matching the snapshot.
    expect(code.match(/RAISE EXCEPTION/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  itLive('USDOT is GLOBALLY unique, so the lookup can only ever match one company', () => {
    const idx = psql(`SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'carrier_profile'
        AND indexname = 'carrier_profile_usdot_unique'`);
    expect(idx.length).toBe(1);
    expect(idx[0]).toMatch(/UNIQUE INDEX .* \(usdot_number\)/);
  });

  itLive('is not reachable by anon or authenticated — service_role and triggers only', () => {
    const grantees = psql(`SELECT DISTINCT grantee FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public' AND routine_name = 'recompute_eld_extension_projection'`);
    expect(grantees).not.toContain('PUBLIC');
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('authenticated');
  });
});

/**
 * BATCH B2 PART ONE — `company_id` on operators, brokers, facilities.
 *
 * The column is only a boundary if nothing can write it and nothing can leave
 * it null. These assertions are live-catalog, not migration-text: a column
 * altered out of band reads correct in the files and wrong here.
 */
describe('tenancy batch B2 part one — operators, brokers, facilities', () => {
  const TABLES = ['operators', 'brokers', 'facilities'] as const;

  itLive('company_id is NOT NULL with no default on all three', () => {
    const rows = psql(`SELECT a.attrelid::regclass::text || ' ' || a.attnotnull::text || ' ' ||
        a.atthasdef::text || ' ' || COALESCE(pg_get_expr(d.adbin, d.adrelid), 'none')
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attname = 'company_id'
        AND a.attrelid IN ('public.operators'::regclass, 'public.brokers'::regclass,
                           'public.facilities'::regclass)
      ORDER BY 1`);
    expect(rows.sort()).toEqual(
      ['brokers true false none', 'facilities true false none', 'operators true false none'],
    );
  });

  itLive('every row carries the live carrier id, and none is null', () => {
    for (const t of TABLES) {
      const row = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(DISTINCT company_id)::text || ' ' ||
          bool_and(company_id = (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toEqual(['0 1 true']);
    }
  });

  itLive('each table stamps company_id server-side on insert', () => {
    const rows = psql(`SELECT t.tgrelid::regclass::text FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgname = 'aa_stamp_tenant_company_id'
        AND t.tgenabled = 'O' AND t.tgrelid IN ('public.operators'::regclass,
          'public.brokers'::regclass, 'public.facilities'::regclass) ORDER BY 1`);
    expect(rows.sort()).toEqual(['brokers', 'facilities', 'operators']);
  });

  itLive('the stamp refuses rather than defaulting, and clients cannot call it', () => {
    const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'stamp_tenant_company_id'`).join('\n');
    expect(code).toMatch(/SECURITY DEFINER/);
    expect(code).toMatch(/search_path TO 'public', 'extensions'/);
    expect(code).toMatch(/RAISE\s+EXCEPTION/);
    // No fallback to "the first carrier row".
    expect(code).not.toMatch(/FROM\s+public\.carrier_profile/i);
    const grantees = psql(`SELECT DISTINCT grantee FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public' AND routine_name = 'stamp_tenant_company_id'`);
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('authenticated');
  });

  itLive('the facilities duplicate rule is PER-COMPANY, leading with company_id', () => {
    const idx = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND tablename = 'facilities' AND indexdef ILIKE '%UNIQUE%' AND indexname <> 'facilities_pkey'`);
    expect(idx.length).toBe(1);
    expect(idx[0]).toMatch(/uq_facilities_company_name_city_state_active/);
    expect(idx[0]).toMatch(/\(company_id,/);
  });

  itLive('operators keeps exactly one GLOBAL unique index besides its key', () => {
    const idx = psql(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      AND tablename IN ('operators', 'brokers') AND indexdef ILIKE '%UNIQUE%' ORDER BY 1`);
    expect(idx).toEqual(['brokers_pkey', 'operators_pkey', 'operators_user_id_key']);
  });
});

/**
 * BATCH B2 PART TWO — `company_id` on user_roles, loads, equipment_items.
 *
 * `applications` is deliberately NOT here: it is written by unauthenticated
 * applicants, who hold neither a membership row nor service_role, so neither
 * sanctioned stamping shape fits it. It stays global until that is decided.
 *
 * The three uniqueness rules below are the ones that made a second tenant
 * impossible: one owner globally, one ST- load number globally, one device
 * serial globally.
 */
describe('tenancy batch B2 part two — user_roles, loads, equipment_items', () => {
  const TABLES = ['user_roles', 'loads', 'equipment_items'] as const;

  itLive('company_id is NOT NULL with no default on all three', () => {
    const rows = psql(`SELECT a.attrelid::regclass::text || ' ' || a.attnotnull::text || ' ' ||
        a.atthasdef::text
      FROM pg_attribute a
      WHERE a.attname = 'company_id'
        AND a.attrelid IN ('public.user_roles'::regclass, 'public.loads'::regclass,
                           'public.equipment_items'::regclass)
      ORDER BY 1`);
    expect(rows.sort()).toEqual(
      ['equipment_items true false', 'loads true false', 'user_roles true false'],
    );
  });

  itLive('every row carries the live carrier id, and none is null', () => {
    for (const t of TABLES) {
      const row = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(DISTINCT company_id)::text || ' ' ||
          bool_and(company_id = (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toEqual(['0 1 true']);
    }
  });

  itLive('every stamped table shares one trigger name, sorting ahead of validation', () => {
    const rows = psql(`SELECT t.tgrelid::regclass::text FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgname = 'aa_stamp_tenant_company_id'
        AND t.tgenabled = 'O' ORDER BY 1`);
    // Six from B2, the two singleton carriers from B3, the 31 empty tables from
    // B4. A new stamped table must be added here deliberately, so an accidental
    // stamp is a red suite.
    expect(rows.sort()).toEqual([
      ...B2_B3_STAMPED, ...B4_TABLES, ...B5_SINGLETONS,
      ...B5B_SETTINGS, ...B5B_SETTLEMENTS, ...B5C_PLAIN, ...B5C_TRIGGERED,
      ...B6_ELD_RODS, ...B6_DOCUMENTS, ...B6_GROUP3_GENERIC,
    ].sort());
    // The equipment serial guard reads NEW.company_id, so the stamp must fire
    // first. BEFORE triggers fire alphabetically; 'aa_' guarantees it.
    const before = psql(`SELECT t.tgname FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgrelid = 'public.equipment_items'::regclass
        AND (t.tgtype & 2) = 2 AND (t.tgtype & 4) = 4 ORDER BY t.tgname`);
    expect(before[0]).toBe('aa_stamp_tenant_company_id');
  });

  itLive('one owner PER COMPANY, not one owner globally', () => {
    const [idx] = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'user_roles_single_owner'`);
    expect(idx).toMatch(/\(company_id, role\)/);
    expect(idx).toMatch(/WHERE \(role = 'owner'/);
  });

  itLive('load numbers restart per company', () => {
    const idx = psql(`SELECT indexname || ' ' || indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'loads' AND indexdef ILIKE '%UNIQUE%'
      ORDER BY 1`);
    expect(idx.some(i => i.startsWith('loads_pkey'))).toBe(true);
    // The old global load_number key must be gone, not merely shadowed.
    expect(idx.some(i => i.startsWith('loads_load_number_key'))).toBe(false);
    const scoped = idx.find(i => i.startsWith('loads_company_load_number_key'));
    expect(scoped).toBeTruthy();
    expect(scoped).toMatch(/\(company_id, load_number\)/);
  });

  itLive('both equipment serial indexes lead with company_id', () => {
    const idx = psql(`SELECT indexname || ' ' || indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'equipment_items'
        AND indexname IN ('idx_equipment_items_canonical_serial_uniq',
                          'idx_equipment_items_serial_type') ORDER BY 1`);
    expect(idx.length).toBe(2);
    for (const i of idx) expect(i).toMatch(/\(company_id,/);
  });

  itLive('the serial collision trigger is scoped to the company too', () => {
    const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'enforce_equipment_serial_uniqueness'`).join('\n');
    // An index scoped per company plus a trigger scoped globally would report a
    // collision against inventory the caller cannot see.
    expect(code).toMatch(/ei\.company_id\s*=\s*NEW\.company_id/);
    expect(code).toMatch(/OLD\.company_id\s*=\s*NEW\.company_id/);
  });

  itLive('the owner functions assign and transfer within one company', () => {
    for (const fn of ['bootstrap_assign_owner', 'transfer_owner']) {
      const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fn}'`).join('\n');
      expect(code, fn).toMatch(/company_id/);
      // No "ORDER BY created_at LIMIT 1" carrier pick: bootstrap uses a bare
      // scalar subquery, which raises 21000 once a second carrier exists.
      expect(code, fn).not.toMatch(/ORDER BY created_at\s+LIMIT 1/i);
    }
  });

  itLive('applications is still GLOBAL, and its email rule is untouched', () => {
    const cols = psql(`SELECT a.attname FROM pg_attribute a
      WHERE a.attrelid = 'public.applications'::regclass AND a.attname = 'company_id'`);
    expect(cols).toEqual([]);
    const [idx] = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'applications_email_non_draft_unique'`);
    expect(idx).toBeTruthy();
    expect(idx).not.toMatch(/company_id/);
  });
});

/**
 * BATCH B3 — the two remaining singleton constraints.
 *
 * These two indexes were the reason the fictitious company could not exist: a
 * global "one default pay policy" and a global "one pending owner transfer"
 * meant company A's rows blocked company B's. Both are now per company.
 *
 * `initiate_owner_transfer` is checked as well as the index, because the same
 * rule is written twice — a per-company index with a globally-scoped body check
 * would refuse the second company before the index ever saw the row.
 */
describe('tenancy batch B3 — pay_policies, owner_transfers', () => {
  const TABLES = ['pay_policies', 'owner_transfers'] as const;

  itLive('company_id is NOT NULL with no default on both', () => {
    const rows = psql(`SELECT a.attrelid::regclass::text || ' ' || a.attnotnull::text || ' ' ||
        a.atthasdef::text
      FROM pg_attribute a
      WHERE a.attname = 'company_id'
        AND a.attrelid IN ('public.pay_policies'::regclass, 'public.owner_transfers'::regclass)
      ORDER BY 1`);
    expect(rows.sort()).toEqual(['owner_transfers true false', 'pay_policies true false']);
  });

  itLive('both reference carrier_profile with ON DELETE RESTRICT', () => {
    for (const t of TABLES) {
      const rows = psql(`SELECT c.confdeltype FROM pg_constraint c
        WHERE c.conrelid = 'public.${t}'::regclass AND c.contype = 'f'
          AND c.confrelid = 'public.carrier_profile'::regclass`);
      expect(rows, t).toEqual(['r']);
    }
  });

  itLive('no row is null and none points off the live carrier', () => {
    for (const t of TABLES) {
      const row = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toEqual(['0 0']);
    }
  });

  itLive('one default pay policy PER COMPANY', () => {
    const [idx] = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'pay_policies_single_company_default'`);
    expect(idx).toMatch(/\(company_id, is_company_default\)/);
    expect(idx).toMatch(/WHERE is_company_default/);
  });

  itLive('one pending owner transfer PER COMPANY', () => {
    const [idx] = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'owner_transfers_single_pending'`);
    expect(idx).toMatch(/\(company_id, status\)/);
    expect(idx).toMatch(/WHERE \(status = 'pending'/);
  });

  itLive('initiate_owner_transfer checks the pending rule within one company', () => {
    const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'initiate_owner_transfer'`).join('\n');
    expect(code).toMatch(/current_company_id\(\)/);
    // Both the expiry sweep and the pending check must name the company.
    const scoped = code.match(/company_id = v_company/g) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(2);
    expect(code).toMatch(/no company membership/);
  });

  itLive('neither table carries any other unique index', () => {
    const rows = psql(`SELECT i.indexrelid::regclass::text FROM pg_index i
      WHERE i.indrelid IN ('public.pay_policies'::regclass, 'public.owner_transfers'::regclass)
        AND i.indisunique ORDER BY 1`);
    expect(rows.sort()).toEqual([
      'owner_transfers_pkey', 'owner_transfers_single_pending',
      'pay_policies_pkey', 'pay_policies_single_company_default',
    ]);
  });
});

/**
 * `carrier_profile` READ SCOPE — 2026-09-14.
 *
 * The read policy was `USING (true)` for as long as a driver could not resolve a
 * company: `hydrate.ts` caches the seven carrier fields AS THE SIGNED-IN
 * OPERATOR, and `carrierIdentity.ts` blocks federal record creation without that
 * cache. Once the resolver gained the operator fallback the policy could be
 * scoped, and it is the single predicate `id = current_company_id()` — the
 * resolver does membership-then-operator internally.
 *
 * What this guards: someone widening the policy back to `true` (or adding an
 * anon grant) so a second company's carrier row becomes visible to another
 * company's driver.
 */
describe('carrier_profile read scope', () => {
  itLive('the SELECT policy is company-scoped and nothing reads USING (true)', () => {
    const rows = psql(`SELECT policyname || '|' || coalesce(qual, '') FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'carrier_profile' AND cmd = 'SELECT'`);
    expect(rows).toHaveLength(1);
    const [, qual] = rows[0].split('|');
    expect(qual).toMatch(/current_company_id\(\)/);
    expect(qual.trim()).not.toBe('true');
  });

  itLive('every carrier_profile policy is authenticated-only, and anon holds no table grant', () => {
    const roles = psql(`SELECT DISTINCT unnest(roles) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'carrier_profile'`);
    expect(roles.sort()).toEqual(['authenticated']);
    const [acl] = psql(`SELECT coalesce(relacl::text, '') FROM pg_class
      WHERE oid = 'public.carrier_profile'::regclass`);
    expect(acl).not.toMatch(/\banon=/);
    // service_role bypasses RLS, so the edge-function readers are unaffected —
    // that is a property of the ROLE, asserted here so it is not assumed.
    const [bypass] = psql(`SELECT rolbypassrls::text FROM pg_roles WHERE rolname = 'service_role'`);
    expect(bypass).toBe('true');
  });

  itLive('every operator with a login can resolve a company, or drivers lose their carrier cache', () => {
    const [row] = psql(`SELECT count(*) FILTER (WHERE user_id IS NOT NULL)::text || ' ' ||
      count(*) FILTER (WHERE user_id IS NOT NULL AND company_id IS NULL)::text
      FROM public.operators`);
    const [withLogin, unresolvable] = row.split(' ').map(Number);
    expect(withLogin).toBeGreaterThan(0);
    expect(unresolvable).toBe(0);
  });
});

/**
 * BATCH B4 — `company_id` on the 31 tables that held no rows.
 *
 * All 31 are written on staff-authenticated paths, so Shape 1 (the trigger
 * resolves the caller's company) applies throughout: no anonymous or
 * service-role-only writer among them.
 *
 * Their unique indexes are deliberately left GLOBAL: each keys on an id that is
 * itself company-owned (`broker_id`, `operator_id`, `deduction_id`, `cycle_id`,
 * `user_id`), so a second company cannot collide on one without owning the
 * parent. That reasoning is asserted rather than trusted — if any of these ever
 * keys on something a tenant chooses (a name, a code), it must be re-scoped.
 */
describe('tenancy batch B4 — the 31 empty tables', () => {
  itLive('company_id is NOT NULL with no default on all 31', () => {
    const rows = psql(`SELECT a.attrelid::regclass::text || ' ' || a.attnotnull::text || ' ' ||
        a.atthasdef::text || ' ' || COALESCE(pg_get_expr(d.adbin, d.adrelid), 'none')
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attname = 'company_id' AND NOT a.attisdropped
        AND a.attrelid = ANY (ARRAY[${B4_TABLES.map(t => `'public.${t}'::regclass`).join(', ')}])
      ORDER BY 1`);
    expect(rows.length).toBe(B4_TABLES.length);
    for (const r of rows) expect(r).toMatch(/ true false none$/);
  });

  itLive('all 31 reference carrier_profile with ON DELETE RESTRICT', () => {
    const rows = psql(`SELECT c.conrelid::regclass::text FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'public.carrier_profile'::regclass
        AND c.confdeltype = 'r'
        AND c.conrelid = ANY (ARRAY[${B4_TABLES.map(t => `'public.${t}'::regclass`).join(', ')}])
      ORDER BY 1`);
    expect(rows.length).toBe(B4_TABLES.length);
  });

  itLive('no B4 table has a unique index keyed on tenant-chosen text', () => {
    const rows = psql(`SELECT tablename || ' ' || indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef ILIKE '%UNIQUE%'
        AND indexname NOT LIKE '%_pkey'
        AND tablename = ANY (ARRAY[${B4_TABLES.map(t => `'${t}'`).join(', ')}])
      ORDER BY 1`);
    // Every one of these keys on an id owned by a company, never on a name or
    // code a second tenant could pick independently.
    expect(rows).toEqual([
      'broker_contacts broker_contacts_one_primary_idx',
      'deduction_installments deduction_installments_deduction_id_installment_number_key',
      'driver_staff_contact_suppressions driver_staff_contact_suppressions_driver_id_staff_id_key',
      'driver_staff_contacts driver_staff_contacts_driver_id_staff_id_key',
      'ica_amendments ica_amendments_operator_id_amendment_number_key',
      'inspection_cycles inspection_cycles_operator_id_cycle_year_cycle_month_key',
      'inspection_program_payments inspection_payments_one_per_cycle',
      'inspection_program_payments inspection_payments_one_per_stop',
      'rm_deposits rm_deposits_operator_id_key',
      'staff_email_overrides staff_email_overrides_user_id_category_key',
      'truck_state_permits truck_state_permits_operator_id_state_code_key',
    ]);
  });

  itLive('no B4 row points off the live carrier', () => {
    for (const t of B4_TABLES) {
      const [row] = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toBe('0 0');
    }
  });
});

/**
 * BATCH B5 PART ONE — the two carrier-data singletons, and the declarations.
 *
 * `settlement_settings` was one row globally because its PRIMARY KEY was a
 * boolean column with `CHECK (singleton)`; `carrier_signature_settings` was one
 * row globally because of `UNIQUE ((true))`. A second carrier could have
 * neither its own pay rules nor its own signature block until both moved.
 */
describe('tenancy B5 part one — settlement settings and the signature block', () => {
  itLive('both singleton tables carry a required, undefaulted, RESTRICT-ed company', () => {
    for (const t of B5_SINGLETONS) {
      const [row] = psql(`SELECT a.attnotnull::text || ' ' || a.atthasdef::text || ' ' ||
          (SELECT count(*)::text FROM pg_constraint k
            WHERE k.conrelid = c.oid AND k.contype = 'f'
              AND k.confrelid = 'public.carrier_profile'::regclass
              AND k.confdeltype = 'r')
        FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
        WHERE c.oid = 'public.${t}'::regclass`);
      expect(row, t).toBe('true false 1');
    }
  });

  itLive('settlement settings are keyed PER COMPANY, and the singleton CHECK is gone', () => {
    const checks = psql(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.settlement_settings'::regclass
        AND conname = 'settlement_settings_singleton_check'`);
    expect(checks).toEqual([]);
    const [pk] = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'settlement_settings_pkey'`);
    expect(pk).toMatch(/\(company_id\)/);
  });

  itLive('the signature block is unique PER COMPANY, not UNIQUE ((true))', () => {
    const idx = psql(`SELECT indexname || ' ' || indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'carrier_signature_settings'
        AND indexdef ILIKE '%UNIQUE%' ORDER BY 1`);
    expect(idx.some(i => i.startsWith('carrier_signature_settings_singleton '))).toBe(false);
    const scoped = idx.find(i => i.startsWith('carrier_signature_settings_company_unique'));
    expect(scoped).toBeTruthy();
    expect(scoped).toMatch(/\(company_id\)/);
  });

  itLive('every reader of the settings row names the caller company', () => {
    for (const fn of ['approve_accessorial_adjustment', 'my_rm_deposit', 'my_fuel_transactions']) {
      const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fn}'`).join('\n');
      expect(code, fn).toMatch(/settlement_settings/);
      // Neither "the" settings row nor "one" settings row: the caller's.
      expect(code, fn).not.toMatch(/settlement_settings\s+\w*\s*(WHERE singleton|LIMIT 1)/);
      expect(code, fn).toMatch(/company_id = public\.current_company_id\(\)/);
    }
  });

  itLive('policies on both tables scope to the caller company', () => {
    for (const t of B5_SINGLETONS) {
      const rows = psql(`SELECT policyname || ' | ' || coalesce(qual, '') || ' | ' ||
          coalesce(with_check, '') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = '${t}' ORDER BY 1`);
      expect(rows.length, t).toBeGreaterThan(0);
      for (const r of rows) expect(r, t).toMatch(/current_company_id\(\)/);
    }
  });

  itLive('email_send_state stays GLOBAL, deliberately', () => {
    // Declared GLOBAL 2026-09-13: the send cursor belongs to the shared sending
    // domain, not to a carrier. Adding company_id here needs a new decision.
    const cols = psql(`SELECT a.attname FROM pg_attribute a
      WHERE a.attrelid = 'public.email_send_state'::regclass AND a.attname = 'company_id'`);
    expect(cols).toEqual([]);
    const [chk] = psql(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.email_send_state'::regclass
        AND conname = 'email_send_state_id_check'`);
    expect(chk).toBe('email_send_state_id_check');
  });

  itLive('the 18 GLOBAL tables carry no company_id', () => {
    for (const t of GLOBAL_TABLES) {
      const cols = psql(`SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = 'public.${t}'::regclass AND a.attname = 'company_id'`);
      expect(cols, t).toEqual([]);
    }
    expect(GLOBAL_TABLES.length).toBe(18);
  });

  itLive('the 8 DEFERRED content tables are untouched, and that is deliberate', () => {
    for (const t of DEFERRED_TABLES) {
      const cols = psql(`SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = 'public.${t}'::regclass AND a.attname = 'company_id'`);
      expect(cols, t).toEqual([]);
    }
    expect(DEFERRED_TABLES.length).toBe(8);
  });
});

/**
 * BATCH B5 PART TWO (2026-09-15) — the per-carrier settings tables and the
 * settlement family. Group B is immutability-locked throughout, so it took the
 * approved constant-DEFAULT route; these assertions are what proves the locks
 * are still ENABLED afterwards rather than left disabled by a backfill.
 */
describe('tenancy B5 part two — settings and the settlement family', () => {
  itLive('all 19 carry a required, undefaulted, RESTRICT-ed company with a stamp', () => {
    for (const t of [...B5B_SETTINGS, ...B5B_SETTLEMENTS]) {
      const [row] = psql(`SELECT a.attnotnull::text || ' ' || a.atthasdef::text || ' ' ||
          COALESCE(pg_get_expr(d.adbin, d.adrelid), 'none') || ' ' ||
          (SELECT count(*)::text FROM pg_constraint k
            WHERE k.conrelid = c.oid AND k.contype = 'f'
              AND k.confrelid = 'public.carrier_profile'::regclass
              AND k.confdeltype = 'r') || ' ' ||
          (SELECT count(*)::text FROM pg_trigger g
            WHERE g.tgrelid = c.oid AND g.tgname = 'aa_stamp_tenant_company_id'
              AND g.tgenabled = 'O')
        FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE c.oid = 'public.${t}'::regclass`);
      expect(row, t).toBe('true false none 1 1');
    }
    expect(B5B_SETTINGS.length + B5B_SETTLEMENTS.length).toBe(19);
  });

  itLive('every row of all 19 belongs to the live carrier', () => {
    for (const t of [...B5B_SETTINGS, ...B5B_SETTLEMENTS]) {
      const [row] = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toBe('0 0');
    }
  });

  itLive('the four tenant-chosen unique keys are now scoped per company', () => {
    const rows = psql(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%company_id%'
        AND tablename IN ('company_settings', 'inspection_binder_order',
                          'carrier_notification_settings', 'notification_role_defaults',
                          'dispatch_settlements')
      ORDER BY 1`);
    expect(rows).toEqual([
      'carrier_notification_settings_company_email_uniq',
      'company_settings_company_setting_key_uniq',
      'dispatch_settlements_company_payee_period_uniq',
      'inspection_binder_order_company_scope_uniq',
      'notification_role_defaults_company_role_category_uniq',
    ]);
  });

  itLive('the pre-existing global keys those replaced are gone', () => {
    const rows = psql(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'company_settings_setting_key_key', 'inspection_binder_order_scope_key',
        'carrier_notification_settings_email_key',
        'notification_role_defaults_role_category_key',
        'dispatch_settlements_payee_period_key')`);
    expect(rows).toEqual([]);
  });

  itLive('every settlement immutability lock is still ENABLED after the backfill', () => {
    const rows = psql(`SELECT c.relname || ' ' || g.tgname || ' ' || g.tgenabled::text
      FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT g.tgisinternal
        AND g.tgname LIKE '%immutab%'
        AND c.relname = ANY (ARRAY[${B5B_SETTLEMENTS.map(t => `'${t}'`).join(', ')}])
      ORDER BY 1`);
    expect(rows).toEqual([
      'dispatch_settlement_line_items enforce_dispatch_settlement_line_immutability O',
      'dispatch_settlement_load_contributions enforce_dispatch_settlement_contribution_immutability O',
      'dispatch_settlements enforce_dispatch_settlement_immutability O',
      'settlement_line_items enforce_settlement_line_immutability O',
      'settlement_withheld_loads enforce_settlement_withheld_immutability O',
      'settlements enforce_settlement_immutability O',
    ]);
  });
});

/**
 * THE THREE FEDERAL BREAKS (2026-09-14).
 *
 * `inspection_documents` and `inspection_document_versions` hold §396 inspection
 * records; `eld_sync_alerts` and `eld_malfunction_notifications` hold §395.8
 * ELD conditions. None of them could reach a company-scoped table through a
 * NOT NULL foreign key: the inspection pair carries `driver_id` with NO foreign
 * key at all, and the two ELD tables reach `operators` / `eld_malfunction_events`
 * only through a NULLABLE column. A wrong answer here is a federal record filed
 * under the wrong carrier, so each one owns its `company_id` outright.
 */
const FEDERAL_TABLES = [
  'eld_malfunction_notifications', 'eld_sync_alerts',
  'inspection_document_versions', 'inspection_documents',
] as const;

describe('the three federal breaks — inspection and ELD records own their carrier', () => {
  itLive('all four carry a required, undefaulted company with ON DELETE RESTRICT', () => {
    for (const t of FEDERAL_TABLES) {
      const [row] = psql(`SELECT a.attnotnull::text || ' ' || a.atthasdef::text || ' ' ||
          (SELECT count(*)::text FROM pg_constraint k
            WHERE k.conrelid = c.oid AND k.contype = 'f'
              AND k.confrelid = 'public.carrier_profile'::regclass
              AND k.confdeltype = 'r' AND k.conkey = ARRAY[a.attnum])
        FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
        WHERE c.oid = 'public.${t}'::regclass`);
      expect(row, t).toBe('true false 1');
    }
  });

  itLive('every federal row sits under the live carrier, none stranded', () => {
    for (const t of FEDERAL_TABLES) {
      const [row] = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toBe('0 0');
    }
  });

  itLive('each table stamps its own carrier server-side, and the trigger is ENABLED', () => {
    const expected: Record<string, string> = {
      inspection_documents: 'stamp_inspection_document_company_id',
      inspection_document_versions: 'stamp_inspection_document_version_company_id',
      eld_sync_alerts: 'stamp_eld_sync_alert_company_id',
      eld_malfunction_notifications: 'stamp_eld_malfunction_notification_company_id',
    };
    for (const t of FEDERAL_TABLES) {
      const rows = psql(`SELECT p.proname || ' ' || t.tgenabled::text
        FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND t.tgrelid = 'public.${t}'::regclass
          AND p.proname = '${expected[t]}'`);
      // 'O' = enabled for origin. A DISABLED stamp is a silently unstamped table.
      expect(rows, t).toEqual([`${expected[t]} O`]);
    }
  });

  itLive('no stamp defaults to a carrier: each refuses when it cannot derive one', () => {
    for (const fn of Object.values({
      d: 'stamp_inspection_document_company_id',
      v: 'stamp_inspection_document_version_company_id',
      a: 'stamp_eld_sync_alert_company_id',
      n: 'stamp_eld_malfunction_notification_company_id',
    })) {
      const def = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fn}'`).join('\n');
      expect(def, fn).toMatch(/SECURITY DEFINER/);
      expect(def, fn).toMatch(/SET search_path TO 'public', 'extensions'/);
      expect(def, fn).toMatch(/RAISE EXCEPTION/);
      // The defect being guarded: falling back to "the" carrier when the real
      // owner is unknown — exactly the ELD timezone defect, on federal records.
      expect(def, fn).not.toMatch(/FROM\s+public\.carrier_profile/i);
      expect(def, fn).not.toMatch(/LIMIT 1\s*\)?\s*;?\s*$/i);
    }
  });

  itLive('the version-history immutability trigger is back on after the backfill', () => {
    // The backfill could only run with this trigger suspended. Left disabled, the
    // §396 version history would become editable.
    const [row] = psql(`SELECT tgname || ' ' || tgenabled::text FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid = 'public.inspection_document_versions'::regclass
        AND tgname = 'trg_inspection_document_versions_immutable'`);
    expect(row).toBe('trg_inspection_document_versions_immutable O');
  });

  itLive('a driver still owns his own inspection documents, and only his own', () => {
    // Compliance check, not a tenancy check: a driver who cannot read or file his
    // own inspection record cannot comply. The insert policy requires the row to
    // name him as both subject and uploader.
    const rows = psql(`SELECT policyname || ' | ' || cmd || ' | ' ||
        coalesce(qual, '') || ' | ' || coalesce(with_check, '')
      FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'inspection_documents' ORDER BY 1`);
    const insert = rows.find(r => r.includes('| INSERT |'));
    expect(insert).toMatch(/driver_id = auth\.uid\(\)/);
    expect(insert).toMatch(/uploaded_by = auth\.uid\(\)/);
    const select = rows.find(r => r.includes('| SELECT |'));
    expect(select).toMatch(/driver_id = auth\.uid\(\)/);
  });
});

/**
 * BATCH B5 GROUP C (2026-09-15) — the plain staff-written remainder. The
 * derivation assertion is the one that matters: every row's company must equal
 * the company of the parent it hangs off, which is what proves the constant
 * default was correct rather than merely uniform.
 */
describe('tenancy B5 group C — the staff-written remainder', () => {
  itLive('all 17 carry a required, undefaulted, RESTRICT-ed company with a stamp', () => {
    for (const t of [...B5C_PLAIN, ...B5C_TRIGGERED]) {
      const [row] = psql(`SELECT a.attnotnull::text || ' ' || a.atthasdef::text || ' ' ||
          COALESCE(pg_get_expr(d.adbin, d.adrelid), 'none') || ' ' ||
          (SELECT count(*)::text FROM pg_constraint k
            WHERE k.conrelid = c.oid AND k.contype = 'f'
              AND k.confrelid = 'public.carrier_profile'::regclass
              AND k.confdeltype = 'r') || ' ' ||
          (SELECT count(*)::text FROM pg_trigger g
            WHERE g.tgrelid = c.oid AND g.tgname = 'aa_stamp_tenant_company_id'
              AND g.tgenabled = 'O')
        FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE c.oid = 'public.${t}'::regclass`);
      expect(row, t).toBe('true false none 1 1');
    }
    expect(B5C_PLAIN.length + B5C_TRIGGERED.length).toBe(17);
  });

  itLive('every row of all 17 belongs to the live carrier', () => {
    for (const t of [...B5C_PLAIN, ...B5C_TRIGGERED]) {
      const [row] = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toBe('0 0');
    }
  });

  itLive('every constant-default row agrees with the company derived from its parent', () => {
    const checks: Array<[string, string]> = [
      ['active_dispatch', 'JOIN public.operators p ON p.id = x.operator_id'],
      ['lease_terminations', 'JOIN public.operators p ON p.id = x.operator_id'],
      ['truck_dot_inspections', 'JOIN public.operators p ON p.id = x.operator_id'],
      ['truck_owners', 'JOIN public.operators p ON p.id = x.operator_id'],
      ['claim_flags', 'JOIN public.loads p ON p.id = x.load_id'],
      ['load_charges', 'JOIN public.loads p ON p.id = x.load_id'],
    ];
    for (const [t, join] of checks) {
      const [row] = psql(`SELECT count(*)::text || ' ' ||
          count(*) FILTER (WHERE x.company_id = p.company_id)::text
        FROM public.${t} x ${join}`);
      const [total, agree] = row.split(' ');
      expect(agree, t).toBe(total);
    }
  });

  itLive('the two tenant-chosen keys in this batch are scoped per company', () => {
    const rows = psql(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%company_id%'
        AND tablename IN ('equipment_serial_conflict_dismissals', 'rate_con_ingest_queue')
      ORDER BY 1`);
    expect(rows).toEqual([
      'equipment_serial_conflict_dismissals_company_key_uniq',
      'rate_con_ingest_queue_company_attachment_sha256_uniq',
    ]);
    const gone = psql(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'equipment_serial_conflict_dismissals_conflict_key_key',
        'rate_con_ingest_queue_attachment_sha256_key')`);
    expect(gone).toEqual([]);
  });

  itLive('the history and derivation triggers this batch avoided are still ENABLED', () => {
    const rows = psql(`SELECT c.relname || ' ' || g.tgname || ' ' || g.tgenabled::text
      FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT g.tgisinternal
        AND g.tgname IN ('trg_dispatch_status_history', 'trg_claim_flags_zz_history',
                         'enforce_lease_termination_void', 'trg_compute_dot_next_due')
      ORDER BY 1`);
    expect(rows).toEqual([
      'active_dispatch trg_dispatch_status_history O',
      'claim_flags trg_claim_flags_zz_history O',
      'lease_terminations enforce_lease_termination_void O',
      'truck_dot_inspections trg_compute_dot_next_due O',
    ]);
  });
});

/**
 * BATCH B6 GROUP 1 (2026-09-15) — the driver-written hours-of-service set.
 * These are federal records, so the derivation check matters more here than
 * anywhere: a row whose company disagrees with the driver who signed it is a
 * log attributed to the wrong carrier.
 */
describe('tenancy B6 group 1 — ELD / RODS', () => {
  itLive('all 10 carry a required, undefaulted, RESTRICT-ed company with a stamp', () => {
    for (const t of B6_ELD_RODS) {
      const [row] = psql(`SELECT a.attnotnull::text || ' ' || a.atthasdef::text || ' ' ||
          (SELECT count(*)::text FROM pg_constraint k
            WHERE k.conrelid = c.oid AND k.contype = 'f'
              AND k.confrelid = 'public.carrier_profile'::regclass
              AND k.confdeltype = 'r') || ' ' ||
          (SELECT count(*)::text FROM pg_trigger g
            WHERE g.tgrelid = c.oid AND g.tgname = 'aa_stamp_tenant_company_id'
              AND g.tgenabled = 'O')
        FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
        WHERE c.oid = 'public.${t}'::regclass`);
      expect(row, t).toBe('true false 1 1');
    }
    expect(B6_ELD_RODS.length).toBe(10);
  });

  itLive('every row belongs to the live carrier', () => {
    for (const t of B6_ELD_RODS) {
      const [row] = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text || ' ' ||
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile))::text
        FROM public.${t}`);
      expect(row, t).toBe('0 0');
    }
  });

  itLive('every constant-default row agrees with the company of the driver who owns it', () => {
    for (const t of ['rods_days', 'rods_correction_requests', 'blank_log_acknowledgments']) {
      const [row] = psql(`SELECT count(*)::text || ' ' ||
          count(*) FILTER (WHERE x.company_id <> o.company_id)::text
        FROM public.${t} x JOIN public.operators o ON o.id = x.operator_id`);
      const [joined, disagree] = row.split(' ');
      expect(disagree, t).toBe('0');
      // A row that joins to no operator would silently pass the check above.
      const [total] = psql(`SELECT count(*)::text FROM public.${t}`);
      expect(joined, t).toBe(total);
    }
  });

  itLive('the certification locks were never suspended to make room for a backfill', () => {
    const rows = psql(`SELECT t.tgrelid::regclass::text || ' ' || t.tgenabled::text
      FROM pg_trigger t WHERE NOT t.tgisinternal
        AND t.tgname IN ('rods_days_lock_update', 'rods_days_lock_delete',
                         'rods_events_lock', 'rods_divergences_append_only')
      ORDER BY 1`);
    // Every one of the four must be enabled; none may be 'D' (disabled).
    expect(rows.length).toBe(4);
    for (const r of rows) expect(r.endsWith(' O'), r).toBe(true);
  });
});

/**
 * SECURITY FINDING has_role_not_company_scoped (2026-09-15). The two role
 * functions ignored user_roles.company_id, so a staff role granted by ANY
 * carrier satisfied every staff-role RLS policy on every carrier's rows.
 */
describe('role checks are carrier-scoped', () => {
  for (const fn of ['has_role', 'is_staff']) {
    itLive(`${fn} compares the role's company against the caller's`, () => {
      // psql() splits on newlines, and a function body is many lines — rejoin
      // it, or every assertion below only ever sees the CREATE line.
      const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fn}'`).join('\n');
      expect(code).toContain('ur.company_id = public.current_company_id()');
      expect(code).toMatch(/SECURITY DEFINER/i);
      expect(code).toMatch(/search_path TO 'public'/i);
    });

    /**
     * 2026-09-15 (later). The escape used to be
     * `current_company_id() IS NULL OR ...`, which fired WHENEVER THE LOOKUP
     * FAILED — including for a signed-in user holding a role row but no
     * company_members and no operators row, whose role then passed for EVERY
     * company. It now names its case: service_role, the same distinction
     * stamp_tenant_company_id draws. Regressing to the NULL form must fail.
     */
    itLive(`${fn}'s escape names service_role and not a failed lookup`, () => {
      const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fn}'`).join('\n');
      expect(code).toContain("auth.role() = 'service_role'");
      expect(code).not.toMatch(/current_company_id\(\)\s+IS\s+NULL/i);
    });
  }

  itLive('no role row is company-less, and none disagrees with its holder', () => {
    const [row] = psql(`SELECT
        (SELECT count(*) FROM public.user_roles WHERE company_id IS NULL)::text || ' ' ||
        (SELECT count(*) FROM public.user_roles r JOIN public.company_members m
           ON m.user_id = r.user_id WHERE m.company_id <> r.company_id)::text || ' ' ||
        (SELECT count(*) FROM public.user_roles r JOIN public.operators o
           ON o.user_id = r.user_id WHERE o.company_id <> r.company_id)::text`);
    expect(row).toBe('0 0 0');
  });
});

/**
 * THE MEMBERSHIP GAP (2026-09-15, third pass of the day).
 *
 * Once the has_role/is_staff escape named service_role only, a staff role
 * granted to a user with NO company_members row stopped passing for every
 * company and started passing for NONE. Every path that mints a staff role
 * must therefore either write the membership row or refuse.
 */
describe('a staff role is never minted without a company membership', () => {
  itLive('assign_user_role refuses a staff role for a non-member of the caller company', () => {
    const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'assign_user_role'`).join('\n');
    expect(code).toContain('public.company_members');
    expect(code).toMatch(/cm\.company_id\s*=\s*v_company/);
    // The gate covers exactly the three staff roles; operators resolve their
    // company through their operator record and hold no membership by design.
    for (const r of ['management', 'dispatcher', 'onboarding_staff']) {
      expect(code).toContain(`'${r}'`);
    }
  });

  itLive('bootstrap_assign_owner seeds the first owner his membership row', () => {
    const code = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'bootstrap_assign_owner'`).join('\n');
    expect(code).toMatch(/INSERT INTO public\.company_members/i);
    expect(code).toContain("VALUES (p_user_id, v_company)");
  });

  itLive('every staff role row still has a membership for the same company', () => {
    const [row] = psql(`SELECT
        (SELECT count(*) FROM public.user_roles r
          WHERE r.role IN ('management','owner','dispatcher','onboarding_staff')
            AND NOT EXISTS (SELECT 1 FROM public.company_members m
                             WHERE m.user_id = r.user_id AND m.company_id = r.company_id))::text`);
    expect(row).toBe('0');
  });

  it('the three role-minting edge functions write company_members', () => {
    const files = [
      'supabase/functions/invite-staff/index.ts',
      'supabase/functions/get-staff-list/index.ts',
      'supabase/functions/bootstrap-admin/index.ts',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must upsert company_members alongside the role`).toContain(
        "from('company_members').upsert",
      );
    }
  });
});

/**
 * B6 GROUP 2 — driver-written DOCUMENT tables, 2026-09-15.
 *
 * Five of the seven candidates were migrated first. `operator_documents` and
 * `document_acknowledgments` were HELD BACK because both have a live
 * truck-owner write path, and a truck owner held neither a company_members row
 * nor an operators row, so current_company_id() resolved NULL for him and a
 * NOT NULL company_id would have refused his upload.
 *
 * CLOSED the same day: current_company_id() gained a THIRD source — his own
 * `truck_owners` row, read directly rather than walked to the operators he
 * owns, so an owner between hires still resolves. The two tables are therefore
 * migrated and the hold-back guard is retired; what remains is the guard that
 * the third source stays in place, below.
 */
describe('driver-written document tables are scoped to a carrier', () => {
  const MIGRATED = [...B6_DOCUMENTS];


  for (const t of MIGRATED) {
    itLive(`${t} has a NOT NULL company_id the server stamps`, () => {
      const [nullable] = psql(`SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='${t}' AND column_name='company_id'`);
      expect(nullable).toBe('NO');
      const [stamp] = psql(`SELECT count(*)::text FROM pg_trigger
        WHERE tgrelid='public.${t}'::regclass AND tgname='aa_stamp_tenant_company_id'`);
      expect(stamp).toBe('1');
      const [fk] = psql(`SELECT confdeltype FROM pg_constraint
        WHERE conname='${t}_company_id_fkey'`);
      expect(fk).toBe('r'); // ON DELETE RESTRICT
      const [orphans] = psql(`SELECT count(*)::text FROM public.${t} d
        WHERE NOT EXISTS (SELECT 1 FROM public.carrier_profile c WHERE c.id = d.company_id)`);
      expect(orphans).toBe('0');
    });
  }

  itLive('the resolver reads truck_owners DIRECTLY as its third source', () => {
    // resolverDef() joins the whole definition; psql() returns one row PER LINE,
    // so reading only its first element would test the word CREATE.
    const body = resolverDef().replace(/--[^\n]*/g, '');
    // Membership, then his own operator row, then his truck_owners row.
    expect(body.search(/public\.operators/i)).toBeLessThan(body.search(/public\.truck_owners/i));
    // Read directly off truck_owners.company_id — NOT walked to the operators
    // he owns, which would leave an owner between hires resolving to nothing.
    expect(body).toMatch(/t\.company_id\s+FROM\s+public\.truck_owners\s+t\s+WHERE\s+t\.user_id\s*=\s*auth\.uid\(\)/i);
    // Still fail-closed: no carrier_profile fallback.
    expect(body).not.toMatch(/carrier_profile/i);
  });

  itLive('every truck owner resolves a company from his own truck_owners row', () => {
    const [n] = psql(`SELECT count(*)::text FROM public.user_roles r
      WHERE r.role = 'truck_owner'
        AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = r.user_id)
        AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.user_id = r.user_id AND o.company_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.truck_owners t WHERE t.user_id = r.user_id AND t.company_id IS NOT NULL)`);
    expect(
      n,
      'a truck_owner role holder resolves to no company: his uploads and acknowledgments would be refused',
    ).toBe('0');
  });


  it('the service-role passenger-auth writer names the company explicitly', () => {
    const src = readFileSync('supabase/functions/finalize-passenger-auth/index.ts', 'utf8');
    expect(src).toContain("company_id: companyId");
    expect(src).toMatch(/from\('operators'\)[\s\S]{0,80}select\('company_id'\)/);
  });
});

/**
 * B6 GROUP 3 — the driver-written remainder, 2026-09-15. Messaging, the service
 * library, forecasts, onboarding/ICA, roadside and the person-owned preference
 * tables. `notifications` is deliberately absent: the record places it in B7.
 */
describe('B6 group 3 — the driver-written remainder is scoped to a carrier', () => {
  const ALL = [
    ...B6_GROUP3_GENERIC,
    ...(Object.keys(B6_GROUP3_PARENT_DERIVED) as (keyof typeof B6_GROUP3_PARENT_DERIVED)[]),
  ];

  // ONE connection for all 31 tables: this suite spawns a psql per query and the
  // pooler drops one connection per long run, which is noise, not evidence.
  itLive('all 31 tables carry a server-stamped NOT NULL company_id with a RESTRICT FK', () => {
    const list = ALL.map(t => `'${t}'`).join(',');
    const rows = psql(`
      WITH t(name) AS (VALUES ${ALL.map(t => `('${t}')`).join(',')})
      SELECT t.name || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, 'none')
             || ' ' || coalesce(k.confdeltype::text, '?')
        FROM t
        JOIN information_schema.columns c ON c.table_schema = 'public'
          AND c.table_name = t.name AND c.column_name = 'company_id'
        LEFT JOIN pg_constraint k ON k.conname = t.name || '_company_id_fkey'
       ORDER BY 1`);
    // NO surviving default: the trigger is the only source, so a client that
    // omits the column cannot land an unstamped row.
    expect(rows).toEqual([...ALL].sort().map(t => `${t} NO none r`));
    const [bad] = psql(`SELECT count(*)::text FROM (
      ${ALL.map(t => `SELECT company_id FROM public.${t}`).join(' UNION ALL ')}
    ) x WHERE x.company_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.carrier_profile c WHERE c.id = x.company_id)`);
    expect(bad, `orphan or null company_id among ${list}`).toBe('0');
  });

  itLive('the three history tables derive the company from their PARENT row', () => {
    for (const [table, trigger] of Object.entries(B6_GROUP3_PARENT_DERIVED)) {
      const [name] = psql(`SELECT tgname FROM pg_trigger
        WHERE NOT tgisinternal AND tgrelid='public.${table}'::regclass
          AND tgname LIKE 'aa_stamp%'`);
      expect(name, table).toBe(trigger);
    }
    // Written by logging triggers with no auth.uid(), so they must NOT depend on
    // the resolver — the parent row is the authority.
    for (const fn of ['stamp_company_from_load', 'stamp_company_from_operator']) {
      const def = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='${fn}'`).join('\n');
      expect(def, fn).not.toMatch(/current_company_id/i);
      expect(def, fn).toContain('search_path');
      expect(def, fn).toContain('SECURITY DEFINER');
    }
  });

  itLive('neither parent-derived stamp is executable by anon or authenticated', () => {
    for (const fn of ['stamp_company_from_load', 'stamp_company_from_operator']) {
      const rows = psql(`SELECT r.rolname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN (VALUES ('anon'), ('authenticated'), ('public')) AS r(rolname)
        WHERE n.nspname='public' AND p.proname='${fn}'
          AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')`);
      expect(rows, fn).toEqual([]);
    }
  });

  itLive('every person holding rows in the person-owned tables resolves a company', () => {
    // This is the check that caught the truck-owner lockout before it fired:
    // membership, own operator row, or own truck_owners row - one of the three.
    // ONE connection for all nine tables: the pooler drops long test runs, and a
    // dropped connection is not evidence of anything.
    // message_notification_throttle keys on sender_id/recipient_id, not user_id.
    const personOwned: [string, string][] = [
      ['notification_preferences', 'user_id'], ['staff_ui_preferences', 'user_id'],
      ['user_view_preferences', 'user_id'], ['thread_participants', 'user_id'],
      ['message_reactions', 'user_id'], ['service_resource_bookmarks', 'user_id'],
      ['service_resource_completions', 'user_id'], ['service_resource_views', 'user_id'],
      ['message_notification_throttle', 'recipient_id'],
    ];
    const unresolved = ([t, col]: [string, string]) => `SELECT '${t}: ' || count(DISTINCT x.${col})::text
      FROM public.${t} x WHERE x.${col} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = x.${col})
        AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.user_id = x.${col} AND o.company_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.truck_owners w WHERE w.user_id = x.${col} AND w.company_id IS NOT NULL)`;
    const rows = psql(personOwned.map(unresolved).join(' UNION ALL '));
    expect(rows.sort(), 'a row owner resolving to no company would be refused his next write')
      .toEqual(personOwned.map(([t]) => `${t}: 0`).sort());
  });

  it('the service-role writers into these tables name the company explicitly', () => {
    const expectations: [string, RegExp][] = [
      ['supabase/functions/manage-group-thread/index.ts', /companyIdForAnyUser/],
      ['supabase/functions/send-operator-broadcast/index.ts', /company_id/],
      ['supabase/functions/send-osas-to-operator/index.ts', /company_id/],
      ['supabase/functions/invite-operator/index.ts', /company_id/],
      ['supabase/functions/create-test-operator/index.ts', /company_id/],
      ['supabase/functions/provision-demo-driver/index.ts', /company_id/],
      ['supabase/functions/provision-test-driver/index.ts', /company_id/],
      ['supabase/functions/reset-demo-driver/index.ts', /company_id/],
    ];
    for (const [file, pattern] of expectations) {
      expect(readFileSync(file, 'utf8'), file).toMatch(pattern);
    }
  });
});
