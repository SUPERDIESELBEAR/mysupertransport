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
 * each role by setting `request.jwt.claims` (which is what `auth.uid()` reads)
 * inside a transaction that is always rolled back.
 *
 * TWO GATES, both named and counted:
 *   - no PGHOST                -> the live catalog is unreachable.
 *   - columns not present yet  -> the migration is STAGED in a draft and
 *                                 applies on accept. A draft shares the live
 *                                 database and may not run DDL, so until the
 *                                 draft is accepted these columns do not
 *                                 exist and the trigger is not installed.
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

if (!HAS_DB) {
  skipBanner('stop-time-source-trigger.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST in the environment, so the trigger could not be exercised.',
  ]);
} else if (!SCHEMA_READY) {
  skipBanner('stop-time-source-trigger.test.ts LIVE CHECKS DID NOT RUN', [
    'load_stops has no provenance columns yet. The migration is STAGED in',
    'this draft and applies when the draft is accepted; a draft shares the',
    'live database and may not run DDL. Re-run after accepting.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB && SCHEMA_READY,
  reason: HAS_DB
    ? 'the stop provenance columns are staged, not yet applied'
    : 'no PGHOST, so the live trigger could not be exercised',
  details: ['Only this check sees what the trigger actually stamps.'],
});

/**
 * Runs `body` inside a rolled-back transaction with a disposable load, stop,
 * and two profiles/users: one dispatcher, one operator.
 */
function scenario(body: string): string[] {
  const sql = `
begin;
set local role postgres;

create temporary table t_ids (k text primary key, v uuid) on commit drop;

-- Two actors. profiles.id is deliberately NOT the auth user id: writing the
-- auth uid into a profiles FK is the failure this whole family of tests exists
-- to catch.
insert into t_ids values
  ('disp_user', gen_random_uuid()), ('disp_profile', gen_random_uuid()),
  ('op_user',   gen_random_uuid()), ('op_profile',   gen_random_uuid()),
  ('load',      gen_random_uuid()), ('stop',         gen_random_uuid());

insert into public.profiles (id, user_id, first_name, last_name)
  values ((select v from t_ids where k='disp_profile'),
          (select v from t_ids where k='disp_user'), 'Dee', 'Spatcher'),
         ((select v from t_ids where k='op_profile'),
          (select v from t_ids where k='op_user'), 'Otto', 'Perator');

insert into public.user_roles (user_id, role) values
  ((select v from t_ids where k='disp_user'), 'dispatcher'),
  ((select v from t_ids where k='op_user'), 'operator');

insert into public.loads (id, load_number, created_by, updated_by)
  values ((select v from t_ids where k='load'),
          'TRIGTEST-' || substr(gen_random_uuid()::text, 1, 8),
          (select v from t_ids where k='disp_profile'),
          (select v from t_ids where k='disp_profile'));

insert into public.load_stops (id, load_id, stop_sequence, stop_type)
  values ((select v from t_ids where k='stop'),
          (select v from t_ids where k='load'), 1, 'pickup');

${body}

rollback;
`;
  return psql(sql);
}

/** Impersonate an actor for the following statements. */
const as = (who: 'disp' | 'op') =>
  `select set_config('request.jwt.claims',
     json_build_object('sub', (select v from t_ids where k='${who}_user'))::text, true);`;

const reportRow = `
select coalesce(s.arrival_source::text,'-') || '|' ||
       coalesce(pa.first_name,'-') || '|' ||
       coalesce(s.departure_source::text,'-') || '|' ||
       coalesce(pd.first_name,'-') || '|' ||
       coalesce((s.arrival_recorded_by = pa.id)::text,'-')
from public.load_stops s
left join public.profiles pa on pa.id = s.arrival_recorded_by
left join public.profiles pd on pd.id = s.departure_recorded_by
where s.id = (select v from t_ids where k='stop');`;

const setArrival = (who: 'disp' | 'op', ts = "'2026-08-27 08:12'") => `
${as(who)}
update public.load_stops set actual_arrival_at = ${ts}
 where id = (select v from t_ids where k='stop');`;

describe('stamp_load_stop_time_source', () => {
  itLive("a dispatcher setting arrival stamps 'dispatcher_entry' and their profile id", () => {
    const out = scenario(`${setArrival('disp')}${reportRow}`);
    expect(out.at(-1)).toBe('dispatcher_entry|Dee|-|-|true');
  });

  itLive("an operator setting arrival on their own stop stamps 'driver_app'", () => {
    const out = scenario(`${setArrival('op')}${reportRow}`);
    expect(out.at(-1)).toBe('driver_app|Otto|-|-|true');
  });

  itLive('a dispatcher correcting an operator-recorded time re-stamps source and actor', () => {
    const out = scenario(`
${setArrival('op')}
${setArrival('disp', "'2026-08-27 09:45'")}
${reportRow}`);
    expect(out.at(-1)).toBe('dispatcher_entry|Dee|-|-|true');
  });

  itLive('clearing a time to null clears its source and actor', () => {
    const out = scenario(`
${setArrival('disp')}
update public.load_stops set actual_arrival_at = null
 where id = (select v from t_ids where k='stop');
${reportRow}`);
    expect(out.at(-1)).toBe('-|-|-|-|-');
  });

  itLive('arrival and departure stamp independently', () => {
    const out = scenario(`
${setArrival('op')}
${as('disp')}
update public.load_stops set actual_departure_at = '2026-08-27 11:30'
 where id = (select v from t_ids where k='stop');
${reportRow}`);
    // Arrival keeps the driver's provenance; only departure takes the dispatcher's.
    expect(out.at(-1)).toBe('driver_app|Otto|dispatcher_entry|Dee|true');
  });
});
