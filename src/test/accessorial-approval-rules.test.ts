import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * MODULE 5, PASS 5 — the late accessorial can now be reached, and the two
 * rules that make reaching it safe.
 *
 * 1. THE DISPATCHER APPROVAL LIMIT IS READ, NEVER PASSED. A limit the caller
 *    supplies is a limit the caller can change, so the function reads
 *    settlement_settings itself. Asserted against the live body.
 * 2. PROOF IS TOTAL. Every charge type maps to a proof kind; an unlisted type
 *    falls back to any_document rather than becoming unsubmittable. The
 *    mapping itself is PROPOSED BY THE BUILD, not stated by the owner.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('accessorial approval rule checks did not run', [
    'No PGHOST, so the live function bodies and the proof mapping could not',
    'be read. The source-level reachability checks below still ran.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live function bodies could not be read',
  details: ['Only this file asserts the approval limit and proof rules.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}
const body = (name: string) =>
  psql(`select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${name}'`).join('\n');

const CHARGE_TYPES = ['linehaul','fsc','detention','stopoff','lumper','layover','tonu','reimbursement','other'];

describe('late accessorial approval rules (live)', () => {
  itLive('approve reads the dispatcher limit itself and takes no limit argument', () => {
    const def = body('approve_accessorial_adjustment');
    expect(def).toContain('settlement_settings');
    expect(def).toContain('dispatcher_accessorial_approval_limit');
    // Exactly two arguments: the adjustment and the reason. No third.
    const args = psql(`select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_accessorial_adjustment'`)[0];
    expect(args).toBe('p_id uuid, p_reason text');
  });

  itLive('the limit lives on settlement_settings and is nullable', () => {
    const [row] = psql(`select is_nullable from information_schema.columns where table_schema='public' and table_name='settlement_settings' and column_name='dispatcher_accessorial_approval_limit'`);
    expect(row).toBe('YES');
  });

  itLive('every charge type maps to a proof kind, and an unknown one still maps', () => {
    for (const t of [...CHARGE_TYPES, 'a_type_nobody_has_invented_yet']) {
      const [kind] = psql(`select public.accessorial_proof_kind('${t}')`);
      expect(['broker_agreement', 'receipt', 'any_document']).toContain(kind);
    }
    expect(psql(`select public.accessorial_proof_kind('detention')`)[0]).toBe('broker_agreement');
    expect(psql(`select public.accessorial_proof_kind('lumper')`)[0]).toBe('receipt');
    expect(psql(`select public.accessorial_proof_kind('a_type_nobody_has_invented_yet')`)[0]).toBe('any_document');
  });

  itLive('submission refuses an adjustment with no proof, and tells whoever gets notified', () => {
    const def = body('submit_accessorial_adjustment');
    expect(def).toContain('cannot be submitted without backup documentation');
    expect(def).toContain('INSERT INTO public.notifications');
    expect(def).toContain("'management'::app_role");
  });
});

describe('the five writers are reachable from a screen', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const lib = read('src/lib/accessorialAdjustments.ts');

  it('every writer has a client call site', () => {
    for (const fn of [
      'create_accessorial_adjustment',
      'submit_accessorial_adjustment',
      'approve_accessorial_adjustment',
      'reject_accessorial_adjustment',
      'void_accessorial_adjustment',
    ]) {
      expect(lib).toContain(fn);
    }
  });

  it('the load page renders the card and both portals render the review page', () => {
    expect(read('src/pages/dispatch/LoadDetailPage.tsx')).toContain('<LateAccessorialsCard');
    expect(read('src/pages/management/ManagementPortal.tsx')).toContain('<LateAccessorialsPage />');
    expect(read('src/pages/dispatch/DispatchPortal.tsx')).toContain('<LateAccessorialsPage />');
  });

  it('both portals carry a navigation item that points at it', () => {
    expect(read('src/pages/management/ManagementPortal.tsx')).toContain("path: 'late-accessorials'");
    expect(read('src/pages/dispatch/DispatchPortal.tsx')).toContain("path: 'dispatch-late-accessorials'");
  });

  it('the client mirror of the proof mapping says it is not authoritative', () => {
    expect(lib.toLowerCase()).toContain('authoritative');
  });
});
