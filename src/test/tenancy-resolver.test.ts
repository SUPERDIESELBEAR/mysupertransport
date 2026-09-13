import { describe, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
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

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

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

  itLive('FAILS CLOSED — no COALESCE and no fallback company in the executable body', () => {
    // Comments are stripped: the body's own comment NAMES the protections, and
    // asserting against commentary would pass on a function that says the right
    // thing and does the wrong one — the exact shape of the defect being guarded.
    const code = resolverDef().replace(/--[^\n]*/g, '');
    expect(code.toLowerCase()).not.toContain('coalesce');
    expect(code).not.toMatch(/carrier_profile/i);
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
        AND t.tgenabled = 'O' ORDER BY 1`);
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
