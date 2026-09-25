/**
 * generate-invoice-pdf — Alvys milestone 2, pass 2 (P72).
 *
 * POST { invoice_id, dry_run }. Signed-in dispatcher, management or owner of
 * the invoice's carrier only. Built ONLY from database rows. dry_run returns
 * the bytes and saves nothing; otherwise the file is saved ONCE and an
 * existing file is returned, never replaced.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { companyIdForUser } from '../_shared/tenancy.ts';
import { buildInvoiceDocument, InvoiceTotalsMismatch } from '../_shared/invoice/model.ts';
import { renderInvoicePdf } from '../_shared/invoice/renderPdf.ts';

const BUCKET = 'invoice-files';
const ROLES = ['dispatcher', 'management', 'owner'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claims, error: authError } = await asUser.auth.getClaims(authHeader.slice(7));
  const userId = claims?.claims?.sub as string | undefined;
  if (authError || !userId) return json({ error: 'Unauthorized' }, 401);

  const { data: roleRows, error: roleError } = await admin
    .from('user_roles').select('role').eq('user_id', userId).in('role', ROLES).limit(1);
  if (roleError) return json({ error: 'Role check failed' }, 500);
  if (!roleRows?.length) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const invoiceId = typeof body?.invoice_id === 'string' ? body.invoice_id : '';
  const dryRun = body?.dry_run === true;
  if (!UUID.test(invoiceId)) return json({ error: 'Invoice not found' }, 404);

  let companyId: string;
  try {
    companyId = await companyIdForUser(admin, userId);
  } catch {
    return json({ error: 'Forbidden' }, 403);
  }

  const { data: invoice, error: invErr } = await admin
    .from('invoices').select('id, company_id, load_id, broker_id, invoice_number, amount, created_at')
    .eq('id', invoiceId).eq('company_id', companyId).maybeSingle();
  if (invErr) return json({ error: 'Could not read the invoice' }, 500);
  if (!invoice) return json({ error: 'Invoice not found' }, 404);

  const fileOut = (bytes: Uint8Array, saved: boolean, pageCount: number) =>
    new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Invoice-${invoice.invoice_number}.pdf"`,
        'X-Invoice-Saved': saved ? 'true' : 'false',
        'X-Page-Count': String(pageCount),
        'Access-Control-Expose-Headers': 'X-Invoice-Saved, X-Page-Count',
      },
    });

  // Saved once, never replaced.
  if (!dryRun) {
    const { data: existing } = await admin
      .from('invoice_files').select('storage_path, page_count')
      .eq('invoice_id', invoice.id).eq('company_id', companyId).maybeSingle();
    if (existing) {
      const { data: blob, error } = await admin.storage.from(BUCKET).download(existing.storage_path);
      if (error || !blob) return json({ error: 'The saved invoice file could not be read' }, 500);
      return fileOut(new Uint8Array(await blob.arrayBuffer()), true, existing.page_count);
    }
  }

  const [linesR, loadR, stopsR, brokerR, settingsR, carrierR, paymentsR] = await Promise.all([
    admin.from('invoice_line_items').select('line_type, description, amount, created_at')
      .eq('invoice_id', invoice.id).eq('company_id', companyId).order('created_at'),
    admin.from('loads').select('load_number, broker_reference_number, po_number, created_at, delivered_at, rate_type, rate_per_ton, confirmed_tons, rate_per_mile, loaded_miles')
      .eq('id', invoice.load_id).eq('company_id', companyId).maybeSingle(),
    admin.from('load_stops').select('stop_sequence, stop_type, facility_name, city, state, zip, reference_label, reference_number, actual_arrival_at, actual_departure_at, appointment_start')
      .eq('load_id', invoice.load_id).eq('company_id', companyId),
    invoice.broker_id
      ? admin.from('brokers').select('company_name, address_line1, address_line2, city, state, zip')
        .eq('id', invoice.broker_id).eq('company_id', companyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from('billing_settings').select('*').eq('company_id', companyId).maybeSingle(),
    admin.from('carrier_profile').select('mc_number, usdot_number, home_terminal_timezone').eq('id', companyId).maybeSingle(),
    admin.from('payments').select('gross_amount').eq('invoice_id', invoice.id),
  ]);
  for (const r of [linesR, loadR, stopsR, brokerR, settingsR, carrierR, paymentsR]) {
    if (r.error) return json({ error: `Could not read the invoice data: ${r.error.message}` }, 500);
  }
  if (!loadR.data) return json({ error: 'Invoice not found' }, 404);
  if (!settingsR.data) return json({ error: 'Billing settings are missing for this carrier' }, 409);

  let doc;
  try {
    doc = buildInvoiceDocument({
      invoice,
      lines: linesR.data ?? [],
      load: loadR.data,
      stops: stopsR.data ?? [],
      broker: brokerR.data,
      settings: settingsR.data,
      carrier: carrierR.data,
      paymentsTotal: (paymentsR.data ?? []).reduce((s: number, p: { gross_amount: number }) => s + Number(p.gross_amount), 0),
      timeZone: carrierR.data?.home_terminal_timezone || 'America/Chicago',
    });
  } catch (e) {
    if (e instanceof InvoiceTotalsMismatch) return json({ error: e.message }, 409);
    throw e;
  }

  const { bytes, pageCount } = await renderInvoicePdf(doc);
  if (dryRun) return fileOut(bytes, false, pageCount);

  const path = `${companyId}/${invoice.id}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

  const { error: rowErr } = await admin.from('invoice_files').insert({
    company_id: companyId,
    invoice_id: invoice.id,
    storage_path: path,
    sha256: await sha256Hex(bytes),
    byte_size: bytes.byteLength,
    page_count: pageCount,
    generated_by: userId,
  });
  if (rowErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return json({ error: `Could not record the invoice file: ${rowErr.message}` }, 500);
  }
  return fileOut(bytes, true, pageCount);
});
