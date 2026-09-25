/**
 * send-invoice-packet — Alvys milestone 2, pass 5 (P80/P81).
 *
 * POST { invoice_id, to?, cc?, dry_run?, test_recipient? }
 * One email per invoice to the carrier's default factoring company.
 * Dispatcher, management or owner of the invoice's carrier; test sends are
 * management/owner only. Every provider call is recorded through
 * record_invoice_send (service role only).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encode as base64Encode } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { companyIdForUser } from '../_shared/tenancy.ts';
import { FROM_DOMAIN } from '../_shared/email/sender.ts';
import { buildPacketParts, combineParts, PacketError } from '../_shared/invoice/packet.ts';
import {
  buildBody, buildFromAddress, buildSubject, combinedFileName, resolveRecipients,
  separateFileName, sizeRefusal,
} from '../_shared/invoice/sendRules.ts';

const ROLES = ['dispatcher', 'management', 'owner'];
const TEST_ROLES = ['management', 'owner'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });

  const { data: claims, error: ae } = await asUser.auth.getClaims(auth.slice(7));
  const uid = claims?.claims?.sub as string | undefined;
  if (ae || !uid) return json({ error: 'Unauthorized' }, 401);

  const { data: roleRows, error: re } = await admin.from('user_roles').select('role').eq('user_id', uid).in('role', ROLES);
  if (re) return json({ error: 'Role check failed' }, 500);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  if (!roles.length) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const invoiceId = typeof body?.invoice_id === 'string' ? body.invoice_id : '';
  const dryRun = body?.dry_run === true;
  const testRecipient = typeof body?.test_recipient === 'string' && body.test_recipient.trim() ? body.test_recipient : null;
  if (!UUID.test(invoiceId)) return json({ error: 'Invoice not found' }, 404);

  let companyId: string;
  try { companyId = await companyIdForUser(admin, uid); } catch { return json({ error: 'Forbidden' }, 403); }

  const { data: invoice, error: ie } = await admin.from('invoices')
    .select('id, company_id, load_id, broker_id, broker_name_snapshot, invoice_number, amount, submitted_at')
    .eq('id', invoiceId).eq('company_id', companyId).maybeSingle();
  if (ie) return json({ error: 'Could not read the invoice' }, 500);
  if (!invoice) return json({ error: 'Invoice not found' }, 404);
  if (testRecipient && !roles.some((r: string) => TEST_ROLES.includes(r))) {
    return json({ error: 'Only management or the owner may send a test.' }, 403);
  }

  const [loadR, brokerR, settingsR, factorR] = await Promise.all([
    admin.from('loads').select('load_number, broker_reference_number').eq('id', invoice.load_id).eq('company_id', companyId).maybeSingle(),
    invoice.broker_id
      ? admin.from('brokers').select('company_name').eq('id', invoice.broker_id).eq('company_id', companyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from('billing_settings').select('remit_to_name, remit_to_email').eq('company_id', companyId).maybeSingle(),
    admin.from('factoring_companies').select('name, send_to_emails, cc_emails, packet_style')
      .eq('company_id', companyId).eq('is_default', true).maybeSingle(),
  ]);
  for (const r of [loadR, brokerR, settingsR, factorR]) if (r.error) return json({ error: `Could not read the invoice data: ${r.error.message}` }, 500);
  if (!loadR.data) return json({ error: 'Invoice not found' }, 404);
  const factor = factorR.data;
  if (!factor) return json({ error: 'No default factoring company is configured.' }, 409);
  const remitName = settingsR.data?.remit_to_name?.trim();
  if (!remitName) return json({ error: 'Billing settings need a remit-to name before sending.' }, 409);

  // Readiness, as the caller: the same database rule that gates invoicing.
  const { data: missingRaw, error: me } = await asUser.rpc('invoice_readiness_missing', { p_load_id: invoice.load_id });
  if (me) return json({ error: me.message }, 403);
  const missing = (missingRaw ?? []) as string[];
  if (!testRecipient && missing.length) {
    return json({ error: `Not ready to send. Missing before invoicing: ${missing.join(', ')}.`, missing }, 409);
  }
  if (!testRecipient && !(factor.send_to_emails ?? []).length) {
    return json({ error: `${factor.name} has no send-to address in Billing settings.` }, 409);
  }

  let recipients;
  try {
    recipients = resolveRecipients(
      { to: factor.send_to_emails ?? [], cc: factor.cc_emails ?? [] },
      { to: body?.to, cc: body?.cc }, testRecipient,
    );
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 400); }

  // The invoice PDF. A real send uses (and if missing, saves) the stored file;
  // a dry run or a test never saves one.
  const saveInvoice = !dryRun && !testRecipient;
  let invoiceBytes: Uint8Array;
  const { data: saved } = await admin.from('invoice_files').select('storage_path')
    .eq('invoice_id', invoice.id).eq('company_id', companyId).maybeSingle();
  if (saved) {
    const { data: blob, error } = await admin.storage.from('invoice-files').download(saved.storage_path);
    if (error || !blob) return json({ error: 'The saved invoice PDF could not be read' }, 500);
    invoiceBytes = new Uint8Array(await blob.arrayBuffer());
  } else {
    const res = await fetch(`${url}/functions/v1/generate-invoice-pdf`, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoice.id, dry_run: !saveInvoice }),
    });
    if (!res.ok) return json(await res.json().catch(() => ({ error: 'The invoice PDF could not be built' })), res.status);
    invoiceBytes = new Uint8Array(await res.arrayBuffer());
  }

  const order = loadR.data.broker_reference_number ?? null;
  let files: Array<{ name: string; bytes: Uint8Array }>;
  try {
    const parts = await buildPacketParts(admin, companyId, invoice.load_id, { bytes: invoiceBytes, name: invoice.invoice_number });
    if (factor.packet_style === 'separate') {
      files = parts.map((p, i) => ({ name: separateFileName(i + 1, invoice.invoice_number, p.documentType), bytes: p.bytes }));
    } else {
      const combined = await combineParts(parts);
      files = [{ name: combinedFileName(invoice.invoice_number, order, loadR.data.load_number), bytes: combined.bytes }];
    }
  } catch (e) {
    if (e instanceof PacketError) return json({ error: e.message }, e.status);
    throw e;
  }
  const sized = files.map((f) => ({ name: f.name, bytes: f.bytes.byteLength }));
  const tooBig = sizeRefusal(sized);
  if (tooBig) return json({ error: tooBig, attachments: sized }, 413);

  const brokerName = brokerR.data?.company_name ?? invoice.broker_name_snapshot ?? null;
  const subject = buildSubject({ invoiceNumber: invoice.invoice_number, brokerName, orderNumber: order, remitToName: remitName }, !!testRecipient);
  const { text, html } = buildBody({
    invoiceNumber: invoice.invoice_number, loadNumber: loadR.data.load_number, orderNumber: order, brokerName,
    amount: Number(invoice.amount), remitToName: remitName, attachments: sized, missing: testRecipient ? missing : undefined,
  });
  const from = buildFromAddress(remitName, FROM_DOMAIN);
  const replyTo = settingsR.data?.remit_to_email ?? null;
  const preview = {
    from, reply_to: replyTo, to: recipients.to, cc: recipients.cc, subject, text, html,
    attachments: sized, packet_style: factor.packet_style, missing, is_test: !!testRecipient, factor_name: factor.name,
  };
  if (dryRun) return json({ dry_run: true, ...preview });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'Email sending is not configured.' }, 500);

  const payload: Record<string, unknown> = {
    from, to: recipients.to, subject, html, text,
    attachments: files.map((f) => ({ filename: f.name, content: base64Encode(f.bytes) })),
  };
  if (recipients.cc.length) payload.cc = recipients.cc;
  if (replyTo) payload.reply_to = replyTo;

  let providerId: string | null = null;
  let sendError: string | null = null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const t = await res.text();
    if (res.ok) { try { providerId = JSON.parse(t)?.id ?? null; } catch { /* non-JSON success */ } }
    else sendError = `Resend error [${res.status}]: ${t}`;
  } catch (e) { sendError = `Resend network error: ${e instanceof Error ? e.message : String(e)}`; }

  // The exact attachments sent. Saved for real successful sends only; a test's are not saved.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const attachments: Array<Record<string, unknown>> = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const entry: Record<string, unknown> = { name: f.name, bytes: f.bytes.byteLength, sha256: await sha256Hex(f.bytes), storage_path: null };
    if (!sendError && !testRecipient) {
      const path = `${companyId}/${invoice.id}/sent-${stamp}-${i + 1}.pdf`;
      const { error: upErr } = await admin.storage.from('invoice-files').upload(path, f.bytes, { contentType: 'application/pdf', upsert: false });
      if (!upErr) entry.storage_path = path;
      else console.error('send-invoice-packet: could not save sent attachment', upErr.message);
    }
    attachments.push(entry);
  }

  const { data: rec, error: recErr } = await admin.rpc('record_invoice_send', {
    p_invoice_id: invoice.id, p_sent_by: uid, p_to: recipients.to, p_cc: recipients.cc, p_subject: subject,
    p_attachments: attachments, p_packet_style: factor.packet_style, p_provider_message_id: providerId,
    p_status: sendError ? 'failed' : 'sent', p_error: sendError, p_is_test: !!testRecipient,
  });
  if (recErr) console.error('send-invoice-packet: record failed', recErr.message);

  if (sendError) return json({ error: sendError, status: 'failed', invoice_send_id: rec?.invoice_send_id ?? null }, 502);
  return json({
    status: 'sent', provider_message_id: providerId, invoice_send_id: rec?.invoice_send_id ?? null,
    submitted: rec?.submitted ?? false, to: recipients.to, cc: recipients.cc, subject, attachments: sized,
    record_error: recErr?.message ?? null,
  });
});
