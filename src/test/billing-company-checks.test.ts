import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * LIVE RULE CHECK — billing functions check the caller's company; dispatchers
 * may issue invoices and only issue (0067, P22, P33).
 *
 * The harness role holds no EXECUTE on the billing functions (it gets
 * "permission denied for function create_invoice") and cannot SET ROLE, so the
 * behaviour — every company refusal, the dispatcher's allowed and refused list,
 * management unchanged — was proven in one raising transaction in
 * docs/passes/2026-09-25-1105-billing-company-checks.md. Structure runs here
 * against the live catalog.
 */
const HAS_DB = Boolean(process.env.PGHOST);
function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((l) => l.trim()).filter(Boolean);
}
let CAN_EXEC = false;
if (HAS_DB) {
  try { CAN_EXEC = psql(`select has_function_privilege('public.create_invoice(uuid,jsonb)','EXECUTE')::text`)[0] === 'true'; } catch { CAN_EXEC = false; }
}
if (HAS_DB && !CAN_EXEC) {
  skipBanner('billing-company-checks.test.ts BEHAVIOURAL CHECK DID NOT RUN', [
    'The harness role has no EXECUTE on the billing functions and cannot SET ROLE.',
    'THIS SKIP IS NOT COVERAGE. The behaviour is proven in the pass report (raising transaction).',
  ]);
}
const itS = gatedIt({ enabled: HAS_DB, reason: 'no PGHOST', details: ['Catalog-only checks.'] });
const itLive = gatedIt({
  enabled: HAS_DB && CAN_EXEC,
  reason: !HAS_DB ? 'no PGHOST' : 'the harness role has no EXECUTE on the billing functions',
  details: ['Behaviour proven in the pass report; a permanent skip is not coverage.'],
});

const SIG: Record<string, string> = {
  create_invoice: 'create_invoice(uuid,jsonb)',
  record_invoice_payment: 'record_invoice_payment(uuid,jsonb)',
  close_short_paid_invoice: 'close_short_paid_invoice(uuid,text)',
  post_invoice_payment_internal:
    'post_invoice_payment_internal(uuid,text,text,text,timestamp with time zone,numeric,numeric,numeric,uuid,text,uuid)',
  record_factoring_remittance: 'record_factoring_remittance(jsonb)',
  create_accessorial_adjustment:
    'create_accessorial_adjustment(uuid,text,numeric,text,text,text,numeric,uuid)',
  update_load_status: 'update_load_status(uuid,load_status,text)',
};
const def = (fn: string) => psql(`select pg_get_functiondef('public.${SIG[fn]}'::regprocedure)`).join('\n');

describe('billing functions check the company (structure)', () => {
  itS('all seven stay SECURITY DEFINER pinned to public, extensions; grants unchanged', () => {
    const rows = psql(`select p.oid::regprocedure::text || '|' || p.prosecdef::text || '|' || array_to_string(p.proconfig, ',')
        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')::text || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
      from pg_proc p where p.oid in (${Object.values(SIG).map((s) => `'public.${s}'::regprocedure`).join(',')}) order by 1`);
    expect(rows.length).toBe(7);
    for (const r of rows) {
      const internal = r.startsWith('post_invoice_payment_internal');
      expect(r.split('|').slice(1).join('|'), r).toBe(`true|search_path=public, extensions|false|${internal ? 'false' : 'true'}`);
    }
  }, 30000);

  itS('create_invoice refuses another company\'s load and broker as "Load not found."', () => {
    const body = def('create_invoice');
    expect(body).toMatch(/v_load\.company_id IS DISTINCT FROM public\.current_company_id\(\)/);
    expect(body).toMatch(/v_broker\.company_id IS DISTINCT FROM public\.current_company_id\(\)/);
    expect((body.match(/RAISE EXCEPTION 'Load not found\.'/g) ?? []).length).toBe(2);
    expect(body).not.toMatch(/does not exist/);
  }, 30000);

  itS('payment, short-pay close and the internal poster refuse another company\'s invoice', () => {
    expect(def('record_invoice_payment')).toMatch(/company_id = public\.current_company_id\(\)\) THEN\s+RAISE EXCEPTION 'Invoice not found\.'/);
    expect(def('close_short_paid_invoice')).toMatch(/v_inv\.company_id IS DISTINCT FROM public\.current_company_id\(\) THEN\s+RAISE EXCEPTION 'Invoice not found\.'/);
    expect(def('post_invoice_payment_internal')).toMatch(/auth\.uid\(\) IS NOT NULL\s+AND v_inv\.company_id IS DISTINCT FROM public\.current_company_id\(\)/);
  }, 30000);

  itS('remittance matching considers only the caller\'s company\'s invoices', () => {
    const body = def('record_factoring_remittance');
    const matches = body.match(/WHERE company_id = public\.current_company_id\(\)\s+AND public\.normalize_invoice_number\(invoice_number\) = v_digits/g) ?? [];
    expect(matches.length).toBe(2);
    expect(body).not.toMatch(/FROM public\.invoices\s+WHERE public\.normalize_invoice_number/);
  }, 30000);

  itS('late accessorial refuses another company\'s load', () => {
    expect(def('create_accessorial_adjustment')).toMatch(/v_company IS DISTINCT FROM public\.current_company_id\(\) THEN\s+RAISE EXCEPTION 'Load not found\.'/);
  }, 30000);
});

describe('dispatchers issue, and only issue (structure)', () => {
  itS('create_invoice admits dispatcher, management, owner', () => {
    const body = def('create_invoice');
    for (const r of ['dispatcher', 'management', 'owner']) expect(body).toMatch(new RegExp(`'${r}'::app_role`));
    expect(body).toMatch(/Only a dispatcher, management or owner may create an invoice\./);
  }, 30000);

  itS('the invoiced step is admitted only through create_invoice\'s transaction-local flag', () => {
    const inv = def('create_invoice');
    expect(inv).toMatch(/set_config\('superdrive\.invoice_issue', 'on', true\);\s+PERFORM public\.update_load_status\(p_load_id, 'invoiced'::load_status, NULL\);\s+PERFORM set_config\('superdrive\.invoice_issue', '', true\);/);
    const uls = def('update_load_status');
    expect(uls).toMatch(/p_new_status = 'invoiced'::load_status\s+AND coalesce\(current_setting\('superdrive\.invoice_issue', true\), ''\) = 'on'/);
    expect(uls).toMatch(/Billing status changes require management access/);
  }, 30000);

  itS('payments, short-pay close and remittances stay management/owner only', () => {
    for (const fn of ['record_invoice_payment', 'close_short_paid_invoice', 'record_factoring_remittance']) {
      expect(def(fn), fn).not.toMatch(/'dispatcher'::app_role/);
    }
  }, 30000);

  itS('the three billing ALL policies are not widened', () => {
    const rows = psql(`select c.relname || '|' || pg_get_expr(p.polqual, p.polrelid) from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname in ('invoices','invoice_line_items','invoice_batches') and p.polname like '%management and owner only' order by 1`);
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r).toMatch(/'management'::app_role/);
      expect(r).not.toMatch(/dispatcher/);
    }
  }, 30000);

  itS('the browser cannot reach set_config (flag unreachable)', () => {
    const [row] = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_config'`);
    expect(row).toBe('0');
  }, 30000);

  itLive('behaviour arm (runs only if the harness can execute the functions)', () => {
    expect(CAN_EXEC).toBe(true);
  }, 30000);
});
