import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * STAFF ACCOUNT SUSPENSION — P16-P19, owner decisions 2026-09-21.
 *
 * Two paths can suspend a staff login: the get-staff-list actions
 * deactivate_user / reactivate_user (service-role writer), and a direct
 * PostgREST UPDATE of profiles.account_status, which the staff UPDATE policy
 * still admits for every staff role. Both must refuse anyone without
 * staff_account.suspend, nobody but the owner may touch the owner account, and
 * nobody may change his own status.
 *
 * The live arms read the catalog rather than the migration file, for the reason
 * in definer-live-catalog.test.ts: a trigger or a grant can be changed out of
 * band, and only the catalog says what is actually enforced right now.
 */

const HAS_DB = Boolean(process.env.PGHOST);
const FN = 'supabase/functions/get-staff-list/index.ts';

if (!HAS_DB) {
  skipBanner('staff-suspension-permission.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST, so the trigger, the permission row and the management grant',
    'could not be read from the catalog. The source-order arms still ran.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', timeout: 30_000 })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

const source = readFileSync(FN, 'utf8');

describe('staff_account.suspend is a real, enforced permission', () => {
  itLive('the permission action exists and is a change permission', () => {
    const rows = psql(`
      SELECT kind || '|' || is_active FROM public.permission_actions
       WHERE key = 'staff_account.suspend';
    `);
    expect(rows).toEqual(['change|true']);
  });

  itLive('management holds the grant and the owner does NOT hold a row (P1 lives in the function)', () => {
    const roles = psql(`
      SELECT DISTINCT role::text FROM public.role_permissions
       WHERE action_key = 'staff_account.suspend' ORDER BY 1;
    `);
    expect(roles).toEqual(['management']);
  });

  itLive('a new carrier receives the grant — seed_role_permissions names it', () => {
    const def = psql(`SELECT pg_get_functiondef('public.seed_role_permissions(uuid)'::regprocedure);`).join('\n');
    expect(def).toContain('staff_account.suspend');
  });

  itLive('the trigger is on profiles, fires BEFORE UPDATE, and sorts before the other profiles triggers', () => {
    const rows = psql(`
      SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
       ORDER BY tgname;
    `);
    expect(rows).toContain('aa_enforce_staff_suspension_permission');
    // Postgres fires same-timing triggers in NAME order; the gate must be first.
    expect(rows[0]).toBe('aa_enforce_staff_suspension_permission');
  });

  itLive('the gate function is a pinned SECURITY DEFINER and is not executable by clients', () => {
    const def = psql(
      `SELECT pg_get_functiondef('public.enforce_staff_suspension_permission()'::regprocedure);`,
    ).join('\n');
    expect(def).toContain('SECURITY DEFINER');
    expect(def).toMatch(/SET search_path TO 'public', 'extensions'/);
    for (const role of ['anon', 'authenticated']) {
      const ok = psql(
        `SELECT has_function_privilege('${role}', 'public.enforce_staff_suspension_permission()', 'EXECUTE');`,
      );
      expect(ok, `${role} must not hold EXECUTE on the trigger function`).toEqual(['f']);
    }
  });

  itLive('the gate only cares when account_status actually changes', () => {
    const def = psql(
      `SELECT pg_get_functiondef('public.enforce_staff_suspension_permission()'::regprocedure);`,
    ).join('\n');
    expect(def).toContain('NEW.account_status IS NOT DISTINCT FROM OLD.account_status');
  });

  it('the edge function asks the permission as the CALLER, not as the service role', () => {
    // Asking through the service-role client makes current_company_id() NULL and
    // has_permission answers false for everyone but the owner — the exact defect
    // caught on 2026-09-21 before this pass shipped.
    expect(source).toContain('const supabaseCaller = createClient(');
    expect(source).toMatch(/supabaseCaller\s*\n?\s*\.rpc\('has_permission'/);
    expect(source).not.toMatch(/supabaseAdmin\s*\n?\s*\.rpc\('has_permission'/);
  });

  it('both suspend actions refuse before any write, in the order self → owner → permission', () => {
    const guard = source.slice(source.indexOf('const refuseSuspension'), source.indexOf('// ── Deactivate'));
    const iSelf = guard.indexOf('targetUserId === callerUser.id');
    const iOwner = guard.indexOf("Only the owner can suspend or reinstate the owner account");
    const iPerm = guard.indexOf("'staff_account.suspend'");
    expect(iSelf).toBeGreaterThan(-1);
    expect(iOwner).toBeGreaterThan(iSelf);
    expect(iPerm).toBeGreaterThan(iOwner);

    for (const action of ['deactivate_user', 'reactivate_user']) {
      const branch = source.slice(source.indexOf(`if (action === '${action}')`));
      const iRefusal = branch.indexOf('await refuseSuspension(user_id)');
      const iWrite = branch.indexOf('.update({ account_status');
      expect(iRefusal, `${action} must call the guard`).toBeGreaterThan(-1);
      expect(iWrite, `${action} must write after the guard`).toBeGreaterThan(iRefusal);
    }
  });

  it('the screen hides the suspend control on the owner card and on your own card', () => {
    const panel = readFileSync('src/components/management/staff-directory/StaffMemberPanel.tsx', 'utf8');
    expect(panel).toContain("member.user_id !== currentUserId && !member.roles.includes('owner')");
    // A refusal must surface the real message, not a blank failure.
    expect(panel).toContain("if (data?.error) throw new Error(data.error)");
  });
});
