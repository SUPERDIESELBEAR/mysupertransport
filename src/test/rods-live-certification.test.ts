/**
 * Live RPC certification test — the database is the authority.
 *
 * Pass A built `certify_rods_day` and its offline counterpart. Pass B fixed the
 * 22P02 integer/string mismatch. This test runs the live function as the
 * authenticated driver, end-to-end, with a real transaction that rolls back.
 *
 * It covers the two arms that matter: a clean initial certification, and a
 * superseding amendment that replaces it. Both must succeed, not just return.
 *
 * FIXTURE RULE — read before editing. This test resolves its own subject at
 * runtime: a DEMO operator (`operators.is_demo = true`). It must never name a
 * real driver. An earlier revision hardcoded a production driver's user_id and
 * operator_id; certifying against a real operator is the shape that puts a
 * scratch federal record on a working driver's account, and the rollback is the
 * SECOND line of defence, not the first. If no demo operator exists, this test
 * FAILS rather than falling back to a live identity.
 *
 * WHEN THIS FILE SKIPS, IT SAYS SO LOUDLY.
 */
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedDescribe } from '@/test/helpers/gate';

const HAS_DB = Boolean(process.env.PGHOST);

function psql(sql: string): string {
  return execFileSync('psql', ['-qAt', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function psqlJson(sql: string): unknown {
  const out = psql(sql);
  return out ? JSON.parse(out) : null;
}

const describeLive = (name: string, body: () => void) =>
  gatedDescribe(name, {
    enabled: HAS_DB,
    reason: 'no PGHOST, so the live certification RPC could not be exercised',
    details: [
      'A green run WITHOUT this file is not evidence that',
      'certify_rods_day works.',
    ],
  }, body);


/**
 * Can this harness actually CALL the function? In the Lovable sandbox, psql
 * connects as a restricted role that is deliberately barred from EXECUTE on
 * database functions, so `SELECT public.certify_rods_day(...)` comes back as
 * `permission denied for function certify_rods_day`. That is by design and
 * granting EXECUTE to the sandbox role to work around it is forbidden.
 *
 * The function also cannot be reached over REST from here: it requires an
 * authenticated JWT for the specific driver, and no service-role key is
 * available on Lovable Cloud to mint one.
 *
 * So the executing arm is gated on the real capability and, when it cannot
 * run, says so at the same volume as the missing-PGHOST banner. It must never
 * read as coverage.
 */
function canExecuteFunctions(): boolean {
  if (!HAS_DB) return false;
  try {
    const out = psql(`
      SELECT bool_or(has_function_privilege(current_user, p.oid, 'EXECUTE'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'certify_rods_day'
    `).trim();
    return out === 't';
  } catch {
    return false;
  }
}

const CAN_EXECUTE = canExecuteFunctions();

if (HAS_DB && !CAN_EXECUTE) {
  console.warn(
    [
      '',
      '  ############################################################',
      '  #  rods-live-certification: THE LIVE RPC ARM DID NOT RUN   #',
      '  #                                                          #',
      '  #  This harness role has no EXECUTE on certify_rods_day,   #',
      '  #  by design, and the RPC needs a driver JWT that cannot   #',
      '  #  be minted here. The end-to-end certify/supersede arm    #',
      '  #  was SKIPPED.                                            #',
      '  #                                                          #',
      '  #  A green run of this file is NOT evidence that           #',
      '  #  certify_rods_day works. Run it where a driver session   #',
      '  #  exists, on a disposable instance.                       #',
      '  ############################################################',
      '',
    ].join('\n'),
  );
}

const itExecuting = CAN_EXECUTE ? it : it.skip;

interface DemoFixture {
  operator_id: string;
  user_id: string;
  legal_name: string;
  is_demo: boolean;
}

/**
 * The subject of every arm below. Demo-only by construction: the WHERE clause
 * is the guard, and an empty result is a failure, never a fallback.
 */
/** Single-quote a value for inline SQL. Fixture data only. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolveDemoFixture(): DemoFixture {
  const row = psqlJson(`
SELECT jsonb_build_object(
  'operator_id', o.id,
  'user_id', o.user_id,
  'legal_name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
  'is_demo', o.is_demo
)
FROM public.operators o
JOIN public.profiles p ON p.user_id = o.user_id
WHERE o.is_demo = true AND o.user_id IS NOT NULL
ORDER BY o.id
LIMIT 1;
  `) as DemoFixture | null;

  if (!row?.operator_id || !row.user_id || !row.is_demo) {
    throw new Error(
      'No demo operator available. This test refuses to certify against a live driver — ' +
      'provision a demo driver (is_demo = true) and re-run.',
    );
  }
  return row;
}

describeLive('certify_rods_day live RPC', () => {
  it('resolves a demo operator as its subject, never a live driver', () => {
    const fixture = resolveDemoFixture();
    expect(fixture.operator_id).toBeTruthy();
    expect(fixture.user_id).toBeTruthy();
    expect(fixture.is_demo).toBe(true);
  });

  itExecuting('certifies a clean initial draft and supersedes it with an amendment', () => {
    // Own fixture, resolved live. The connection cannot write auth.users, so
    // the subject is an existing DEMO operator — an account that exists to be
    // written to — rather than a working driver. Rollback still wraps it.
    const { user_id: userId, operator_id: operatorId, legal_name: legalName } = resolveDemoFixture();
    const logDate = '2030-01-01';
    const token1 = '11111111-1111-1111-1111-111111111111';
    const token2 = '22222222-2222-2222-2222-222222222222';

    const result = psqlJson(`
BEGIN;

DO $$
DECLARE
  v_cert jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true);

  INSERT INTO public.rods_days (
    id, operator_id, log_date, record_source, status, locked, is_reconstructed,
    supersedes_day_id, amendment_reason, carrier_name, carrier_usdot, carrier_mc,
    main_office_address, home_terminal_address, home_terminal_timezone,
    truck_number, total_miles_driving_today, from_location, to_location,
    co_driver_name, shipping_document_no, period_start_time,
    total_off_duty_minutes, total_sleeper_minutes, total_driving_minutes, total_on_duty_minutes,
    pdf_path, certification_signature_path, certified_at, certification_legal_name,
    created_at, updated_at
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${operatorId}', '${logDate}',
    'keyed', 'draft', false, false,
    null, null, 'SuperTransport Inc', '1234567', 'MC-123456',
    '123 Main St, Springfield, MO', '456 Depot Rd, Springfield, MO', 'America/Chicago',
    'TRUCK-01', 100, 'Springfield, MO', 'Joplin, MO',
    'None', 'SHIP-12345', '00:00:00',
    1440, 0, 0, 0,
    null, null, null, null,
    now(), now()
  );

  INSERT INTO public.rods_events (
    id, rods_day_id, start_minute, end_minute, duty_status, city, state, remarks, is_short_period
  ) VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    0, 1440, 1, 'Off-Duty', 'XX', 'Rest day', false
  );

  -- Arm 1: initial certification.
  v_cert := public.certify_rods_day(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ${sqlLiteral(legalName)},
    'sigs/initial.png',
    'pdfs/initial.pdf',
    'live-test',
    '${token1}'::uuid,
    '[]'::jsonb,
    '{}'::jsonb
  );
  IF (v_cert->>'status') IS NULL THEN
    RAISE EXCEPTION 'Initial certification returned null: %', v_cert;
  END IF;

  -- Arm 2: superseding amendment.
  INSERT INTO public.rods_days (
    id, operator_id, log_date, record_source, status, locked, is_reconstructed,
    supersedes_day_id, amendment_reason, carrier_name, carrier_usdot, carrier_mc,
    main_office_address, home_terminal_address, home_terminal_timezone,
    truck_number, total_miles_driving_today, from_location, to_location,
    co_driver_name, shipping_document_no, period_start_time,
    total_off_duty_minutes, total_sleeper_minutes, total_driving_minutes, total_on_duty_minutes,
    pdf_path, certification_signature_path, certified_at, certification_legal_name,
    created_at, updated_at
  ) VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc', '${operatorId}', '${logDate}',
    'keyed', 'draft', false, false,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Added missing co-driver', 'SuperTransport Inc', '1234567', 'MC-123456',
    '123 Main St, Springfield, MO', '456 Depot Rd, Springfield, MO', 'America/Chicago',
    'TRUCK-01', 100, 'Springfield, MO', 'Joplin, MO',
    'Jane Smith', 'SHIP-12345', '00:00:00',
    1440, 0, 0, 0,
    null, null, null, null,
    now(), now()
  );

  INSERT INTO public.rods_events (
    id, rods_day_id, start_minute, end_minute, duty_status, city, state, remarks, is_short_period
  ) VALUES (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    0, 1440, 1, 'Off-Duty', 'XX', 'Rest day', false
  );

  v_cert := public.certify_rods_day(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    ${sqlLiteral(legalName)},
    'sigs/amendment.png',
    'pdfs/amendment.pdf',
    'live-test',
    '${token2}'::uuid,
    jsonb_build_array(
      jsonb_build_object('field_path', 'co_driver_name', 'old_value', 'None', 'new_value', 'Jane Smith')
    ),
    '{}'::jsonb
  );
  IF (v_cert->>'status') IS NULL THEN
    RAISE EXCEPTION 'Amendment certification returned null: %', v_cert;
  END IF;
END $$;

SELECT jsonb_build_object(
  'original_status', (SELECT status FROM public.rods_days WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'original_locked', (SELECT locked FROM public.rods_days WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'amendment_status', (SELECT status FROM public.rods_days WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'amendment_locked', (SELECT locked FROM public.rods_days WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'amendment_count', (SELECT count(*) FROM public.rods_amendments WHERE original_day_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
);

ROLLBACK;
    `) as Record<string, unknown>;

    expect(result.original_status).toBe('superseded');
    expect(result.original_locked).toBe(true);
    expect(result.amendment_status).toBe('certified');
    expect(result.amendment_locked).toBe(true);
    expect(result.amendment_count).toBe(1);
  });
});
