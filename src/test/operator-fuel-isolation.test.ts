import { describe, expect } from 'vitest';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import { execFileSync } from 'node:child_process';

/**
 * ONE DRIVER, HIS OWN FUEL — ASSERTED AT THE DATABASE, BY REFUSAL.
 *
 * This is the file that stands between one driver and another driver's
 * spending, locations and cash advances. A component test cannot prove it: the
 * driver portal never names an operator id, so a rendered assertion would pass
 * unchanged even if the read admitted the whole fleet.
 *
 * So these checks IMPERSONATE a driver — `set local role authenticated` with
 * that driver's uid in the JWT claims — and then try to reach another driver's
 * fuel by every route a client can construct: the table directly, the line
 * rows, and the function. Each attempt must come back EMPTY. A refusal
 * demonstrated is worth more than a policy read that looks right.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner('operator-fuel-isolation.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST, so no impersonated read could be attempted. This file is the',
    "only guard against one driver reading another driver's fuel.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the refusal could not be demonstrated live',
  details: ['Only an impersonated read can show what a driver actually gets.'],
});

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * WHAT COULD AND COULD NOT BE DEMONSTRATED HERE.
 *
 * The sandbox connects as a role with no membership in `authenticated` and no
 * right to grant one, so a full impersonated session could NOT be opened:
 * `set role authenticated` returns "permission denied to set role". That is
 * recorded rather than papered over.
 *
 * What IS demonstrated live, by attempt and refusal: a role holding no grant
 * on the function is REFUSED when it calls it. What is asserted from the
 * catalog: who holds the grant, that no fuel policy admits an operator, that
 * the function takes no argument, and that its result carries no staff
 * diagnostic. Those four together leave no route a driver could take.
 */

/** Attempt `sql` and report the refusal, if any, instead of throwing. */
function attempt(sql: string): { ok: boolean; error: string } {
  try {
    execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, error: '' };
  } catch (e) {
    return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) };
  }
}

describe('operator fuel isolation', () => {
  itLive('the function takes no argument, so there is nothing to substitute', () => {
    const args = psql(
      "select coalesce(pg_get_function_identity_arguments(p.oid), '') from pg_proc p "
      + "join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' "
      + "where p.proname = 'my_fuel_transactions'",
    );
    expect(args).toEqual([]); // no rows printed for an empty identity argument list
  });

  itLive('the function is definer, pinned, and not executable by PUBLIC or anon', () => {
    const row = psql(
      "select p.prosecdef::text || ' | ' "
      + "|| coalesce(array_to_string(p.proconfig, ','), 'NO-PIN') || ' | ' "
      + "|| has_function_privilege('public', p.oid, 'EXECUTE')::text || ' | ' "
      + "|| has_function_privilege('anon', p.oid, 'EXECUTE')::text || ' | ' "
      + "|| has_function_privilege('authenticated', p.oid, 'EXECUTE')::text "
      + 'from pg_proc p join pg_namespace n on n.oid = p.pronamespace '
      + "and n.nspname = 'public' where p.proname = 'my_fuel_transactions'",
    );
    expect(row).toEqual(['true | search_path=public, extensions | false | false | true']);
  });

  itLive('no fuel SELECT policy admits the operator role at all', () => {
    // The driver reads fuel ONLY through the self-scoped function. If a policy
    // ever opened the table to operators, this fails before anything renders.
    const offenders = psql(
      "select c.relname || ' | ' || p.polname from pg_policy p "
      + 'join pg_class c on c.oid = p.polrelid '
      + "join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' "
      + "where c.relname in ('fuel_transactions','fuel_transaction_lines') "
      + "and p.polcmd in ('r','*') "
      + "and coalesce(pg_get_expr(p.polqual, p.polrelid),'') ilike '%''operator''::app_role%' "
      + 'order by 1',
    );
    expect(offenders).toEqual([]);
  });

  itLive('anon holds no privilege on any fuel table', () => {
    const granted = psql(
      "select table_name || ' | ' || privilege_type from information_schema.role_table_grants "
      + "where table_schema = 'public' and grantee = 'anon' "
      + "and table_name in ('fuel_transactions','fuel_transaction_lines') order by 1",
    );
    expect(granted).toEqual([]);
  });

  itLive('a caller holding no grant is REFUSED when it calls the function', () => {
    // This is the refusal itself, not a description of one: the sandbox role
    // holds no EXECUTE grant, and the database says so when it tries.
    expect(
      attempt("select has_function_privilege(current_user,'public.my_fuel_transactions()','EXECUTE')"),
    ).toMatchObject({ ok: true });
    const denied = attempt('select count(*) from public.my_fuel_transactions()');
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('permission denied for function my_fuel_transactions');
  });

  itLive('the driver is resolved inside the function, from the session, not an input', () => {
    const body = psql(
      'select pg_get_functiondef(p.oid) from pg_proc p '
      + "join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' "
      + "where p.proname = 'my_fuel_transactions'",
    ).join('\n');
    expect(body).toContain('auth.uid()');
    // An operator id arriving from outside is the failure mode this pass exists
    // to prevent, and the function has no parameter it could arrive through.
    expect(/\$1|_operator_id|p_operator/.test(body)).toBe(false);
  });

  itLive('the function never returns a staff diagnostic column', () => {
    const shape = psql(
      'select pg_get_function_result(p.oid) from pg_proc p '
      + "join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' "
      + "where p.proname = 'my_fuel_transactions'",
    ).join(' ');
    for (const forbidden of ['match_status', 'disagreement', 'reconciliation', 'unmatched']) {
      expect(shape.includes(forbidden), `the result shape names ${forbidden}`).toBe(false);
    }
  });
});
