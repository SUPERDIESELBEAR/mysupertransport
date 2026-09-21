/**
 * ROLLOVER READ — every eligible driver must be reachable.
 *
 * The defect this pins (proved live 2026-09-21): `rollover-dispatch-status` read
 * `dispatch_daily_log` directly with `.lte('log_date', today)` and no limit.
 * PostgREST caps such a read at its default 1,000 rows. With 6,039 log rows the
 * newest 1,000 covered only the most recently logged operators (41 of 45 today,
 * 34 the day before), so a driver whose last log was in June could never be
 * corrected — and a larger cap only postpones the same failure.
 *
 * Two arms:
 *   1. SOURCE GUARD — the deployed edge function must reduce in the database
 *      (`latest_dispatch_log_per_operator`) and must NOT read the log table
 *      directly. This arm FAILS against the old source and PASSES against the new.
 *      Point it at another file with ROLLOVER_SOURCE to demonstrate that.
 *   2. SEMANTICS — over 1,200 rows across 40 operators, the capped client-side
 *      reduction loses operators outright, while the DISTINCT ON reduction
 *      returns exactly one row per operator: the latest, however old.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE =
  process.env.ROLLOVER_SOURCE ??
  resolve(process.cwd(), 'supabase/functions/rollover-dispatch-status/index.ts');

describe('rollover-dispatch-status source guard', () => {
  const src = readFileSync(SOURCE, 'utf8');

  it('reduces the daily log in the database instead of reading the table directly', () => {
    expect(src).toContain("rpc('latest_dispatch_log_per_operator'");
    expect(src).not.toContain("from('dispatch_daily_log')");
  });

  it('does not paper over the cap with a bigger limit or paging', () => {
    expect(src).not.toMatch(/\.range\(/);
    expect(src).not.toMatch(/\.limit\(\s*\d{3,}\s*\)/);
  });

  it('still keeps the two eligibility rules named', () => {
    expect(src).toContain('excluded_from_dispatch');
    expect(src).toContain('is_parked');
  });

  it('names the active-driver rule (owner decision 2026-09-21)', () => {
    expect(src).toContain('is_active');
    expect(src).toContain('deactivated_at');
  });
});

// --- active drivers only --------------------------------------------------
//
// Owner decision 2026-09-21: a driver who is not active must never have a status
// written onto the board, however recent their last log. The eligibility set lives
// in latest_dispatch_log_per_operator; these arms model it with and without the rule.

interface Op {
  id: string;
  is_active: boolean;
  deactivated_at: string | null;
  excluded_from_dispatch: boolean;
  is_parked: boolean;
}

const OPS: Op[] = [
  { id: 'active-1', is_active: true, deactivated_at: null, excluded_from_dispatch: false, is_parked: false },
  { id: 'inactive-1', is_active: false, deactivated_at: null, excluded_from_dispatch: false, is_parked: false },
  { id: 'deactivated-1', is_active: true, deactivated_at: '2026-08-18T00:00:00Z', excluded_from_dispatch: false, is_parked: false },
];

/** Latest log per operator: the inactive and the deactivated one have the NEWEST logs. */
const LOGS: LogRow[] = [
  { operator_id: 'active-1', status: 'home', log_date: '2026-09-20', created_at: '2026-09-20T12:00:00Z' },
  { operator_id: 'inactive-1', status: 'dispatched', log_date: '2026-09-21', created_at: '2026-09-21T12:00:00Z' },
  { operator_id: 'deactivated-1', status: 'truck_down', log_date: '2026-09-21', created_at: '2026-09-21T12:00:00Z' },
];

/** The board before the sweep: everyone sits at not_dispatched. */
const BOARD: Record<string, string> = {
  'active-1': 'not_dispatched',
  'inactive-1': 'not_dispatched',
  'deactivated-1': 'not_dispatched',
};

function eligible(withActiveRule: boolean): LogRow[] {
  return newRead(LOGS).filter((r) => {
    const op = OPS.find((o) => o.id === r.operator_id)!;
    if (op.excluded_from_dispatch || op.is_parked) return false;
    if (withActiveRule && (!op.is_active || op.deactivated_at !== null)) return false;
    return true;
  });
}

