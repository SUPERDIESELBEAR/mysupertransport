/**
 * Drift guard: every byte-holding column on rods_days must be purged.
 *
 * `purge_rods_day` returns the storage paths it collected so the caller can
 * delete the objects. When Pass B §6 added `display_document_path`, the
 * function was not updated and the display copies were orphaned — the file
 * survived a purge that was supposed to remove the record. That was found by
 * reading the function, which does not scale.
 *
 * The invariant is structural: a column on rods_days whose name ends in
 * `_path` names an object in Storage, and an object in Storage that a purge
 * does not name is an object that outlives the record it belongs to. So this
 * test reads the live catalog rather than a fixture, and fails on the NEXT
 * `_path` column somebody adds without touching the function.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  console.warn(
    [
      '',
      '  ############################################################',
      '  #  purge-path-coverage.test.ts DID NOT RUN                 #',
      '  #  No PGHOST, so the live column list could not be read.   #',
      '  #  A green run WITHOUT this file is not evidence that      #',
      '  #  purge_rods_day collects every stored object.            #',
      '  ############################################################',
      '',
    ].join('\n'),
  );
}

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Columns that end in `_path` but do not name a Storage object. Empty today,
 * and adding to it must be a deliberate act with a stated reason — that is the
 * whole point of forcing the failure.
 */
const NOT_STORAGE_OBJECTS: readonly string[] = [];

const describeLive = HAS_DB ? describe : describe.skip;

describeLive('purge_rods_day path coverage', () => {
  it('collects every _path column on rods_days', () => {
    const columns = psql(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rods_days'
        AND column_name LIKE '%\\_path'
      ORDER BY column_name
    `).filter((c) => !NOT_STORAGE_OBJECTS.includes(c));

    // Every overload, concatenated. There are three: a two-argument stub that
    // refuses (it has no storage owner to attribute the deletes to), a
    // three-argument delegate kept alive for the deploy window, and the
    // four-argument function that does the work. Reading only the first
    // matched the stub and reported all four columns missing.
    const def = psql(`
      SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'purge_rods_day'
    `).join('\n');
    expect(def.length, 'purge_rods_day must exist').toBeGreaterThan(0);

    // The five known today. Stated explicitly so a RENAME is caught as well as
    // an addition: renaming one away makes both this list and the catalog
    // comparison fail.
    expect(columns).toEqual([
      'bol_photo_path',
      'certification_signature_path',
      'display_document_path',
      'pdf_path',
      'source_document_path',
    ]);

    const missing = columns.filter((c) => !def.includes(c));
    expect(
      missing,
      `rods_days columns not referenced by purge_rods_day: ${missing.join(', ')}.`
      + ' A _path column the purge does not collect leaves the object in Storage'
      + ' after the record it belongs to is gone. Add it to the function, or add'
      + ' it to NOT_STORAGE_OBJECTS with a reason if it does not name an object.',
    ).toEqual([]);
  });
});