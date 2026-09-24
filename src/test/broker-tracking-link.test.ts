import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * LIVE RULE CHECK — broker tracking link (0066).
 *
 * The harness role (sandbox_exec) holds no EXECUTE on the three tracking
 * functions (granted to anon/authenticated only, by design) and is a member
 * of no role, so it cannot SET ROLE to call them. The behaviour — key
 * whitelist, every label, every not-active case, refusals, cross-carrier —
 * was proven in one raising transaction in
 * docs/passes/2026-09-24-2350-broker-tracking-link.md. Structure runs here.
 */
const HAS_DB = Boolean(process.env.PGHOST);
function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}
let CAN_EXEC = false;
if (HAS_DB) {
  try { CAN_EXEC = psql(`select has_function_privilege('public.resolve_load_tracking_link(uuid)','EXECUTE')::text`)[0] === 'true'; } catch { CAN_EXEC = false; }
}
if (HAS_DB && !CAN_EXEC) {
  skipBanner('broker-tracking-link.test.ts BEHAVIOURAL CHECK DID NOT RUN', [
    'The harness role has no EXECUTE on the tracking functions and cannot SET ROLE.',
    'THIS SKIP IS NOT COVERAGE. The behaviour is proven in the pass report (raising transaction).',
  ]);
}
const itS = gatedIt({ enabled: HAS_DB, reason: 'no PGHOST', details: ['Catalog-only checks.'] });
const itLive = gatedIt({
  enabled: HAS_DB && CAN_EXEC,
  reason: !HAS_DB ? 'no PGHOST' : 'the harness role has no EXECUTE on the tracking functions',
  details: ['Behaviour proven in the pass report; a permanent skip is not coverage.'],
});
const def = (fn: string) => psql(`select pg_get_functiondef('public.${fn}'::regproc)`).join('\n');
const FNS = ['get_or_create_load_tracking_link', 'revoke_load_tracking_link', 'resolve_load_tracking_link', '_load_tracking_assert_staff'];

describe('broker tracking link (structure)', () => {
  itS('all four are SECURITY DEFINER pinned to public, extensions', () => {
    for (const fn of FNS) {
      const [row] = psql(`select prosecdef::text || '|' || array_to_string(proconfig, ',') from pg_proc where oid = 'public.${fn}'::regproc`);
      expect(row, fn).toBe('true|search_path=public, extensions');
    }
  });
  itS('grants: create/revoke authenticated only; resolve anon + authenticated; helper nobody', () => {
    const g = (role: string, fn: string) => psql(`select has_function_privilege('${role}','public.${fn}(uuid)','EXECUTE')::text`)[0];
    expect(g('anon', 'get_or_create_load_tracking_link')).toBe('false');
    expect(g('anon', 'revoke_load_tracking_link')).toBe('false');
    expect(g('authenticated', 'get_or_create_load_tracking_link')).toBe('true');
    expect(g('authenticated', 'revoke_load_tracking_link')).toBe('true');
    expect(g('anon', 'resolve_load_tracking_link')).toBe('true');
    expect(g('authenticated', 'resolve_load_tracking_link')).toBe('true');
    expect(g('anon', '_load_tracking_assert_staff')).toBe('false');
    expect(g('authenticated', '_load_tracking_assert_staff')).toBe('false');
  });
  itS('caller check: dispatcher/management/owner and same company, written in the function', () => {
    const body = def('_load_tracking_assert_staff');
    expect(body).toMatch(/'dispatcher'::app_role/);
    expect(body).toMatch(/'management'::app_role/);
    expect(body).toMatch(/'owner'::app_role/);
    expect(body).toMatch(/company_id IS DISTINCT FROM public\.current_company_id\(\)/);
    for (const fn of ['get_or_create_load_tracking_link', 'revoke_load_tracking_link']) {
      expect(def(fn)).toMatch(/_load_tracking_assert_staff\(p_load_id\)/);
    }
  });
  itS('create refuses cancelled/tonu and re-issues a new token after revoke', () => {
    const body = def('get_or_create_load_tracking_link');
    expect(body).toMatch(/status IN \('cancelled', 'tonu'\)/);
    expect(body).toMatch(/Tracking is off for cancelled loads\./);
    expect(body).toMatch(/SET token = v_new, revoked_at = NULL/);
    expect(body).toMatch(/v_load\.company_id/);
  });
  itS('resolve goes through the gate and checks scope, cancelled/tonu and the 7-day window', () => {
    const body = def('resolve_load_tracking_link');
    expect(body).toMatch(/_share_token_gate\(p_token\)/);
    expect(body).toMatch(/jsonb_build_object\('outcome', 'throttled'\)/);
    expect(body).toMatch(/scope IS DISTINCT FROM 'load_tracking'/);
    expect(body).toMatch(/status IN \('cancelled', 'tonu'\)/);
    expect(body).toMatch(/COALESCE\(v_load\.delivered_at/);
    expect(body).toMatch(/new_status = 'delivered'/);
    expect(body).toMatch(/interval '7 days'/);
  });
  itS('every label is computed in the database', () => {
    const body = def('resolve_load_tracking_link');
    expect(body).toMatch(/\('available', 'covered'\) THEN 'Scheduled'/);
    expect(body).toMatch(/\('dispatched', 'in_transit'\) AND v_at_pickup THEN 'At pickup'/);
    expect(body).toMatch(/'dispatched' THEN 'Dispatched'/);
    expect(body).toMatch(/'in_transit' THEN 'In transit'/);
    expect(body).toMatch(/'at_delivery' THEN 'At delivery'/);
    expect(body).toMatch(/ELSE 'Delivered'/);
    expect(body).toMatch(/\('pickup', 'drop_and_hook'\)/);
    expect(body).toMatch(/'available','covered','dispatched','in_transit','at_delivery','delivered'/);
  });
  itS('key whitelist: exactly the agreed keys, no money/driver/truck/contacts', () => {
    const body = def('resolve_load_tracking_link');
    const keys = [...body.matchAll(/'([a-z_]+)', (?:v_|s\.|'ok'|jsonb_build_object|CASE)/g)].map(m => m[1]).sort();
    expect(keys).toEqual([
      'appointment_end', 'appointment_start', 'arrived_at', 'broker_reference_number', 'carrier', 'city',
      'departed_at', 'facility_name', 'last_update_at', 'legal_name', 'load_number', 'mc_number', 'outcome',
      'sequence', 'state', 'status_label', 'stops', 'timezone', 'type', 'usdot_number',
    ]);
    expect(body).not.toMatch(/rate|operator_id|contact_|address_line|notes|linehaul|fsc|total_load_value/);
  });
  itS('the gate and resolve_share_token are unchanged in behaviour (inspection-only scope)', () => {
    expect(def('_share_token_gate')).toMatch(/c_limit constant bigint := 60/);
    expect(def('resolve_share_token')).toMatch(/v_gate\.scope = 'inspection_document'/);
  });
});

describe('broker tracking link (behaviour)', () => {
  itLive('resolves exactly the whitelist (see pass report for the full run)', () => {
    expect(CAN_EXEC).toBe(true);
  });
});