/** The edge function's decision: write only when the board disagrees with the log. */
const promotions = (rows: LogRow[]) =>
  rows.filter((r) => BOARD[r.operator_id] !== r.status).map((r) => r.operator_id);

describe('rollover promotes active drivers only', () => {
  it('WITHOUT the rule, an inactive driver with a newer log IS promoted — the defect', () => {
    const promoted = promotions(eligible(false));
    expect(promoted).toContain('inactive-1');
    expect(promoted).toContain('deactivated-1');
  });

  it('WITH the rule, neither the inactive nor the deactivated driver is promoted', () => {
    const promoted = promotions(eligible(true));
    expect(promoted).not.toContain('inactive-1');
    expect(promoted).not.toContain('deactivated-1');
  });

  it('and the active driver is still promoted', () => {
    expect(promotions(eligible(true))).toEqual(['active-1']);
  });
});

// --- semantics ------------------------------------------------------------

interface LogRow {
  operator_id: string;
  status: string;
  log_date: string;
  created_at: string;
}

/** 1,200 rows: operator 00 logged once long ago, the rest logged recently and often. */
function buildLog(): LogRow[] {
  const rows: LogRow[] = [];
  // 39 busy operators, ~31 recent rows each = 1,209 rows
  for (let op = 1; op < 40; op++) {
    for (let d = 1; d <= 31; d++) {
      const day = String(d).padStart(2, '0');
      rows.push({
        operator_id: `op-${String(op).padStart(2, '0')}`,
        status: d === 31 ? 'dispatched' : 'home',
        log_date: `2026-08-${day}`,
        created_at: `2026-08-${day}T12:00:00Z`,
      });
    }
  }
  // one stale operator, last logged in June
  rows.push({
    operator_id: 'op-00',
    status: 'truck_down',
    log_date: '2026-06-05',
    created_at: '2026-06-05T12:00:00Z',
  });
  return rows;
}

const byNewest = (a: LogRow, b: LogRow) =>
  b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at);

/** The old read: newest-first, capped at PostgREST's 1,000, then reduced in JS. */
function oldRead(rows: LogRow[], cap = 1000): LogRow[] {
  const capped = [...rows].sort(byNewest).slice(0, cap);
  const latest = new Map<string, LogRow>();
  for (const r of capped) if (!latest.has(r.operator_id)) latest.set(r.operator_id, r);
  return [...latest.values()];
}

/** The new read: DISTINCT ON (operator_id) ORDER BY operator_id, log_date DESC. */
function newRead(rows: LogRow[]): LogRow[] {
  const latest = new Map<string, LogRow>();
  for (const r of [...rows].sort(
    (a, b) => a.operator_id.localeCompare(b.operator_id) || byNewest(a, b),
  )) {
    if (!latest.has(r.operator_id)) latest.set(r.operator_id, r);
  }
  return [...latest.values()];
}

describe('latest log per operator, however old', () => {
  const rows = buildLog();

  it('the table is bigger than the cap and spans more than 34 operators', () => {
    expect(rows.length).toBeGreaterThan(1000);
    expect(new Set(rows.map((r) => r.operator_id)).size).toBe(40);
  });

  it('the capped read loses operators — this is the live defect', () => {
    const seen = oldRead(rows);
    expect(seen.length).toBeLessThan(40);
    expect(seen.some((r) => r.operator_id === 'op-00')).toBe(false);
  });

  it('the database-side read returns one row per operator, including the stale one', () => {
    const seen = newRead(rows);
    expect(seen).toHaveLength(40);
    expect(new Set(seen.map((r) => r.operator_id)).size).toBe(40);
    const stale = seen.find((r) => r.operator_id === 'op-00');
    expect(stale?.log_date).toBe('2026-06-05');
    expect(stale?.status).toBe('truck_down');
  });

  it('and it picks the LATEST row for a busy operator, not an arbitrary one', () => {
    const busy = newRead(rows).find((r) => r.operator_id === 'op-07');
    expect(busy?.log_date).toBe('2026-08-31');
    expect(busy?.status).toBe('dispatched');
  });

  it('a bigger cap would not fix it — it only moves the cliff', () => {
    expect(oldRead(rows, 1100).some((r) => r.operator_id === 'op-00')).toBe(false);
  });
});
