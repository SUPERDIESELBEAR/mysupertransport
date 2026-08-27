import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * LIVE TRIGGER CHECK — stop_time_source stamping.
 *
 * `stamp_load_stop_time_source` derives the capture source from the WRITER'S
 * ROLE and stamps the actor with `current_profile_id()`. Neither can be read
 * off the client: the whole point is that the client cannot influence it. So
 * this file exercises the real trigger against the real table, impersonating
 * each actor by setting `request.jwt.claims` (which is what `auth.uid()` reads)
 * inside a transaction that is always rolled back.
 *
 * FIXTURE RULE — read before editing. This follows
 * rods-live-certification.test.ts:
 *
 *   - It runs as the AMBIENT psql role. There is no `set local role postgres`:
 *     no other database test in this project assumes that privilege, and the
 *     impersonation that actually matters is the `set_config` below.
 *   - It never writes `auth.users`. The two actors are RESOLVED from identities
 *     that already exist: one user holding `operator` and NOT holding
 *     dispatcher/management/owner (a driver who also holds a staff role would
 *     be stamped `dispatcher_entry`, so the test would prove nothing), and one
 *     user holding dispatcher or management and NOT `operator`.
 *   - The load and stop it writes to are DISPOSABLE rows created inside the
 *     transaction, not a live load, and the load is assigned to the resolved
 *     operator so `enforce_load_stops_operator_update` sees a legitimate
 *     driver-path write.
 *
 * TWO GATES, both named and counted:
 *   - no PGHOST                -> the live catalog is unreachable.
 *   - provenance columns absent -> the migration has not been applied here.
 */

const HAS_DB = Boolean(process.env.PGHOST);

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').map(l => l.trim()).filter(Boolean);
}

let SCHEMA_READY = false;
if (HAS_DB) {
  try {
    SCHEMA_READY = psql(
      `select count(*) from information_schema.columns
        where table_schema='public' and table_name='load_stops'
          and column_name in ('arrival_source','departure_source',
                              'arrival_recorded_by','departure_recorded_by')`,
    )[0] === '4';
  } catch {
    SCHEMA_READY = false;
  }
}

/**
 * Third gate, and the one that bites here. `stamp_load_stop_time_source` is a
 * BEFORE UPDATE trigger, so exercising it requires UPDATE on load_stops. The
 * sandbox psql role (`sandbox_exec`) is granted SELECT and INSERT and nothing
 * else, on every public table — the same deliberate restriction that bars
 * EXECUTE in rods-live-certification.test.ts. Granting UPDATE to work around it
 * is forbidden, so the arm is gated on the real capability and says so at the
 * same volume as the missing-PGHOST banner. It must never read as coverage.
 */
let CAN_UPDATE = false;
if (HAS_DB) {
  try {
    CAN_UPDATE = psql(
      `select has_table_privilege('public.load_stops','UPDATE')::text`,
    )[0] === 'true';
  } catch {
    CAN_UPDATE = false;
  }
}

if (!HAS_DB) {
  skipBanner('stop-time-source-trigger.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST in the environment, so the trigger could not be exercised.',
  ]);
} else if (!SCHEMA_READY) {
  skipBanner('stop-time-source-trigger.test.ts LIVE CHECKS DID NOT RUN', [
    'load_stops has no provenance columns in this database, so the trigger',
    'is not installed. Apply the provenance migration and re-run.',
  ]);
} else if (!CAN_UPDATE) {
  skipBanner('stop-time-source-trigger.test.ts BEHAVIOURAL CHECKS DID NOT RUN', [
    'This harness role has SELECT and INSERT on load_stops and no UPDATE.',
    'The trigger is BEFORE UPDATE, so it cannot fire from here at all.',
    'Granting UPDATE to the sandbox role is forbidden.',
    '',
    'THESE FIVE SKIPS ARE NOT COVERAGE. Read them as untested here:',
    '  - the dispatcher path is verified MANUALLY in the application, by a',
    '    staff user typing a time on a load stop and reading back the stamped',
    '    source and actor. No automated check covers it in this environment.',
    '  - the operator (driver_app) path CANNOT be verified at all until the',
    '    driver check-in app exists (Module 11). Nothing writes that path today.',
    '',
    'The structural checks below DO run here: they assert the trigger exists,',
    'is BEFORE UPDATE on public.load_stops, is SECURITY DEFINER and pins',
    'search_path. Structure is not behaviour — a correctly attached trigger',
    'with the wrong body would still pass them.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB && SCHEMA_READY && CAN_UPDATE,
  reason: !HAS_DB
    ? 'no PGHOST, so the live trigger could not be exercised'
    : !SCHEMA_READY
      ? 'the stop provenance columns are not present in this database'
      : 'the harness role has no UPDATE on load_stops, so a BEFORE UPDATE trigger cannot fire',
  details: [
    'Only this check sees what the trigger actually stamps.',
    'Dispatcher path: verified manually in the app. Operator path: unverifiable',
    'until the driver app exists. A permanent skip is not coverage.',
  ],
});

/* ------------------------------------------------------------------ */
/* Structural checks — catalog SELECTs only                            */
/* ------------------------------------------------------------------ */

/**
 * These follow definer-live-catalog.test.ts: they read pg_proc / pg_trigger
 * and need nothing but SELECT, so they run under the harness role's existing
 * privileges even though the behavioural arm cannot. They prove the trigger is
 * ATTACHED AND SHAPED correctly; they prove nothing about what it stamps.
 */
const itStructure = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Catalog-only checks; they need SELECT and nothing more.'],
});

