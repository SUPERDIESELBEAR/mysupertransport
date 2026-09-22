/**
 * Shared storage folders are scoped to the caller's carrier.
 *
 * The defect (scanner, 2026-09-22; three error-level findings): three SELECT
 * policies on storage.objects each had a branch with NO binding whatsoever —
 * `inspection-documents` under `company/` and `ica-signatures` under
 * `carrier-default/` were readable by ANY signed-in account, an applicant
 * included. Proved live before the fix: an applicant with no roster row read all
 * 7 shared company documents and the carrier signature.
 *
 * The fix binds each object to ITS company through the row that records it
 * (inspection_documents.file_path / carrier_signature_settings.signature_url)
 * and compares that with public.current_company_id().
 *
 * The second half of this file exists because of a regression the first fix
 * caused and the proof caught: a policy subquery runs as the CALLER, and
 * carrier_signature_settings is staff-only, so drivers and truck owners saw 0
 * signatures — a broken image on the agreement screen. Hence the SECURITY
 * DEFINER helpers. If anyone ever inlines those EXISTS clauses back into the
 * policies, this file goes red.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

const M35 = resolve(process.cwd(), 'drizzle/migrations/0035_shared_storage_reads_scoped_to_carrier.sql');
const M36 = resolve(process.cwd(), 'drizzle/migrations/0036_shared_storage_scoping_via_definer_helpers.sql');

describe('0035 / 0036 migration text', () => {
  const m35 = readFileSync(M35, 'utf8');
  const m36 = readFileSync(M36, 'utf8');

  it('names all three previously unbound policies', () => {
    for (const p of [
      'Drivers can view company and own inspection docs',
      'Truck owners can view contractor signature',
      'Operators can view their own ICA signatures',
    ]) {
      expect(m35).toContain(p);
      expect(m36).toContain(p);
    }
  });

  it('resolves the carrier through current_company_id, not a membership test', () => {
    expect(m36).toContain('public.current_company_id()');
  });

  it('creates both helpers SECURITY DEFINER with a pinned search_path', () => {
    for (const fn of [
      'public.is_company_inspection_doc_of_caller',
      'public.is_carrier_default_signature_of_caller',
    ]) {
      expect(m36).toContain(fn);
    }
    expect(m36.match(/SECURITY DEFINER/g) ?? []).toHaveLength(2);
    expect(m36.match(/SET search_path TO 'public', 'extensions'/g) ?? []).toHaveLength(2);
  });

  it('never grants the helpers to PUBLIC or anon', () => {
    expect(m36.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC/g) ?? []).toHaveLength(2);
    expect(m36.match(/FROM anon/g) ?? []).toHaveLength(2);
    expect(m36).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.is_[a-z_]+_of_caller\(text\) TO (anon|PUBLIC)/);
  });

  it('carries an undo comment', () => {
    expect(m35).toContain('UNDO');
    expect(m36).toContain('DROP FUNCTION public.is_carrier_default_signature_of_caller(text)');
  });

  it('records the path-prefix limit for a second carrier', () => {
    expect(m35).toContain("'company/<company_id>/...'");
  });
});

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner('shared-storage-carrier-scoped.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST, so storage.objects policies could not be read. Migration text',
    'is not a substitute: a policy can be replaced out of band.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live storage policies could not be read',
  details: ['Only this check sees the policy as the database currently holds it.'],
});

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-At', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('live storage policies', () => {
  itLive('no shared-folder branch is left unbound', () => {
    // An unbound branch reads `(storage.foldername(name))[1] = 'company'` (or
    // 'carrier-default') with nothing tying it to the caller. Every such branch
    // must now sit beside one of the two helpers.
    const offenders = psql(
      "select policyname from pg_policies where schemaname='storage' and tablename='objects' " +
        "and cmd='SELECT' and ( qual like '%''company''%' or qual like '%carrier-default%' ) " +
        "and qual not like '%_of_caller%'",
    );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  itLive('both helpers exist, are definer, and are not executable by anon', () => {
    const rows = psql(
      "select p.proname || ' ' || p.prosecdef::text || ' ' || " +
        "has_function_privilege('anon', p.oid, 'EXECUTE')::text || ' ' || " +
        "has_function_privilege('authenticated', p.oid, 'EXECUTE')::text " +
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "where n.nspname='public' and p.proname in " +
        "('is_company_inspection_doc_of_caller','is_carrier_default_signature_of_caller') order by 1",
    );
    expect(rows).toEqual([
      'is_carrier_default_signature_of_caller true false true',
      'is_company_inspection_doc_of_caller true false true',
    ]);
  });

  itLive('the per-driver and per-owner branches are still bound to the caller', () => {
    const quals = psql(
      "select coalesce(qual,'') from pg_policies where schemaname='storage' and tablename='objects' " +
        "and policyname in ('Drivers can view company and own inspection docs'," +
        "'Truck owners can view contractor signature','Operators can view their own ICA signatures')",
    ).join('\n');
    expect(quals).toContain('auth.uid()');
  });
});
