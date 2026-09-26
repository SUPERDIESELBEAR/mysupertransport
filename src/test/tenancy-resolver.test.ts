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
 *
 * 2026-09-23, demo carrier stage 3 pass 3a: SEVEN application tables LEFT this
 * list by being stamped, not by being decided away — `applications`,
 * `application_invites`, `application_correction_requests`,
 * `application_correction_fields`, `application_document_history`,
 * `application_interview_notes`, `application_revision_attachments`. The owner
 * decided on 2026-09-23 that applications and the PEI family are PER-CARRIER,
 * superseding the 2026-09-13 GLOBAL declaration. `application_resume_tokens`
 * stays here: it resolves its carrier through the application it points at.
 */
const GLOBAL_TABLES = [
  'application_resume_tokens',
  'profiles', 'carrier_profile', 'resource_documents', 'resource_history',
  'release_notes', 'eld_device_models', 'eld_revoked_list_checks',
  'revert_courtesy_email_defaults',
  'email_unsubscribe_tokens', 'suppressed_emails',
  // 2026-09-21 permissions foundation. `permission_actions` is the CATALOGUE of
  // actions SUPERDRIVE is able to enforce — one row per enforcement point in the
  // code. A carrier decides WHO holds an action (`role_permissions`, which is
  // per-carrier); it does not get to invent or retire the actions themselves,
  // because each one only means anything where the code checks it. Rows arrive by
  // migration and the table has no write policy at all.
  'permission_actions',
  // 2026-09-23, P43: `platform_admins` is the SUPERDRIVE platform role (who may
  // create a carrier). It belongs to NO carrier on purpose: a company_id would
  // make it something a carrier holds, and P43 says no carrier holds it and
  // nothing a carrier does can grant it. Rows arrive only by migration.
  'platform_admins',
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

/**
 * PER-DRIVER PAY, PASS 3 (2026-09-22), migration
 * 0040_operator_linehaul_pct_versions.sql. Each driver's own linehaul
 * percentage, versioned. Born tenant-stamped and restrictive — it never
 * existed in an untenanted form, so there is no backfill to reconcile. The
 * migration's own 157-row backfill names each driver's company_id explicitly,
 * because a migration has no JWT and the stamp resolves NULL for it.
 */
const PER_DRIVER_PAY_STAMPED = ['operator_linehaul_pct_versions'] as const;
// 0068 (2026-09-25): billing settings, factoring companies, invoice files.
const BILLING_PDF_STAMPED = ['billing_settings', 'factoring_companies', 'invoice_files'] as const;
/** Milestone 2 pass 4 (0073): required-document settings, one row per company per type. */
const REQUIRED_DOCS_STAMPED = ['document_requirement_settings', 'document_requirements'] as const;

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
    // 2026-09-16, owner decision C: the COALESCE preference chain is GONE. The
    // three sources are read together and an ambiguous caller resolves to NULL,
    // so there is no chain into which a fourth fallback could be smuggled. This
    // assertion replaces "exactly one COALESCE"; see the ambiguity guard below.
    expect((code.match(/coalesce/gi) ?? []).length).toBe(0);
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
    //
    // NARROWED 2026-09-16, restrictive-policy pilot: `permissive = 'PERMISSIVE'`.
    // This guard is a rule about policies that GRANT access. A RESTRICTIVE
    // policy can only ever REMOVE access — Postgres ANDs every applicable
    // restrictive policy on top of the permissive ones — so a restrictive
    // `company_id = current_company_id()` policy with no role test admits
    // nobody and cannot be an offender. Without this narrowing the guard
    // reports every `tenant_isolation` policy as a violation of a rule it
    // does not break.
    const offenders = psql(`SELECT tablename || ' | ' || policyname FROM pg_policies
      WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
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
    // Since pass 3 the paperwork gate runs on every invoice insert and, for a
    // caller holding no billing role, refuses before the NOT NULL check is
    // reached. Either way the non-member writes nothing.
    expect(err).toMatch(/Only a dispatcher, management or owner may check invoice readiness|null value in column "company_id"/);
    expect(err).not.toContain('INSERT 0 1');
  });

  itLive('a member IS stamped with that member’s company, and a supplied company is overridden', () => {
    const [stamped] = psql(`BEGIN;
      SELECT set_config('request.jwt.claims',
        json_build_object('sub', (SELECT cm.user_id FROM public.company_members cm
                            JOIN public.carrier_profile c ON c.id = cm.company_id
                           WHERE c.usdot_number = '2309365' ORDER BY cm.created_at LIMIT 1),
                          'role', 'authenticated')::text, true);
      -- Pass 3 gate: invoice a scratch load that is READY (address, BOL, rate con).
      WITH b AS (INSERT INTO public.brokers (company_name, address_line1, city, state, zip)
          VALUES ('SCRATCH broker', '1 Main', 'Town', 'MO', '64080') RETURNING id),
        l AS (INSERT INTO public.loads (load_number, broker_id) SELECT 'SCRATCH-READY', id FROM b RETURNING id)
      INSERT INTO public.load_documents (load_id, document_type, document_name)
        SELECT id, t::public.load_document_type, 'scratch' FROM l, unnest(ARRAY['bol','rate_confirmation']) t;
      INSERT INTO public.invoices (company_id, load_id, invoice_number, billing_path, amount)
      VALUES ((SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'),
              (SELECT l.id FROM public.loads l WHERE l.load_number = 'SCRATCH-READY'),
              'ST-SCRATCH-TENANCY', 'factored', 1)
      RETURNING company_id::text;
      ROLLBACK;`).filter(l => /^[0-9a-f-]{36}$/.test(l));
    const [expected] = psql(`SELECT cm.company_id::text FROM public.company_members cm JOIN public.carrier_profile c ON c.id = cm.company_id WHERE c.usdot_number = '2309365' ORDER BY cm.created_at LIMIT 1`);
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
          bool_and(company_id = (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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
          bool_and(company_id = (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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
    //
    // B8's seven token/share tables were stamped on 2026-09-15 and NOT added
    // here, so this census was RED from that pass until 2026-09-16. That is the
    // cost of a census assertion: it goes stale on correct work. The invariant
    // at the foot of this file is the one that cannot.
    expect(rows.sort()).toEqual([
      ...B2_B3_STAMPED, ...B4_TABLES, ...B5_SINGLETONS,
      ...B5B_SETTINGS, ...B5B_SETTLEMENTS, ...B5C_PLAIN, ...B5C_TRIGGERED,
      ...B6_ELD_RODS, ...B6_DOCUMENTS, ...B6_GROUP3_GENERIC, ...B8_SHAPE_1,
      ...TWELVE_TENANT_STAMPED, ...PERMISSIONS_STAMPED, ...ANNOUNCEMENT_STAMPED,
      ...PER_DRIVER_PAY_STAMPED, ...BILLING_PDF_STAMPED, ...REQUIRED_DOCS_STAMPED,
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
      // No "ORDER BY created_at LIMIT 1" carrier pick. Since demo carrier
      // stage 2, bootstrap_assign_owner TAKES p_company_id; omitted, it counts
      // the carriers and refuses (42501) unless there is exactly one.
      expect(code, fn).not.toMatch(/ORDER BY created_at\s+LIMIT 1/i);
    }
  });

  // 2026-09-23, stage 3 pass 3a: `applications` now CARRIES a nullable
  // company_id (owner decision: per-carrier). What this guard protects is what
  // 3a deliberately did NOT change — the duplicate-email rule stays global, so
  // one person cannot hold a live application at two carriers under one email
  // until that is decided on its own.
  // 3a added the column nullable; 3e (migration 0054) made it NOT NULL.
  itLive('applications carries a required carrier, and its email rule is untouched', () => {
    const [col] = psql(`SELECT a.attnotnull::text FROM pg_attribute a
      WHERE a.attrelid = 'public.applications'::regclass AND a.attname = 'company_id'`);
    expect(col).toBe('true');
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
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
        FROM public.${t}`);
      expect(row, t).toEqual(['0 0']);
    }
  });

  itLive('one CURRENT default pay policy PER COMPANY', () => {
    const [idx] = psql(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'pay_policies_single_company_default'`);
    expect(idx).toMatch(/\(company_id, is_company_default\)/);
    // Per-driver pay Pass 2 (2026-09-22) re-scoped this index to CURRENT versions
    // only, so a carrier keeps its closed rate history while still having exactly
    // one live default. The tenancy rule is unchanged — it is still per company —
    // but the predicate MUST carry effective_to IS NULL, or history cannot exist.
    expect(idx).toMatch(/WHERE \(is_company_default AND \(effective_to IS NULL\)\)/);
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
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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

  // 2026-09-21: 18 + 1 = 19. 2026-09-23, stage 3 pass 3a: 19 - 7 = 12, the seven
  // application tables having been stamped per-carrier by the owner's decision.
  // The count stays an exact assertion, not a floor, so a table cannot drift
  // onto this list unannounced.
  itLive('the 12 GLOBAL tables carry no company_id', () => {
    for (const t of GLOBAL_TABLES) {
      const cols = psql(`SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = 'public.${t}'::regclass AND a.attname = 'company_id'`);
      expect(cols, t).toEqual([]);
    }
    expect(GLOBAL_TABLES.length).toBe(13);
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
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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
      // P34 (2026-09-21): re-scoped to LIVE rows so kept voided settlements
      // can sit beside the month's one live settlement.
      'dispatch_settlements_company_payee_period_live_uniq',
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
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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
          count(*) FILTER (WHERE company_id <> (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text
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

/**
 * B7 — THE FOUR LARGE LOGS, 2026-09-15.
 *
 * Two of the four were migrated and two were NOT, and the reason is the same in
 * both directions: a log row is only scoped to a carrier if something in the row
 * SAYS which carrier. `notifications` names its recipient and
 * `dispatch_daily_log` names its operator, so both derive. `audit_log` had 1,077
 * rows whose actor resolved to nobody (1,021 with no actor at all) and
 * `email_send_log` has no tenancy key whatsoever — 1,340 rows with null
 * metadata and a recipient address that joins to no table (neither
 * `profiles.email` nor `operators.email` exists). Defaulting either one to the
 * sole carrier would be the first-carrier guess this whole file exists to stop,
 * so both were left alone.
 *
 * The two absences are ASSERTED, not merely written down: a later pass that
 * quietly adds the column by guessing turns this suite red.
 */
const B7_MIGRATED = {
  notifications: 'aa_stamp_company_from_recipient',
  dispatch_daily_log: 'aa_stamp_company_from_operator',
} as const;

const B7_UNDERIVABLE = ['audit_log', 'email_send_log'] as const;

describe('B7 — the large logs', () => {
  itLive('both migrated logs carry a server-stamped NOT NULL company_id with a RESTRICT FK', () => {
    const names = Object.keys(B7_MIGRATED);
    const rows = psql(`
      WITH t(name) AS (VALUES ${names.map(t => `('${t}')`).join(',')})
      SELECT t.name || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, 'none')
             || ' ' || coalesce(k.confdeltype::text, '?')
        FROM t
        JOIN information_schema.columns c ON c.table_schema = 'public'
          AND c.table_name = t.name AND c.column_name = 'company_id'
        LEFT JOIN pg_constraint k ON k.conname = t.name || '_company_id_fkey'
       ORDER BY 1`);
    expect(rows).toEqual([...names].sort().map(t => `${t} NO none r`));
    const [bad] = psql(`SELECT count(*)::text FROM (
      ${names.map(t => `SELECT company_id FROM public.${t}`).join(' UNION ALL ')}
    ) x WHERE x.company_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.carrier_profile c WHERE c.id = x.company_id)`);
    expect(bad, 'null or orphan company_id in a migrated log').toBe('0');
  });

  itLive('each migrated log derives its company from the row it already names', () => {
    for (const [table, trigger] of Object.entries(B7_MIGRATED)) {
      const [name] = psql(`SELECT tgname FROM pg_trigger
        WHERE NOT tgisinternal AND tgrelid='public.${table}'::regclass
          AND tgname LIKE 'aa_stamp%'`);
      expect(name, table).toBe(trigger);
    }
    // Both are written by cron jobs, edge functions and logging triggers with no
    // auth.uid(), so neither may lean on the caller-based resolver.
    const def = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='stamp_company_from_recipient'`).join('\n');
    expect(def).not.toMatch(/current_company_id/i);
    expect(def).toContain('SECURITY DEFINER');
    expect(def).toContain('search_path');
    // Fail closed: an unresolvable recipient is refused, never defaulted.
    expect(def).toMatch(/RAISE EXCEPTION/);
  });

  itLive('the recipient stamp is not executable by anon or authenticated', () => {
    const rows = psql(`SELECT r.rolname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated'), ('public')) AS r(rolname)
      WHERE n.nspname='public' AND p.proname='stamp_company_from_recipient'
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')`);
    expect(rows).toEqual([]);
  });

  itLive('every notification recipient and every logged operator resolves a company', () => {
    const rows = psql(`
      SELECT 'notifications: ' || count(DISTINCT n.user_id)::text
        FROM public.notifications n
       WHERE NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = n.user_id)
         AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.user_id = n.user_id AND o.company_id IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM public.truck_owners w WHERE w.user_id = n.user_id AND w.company_id IS NOT NULL)
      UNION ALL
      SELECT 'dispatch_daily_log: ' || count(DISTINCT d.operator_id)::text
        FROM public.dispatch_daily_log d
       WHERE NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.id = d.operator_id AND o.company_id IS NOT NULL)`);
    expect(rows.sort()).toEqual(['dispatch_daily_log: 0', 'notifications: 0']);
  });

  itLive('dispatch_daily_log keeps ONE (operator_id, log_date) unique definition', () => {
    // Two byte-identical definitions existed: the plain index
    // `dispatch_daily_log_op_date_uniq` and the constraint-backed
    // `unique_operator_log_date`. The constraint survives because the upsert
    // paths name it; dropping the constraint's index is refused by Postgres
    // anyway (2BP01).
    const rows = psql(`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='dispatch_daily_log'
        AND indexdef LIKE '%operator_id%' AND indexdef LIKE '%log_date%'
        AND indexdef LIKE 'CREATE UNIQUE%' ORDER BY 1`);
    expect(rows).toEqual(['unique_operator_log_date']);
  });

  itLive('the two underivable logs still have NO company_id', () => {
    const rows = psql(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='company_id'
        AND table_name IN (${B7_UNDERIVABLE.map(t => `'${t}'`).join(',')})`);
    expect(rows, 'a company_id here could only have been guessed').toEqual([]);
    // And the reason is still true: rows whose tenancy nothing in the row states.
    const [audit] = psql(`SELECT count(*)::text FROM public.audit_log a
      WHERE a.actor_id IS NULL
         OR (NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = a.actor_id)
         AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.user_id = a.actor_id AND o.company_id IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM public.truck_owners w WHERE w.user_id = a.actor_id AND w.company_id IS NOT NULL))`);
    expect(Number(audit), 'audit_log became derivable — revisit the B7 stop').toBeGreaterThan(0);
    const [email] = psql(`SELECT count(*)::text FROM public.email_send_log WHERE metadata IS NULL`);
    expect(Number(email), 'email_send_log gained a tenancy key — revisit the B7 stop').toBeGreaterThan(0);
  });
});

/**
 * 2026-09-15 audit/email tenancy decision — both tables stay GLOBAL.
 *
 * The investigation (docs/passes/2026-09-15-2310-audit-email-tenancy-decision.md)
 * established that entity-first derivation recovers only 121 of the 1,077
 * actor-underivable rows; 956 (24% of audit_log) resolve from NOTHING:
 *   - 511 structurally unplaceable (`application` 211, `pei_request` 296 name
 *     entities on tables declared GLOBAL — the company is not there to read)
 *   - 390 of the 446 `operator` rows have NO entity_id at all
 *   - plus deleted entities and label-mismatched entity types (below)
 * Nullable company_id was rejected: no trigger can distinguish "system action"
 * from "GLOBAL entity by design" from "entity_id never set", so the column
 * would carry a meaning no check can defend.
 *
 * The only route that lifts the stop is giving `applications` and
 * `pei_requests` a company — a reversal of their GLOBAL declaration, its own
 * pass, not an audit-log task. Recorded with no trigger.
 */
describe('2026-09-15 — audit_log / email_send_log stay GLOBAL', () => {
  itLive('neither table EVER gains a company_id', () => {
    const rows = psql(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='company_id'
        AND table_name IN ('audit_log', 'email_send_log')`);
    expect(rows, 'a company_id here could only have been guessed — the decision is GLOBAL').toEqual([]);
  });

  itLive('the unplaceable residue stays NON-ZERO — the decision must not be quietly outlived', () => {
    // Residue = rows that resolve from neither actor, nor the entity they name,
    // nor an operator_id in their stored details.
    const [residue] = psql(`
      WITH u AS (
        SELECT a.* FROM public.audit_log a
         WHERE a.actor_id IS NULL
            OR (NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = a.actor_id)
            AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.user_id = a.actor_id AND o.company_id IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM public.truck_owners w WHERE w.user_id = a.actor_id AND w.company_id IS NOT NULL))
      ), r AS (
        SELECT coalesce(
          (SELECT o.company_id FROM public.operators o WHERE o.id = u.entity_id),
          (SELECT c.company_id FROM public.ica_contracts c WHERE c.id = u.entity_id),
          (SELECT d.company_id FROM public.rods_days d WHERE d.id = u.entity_id),
          (SELECT x.company_id FROM public.accessorial_adjustments x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.dispatch_settlements x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.invoices x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.settlements x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.truck_dot_inspections x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.onboard_assignment_sheets x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.equipment_items x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.eld_malfunction_events x WHERE x.id = u.entity_id),
          (SELECT x.company_id FROM public.loads x WHERE x.id = u.entity_id),
          (SELECT o.company_id FROM public.operators o
            WHERE jsonb_typeof(u.metadata) = 'object' AND o.id = (u.metadata->>'operator_id')::uuid)
        ) AS co FROM u
      )
      SELECT count(*)::text FROM r WHERE co IS NULL`);
    expect(Number(residue),
      'residue reached zero — every row is placeable, so revisit the GLOBAL decision instead of outliving it')
      .toBeGreaterThan(0);
  });

  itLive('email_send_log: the only derivation path (metadata operator_id) still leaves most rows unplaceable', () => {
    const [placeable] = psql(`SELECT count(*)::text FROM public.email_send_log e
      WHERE EXISTS (SELECT 1 FROM public.operators o
        WHERE jsonb_typeof(e.metadata) = 'object' AND o.id = (e.metadata->>'operator_id')::uuid)`);
    const [total] = psql(`SELECT count(*)::text FROM public.email_send_log`);
    // 414 of 2,058 at decision time. Assert the MINORITY-share shape, not the
    // census: if most rows became placeable, revisit rather than assume.
    expect(Number(placeable)).toBeGreaterThan(0);
    expect(Number(placeable) * 2, 'a majority became placeable — revisit the email GLOBAL decision')
      .toBeLessThan(Number(total));
  });

  itLive('LABEL MISMATCH (not a tenancy matter): ica_contract audit entity_id holds an OPERATOR id', () => {
    // Table-wide: 840 of 885 match operators.id, ZERO match ica_contracts.id.
    // The obvious join (entity_id -> ica_contracts.id) returns nothing rather
    // than failing. Asserted so no later pass assumes the label.
    const rows = psql(`SELECT
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.operators o WHERE o.id = a.entity_id))::text
        || ' / ' ||
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.ica_contracts c WHERE c.id = a.entity_id))::text
      FROM public.audit_log a
      WHERE a.entity_type = 'ica_contract' AND a.entity_id IS NOT NULL`);
    expect(rows, 'ica_contract entity_id semantics changed — re-record the label mismatch')
      .toEqual([expect.stringMatching(/^[1-9]\d* \/ 0$/)]);
  });

  itLive('LABEL MISMATCH: rods_day audit entity_id matches NO live table; the operator survives only in stored details', () => {
    // All are rods_day_purged actions: the day was deliberately destroyed.
    // entity_id matches neither rods_days nor operators; metadata.operator_id
    // is the only place the operator survives.
    const rows = psql(`SELECT
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.rods_days d WHERE d.id = a.entity_id)
                       AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.id = a.entity_id))::text
        || ' / ' ||
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.operators o
                       WHERE jsonb_typeof(a.metadata) = 'object' AND o.id = (a.metadata->>'operator_id')::uuid))::text
      FROM public.audit_log a
      WHERE a.entity_type = 'rods_day'`);
    const [[gone, viaMeta]] = [rows[0].split(' / ').map(Number)];
    expect(gone, 'a rods_day entity_id began resolving — re-check the label mismatch').toBeGreaterThan(0);
    expect(viaMeta, 'the purge path stopped recording operator_id in metadata').toBeGreaterThan(0);
  });
});

