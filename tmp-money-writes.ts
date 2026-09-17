/** MONEY BATCH — refusal probes over a real session. Updates only; a refused update writes nothing. */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const FAKE = '000000000000000000000000000000ff';

async function main() {
  const s = JSON.parse(readFileSync('/tmp/money/marcus.json', 'utf8'));
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await sb.auth.setSession({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });

  const show = (label: string, r: any) => console.log(label, JSON.stringify({
    status: r.status, error: r.error, data: r.data,
  }));

  show('invoice move-to-random-company:', await (sb.from('invoices' as never) as any)
    .update({ company_id: FAKE }).eq('invoice_number', 'ST26-0001').select('invoice_number, company_id'));

  show('invoice amount change:', await (sb.from('invoices' as never) as any)
    .update({ amount: 9999 }).eq('invoice_number', 'ST26-0001').select('invoice_number, amount'));

  const settle = await (sb.from('settlements' as never) as any).select('id, net_amount, status, company_id').limit(1);
  const id = settle.data?.[0]?.id;
  console.log('settlement before:', JSON.stringify(settle.data));
  show('settlement move-to-random-company:', await (sb.from('settlements' as never) as any)
    .update({ company_id: FAKE }).eq('id', id).select('id, company_id'));
  show('settlement net change:', await (sb.from('settlements' as never) as any)
    .update({ net_amount: 1 }).eq('id', id).select('id, net_amount'));

  const adj = await (sb.from('accessorial_adjustments' as never) as any).select('id, company_id, status').limit(1);
  console.log('adjustment before:', JSON.stringify(adj.data));
  show('adjustment move-to-random-company:', await (sb.from('accessorial_adjustments' as never) as any)
    .update({ company_id: FAKE }).eq('id', adj.data?.[0]?.id).select('id, company_id'));

  console.log('AFTER invoices:', JSON.stringify((await (sb.from('invoices' as never) as any)
    .select('invoice_number, amount, status, company_id')).data));
  console.log('AFTER settlement:', JSON.stringify((await (sb.from('settlements' as never) as any)
    .select('id, net_amount, status, company_id')).data));
  console.log('AFTER adjustment:', JSON.stringify((await (sb.from('accessorial_adjustments' as never) as any)
    .select('id, company_id, status')).data));
}
void main();
