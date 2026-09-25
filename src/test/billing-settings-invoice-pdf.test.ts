import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt } from '@/test/helpers/gate';

/**
 * LIVE CATALOG CHECK — 0068: billing settings, factoring companies, invoice
 * files, the invoice-files bucket, the dispatcher line read (P71) and the
 * remittance source fix (P70). Behaviour (tenancy refusals, email rules,
 * dispatcher read-only, a posted `factor` payment) was proven in one raising
 * transaction in docs/passes/2026-09-25-1243-invoice-pdf.md.
 */
const HAS_DB = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((l) => l.trim()).filter(Boolean);
const it = gatedIt({ enabled: HAS_DB, reason: 'no PGHOST', details: ['Catalog-only checks.'] });

const TABLES = ['billing_settings', 'factoring_companies', 'invoice_files'];

describe('0068 billing settings and invoice PDF', () => {
  it('each new table has company_id NOT NULL, RLS, a restrictive tenant policy and a stamp trigger', () => {
    for (const t of TABLES) {
      expect(psql(`select is_nullable from information_schema.columns where table_schema='public' and table_name='${t}' and column_name='company_id'`)).toEqual(['NO']);
      expect(psql(`select relrowsecurity::text from pg_class where oid='public.${t}'::regclass`)).toEqual(['true']);
      expect(Number(psql(`select count(*) from pg_policies where schemaname='public' and tablename='${t}' and permissive='RESTRICTIVE'`)[0])).toBeGreaterThan(0);
      expect(Number(psql(`select count(*) from pg_trigger where tgrelid='public.${t}'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%stamp%'`)[0])).toBeGreaterThan(0);
    }
  }, 60_000);

  it('settings writes are management/owner only; invoice_files has no client write policy', () => {
    for (const t of ['billing_settings', 'factoring_companies']) {
      const writes = psql(`select coalesce(qual,'')||coalesce(with_check,'') from pg_policies where schemaname='public' and tablename='${t}' and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive='PERMISSIVE'`);
      expect(writes.length).toBeGreaterThan(0);
      for (const w of writes) expect(w).not.toMatch(/dispatcher/);
    }
    expect(psql(`select count(*) from pg_policies where schemaname='public' and tablename='invoice_files' and cmd<>'SELECT' and permissive='PERMISSIVE' and 'authenticated'=any(roles)`)).toEqual(['0']);
  }, 60_000);

  it('dispatchers may READ invoice lines under invoice.view, nothing more (P71)', () => {
    const p = psql(`select cmd||'|'||qual from pg_policies where schemaname='public' and tablename='invoice_line_items' and policyname='invoice_line_items_view_permission'`);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^SELECT\|.*invoice\.view/);
  }, 60_000);

  it('the invoice-files bucket is private with a same-company invoice.view read only', () => {
    expect(psql(`select public::text from storage.buckets where id='invoice-files'`)).toEqual(['false']);
    const pol = psql(`select cmd from pg_policies where schemaname='storage' and tablename='objects' and coalesce(qual,'')||coalesce(with_check,'') ilike '%invoice-files%'`);
    expect(pol).toEqual(['SELECT']);
  }, 60_000);

  it('remittance payments are written with source factor (P70)', () => {
    const d = psql(`select pg_get_functiondef('public.post_invoice_payment_internal(uuid,text,text,text,timestamp with time zone,numeric,numeric,numeric,uuid,text,uuid)'::regprocedure)`).join('\n');
    expect(d).toMatch(/'factor'/);
    expect(d).toMatch(/current_company_id\(\)/);
  }, 60_000);

  it('email validation triggers exist on both settings tables', () => {
    for (const t of ['billing_settings', 'factoring_companies']) {
      expect(Number(psql(`select count(*) from pg_trigger where tgrelid='public.${t}'::regclass and not tgisinternal`)[0])).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);
});