/**
 * B8 — THE TOKEN AND SHARE TABLES, 2026-09-15. The last batch.
 *
 * Seven tables took SHAPE 1 (server-stamped company_id, NOT NULL, no default,
 * RESTRICT FK). Three decisions shaped the batch and each is asserted here:
 *
 *  1. `document_short_links` is SHAPE 1, not the anonymous shape. The build
 *     record calling `get_or_create_short_link` an anonymous writer was WRONG:
 *     it raises 'authentication required' before writing and stamps
 *     `created_by` from the caller.
 *  2. `share_token_access_log` STAYS GLOBAL. Its `not_found` rows have no
 *     parent and never did — they are the record of someone presenting a bad or
 *     guessed token. A cross-carrier abuse log is not tenant data; its most
 *     important rows are the ones with no tenant.
 *  3. THE THIRD STAMPING SHAPE THEREFORE COVERS ZERO TABLES. It was invented
 *     for a case that turned out not to exist.
 *
 * `share_tokens` also gained a company-scoped READ policy: both prior policies
 * were role tests only, so a second carrier's dispatcher would have listed this
 * carrier's share links including `resource_id`, which names its inspection
 * documents.
 *
 * The anonymous resolve path is definer and looks up BY TOKEN, so it does not
 * traverse the new policy. That is the thing that must not break, so it is
 * asserted rather than assumed.
 */
