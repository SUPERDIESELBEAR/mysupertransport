import { describe, expect } from 'vitest';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import { execFileSync } from 'node:child_process';

/**
 * ONE OPERATOR, ONE SETTLEMENT — ASSERTED AT THE DATABASE.
 *
 * A component test cannot prove this. The driver portal only ever asks for the
 * driver's own operator_id, so a UI assertion would pass even if the policy
 * admitted every row in the table. Only the catalog can say who a policy lets
 * in, which is why this reads pg_policy.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner('operator-settlement-isolation.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST, so pg_policy could not be read. This file is the only guard',
    "against one driver reading another driver's settlement.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live policy catalog could not be read',
  details: ['Only a catalog read can see who a policy actually admits.'],
});

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').map(l => l.trim()).filter(Boolean);
}

const TABLES = ['settlements', 'settlement_line_items', 'settlement_withheld_loads'];

describe('operator settlement isolation', () => {
  itLive('every permissive settlement SELECT policy for authenticated is self-scoped', () => {
    // 2026-09-17 MONEY BATCH: these tables also carry the RESTRICTIVE
    // tenant_isolation policy, whose predicate is company-scoped and names no
    // driver. It is excluded here because a restrictive policy cannot ADMIT a
    // row — it can only remove one — so it can never widen driver visibility.
    // Its presence and shape are asserted in tenancy-resolver.test.ts.
    // 2026-09-21 PERMISSIONS FOUNDATION: `settlements_view_permission` is a
    // SELECT-only policy reading `has_permission('settlement.view')`, which
    // resolves the caller with auth.uid() INSIDE the function, so the predicate
    // itself carries no auth.uid() to match. It is excluded by name, not by
    // loosening the pattern, and its own shape is asserted below. P2 grants the
    // dispatcher this read deliberately; no operator holds the grant, and an
    // operator's own rows still come from the self-scoped policy.
    const offenders = psql(
      "select c.relname || ' | ' || p.polname from pg_policy p " +
        'join pg_class c on c.oid = p.polrelid ' +
        "join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' " +
        `where c.relname in (${TABLES.map(t => `'${t}'`).join(',')}) ` +
        "and p.polpermissive and p.polcmd in ('r','*') " +
        "and p.polname <> 'settlements_view_permission' " +
        "and coalesce(pg_get_expr(p.polqual, p.polrelid),'') !~* 'auth\\.uid\\(\\)' " +
        'order by 1',
    );
    expect(offenders).toEqual([]);
  });

  itLive('the one excluded policy is SELECT-only and gated on the permission', () => {
    const rows = psql(
      "select p.polcmd::text || ' | ' || pg_get_expr(p.polqual, p.polrelid) " +
        "|| ' | ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'NO-CHECK') " +
        'from pg_policy p join pg_class c on c.oid = p.polrelid ' +
        "where c.relnamespace = 'public'::regnamespace " +
        "and p.polname = 'settlements_view_permission'",
    );
    expect(rows).toHaveLength(1);
    const [cmd, using, check] = rows[0].split(' | ');
    expect(cmd).toBe('r');
    expect(check).toBe('NO-CHECK');
    expect(using).toContain("has_permission('settlement.view'");
    // Wrapped in a scalar subquery: evaluated once per query, not once per row.
    expect(using).toMatch(/\(\s*SELECT/);
  });




  itLive('anon holds no privilege on any settlement table', () => {
    const granted = psql(
      "select table_name || ' | ' || privilege_type from information_schema.role_table_grants " +
        `where table_schema = 'public' and grantee = 'anon' and table_name in (${TABLES.map(t => `'${t}'`).join(',')}) ` +
        'order by 1',
    );
    expect(granted).toEqual([]);
  });

  itLive('the deposit function is definer, pinned, and not PUBLIC', () => {
    const row = psql(
      "select p.prosecdef::text || ' | ' " +
        "|| coalesce(array_to_string(p.proconfig, ','), 'NO-PIN') || ' | ' " +
        "|| has_function_privilege('public', p.oid, 'EXECUTE')::text " +
        'from pg_proc p join pg_namespace n on n.oid = p.pronamespace ' +
        "and n.nspname = 'public' where p.proname = 'my_rm_deposit'",
    );
    expect(row).toEqual(['true | search_path=public, extensions | false']);
  });

  itLive('the deposit function returns the caller\'s balance only', () => {
    const shape = psql(
      'select pg_get_function_result(p.oid) from pg_proc p ' +
        "join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' " +
        "where p.proname = 'my_rm_deposit'",
    );
    expect(shape).toEqual(['TABLE(current_balance numeric, target_amount numeric)']);
  });
});