describe('stamp_load_stop_time_source (structure)', () => {
  itStructure('the function exists in public', () => {
    expect(
      psql(
        `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='stamp_load_stop_time_source'`,
      ),
    ).toEqual(['1']);
  });

  itStructure('it is SECURITY DEFINER', () => {
    expect(
      psql(
        `select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='stamp_load_stop_time_source'`,
      ),
    ).toEqual(['true']);
  });

  itStructure('it pins search_path to public and extensions', () => {
    const rows = psql(
      `select coalesce(array_to_string(p.proconfig, ','), '<none>')
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='stamp_load_stop_time_source'`,
    );
    expect(rows).toHaveLength(1);
    const pin = rows[0].replace(/^search_path=/, '');
    expect(rows[0]).toMatch(/^search_path=/);
    expect(
      pin.split(',').map(s => s.trim().replace(/^"|"$/g, '')).sort(),
    ).toEqual(['extensions', 'public']);
  });

  itStructure('it is attached BEFORE UPDATE on public.load_stops', () => {
    // tgtype bit 1 = BEFORE (0 = AFTER), bit 4 = UPDATE, bit 2 = INSERT, bit 3 = DELETE.
    const rows = psql(
      `select (t.tgtype & 2 > 0)::text || '|' || (t.tgtype & 16 > 0)::text || '|' ||
              (t.tgtype & 4 > 0)::text || '|' || (t.tgtype & 8 > 0)::text
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
        where n.nspname='public' and c.relname='load_stops'
          and p.proname='stamp_load_stop_time_source' and not t.tgisinternal`,
    );
    // BEFORE | UPDATE | not INSERT | not DELETE
    expect(rows).toEqual(['true|true|false|false']);
  });
});




/* ------------------------------------------------------------------ */
/* Fixture: resolve, never invent                                      */
/* ------------------------------------------------------------------ */

/**
 * A driver: holds `operator`, holds none of dispatcher/management/owner.
 * A staff actor: holds dispatcher or management, does NOT hold `operator`.
 *
 * Selected in the SAME transaction as the writes, into a temp table, so the
 * ids used by the inserts and the ids used by the assertions cannot drift.
 */
const RESOLVE = `
insert into t_ids(k, v)
select k, v from (
  select 'op_user' as k, o.user_id as v, 1 as ord from public.operators o
   where o.user_id is not null
     and exists (select 1 from public.profiles p where p.user_id = o.user_id)
     and exists (select 1 from public.user_roles r
                  where r.user_id = o.user_id and r.role = 'operator')
     and not exists (select 1 from public.user_roles r
                  where r.user_id = o.user_id
                    and r.role in ('dispatcher','management','owner'))
   order by coalesce(o.is_demo, false) desc, o.id
   limit 1
) s;

insert into t_ids(k, v)
select 'op_operator', o.id from public.operators o
 where o.user_id = (select v from t_ids where k='op_user') order by o.id limit 1;

insert into t_ids(k, v)
select 'op_profile', p.id from public.profiles p
 where p.user_id = (select v from t_ids where k='op_user') limit 1;

insert into t_ids(k, v)
select 'staff_user', p.user_id from public.profiles p
 where exists (select 1 from public.user_roles r
                where r.user_id = p.user_id and r.role in ('dispatcher','management'))
   and not exists (select 1 from public.user_roles r
                where r.user_id = p.user_id and r.role = 'operator')
 order by p.id limit 1;

insert into t_ids(k, v)
select 'staff_profile', p.id from public.profiles p
 where p.user_id = (select v from t_ids where k='staff_user') limit 1;
`;