const B8_SHAPE_1 = [
  'binder_share_bundles',
  'document_short_links',
  'ica_review_links',
  'officer_packet_links',
  'passenger_authorizations',
  'preview_sessions',
  'share_tokens',
] as const;

/**
 * THE TWELVE, 2026-09-17 (migration 0005). Only ONE of the twelve stamps from
 * the caller's own membership: `fuel_import_batches`, written by
 * `commit_fuel_import` in the importing staff member's session. The other eleven
 * derive tenancy from a parent row or from the person the row is about, so they
 * carry their own stamp trigger names and are asserted in their own describe.
 */
const TWELVE_TENANT_STAMPED = ['fuel_import_batches'] as const;

/**
 * 2026-09-21 PERMISSIONS FOUNDATION. Both grant tables take the shared
 * `aa_stamp_tenant_company_id` stamp, so they belong in the census below. Noted
 * because it has a runtime consequence: a caller with no `company_members` row
 * and no server-side company cannot insert a grant at all, which is why
 * `seed_role_permissions()` is service_role only and must be called from a
 * function holding the service key when a carrier is created.
 */
const PERMISSIONS_STAMPED = ['role_permissions', 'user_permission_exceptions'] as const;

/**
 * ANNOUNCEMENT READS (1), 2026-09-21, migration
 * `drizzle/migrations/0021_release_note_approval.sql` (another session's
 * What's New approval pass). `release_note_reads` records who has seen or
 * acknowledged a staff announcement, carries `company_id` with the generic
 * `aa_stamp_tenant_company_id` stamp, and was confirmed from the live catalog
 * to carry the restrictive policy:
 *   tenant_isolation|RESTRICTIVE|ALL|(company_id = ( SELECT current_company_id()))
 * Added here because the census assertion above goes stale on correct work.
 */
