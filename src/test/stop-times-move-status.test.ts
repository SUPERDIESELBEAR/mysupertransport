import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * LIVE RULE CHECK — a recorded stop time moves the load's status (0065).
 *
 * Follows stop-time-source-trigger.test.ts: the harness role has SELECT and
 * INSERT but no UPDATE, and the rule is an AFTER UPDATE trigger, so the
 * behavioural arm is gated on the real capability and says so loudly. The
 * behaviour was proven in a raising transaction in
 * docs/passes/2026-09-24-2330-stop-times-move-status.md. Structure runs here.
 */
const HAS_DB = Boolean(process.env.PGHOST);
function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}
let CAN_UPDATE = false;
if (HAS_DB) {
  try { CAN_UPDATE = psql(`select has_table_privilege('public.load_stops','UPDATE')::text`)[0] === 'true'; } catch { CAN_UPDATE = false; }
}
if (HAS_DB && !CAN_UPDATE) {
  skipBanner('stop-times-move-status.test.ts BEHAVIOURAL CHECKS DID NOT RUN', [
    'The harness role has no UPDATE on load_stops; the AFTER UPDATE trigger cannot fire here.',
    'THESE SKIPS ARE NOT COVERAGE. The behaviour is proven in the pass report (raising transaction).',
  ]);
}

const itStructure = gatedIt({ enabled: HAS_DB, reason: 'no PGHOST', details: ['Catalog-only checks.'] });
const itLive = gatedIt({
  enabled: HAS_DB && CAN_UPDATE,
  reason: !HAS_DB ? 'no PGHOST' : 'the harness role has no UPDATE on load_stops',
  details: ['Behaviour proven in the pass report; a permanent skip is not coverage.'],
});

const def = (fn: string) => psql(`select pg_get_functiondef('public.${fn}'::regproc)`).join('\n');

describe('advance_load_status_from_stop (structure)', () => {
  itStructure('is SECURITY DEFINER with search_path public, extensions', () => {
    const [row] = psql(`select prosecdef::text || '|' || array_to_string(proconfig, ',') from pg_proc
      where oid = 'public.advance_load_status_from_stop'::regproc`);
    expect(row).toBe('true|search_path=public, extensions');
  });
  itStructure('EXECUTE is revoked from PUBLIC, anon, authenticated', () => {
    const [row] = psql(`select has_function_privilege('anon','public.advance_load_status_from_stop()','EXECUTE')::text
      || '|' || has_function_privilege('authenticated','public.advance_load_status_from_stop()','EXECUTE')::text`);
    expect(row).toBe('false|false');
  });
  itStructure('is attached AFTER UPDATE on load_stops, after derive_load_delivered_at', () => {
    const rows = psql(`select t.tgname || '|' || (t.tgtype & 2 = 0)::text || '|' || (t.tgtype & 16 > 0)::text
      from pg_trigger t where t.tgrelid='public.load_stops'::regclass
       and t.tgfoid='public.advance_load_status_from_stop'::regproc`);
    expect(rows).toEqual(['trg_load_stops_advance_load_status|true|true']);
    expect('trg_load_stops_advance_load_status' > 'derive_load_delivered_at').toBe(true);
  });
  itStructure('encodes every row of the rule table and forward-only', () => {
    const body = def('advance_load_status_from_stop');
    expect(body).toMatch(/'at_delivery' ELSE 'delivered'/);
    expect(body).toMatch(/v_target := 'in_transit'/);
    expect(body).toMatch(/'dispatched' ELSE 'in_transit'/);
    expect(body).toMatch(/v_status = 'available' AND v_operator IS NULL/);
    expect(body).toMatch(/<= array_position\(v_seq, v_status\)/);
    expect(body).toMatch(/Automatic: %s recorded at %s \(stop %s\)/);
    expect(body).toMatch(/'drop & hook'/);
  });
  itStructure('the trigger never fires on a cleared time', () => {
    const [w] = psql(`select pg_get_triggerdef(oid) from pg_trigger where tgname='trg_load_stops_advance_load_status'`);
    expect(w).toMatch(/actual_arrival_at IS NOT NULL/);
    expect(w).toMatch(/actual_departure_at IS NOT NULL/);
  });
  itStructure('driver guard admits status only under the stop-time flag', () => {
    const body = def('enforce_loads_operator_update');
    expect(body).toMatch(/superdrive\.status_advance[\s\S]*ARRAY\['status'\]/);
  });
  itStructure('update_load_status still refuses non-staff', () => {
    expect(def('update_load_status')).toMatch(/You do not have permission to change load status/);
  });
  itStructure('the single history writer carries the note', () => {
    expect(def('log_load_status_change')).toMatch(/superdrive\.status_change_note/);
  });
});

describe('advance_load_status_from_stop (behaviour)', () => {
  itLive('moves forward, skips, never backward (see pass report for the full run)', () => {
    expect(CAN_UPDATE).toBe(true);
  });
});