/** Fail loudly if either identity is missing, instead of silently passing. */
function assertIdentitiesExist(): void {
  const rows = psql(`
select
  (select count(*) from public.operators o
    where o.user_id is not null
      and exists (select 1 from public.profiles p where p.user_id = o.user_id)
      and exists (select 1 from public.user_roles r where r.user_id = o.user_id and r.role='operator')
      and not exists (select 1 from public.user_roles r where r.user_id = o.user_id
                        and r.role in ('dispatcher','management','owner')))
  || '|' ||
  (select count(*) from public.profiles p
    where exists (select 1 from public.user_roles r where r.user_id = p.user_id
                    and r.role in ('dispatcher','management'))
      and not exists (select 1 from public.user_roles r where r.user_id = p.user_id and r.role='operator'))
`);
  const [drivers, staff] = (rows[0] ?? '0|0').split('|').map(Number);
  if (!drivers) throw new Error('No operator-only identity exists to impersonate.');
  if (!staff) throw new Error('No dispatcher/management identity exists to impersonate.');
}

/**
 * Runs `body` inside a rolled-back transaction holding a disposable load —
 * assigned to the resolved operator — and one disposable stop on it.
 */
function scenario(body: string): string[] {
  assertIdentitiesExist();
  const sql = `
begin;

create temporary table t_ids (k text primary key, v uuid) on commit drop;
${RESOLVE}

insert into t_ids values ('load', gen_random_uuid()), ('stop', gen_random_uuid());

insert into public.loads (id, load_number, operator_id, created_by, updated_by)
  values ((select v from t_ids where k='load'),
          'TRIGTEST-' || substr(gen_random_uuid()::text, 1, 8),
          (select v from t_ids where k='op_operator'),
          (select v from t_ids where k='staff_profile'),
          (select v from t_ids where k='staff_profile'));

insert into public.load_stops (id, load_id, stop_sequence, stop_type)
  values ((select v from t_ids where k='stop'),
          (select v from t_ids where k='load'), 1, 'pickup');

${body}

rollback;
`;
  return psql(sql);
}

/** Impersonate an actor for the following statements. */
const as = (who: 'staff' | 'op') =>
  `select set_config('request.jwt.claims',
     json_build_object('sub', (select v from t_ids where k='${who}_user'),
                       'role', 'authenticated')::text, true);`;

/**
 * source|actor-tag for arrival, then for departure. The actor is reported as a
 * TAG ('op' / 'staff') resolved from the fixture ids, so the assertion is about
 * WHICH profile was stamped, not about a name that could collide.
 */
const reportRow = `
select coalesce(s.arrival_source::text,'-') || '|' ||
       coalesce(case s.arrival_recorded_by
                  when (select v from t_ids where k='op_profile') then 'op'
                  when (select v from t_ids where k='staff_profile') then 'staff'
                  else 'other' end, '-') || '|' ||
       coalesce(s.departure_source::text,'-') || '|' ||
       coalesce(case s.departure_recorded_by
                  when (select v from t_ids where k='op_profile') then 'op'
                  when (select v from t_ids where k='staff_profile') then 'staff'
                  else 'other' end, '-')
from public.load_stops s
where s.id = (select v from t_ids where k='stop');`;

const setArrival = (who: 'staff' | 'op', ts = "'2026-08-27 08:12'") => `
${as(who)}
update public.load_stops set actual_arrival_at = ${ts}
 where id = (select v from t_ids where k='stop');`;

describe('stamp_load_stop_time_source', () => {
  itLive("a dispatcher setting arrival stamps 'dispatcher_entry' and their profile id", () => {
    const out = scenario(`${setArrival('staff')}${reportRow}`);
    expect(out.at(-1)).toBe('dispatcher_entry|staff|-|-');
  });

  itLive("an operator setting arrival on their own stop stamps 'driver_app'", () => {
    const out = scenario(`${setArrival('op')}${reportRow}`);
    expect(out.at(-1)).toBe('driver_app|op|-|-');
  });

  itLive('a dispatcher correcting an operator-recorded time re-stamps source and actor', () => {
    const out = scenario(`
${setArrival('op')}
${setArrival('staff', "'2026-08-27 09:45'")}
${reportRow}`);
    expect(out.at(-1)).toBe('dispatcher_entry|staff|-|-');
  });

  itLive('clearing a time to null clears its source and actor', () => {
    const out = scenario(`
${setArrival('staff')}
update public.load_stops set actual_arrival_at = null
 where id = (select v from t_ids where k='stop');
${reportRow}`);
    expect(out.at(-1)).toBe('-|-|-|-');
  });

  itLive('arrival and departure stamp independently', () => {
    const out = scenario(`
${setArrival('op')}
${as('staff')}
update public.load_stops set actual_departure_at = '2026-08-27 11:30'
 where id = (select v from t_ids where k='stop');
${reportRow}`);
    // Arrival keeps the driver's provenance; only departure takes the staff actor's.
    expect(out.at(-1)).toBe('driver_app|op|dispatcher_entry|staff');
  });
});