const ANNOUNCEMENT_STAMPED = ['release_note_reads'] as const;

/** table -> the stamp function that must fire BEFORE INSERT OR UPDATE. */
const TWELVE_STAMPS: readonly [string, string][] = [
  ['fuel_import_batches', 'stamp_tenant_company_id'],
  ['fuel_transactions', 'stamp_company_from_fuel_batch'],
  ['fuel_transaction_lines', 'stamp_company_from_fuel_transaction'],
  ['fuel_disagreement_acceptances', 'stamp_company_from_fuel_transaction'],
  ['operator_broadcasts', 'stamp_company_from_user_ref'],
  ['operator_departing_events', 'stamp_company_from_operator'],
  ['operator_parking_events', 'stamp_company_from_operator'],
  ['equipment_return_confirmations', 'stamp_company_from_operator'],
  ['driver_optional_docs', 'stamp_company_from_user_ref'],
  ['onboard_assignment_sheet_sends', 'stamp_company_from_osas_sheet'],
  ['staff_event_acknowledgments', 'stamp_company_from_user_ref'],
  ['staff_help_query_log', 'stamp_company_from_user_ref'],
];

describe('the twelve — fuel, operator events, staff acknowledgments', () => {
  itLive('company_id is NOT NULL with no default, one carrier, no nulls', () => {
    for (const [t] of TWELVE_STAMPS) {
      const [shape] = psql(`SELECT a.attnotnull::text || ' ' || a.atthasdef::text
        FROM pg_attribute a WHERE a.attname = 'company_id'
          AND a.attrelid = 'public.${t}'::regclass`);
      expect(shape, `${t} company_id shape`).toBe('true false');
      const [rows] = psql(`SELECT count(*) FILTER (WHERE company_id IS NULL)::text
          || ' ' || coalesce(bool_and(company_id = (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365'))::text, 'empty')
        FROM public.${t}`);
      expect(rows, `${t} rows`).toMatch(/^0 (true|empty)$/);
    }
  });

  itLive('each carries its derived stamp trigger, firing before validation', () => {
    for (const [t, fn] of TWELVE_STAMPS) {
      const rows = psql(`SELECT p.proname FROM pg_trigger tg
        JOIN pg_proc p ON p.oid = tg.tgfoid
        WHERE NOT tg.tgisinternal AND tg.tgenabled = 'O'
          AND tg.tgrelid = 'public.${t}'::regclass
          AND (tg.tgtype & 2) = 2
          AND p.proname LIKE 'stamp%company%'
        ORDER BY tg.tgname`);
      expect(rows, `${t} stamp trigger`).toEqual([fn]);
    }
  });

  itLive('fuel tenancy comes from the import batch, never the driver', () => {
    // An unmatched fuel row has no operator at all, so a driver-derived stamp
    // could not have stamped it. This asserts the derivation actually used.
    const [n] = psql(`SELECT count(*)::text FROM public.fuel_transactions t
      JOIN public.fuel_import_batches b ON b.id = t.batch_id
      WHERE t.company_id <> b.company_id`);
    expect(n, 'fuel_transactions disagreeing with their batch').toBe('0');
    const [lines] = psql(`SELECT count(*)::text FROM public.fuel_transaction_lines l
      JOIN public.fuel_transactions t ON t.id = l.transaction_id
      WHERE l.company_id <> t.company_id`);
    expect(lines, 'fuel lines disagreeing with their transaction').toBe('0');
  });
});



describe('B8 — token and share tables', () => {
  itLive('all seven carry a server-stamped NOT NULL company_id with a RESTRICT FK', () => {
    const rows = psql(`
      WITH t(name) AS (VALUES ${B8_SHAPE_1.map(t => `('${t}')`).join(',')})
      SELECT t.name || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, 'none')
             || ' ' || coalesce(k.confdeltype::text, '?')
             || ' ' || coalesce((SELECT tg.tgname FROM pg_trigger tg
                   WHERE NOT tg.tgisinternal AND tg.tgrelid = ('public.' || t.name)::regclass
                     AND tg.tgname LIKE 'aa_stamp%'), 'no-trigger')
        FROM t
        JOIN information_schema.columns c ON c.table_schema = 'public'
          AND c.table_name = t.name AND c.column_name = 'company_id'
        LEFT JOIN pg_constraint k ON k.conname = t.name || '_company_id_fkey'
       ORDER BY 1`);
    expect(rows).toEqual(
      [...B8_SHAPE_1].sort().map(t => `${t} NO none r aa_stamp_tenant_company_id`),
    );
    const [bad] = psql(`SELECT count(*)::text FROM (
      ${B8_SHAPE_1.map(t => `SELECT company_id FROM public.${t}`).join(' UNION ALL ')}
    ) x WHERE x.company_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.carrier_profile c WHERE c.id = x.company_id)`);
    expect(bad, 'null or orphan company_id in a B8 table').toBe('0');
  });

  itLive('share_token_access_log stays GLOBAL, and its parentless rows are why', () => {
    const rows = psql(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='share_token_access_log'
        AND column_name='company_id'`);
    expect(rows, 'a cross-carrier abuse log is not tenant data').toEqual([]);
    const [orphans] = psql(`SELECT count(*)::text FROM public.share_token_access_log l
      WHERE NOT EXISTS (SELECT 1 FROM public.share_tokens s WHERE s.token = l.token)`);
    expect(Number(orphans), 'the parentless rows vanished — re-read the B8 decision')
      .toBeGreaterThan(0);
  });

  itLive('the third stamping shape covers ZERO tables', () => {
    // No stamp function derives a company from a share TOKEN. If one appears,
    // the shape was resurrected and the decision above needs revisiting.
    const rows = psql(`SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'stamp_company_from%'
        AND pg_get_functiondef(p.oid) ILIKE '%share_token%' ORDER BY 1`);
    expect(rows).toEqual([]);
  });

  itLive('token and code unique indexes stay GLOBAL — probed before any tenant is known', () => {
    const rows = psql(`SELECT indexname FROM pg_indexes
      WHERE schemaname='public'
        AND tablename IN (${B8_SHAPE_1.map(t => `'${t}'`).join(',')})
        AND indexdef LIKE 'CREATE UNIQUE%'
        AND (indexdef LIKE '%(token)%' OR indexdef LIKE '%(code%' OR indexdef LIKE '%code_hash%')
        AND indexdef LIKE '%company_id%' ORDER BY 1`);
    expect(rows, 'a tenant-scoped token index would make an unguessable token guessable per carrier')
      .toEqual([]);
  });

  itLive('share_tokens reads are company-scoped; the anonymous resolve is not', () => {
    const reads = psql(`SELECT polname FROM pg_policy p
      WHERE p.polrelid='public.share_tokens'::regclass AND p.polcmd IN ('r','*')
        AND pg_get_expr(p.polqual, p.polrelid) NOT ILIKE '%current_company_id%'`);
    expect(reads, 'a read policy without a company test leaks resource_id across carriers')
      .toEqual([]);
    const def = psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='resolve_share_token'`).join('\n');
    expect(def).toContain('SECURITY DEFINER');
    expect(def).toMatch(/search_path/);
    expect(def, 'the officer/anonymous path must not depend on a resolvable caller')
      .not.toMatch(/current_company_id/i);
  });

  it('the service-role writers into the B8 tables name the company explicitly', () => {
    const expectations: [string, RegExp][] = [
      ['supabase/functions/send-officer-packet/index.ts', /companyIdForOperator/],
      ['supabase/functions/send-binder-share/index.ts', /companyIdForAnyUser/],
      ['supabase/functions/send-ica-review-link/index.ts', /companyIdForUser/],
      ['supabase/functions/create-preview-session/index.ts', /companyIdForUser/],
      ['supabase/functions/send-passenger-auth/index.ts', /company_id: membership\.company_id/],
    ];
    for (const [file, pattern] of expectations) {
      expect(readFileSync(file, 'utf8'), file).toMatch(pattern);
    }
  });
});

