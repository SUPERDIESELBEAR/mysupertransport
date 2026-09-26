/**
 * Sending an invoice packet to the factor — Alvys milestone 2, pass 5 (P80/P81).
 *
 * Only the `send-invoice-packet` function sends or records anything. One call
 * is one invoice and one email; "Send selected" calls it once per invoice.
 */
import { supabase } from '@/integrations/supabase/client';

export interface SendAttachment { name: string; bytes: number }

export interface SendPreview {
  dry_run: true;
  from: string;
  reply_to: string | null;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: SendAttachment[];
  packet_style: 'combined' | 'separate';
  missing: string[];
  factor_name: string;
}

export interface SendResult {
  status: 'sent';
  provider_message_id: string | null;
  invoice_send_id: string | null;
  submitted: boolean;
  to: string[];
  cc: string[];
  subject: string;
  attachments: SendAttachment[];
}

export interface InvoiceSendRow {
  id: string;
  invoice_id: string;
  sent_at: string;
  sent_by: string | null;
  to_emails: string[];
  cc_emails: string[];
  attachments: Array<{ name: string; bytes: number }>;
  status: 'sent' | 'failed';
  error: string | null;
  is_test: boolean;
  sender_name?: string | null;
}

export class SendError extends Error {
  constructor(message: string, readonly status: number, readonly missing: string[] = []) { super(message); }
}

export interface SendRequest {
  invoice_id: string;
  to?: string[];
  cc?: string[];
  dry_run?: boolean;
  test_recipient?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fetcher = (url: string, init: RequestInit) => Promise<any>;

export async function callSendInvoicePacket<T>(req: SendRequest, fetcher: Fetcher = fetch): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new SendError('Please sign in again.', 401);
  const res = await fetcher(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-packet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SendError(payload?.error ?? `The send failed (${res.status}).`, res.status, payload?.missing ?? []);
  }
  return payload as T;
}

export const previewSend = (invoiceId: string) =>
  callSendInvoicePacket<SendPreview>({ invoice_id: invoiceId, dry_run: true });

export const sendInvoice = (invoiceId: string, to?: string[], cc?: string[]) =>
  callSendInvoicePacket<SendResult>({ invoice_id: invoiceId, to, cc });

/** Sends each invoice as its own email, one after another; never stops at a failure. */
export async function sendMany(
  invoiceIds: string[],
  send: (id: string) => Promise<SendResult> = (id) => sendInvoice(id),
): Promise<Record<string, { ok: true; result: SendResult } | { ok: false; error: string }>> {
  const out: Record<string, { ok: true; result: SendResult } | { ok: false; error: string }> = {};
  for (const id of invoiceIds) {
    try { out[id] = { ok: true, result: await send(id) }; }
    catch (e) { out[id] = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}

/** The send history, newest first, with who sent each. */
export async function fetchInvoiceSends(invoiceIds: string[]): Promise<InvoiceSendRow[]> {
  if (invoiceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('invoice_sends')
    .select('id, invoice_id, sent_at, sent_by, to_emails, cc_emails, attachments, status, error, is_test')
    .in('invoice_id', invoiceIds)
    .order('sent_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as InvoiceSendRow[];
  const senders = [...new Set(rows.map(r => r.sent_by).filter(Boolean))] as string[];
  if (senders.length) {
    const { data: people } = await supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', senders);
    const names = new Map((people ?? []).map(p => [p.user_id, [p.first_name, p.last_name].filter(Boolean).join(' ')]));
    rows.forEach(r => { r.sender_name = r.sent_by ? names.get(r.sent_by) || null : null; });
  }
  return rows;
}

/** The last real (non-test) successful send, if any. */
export const lastRealSend = (rows: InvoiceSendRow[]) =>
  rows.find(r => r.status === 'sent' && !r.is_test) ?? null;

export async function fetchDefaultFactorName(): Promise<string | null> {
  const { data, error } = await supabase.from('factoring_companies').select('name').eq('is_default', true).maybeSingle();
  if (error) return null;
  return data?.name ?? null;
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const sentDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
