/**
 * Invoice PDF — Module 7 / Alvys milestone 2, pass 2.
 *
 * Only the `generate-invoice-pdf` edge function writes a file. The browser
 * reads a stored file through the private `invoice-files` bucket (same-company
 * invoice.view staff only) and asks the function to create one. A stored file
 * is never replaced.
 */
import { supabase } from '@/integrations/supabase/client';

export interface InvoiceFileRow {
  invoice_id: string;
  storage_path: string;
}

/** Which of these invoices already have a stored PDF. */
export async function fetchInvoiceFiles(invoiceIds: string[]): Promise<Record<string, string>> {
  if (invoiceIds.length === 0) return {};
  const { data, error } = await supabase
    .from('invoice_files')
    .select('invoice_id, storage_path')
    .in('invoice_id', invoiceIds);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as InvoiceFileRow[]) out[r.invoice_id] = r.storage_path;
  return out;
}

/** Ask the function to create (or return) the stored PDF. */
export async function createInvoicePdf(invoiceId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('generate-invoice-pdf', {
    body: { invoice_id: invoiceId, dry_run: false },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch { /* keep the original message */ }
    throw new Error(msg);
  }
}

async function invokePdf(name: string, body: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `The PDF could not be built (${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Render the current billing settings without writing an invoice file. */
export const previewInvoicePdf = (invoiceId: string) =>
  invokePdf('generate-invoice-pdf', { invoice_id: invoiceId, dry_run: true });

/** Build the current combined packet without saving it. */
export const previewInvoicePacket = (loadId: string) =>
  invokePdf('build-invoice-packet', { load_id: loadId, dry_run: true });

/** Open a stored PDF in a new tab, via a blob so the browser shows it inline. */
export async function openInvoicePdf(storagePath: string): Promise<void> {
  const win = window.open('', '_blank');
  const { data, error } = await supabase.storage.from('invoice-files').download(storagePath);
  if (error || !data) {
    win?.close();
    throw new Error(error?.message ?? 'The invoice PDF could not be opened');
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  if (win) win.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