/**
 * THE DISPOSITION INVARIANT (2026-09-16).
 *
 * Every guard before this one asserts what was DECLARED: the 18 GLOBAL tables
 * carry no `company_id`, the 8 DEFERRED ones are untouched. None of them could
 * notice a table that was never declared at all — which is exactly how B6
 * Group 3's deferred candidates reached B8 with nobody having taken them, while
 * the record read "no batch remains that is merely unstarted".
 *
 * So this asserts the complement instead: a public base table with no
 * `company_id` must appear in EXACTLY ONE named list. A table with no column and
 * no list FAILS. Adding a table to `UNASSIGNED` is not a fix — it is the
 * admission that the owner has not decided yet — but it cannot be forgotten.
 */
const GLOBAL_LOGS = [
  // Decided global by their own passes: cross-carrier infrastructure whose most
  // important rows have no tenant (audit 2026-09-15, email log 2026-09-15,
  // abuse log 2026-09-15) plus the shared send cursor (2026-09-13), which is
  // also asserted individually above.
  'audit_log', 'email_send_log', 'share_token_access_log', 'email_send_state',
] as const;

/**
 * The four PEI tables were declared AWAITING_APPLICATIONS while `applications`
 * was GLOBAL. They left that list on 2026-09-23 (stage 3 pass 3a) by being
 * STAMPED, together with their parent, on the owner's per-carrier decision —
 * not by being decided away. The list is gone with them; their disposition is
 * now the column itself, plus PENDING_RESTRICTIVE until pass 3c writes the
 * policies.
 */


/**
 * NO DECISION YET. Found live 2026-09-16, not by any batch. Proposals are in
 * the record; the owner decides. Removing a table from here without either a
 * `company_id` column or another list makes this file fail, deliberately.
 *
 * 2026-09-17: the twelve per-carrier tables (fuel, operator events, driver
 * optional docs, OSAS sends, staff acknowledgments and the staff help query
 * log) left this list by being STAMPED — migration
 * `0005_stamp_twelve_tables_tenancy.sql` — not by being decided away. What
 * remains here is genuinely undecided: `driver_documents` (whose rows predate
 * the operator rows they belong to) and `eld_cron_runs` (job telemetry, and
 * the ELD feature is hidden).
 */
const UNASSIGNED = [
  'driver_documents', 'eld_cron_runs',
] as const;

