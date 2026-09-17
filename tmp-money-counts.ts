/**
 * MONEY BATCH probe — before/after measurement only. Reads, never writes.
 *
 * Counts every batch table under each of the five real sessions, and computes
 * the two screen figures through the SAME code the screens use:
 *   - Steve's settlement list: the query in src/components/operator/MySettlements/index.tsx
 *     plus the `my_rm_deposit` RPC, summed with earningLines/deductionLines/sumLines
 *     from src/components/operator/MySettlements/settlementView.ts.
 *   - The management billing figure: `gatherBillingQueue` from src/lib/billingRun.ts,
 *     reduced exactly as BillingQueuePage's `total` useMemo does.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { gatherBillingQueue } from '@/lib/billingRun';
import { earningLines, deductionLines, sumLines, type DriverSettlement } from '@/components/operator/MySettlements/settlementView';

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

const TABLES = [
  // already test company_id on reads (the 2026-09-16 census twelve)
  'invoices', 'invoice_line_items', 'invoice_batches', 'invoice_number_config',
  'payments', 'factoring_remittances', 'ar_aging_snapshots', 'accessorial_adjustments',
  'settlement_settings', 'carrier_signature_settings', 'share_tokens', 'unit_number_config',
  // role-only on reads today
  'settlements', 'settlement_line_items', 'settlement_withheld_loads',
  'dispatch_settlements', 'dispatch_settlement_line_items',
  'deductions', 'deduction_installments', 'load_charges', 'inspection_program_payments',
];

const IDS = ['marcus', 'leo', 'mae', 'steve', 'donald'];

function clientFor(name: string) {
  const s = JSON.parse(readFileSync(`/tmp/money/${name}.json`, 'utf8'));
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return { sb, session: s.session ?? s };
}

async function main() {
  const out: Record<string, unknown> = {};
  for (const name of IDS) {
    const { sb, session } = clientFor(name);
    await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    const counts: Record<string, number | string> = {};
    for (const t of TABLES) {
      const { count, error } = await sb.from(t as never).select('*', { count: 'exact', head: true });
      counts[t] = error ? `ERR ${error.code ?? ''} ${error.message}` : (count ?? 0);
    }
    out[name] = counts;

    if (name === 'steve') {
      const { data } = await sb.from('settlements' as never)
        .select('id, period_start, period_end, payday, status, net_amount, hold_reason, '
          + 'settlement_line_items(id, line_type, amount, description), '
          + 'settlement_withheld_loads(id, load_number, message, outstanding)')
        .order('period_start', { ascending: false });
      const rows = (data ?? []) as any[];
      const shaped: DriverSettlement[] = rows.map((r) => ({
        id: r.id, periodStart: r.period_start, periodEnd: r.period_end,
        payday: r.payday ?? null, status: r.status, netAmount: Number(r.net_amount ?? 0),
        holdReason: r.hold_reason ?? null,
        lines: (r.settlement_line_items ?? []).map((l: any) => ({
          id: l.id, lineType: l.line_type, amount: Number(l.amount ?? 0), description: l.description ?? '',
        })),
        withheld: (r.settlement_withheld_loads ?? []).map((w: any) => ({
          id: w.id, loadNumber: w.load_number, message: w.message, outstanding: w.outstanding ?? [],
        })),
      }));
      const { data: rm } = await sb.rpc('my_rm_deposit' as never);
      out.steve_screen = {
        settlements: shaped.length,
        rows: shaped.map((s) => ({
          period: `${s.periodStart}..${s.periodEnd}`, status: s.status,
          net: s.netAmount, earnings: sumLines(earningLines(s)), deductions: sumLines(deductionLines(s)),
          lines: s.lines.length, withheld: s.withheld.length,
        })),
        rm_deposit: Array.isArray(rm) ? rm[0] : rm,
      };
    }

    if (name === 'leo' || name === 'marcus') {
      try {
        const q = await gatherBillingQueue(sb);
        out[`${name}_billing`] = {
          queued_loads: q.length,
          queued_total: q.reduce((s, r) => s + r.invoice.amount, 0),
          invoices: q.map((r) => ({ load: r.loadNumber, amount: r.invoice.amount, path: r.billingPath })),
        };
      } catch (e) {
        out[`${name}_billing`] = `ERR ${(e as Error).message}`;
      }
      const inv = await sb.from('invoices' as never).select('invoice_number, amount, status');
      out[`${name}_invoices`] = inv.error ? `ERR ${inv.error.message}` : inv.data;
    }
  }
  console.log(JSON.stringify(out, null, 1));
}

void main();
