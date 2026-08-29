import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * LIVE GUARD CHECK — look-alike equipment serial uniqueness.
 *
 * THE REPORTED DEFECT, written as its case.
 *
 * `enforce_equipment_serial_uniqueness` fires BEFORE INSERT OR UPDATE OF
 * serial_number, device_type, status. Because `status` is in that list, assign
 * (`status='assigned'`), return (`status='lost'|'damaged'`) and archive
 * (`status='deactivated'`) all consulted a SERIAL-uniqueness check even though
 * none of them touch a serial. On a row with a near-twin already in inventory
 * every one of those was rejected — including deactivation, which is the
 * REMEDY for a duplicate. A guard that blocks its own cleanup.
 *
 * The fix added two early exits: `NEW.status = 'deactivated'` always passes,
 * and an UPDATE whose canonical serial and device_type are unchanged from OLD
 * never reaches the collision query.
 *
 * NO NEAR-DUPLICATE PAIR EXISTS IN LIVE DATA (zero groups under the guard's own
 * canonicalisation at the time of writing), so the defect was latent. The pair
 * is therefore CONSTRUCTED here, inside a transaction that is always rolled
 * back — never resolved from live rows.
 *
 * FIXTURE RULE — read before editing.
 *   - Runs as the AMBIENT psql role. No `set local role postgres`: the sandbox
 *     role cannot set it, and no other database test in this project assumes
 *     that privilege.
 *   - Every write happens inside a single transaction ending in ROLLBACK. This
 *     file must never leave a row in equipment_items — the harness role has no
 *     DELETE, so anything committed here would be permanent junk.
 *   - Serials are deliberately synthetic (`ZZTEST…`) so a leak would be
 *     obvious rather than plausible.
 *
 * TWO GATES, both named and counted:
 *   - no PGHOST                  -> the live catalog is unreachable.
 *   - no UPDATE on equipment_items -> the behavioural arm cannot fire. The
 *     sandbox role holds SELECT + INSERT and nothing else on every public
 *     table, and the defect is an UPDATE-path defect. Granting UPDATE to work
 *     around it is forbidden. Those skips ARE NOT COVERAGE; see the banner.
 */

const HAS_DB = Boolean(process.env.PGHOST);

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').map(l => l.trim()).filter(Boolean);
}