describe('tenancy disposition — every table accounted for', () => {
  itLive('no public base table lacks both a company_id and a disposition', () => {
    const lacking = psql(`SELECT t.table_name FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name
            AND c.column_name = 'company_id')
      ORDER BY 1`);
    expect(lacking.length, 'the inventory query returned nothing — it broke')
      .toBeGreaterThan(0);

    const lists: Record<string, readonly string[]> = {
      GLOBAL: GLOBAL_TABLES,
      DEFERRED: DEFERRED_TABLES,
      GLOBAL_LOGS,
      UNASSIGNED,
    };

    const undeclared = lacking.filter(
      t => !Object.values(lists).some(l => (l as readonly string[]).includes(t)),
    );
    expect(
      undeclared,
      'these tables have no company_id and no disposition: decide, or add them to UNASSIGNED',
    ).toEqual([]);

    // Exactly one list, so a table cannot be both global and pending.
    const doubled = lacking.filter(
      t => Object.values(lists).filter(l => (l as readonly string[]).includes(t)).length > 1,
    );
    expect(doubled, 'a table declared in two lists has two contradictory decisions').toEqual([]);

    // And nothing may sit in a list while it HAS the column — that is a stale
    // declaration, the other direction of the same rot.
    const stale = Object.entries(lists).flatMap(([name, l]) =>
      (l as readonly string[]).filter(t => !lacking.includes(t)).map(t => `${name}:${t}`),
    );
    expect(stale, 'these tables now have company_id but are still declared without it').toEqual([]);
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * RESTRICTIVE TENANT POLICY — the invariant, and the rollout ledger
 *
 * Owner decision 2026-09-16: cross-carrier read enforcement is closed by ONE
 * restrictive policy per table that has `company_id`, `TO authenticated`,
 * requiring the row's company to equal the caller's. Permissive policies are
 * not edited. A restrictive policy can only remove access, so a wrong one does
 * not leak — it silently EMPTIES a screen. Hence: exact shape, or listed as
 * pending. Nothing in between.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The predicate as Postgres prints it back in `pg_policies`. */
const RESTRICTIVE_PREDICATE =
  '(company_id = ( SELECT current_company_id() AS current_company_id))';

/**
 * Tables whose restrictive policy is deliberately WIDER than the standard
 * predicate, with the exact wider text asserted here so it cannot drift.
 *
 * `applications` (2026-09-23, stage 3 pass 3c): an applicant who has signed in
 * but is not yet an operator, a truck owner or a staff member resolves to NO
 * company, and `src/pages/ApplicationStatus.tsx` reads his OWN row by
 * `user_id` — the long-standing "Owner can view own application" permissive
 * policy. The standard predicate alone would empty that screen for him. Every
 * one of today's 158 owner-held applications resolves to SUPERTRANSPORT, so the
 * exception is forward-looking, not a hole in the present: it widens the rule by
 * the applicant's own row only, never by another carrier's row.
 */
const RESTRICTIVE_WIDER: Record<string, string> = {
  applications:
    '((company_id = ( SELECT current_company_id() AS current_company_id))'
    + ' OR (user_id = auth.uid()))',
};

/** `company_members` is never a target: its `company_id` IS the assertion, it
 * has no company stamp trigger, and it is service_role-only. */
const RESTRICTIVE_EXEMPT = ['company_members'] as const;

/**
 * Pilot batch (4) and BATCH 1, staff-only tables (25), both 2026-09-16, plus
 * BATCH 2 (20) on 2026-09-17 — batch 1's empty remainder, re-derived live —
 * plus BATCH 3 (25) and BATCH 4 (14) on 2026-09-17, the driver-facing
 * ownership tables, chosen live from PENDING_RESTRICTIVE (at least one
 * OWNERSHIP policy, no OTHER policy), excluding realtime-subscribed,
 * financial, token, `user_roles`, `company_members` and every ELD/RODS table.
 * BATCH 4 additionally excluded `operators` and `passenger_authorizations`:
 * source shows live subscriptions on both even though the pre-check's
 * realtime list omits them.
 *
 * Plus the ELD/RODS batch (10) on 2026-09-17, applied as
 * `drizzle/migrations/0003_restrictive_tenant_policy_eld_batch.sql`. That pass
 * was stopped by the owner after the migration: visibility was confirmed
 * unchanged for all five identities, but the offline sync path was NOT
 * re-tested after the policies landed. `truck_dot_inspections` and
 * `inspection_documents` stay pending — both are realtime-subscribed.
 */
const RESTRICTIVE_DONE = [
  'billing_settings', 'factoring_companies', 'invoice_files',
  'invoice_sends', // pass 5, 0074

  'active_dispatch', 'blank_log_acknowledgments', 'broker_contacts',
  'broker_do_not_load_history',
  'broker_documents', 'broker_factoring_history', 'broker_notes', 'brokers',
  'carrier_notification_settings', 'cash_advances', 'cert_reminders',
  'claim_flag_history', 'claim_flags', 'company_documents',
  'company_settings', 'detention_claims', 'dispatch_daily_log',
  'dispatch_deductions',
  'dispatch_settlement_charge_verdicts',
  'dispatch_settlement_load_contributions', 'dispatch_settlement_rates',
  'dispatch_settlement_rates_history', 'document_acknowledgments',
  'document_exceptions',
  'document_requirement_settings', 'document_requirements', 'document_send_log',
  'document_version_history', 'documents', 'dot_consultant_email_settings',
  'driver_staff_contact_suppressions',
  'driver_staff_contacts', 'driver_vault_documents', 'eld_devices',
  'eld_extension_requests', 'eld_malfunction_events',
  'eld_malfunction_notifications',
  'eld_sync_alerts', 'equipment_items', 'equipment_receipts',
  'equipment_serial_conflict_dismissals', 'facilities', 'fleet_settings',
  'ica_amendment_units', 'ica_amendments',
  'ica_driver_acknowledgments', 'inspection_binder_order',
  'inspection_cycles',
  'inspection_document_versions',
  'insurance_email_settings', 'lease_terminations',
  'load_change_history', 'load_documents',
  'load_number_config', 'load_reference_citations', 'load_references',
  'load_status_history', 'load_stops', 'message_threads',
  'mo_plate_assignments', 'mo_plates', 'notification_preferences',
  'notification_role_defaults', 'onboard_assignment_sheet_items',
  'operator_broadcast_recipients', 'operator_offboarding_steps',
  'owner_transfers', 'pandadoc_documents',
  'parser_diagnostics', 'pay_policies', 'pay_policy_assignments',
  'pei_cadence_settings', 'rm_deposit_transactions', 'rm_deposits',
  'roadside_stop_documents', 'roadside_stop_violations', 'roadside_stops',
  'rods_amendments', 'rods_correction_requests', 'rods_days',
  'rods_divergences', 'rods_events', 'rods_unlock_events',
  'service_help_requests', 'service_resource_bookmarks',
  'service_resource_completions',
  'service_resource_views',
  'settlement_settings_history', 'staff_email_overrides',
  'staff_help_messages', 'staff_help_threads', 'staff_messaging_settings',
  'staff_ui_preferences', 'thread_participants',
  'truck_maintenance_records', 'truck_owners',
  'truck_plate_history', 'truck_state_permits', 'user_view_preferences',
  'vacant_units',
  // THE TWELVE, 2026-09-17, migration 0005_stamp_twelve_tables_tenancy.sql:
  // stamped and policied in the same pass. Fuel tenancy derives from the IMPORT
  // BATCH, never the driver, because an unmatched fuel row has no driver at all.
  'fuel_import_batches', 'fuel_transactions', 'fuel_transaction_lines',
  'fuel_disagreement_acceptances', 'operator_broadcasts',
  'operator_departing_events', 'operator_parking_events',
  'equipment_return_confirmations', 'driver_optional_docs',
  'onboard_assignment_sheet_sends', 'staff_event_acknowledgments',
  'staff_help_query_log',
  // THE MONEY BATCH (21), 2026-09-17, migration
  // 0007_restrictive_tenant_policy_money_batch.sql. The first twelve are the
  // 2026-09-16 read-enforcement census tables, whose permissive policies
  // ALREADY read `(company_id = current_company_id()) AND <role test>`, so the
  // restrictive rule is a no-op for them; the remaining nine did not test
  // company on reads, so for those it is a real new refusal. `share_tokens` is
  // treated here as a money table: its PUBLIC token path never reads it as
  // `authenticated`, so a RESTRICTIVE ... TO authenticated policy cannot touch
  // a share link.
  'invoices', 'invoice_line_items', 'invoice_batches', 'invoice_number_config',
  'payments', 'factoring_remittances', 'ar_aging_snapshots',
  'accessorial_adjustments', 'settlement_settings',
  'carrier_signature_settings', 'share_tokens', 'unit_number_config',
  'settlements', 'settlement_line_items', 'settlement_withheld_loads',
  'dispatch_settlements', 'dispatch_settlement_line_items', 'deductions',
  'deduction_installments', 'load_charges', 'inspection_program_payments',
  // SHARE LINKS (5) and SMALL SETTINGS (2), 2026-09-17, migration
  // 0009_restrictive_tenant_policy_share_links_and_settings.sql. Every
  // signed-out path into the share-link tables runs through a SECURITY DEFINER
  // function (`resolve_short_link`, `get_ica_review_link`,
  // `resolve_share_bundle` / `get_share_bundle_meta`) or an edge function
  // holding service_role, so a RESTRICTIVE ... TO authenticated policy cannot
  // reach an anonymous visitor. Verified live before and after: every
  // signed-out link rendered identically. `contractor_pay_setup` was
  // deliberately NOT included — it is driver pay data read on the driver's own
  // pay screens and gets the money-batch treatment in its own pass.
  'document_short_links', 'officer_packet_links', 'ica_review_links',
  'binder_share_bundles', 'preview_sessions', 'inspection_program_settings',
  'message_notification_throttle',
  // THE LIVE-UPDATING BATCH (19), 2026-09-17, migration
  // 0010_restrictive_tenant_policy_realtime_batch.sql. Derived two ways and
  // reconciled: 7 of these are in the `supabase_realtime` publication
  // (`ica_contracts`, `message_reactions`, `messages`, `notifications`,
  // `onboarding_status`, `operator_documents`, `rate_con_ingest_queue`); 8 more
  // are subscribed in source but NOT published, so those subscriptions deliver
  // nothing today — a pre-existing condition this batch neither caused nor
  // fixed. `loads` and the three forecast tables have no subscription at all
  // and are included because they sit in the same dispatch surface. Live
  // realtime delivery was measured per table BEFORE and AFTER: identical.
  'dispatch_status_history', 'driver_uploads', 'equipment_assignments',
  'forecast_deductions', 'forecast_expenses', 'forecast_loads',
  'ica_contracts', 'inspection_documents', 'loads', 'message_reactions',
  'messages', 'notifications', 'onboard_assignment_sheets',
  'onboarding_status', 'operator_documents', 'operators',
  'passenger_authorizations', 'rate_con_ingest_queue',
  'truck_dot_inspections',
  // CONTRACTOR PAY SETUP (1), 2026-09-18, migration
  // 0011_restrictive_tenant_policy_contractor_pay_setup.sql. Money-shaped pass:
  // driver pay data read on the driver's own Stage 8 screen
  // (ContractorPaySetup.tsx) and on the staff detail panel
  // (OperatorDetailPanel.tsx). Nothing subscribes to it. Counts for all five
  // identities and both screens' figures were identical before and after.
  'contractor_pay_setup',
  // USER_ROLES (1), 2026-09-18, migration
  // 0012_restrictive_tenant_policy_user_roles.sql. THE LAST TABLE, deliberately
  // last: every other policy in the database resolves through `has_role()` /
  // `is_staff()`, which read this table, so a restrictive predicate here
  // changes the meaning of every other table's rules at once. A lock-out check
  // ran first over all 185 rows against `current_company_id()`'s three sources:
  // zero mismatches, zero role-holders resolving to no company, zero users
  // holding roles in more than one company. All 22 functions reading the table
  // are SECURITY DEFINER owned by `postgres` (the table's owner) and the table
  // is not FORCE RLS, so they keep working. All five identities reported the
  // same roles and landed on the same portal before and after.
  'user_roles',
  // PERMISSIONS FOUNDATION (2), 2026-09-21, migration
  // 0013_permissions_foundation_and_three_actions.sql. Both tables carry the
  // restrictive policy from birth, not retrofitted: a grant is the most
  // dangerous row in the database to leak across carriers. `permission_actions`
  // is NOT here and never will be — it has no `company_id` (see GLOBAL_TABLES),
  // because the set of actions the code can enforce is not a carrier's to edit.
  'role_permissions', 'user_permission_exceptions',
  // ANNOUNCEMENT READS (1), 2026-09-21, migration
  // 0021_release_note_approval.sql, authored by another session. Confirmed from
  // the live catalog before being listed here:
  //   release_note_reads_own|PERMISSIVE|ALL|(user_id = auth.uid())
  //   release_note_reads_read_reviewers|PERMISSIVE|SELECT|(management OR owner)
  //   tenant_isolation|RESTRICTIVE|ALL|(company_id = (SELECT current_company_id()))
  'release_note_reads',
  // PER-DRIVER PAY (1), 2026-09-22, migration
  // 0040_operator_linehaul_pct_versions.sql. Born restrictive, so there is no
  // window in which a driver's pay percentage was visible across carriers.
  //   Management reads driver linehaul versions|PERMISSIVE|SELECT|(management OR owner)
  //   tenant_isolation|RESTRICTIVE|ALL|(company_id = (SELECT current_company_id()))
  'operator_linehaul_pct_versions',
  // APPLICATIONS AND PEI (11), 2026-09-23, migration
  // 0046_applications_family_restrictive_tenant_policy.sql (stage 3 pass 3c).
  // Stamped in 3a, written to in 3b, isolated here. Ten carry the exact
  // standard predicate; `applications` carries the wider one declared in
  // RESTRICTIVE_WIDER, because a signed-in applicant who is not yet an
  // operator resolves to no company and must still read his own row. No
  // permissive policy was touched: the anonymous apply path runs through the
  // SECURITY DEFINER RPCs `save_application_draft` / `submit_application_draft`
  // and the PEI response route through its own definer path, so a
  // RESTRICTIVE ... TO authenticated policy cannot reach either.
  'applications', 'application_invites',
  'application_correction_requests', 'application_correction_fields',
  'application_document_history', 'application_interview_notes',
  'application_revision_attachments',
  'pei_requests', 'pei_responses', 'pei_accidents', 'pei_request_events',
] as const;

/**
 * Tables that HAVE `company_id` and do NOT yet have the restrictive policy.
 * EMPTY since 2026-09-18: the rollout is complete.
 *
 * An empty list does NOT make this guard vacuous. Coverage is asserted against
 * the LIVE inventory, not against this list: every `company_id` table must
 * appear in `RESTRICTIVE_DONE` or `RESTRICTIVE_EXEMPT` (`undeclared`), and
 * every `RESTRICTIVE_DONE` table must carry exactly one `tenant_isolation`
 * policy of the exact shape (`problems`, whose first branch is
 * "no restrictive policy"). Dropping a policy, or dropping a table name from
 * `RESTRICTIVE_DONE`, still fails. A future table with `company_id` and no
 * policy fails as undeclared until it is migrated or listed here.
 */
/**
 * 2026-09-23, demo carrier stage 3 pass 3a: the applications and PEI families
 * were given a nullable `company_id` and backfilled, deliberately WITHOUT any
 * policy change. Pass 3c (migration 0046) wrote their policies, so they moved
 * into RESTRICTIVE_DONE and this list is EMPTY again — the rollout is complete
 * once more.
 */
const PENDING_RESTRICTIVE = [] as const;


type RestrictiveRow = {
  policyname: string; cmd: string; roles: string; qual: string; with_check: string;
};

/** Extracted so the branches that cannot be staged by DDL from the sandbox
 * (a duplicate policy, a hand-written predicate) can be exercised against
 * authored rows. */
export function restrictiveShapeProblems(
  table: string, rows: RestrictiveRow[],
): string[] {
  const problems: string[] = [];
  if (rows.length === 0) return [`${table}: no restrictive policy`];
  if (rows.length > 1) {
    problems.push(`${table}: ${rows.length} restrictive policies (${rows.map(r => r.policyname).join(', ')})`);
  }
  const expected = RESTRICTIVE_WIDER[table] ?? RESTRICTIVE_PREDICATE;
  for (const r of rows) {
    if (r.policyname !== 'tenant_isolation') problems.push(`${table}: policy named ${r.policyname}`);
    if (r.cmd !== 'ALL') problems.push(`${table}: cmd ${r.cmd}, expected ALL`);
    if (r.roles !== '{authenticated}') problems.push(`${table}: roles ${r.roles}, expected {authenticated}`);
    if (r.qual !== expected) problems.push(`${table}: qual ${r.qual}`);
    if (r.with_check !== expected) problems.push(`${table}: with_check ${r.with_check}`);
  }
  return problems;
}

describe('restrictive tenant policy — exact shape, or declared pending', () => {
  itLive('every company_id table either carries tenant_isolation or is pending', () => {
    const tables = psql(`SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname
            AND col.column_name = 'company_id')
      ORDER BY 1`);
    expect(tables.length, 'the inventory query returned nothing — it broke').toBeGreaterThan(0);
    // The DONE list must not have been emptied or truncated, which is what a
    // lost list would look like. 2026-09-23: the pending list is no longer
    // empty — the eleven applications/PEI tables await pass 3c — so DONE plus
    // PENDING, not DONE alone, has to cover the inventory minus the exempt.
    expect(RESTRICTIVE_DONE.length + PENDING_RESTRICTIVE.length,
      'the DONE list shrank below the live inventory — it was lost or truncated')
      .toBeGreaterThanOrEqual(tables.length - RESTRICTIVE_EXEMPT.length);


    const rows = psql(`SELECT tablename || '\t' || policyname || '\t' || cmd || '\t'
        || roles::text || '\t' || coalesce(qual,'') || '\t' || coalesce(with_check,'')
      FROM pg_policies WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
      ORDER BY 1`).map(l => l.split('\t'));

    const byTable = new Map<string, RestrictiveRow[]>();
    for (const [t, policyname, cmd, roles, qual, with_check] of rows) {
      if (!byTable.has(t)) byTable.set(t, []);
      byTable.get(t)!.push({ policyname, cmd, roles, qual, with_check });
    }

    // No restrictive policy anywhere else in public.
    const strays = [...byTable.keys()].filter(t => !tables.includes(t));
    expect(strays, 'restrictive policies on tables without company_id').toEqual([]);

    const undeclared = tables.filter(t =>
      !(RESTRICTIVE_EXEMPT as readonly string[]).includes(t)
      && !(RESTRICTIVE_DONE as readonly string[]).includes(t)
      && !(PENDING_RESTRICTIVE as readonly string[]).includes(t));
    expect(undeclared, 'these tables have company_id and no restrictive-policy disposition: migrate them, or add them to PENDING_RESTRICTIVE').toEqual([]);

    const stale = (PENDING_RESTRICTIVE as readonly string[])
      .filter(t => byTable.has(t))
      .map(t => `${t}: declared pending but already carries a restrictive policy`);
    expect(stale, 'stale PENDING_RESTRICTIVE entries').toEqual([]);

    const problems = (RESTRICTIVE_DONE as readonly string[])
      .flatMap(t => restrictiveShapeProblems(t, byTable.get(t) ?? []));
    expect(problems, problems.join('\n')).toEqual([]);

    // `company_members` must have none.
    for (const t of RESTRICTIVE_EXEMPT) {
      expect(byTable.get(t) ?? [], `${t} must carry no restrictive policy`).toEqual([]);
    }
  });

  // AUTHORED FIXTURES, disclosed as such: the sandbox role cannot CREATE POLICY,
  // so the duplicate and wrong-predicate branches are exercised against rows
  // written by hand in the shape `pg_policies` returns.
  it('FIXTURE — a second restrictive policy is a problem', () => {
    const good: RestrictiveRow = {
      policyname: 'tenant_isolation', cmd: 'ALL', roles: '{authenticated}',
      qual: RESTRICTIVE_PREDICATE, with_check: RESTRICTIVE_PREDICATE,
    };
    expect(restrictiveShapeProblems('brokers', [good])).toEqual([]);
    expect(restrictiveShapeProblems('brokers', [good, { ...good, policyname: 'tenant_isolation_v2' }]))
      .toEqual([
        'brokers: 2 restrictive policies (tenant_isolation, tenant_isolation_v2)',
        'brokers: policy named tenant_isolation_v2',
      ]);
  });

  it('FIXTURE — the applicant self-exception is accepted ONLY on applications', () => {
    const wider = RESTRICTIVE_WIDER.applications;
    const row: RestrictiveRow = {
      policyname: 'tenant_isolation', cmd: 'ALL', roles: '{authenticated}',
      qual: wider, with_check: wider,
    };
    // Exactly as live on `applications`.
    expect(restrictiveShapeProblems('applications', [row])).toEqual([]);
    // The same widening anywhere else is a problem.
    expect(restrictiveShapeProblems('pei_requests', [row])).toEqual([
      `pei_requests: qual ${wider}`,
      `pei_requests: with_check ${wider}`,
    ]);
    // And `applications` narrowed back to the standard predicate is ALSO a
    // problem: the applicant's own-row read would have been dropped silently.
    expect(restrictiveShapeProblems('applications', [{
      ...row, qual: RESTRICTIVE_PREDICATE, with_check: RESTRICTIVE_PREDICATE,
    }])).toEqual([
      `applications: qual ${RESTRICTIVE_PREDICATE}`,
      `applications: with_check ${RESTRICTIVE_PREDICATE}`,
    ]);
  });

  it('FIXTURE — a predicate naming a literal uuid is a problem', () => {
    const literal = '(company_id = \'6b54d0e6-8743-4284-b55b-8cd094b093dd\'::uuid)';
    expect(restrictiveShapeProblems('facilities', [{
      policyname: 'tenant_isolation', cmd: 'ALL', roles: '{authenticated}',
      qual: literal, with_check: literal,
    }])).toEqual([
      `facilities: qual ${literal}`,
      `facilities: with_check ${literal}`,
    ]);
  });
});

/**
 * OWNER DECISION C, 2026-09-16 — AN AMBIGUOUS COMPANY RESOLVES TO NOTHING.
 *
 * A person matching more than one distinct company across `company_members`,
 * `operators` and `truck_owners` resolves to NULL, not to whichever row a
 * `LIMIT 1` happened to return. Options rejected: one company per person
 * enforced by constraint (too rigid), and pick-by-rule such as newest (silently
 * shows the wrong carrier while both links are live).
 *
 * WHY THIS GUARD READS THE BODY INSTEAD OF BEHAVING.
 * The sandbox psql role cannot execute `public.current_company_id()` at all —
 * `ERROR: permission denied for function current_company_id` — and cannot
 * insert the scratch `carrier_profile` / `company_members` rows an ambiguity
 * needs. The behavioural proof was therefore run through the migration channel
 * (a DO block that stages the ambiguity and then RAISEs, so nothing persists);
 * its verbatim output is in `docs/passes/2026-09-16-2215-ambiguous-company-refused.md`.
 * What CAN be asserted from here is the live body, which is what this does.
 */
function ambiguityProblems(def: string): string[] {
  const code = def.replace(/--[^\n]*/g, '');
  const problems: string[] = [];
  if (/\bLIMIT\b/i.test(code)) problems.push('resolver body contains a LIMIT — it picks a row instead of refusing');
  if (/\bcoalesce\b/i.test(code)) problems.push('resolver body contains COALESCE — a preference chain returns the first source, not a refusal');
  if (!/count\(\*\)\s*=\s*1/i.test(code)) problems.push('resolver body does not require exactly one distinct company');
  if (!/\bUNION\b/i.test(code)) problems.push('resolver body does not read the three sources together');
  return problems;
}

describe('an ambiguous company resolves to NOTHING (owner decision C)', () => {
  itLive('the live resolver picks no row and requires exactly one company', () => {
    expect(ambiguityProblems(resolverDef())).toEqual([]);
  });

  itLive('the live resolver still reads exactly the three sources', () => {
    const code = resolverDef().replace(/--[^\n]*/g, '');
    const sources = (code.match(/FROM\s+public\.(\w+)/gi) ?? [])
      .map(s => s.split('.')[1].toLowerCase()).sort();
    expect(sources).toEqual(['company_members', 'operators', 'truck_owners']);
  });

  itLive('no OTHER database resolver derives a company from a user with a LIMIT', () => {
    // stamp_company_from_recipient and stamp_eld_malfunction_notification_company_id
    // derive from NEW.user_id / NEW.recipient_user_id and were changed in the same
    // pass. stamp_inspection_document_company_id uses a bare scalar subquery,
    // which raises 21000 on two rows, so it is included and must stay LIMIT-free.
    const offenders = psql(`SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f'
        AND p.proname IN ('stamp_company_from_recipient',
                          'stamp_eld_malfunction_notification_company_id',
                          'stamp_inspection_document_company_id')
        AND regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') ~* '\\mlimit\\M'
      ORDER BY 1`);
    expect(offenders).toEqual([]);
  });

  /**
   * FIXTURE, disclosed as such: the resolver body as it stood BEFORE this pass,
   * copied from `pg_get_functiondef` output on 2026-09-16. It is the honest way
   * to demonstrate the check catches the defect — the sandbox role cannot
   * CREATE OR REPLACE a function, so the old body cannot be staged live.
   */
  it('FIXTURE — the pre-decision body is flagged', () => {
    const old = `
      SELECT COALESCE(
        (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() LIMIT 1),
        (SELECT o.company_id FROM public.operators o WHERE o.user_id = auth.uid() LIMIT 1),
        (SELECT t.company_id FROM public.truck_owners t WHERE t.user_id = auth.uid() LIMIT 1)
      )`;
    expect(ambiguityProblems(old)).toEqual([
      'resolver body contains a LIMIT — it picks a row instead of refusing',
      'resolver body contains COALESCE — a preference chain returns the first source, not a refusal',
      'resolver body does not require exactly one distinct company',
      'resolver body does not read the three sources together',
    ]);
  });
});