/** Runs SQL expected to FAIL; returns the error text. Empty string means it succeeded. */
function psqlExpectError(sql: string): string {
  try {
    execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return '';
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    return `${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
}

let CAN_UPDATE = false;
if (HAS_DB) {
  try {
    CAN_UPDATE =
      psql(`select has_table_privilege('public.equipment_items','UPDATE')::text`)[0] ===
      'true';
  } catch {
    CAN_UPDATE = false;
  }
}

if (!HAS_DB) {
  skipBanner('equipment-serial-guard.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST in the environment, so the guard could not be exercised.',
  ]);
} else if (!CAN_UPDATE) {
  skipBanner('equipment-serial-guard.test.ts BEHAVIOURAL CHECKS DID NOT RUN', [
    'This harness role has SELECT and INSERT on equipment_items and no UPDATE.',
    'The reported defect is an UPDATE-path defect — assign, return and archive',
    'are all status UPDATEs — so it cannot be reproduced or disproved here.',
    'Granting UPDATE to the sandbox role is forbidden.',
    '',
    'THESE THREE SKIPS ARE NOT COVERAGE. Read them as untested here:',
    '  - assign / return / archive against a row with a near-twin are verified',
    '    MANUALLY in Onboard Systems, and on a disposable instance where the',
    '    harness role holds UPDATE. Nothing automated covers them in this',
    '    environment.',
    '',
    'The INSERT and structural checks below DO run here: they assert the guard',
    'still rejects a new live near-twin, that a deactivated twin is permitted',
    'by both trigger and index, that the partial unique index exists with the',
    'right predicate, and that both early exits are present in the body.',
    'Body text is not behaviour.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB && CAN_UPDATE,
  reason: !HAS_DB
    ? 'no PGHOST, so the live guard could not be exercised'
    : 'the harness role has no UPDATE on equipment_items, so the UPDATE-path defect cannot fire',
  details: [
    'This is the reported defect itself: assign, return and archive against a',
    'row whose serial has a near-twin. A permanent skip is not coverage.',
  ],
});

const itStructure = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Catalog and INSERT-path checks; they need no UPDATE privilege.'],
});

/**
 * The constructed pair, built inside one transaction and rolled back.
 *
 * `ZZTESTG024945` and `ZZTESTGO24945` differ only by 0/O, so they are distinct
 * under the OLD exact-form unique index (`idx_equipment_items_serial_type`) and
 * identical under `canonical_equipment_serial`. That is precisely the pair the
 * look-alike guard exists to catch — and precisely the pair staff could not
 * clean up before the fix.
 */
const LIVE_SERIAL = 'ZZTESTG024945';
const TWIN_SERIAL = 'ZZTESTGO24945';

/** Creates the live row + a deactivated twin, runs `body`, always rolls back. */
function inPair(body: string): string[] {
  return psql(`
    begin;
    create temp table t_ids(k text primary key, v uuid) on commit drop;

    insert into public.equipment_items (device_type, serial_number, status)
    values ('eld', '${LIVE_SERIAL}', 'available')
    returning id \\gset
    ;
    insert into t_ids(k, v)
      select 'live', id from public.equipment_items
       where device_type='eld' and serial_number='${LIVE_SERIAL}';

    -- The twin can only exist as deactivated: both the guard and the partial
    -- unique index permit that, and forbid a second LIVE one.
    insert into public.equipment_items (device_type, serial_number, status)
    values ('eld', '${TWIN_SERIAL}', 'deactivated');

    ${body}

    rollback;
  `);
}

describe('enforce_equipment_serial_uniqueness — the reported defect', () => {
  itLive('assign succeeds on a row whose serial has a near-twin', () => {
    const rows = inPair(`
      update public.equipment_items set status='assigned'
       where id = (select v from t_ids where k='live');
      select status from public.equipment_items
       where id = (select v from t_ids where k='live');
    `);
    expect(rows).toContain('assigned');
  });

  itLive('return succeeds on a row whose serial has a near-twin', () => {
    const rows = inPair(`
      update public.equipment_items set status='lost'
       where id = (select v from t_ids where k='live');
      select status from public.equipment_items
       where id = (select v from t_ids where k='live');
    `);
    expect(rows).toContain('lost');
  });

  itLive('archive succeeds on a row whose serial has a near-twin', () => {
    // The sharpest edge: deactivation is the remedy for a duplicate, and it
    // was the action the guard rejected hardest.
    const rows = inPair(`
      update public.equipment_items set status='deactivated'
       where id = (select v from t_ids where k='live');
      select status from public.equipment_items
       where id = (select v from t_ids where k='live');
    `);
    expect(rows).toContain('deactivated');
  });

  itLive('rewriting a row to its own current serial still succeeds', () => {
    // Self-comparison would reject every update to the row. `ei.id <> NEW.id`
    // must stay, and the unchanged-serial exit must not mask its absence.
    const rows = inPair(`
      update public.equipment_items set serial_number='${LIVE_SERIAL}'
       where id = (select v from t_ids where k='live');
      select serial_number from public.equipment_items
       where id = (select v from t_ids where k='live');
    `);
    expect(rows).toContain(LIVE_SERIAL);
  });

  itLive('changing a serial INTO a live twin is still rejected', () => {
    // The guard must still bite where it should. Proving the fix did not
    // simply switch it off.
    const err = psqlExpectError(`
      begin;
      insert into public.equipment_items (device_type, serial_number, status)
      values ('eld', '${LIVE_SERIAL}', 'available'), ('eld', 'ZZTESTOTHER1', 'available');
      update public.equipment_items set serial_number='${TWIN_SERIAL}'
       where device_type='eld' and serial_number='ZZTESTOTHER1';
      rollback;
    `);
    expect(err).toMatch(/already on file|duplicate key/i);
  });
});

describe('enforce_equipment_serial_uniqueness — INSERT path and structure', () => {
  itStructure('a second LIVE near-twin cannot be inserted', () => {
    const err = psqlExpectError(`
      begin;
      insert into public.equipment_items (device_type, serial_number, status)
      values ('eld', '${LIVE_SERIAL}', 'available'), ('eld', '${TWIN_SERIAL}', 'available');
      rollback;
    `);
    expect(err).toMatch(/already on file|duplicate key/i);
  });

  itStructure('a DEACTIVATED near-twin is permitted', () => {
    // Cleanup must remain expressible: any number of retired twins may coexist.
    const rows = psql(`
      begin;
      insert into public.equipment_items (device_type, serial_number, status)
      values ('eld', '${LIVE_SERIAL}', 'available'),
             ('eld', '${TWIN_SERIAL}', 'deactivated'),
             ('eld', 'ZZTESTG-024945', 'deactivated');
      select count(*)::text from public.equipment_items
       where serial_number like 'ZZTEST%';
      rollback;
    `);
    expect(rows).toContain('3');
  });

  itStructure('the canonical unique index exists and is partial on non-deactivated', () => {
    // Without this, look-alike uniqueness rests on the trigger alone and any
    // path that bypasses it — bulk import, restore, direct SQL — creates pairs.
    const rows = psql(
      `select indexdef from pg_indexes
        where schemaname='public' and tablename='equipment_items'
          and indexname='idx_equipment_items_canonical_serial_uniq'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/CREATE UNIQUE INDEX/);
    expect(rows[0]).toMatch(/canonical_equipment_serial\(serial_number\)/);
    expect(rows[0]).toMatch(/WHERE \(status <> 'deactivated'::text\)/);
  });

  itStructure('the superseded non-unique canonical index is gone', () => {
    expect(
      psql(
        `select indexname from pg_indexes
          where schemaname='public' and tablename='equipment_items'
            and indexname='idx_equipment_items_canonical_serial'`,
      ),
    ).toEqual([]);
  });

  itStructure('both early exits are present in the live body', () => {
    const def = psql(
      `select replace(pg_get_functiondef(p.oid), E'\\n', ' ')
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='enforce_equipment_serial_uniqueness'`,
    ).join(' ');
    expect(def).toMatch(/NEW\.status = 'deactivated'/);
    expect(def).toMatch(/TG_OP = 'UPDATE'/);
    expect(def).toMatch(/OLD\.device_type = NEW\.device_type/);
    expect(def).toMatch(/canonical_equipment_serial\(OLD\.serial_number\)/);
    // self-exemption must survive every rewrite
    expect(def).toMatch(/ei\.id <> NEW\.id/);
  });

  itStructure('it is SECURITY DEFINER, pinned, and not executable by clients', () => {
    const rows = psql(
      `select p.prosecdef::text || '|' ||
              coalesce(array_to_string(p.proconfig, ','), '<none>') || '|' ||
              coalesce(p.proacl::text, '<null>')
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='enforce_equipment_serial_uniqueness'`,
    );
    expect(rows).toHaveLength(1);
    const [secdef, config, acl] = rows[0].split('|');
    expect(secdef).toBe('true');
    const pin = config.replace(/^search_path=/, '');
    expect(config).toMatch(/^search_path=/);
    expect(
      pin.split(',').map(s => s.trim().replace(/^"|"$/g, '')).sort(),
    ).toEqual(['extensions', 'public']);
    expect(acl).not.toMatch(/(^|,|\{)anon=/);
    expect(acl).not.toMatch(/(^|,|\{)authenticated=/);
    expect(acl).not.toMatch(/(^|,|\{)=X/); // PUBLIC
  });
});
