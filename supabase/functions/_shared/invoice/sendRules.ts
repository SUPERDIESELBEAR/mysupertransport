/**
 * Pure rules for sending an invoice to the factor (P80/P81). No imports, so
 * both the edge function and the vitest suite use this exact file.
 */

export const MAX_TOTAL_BYTES = 35 * 1024 * 1024;
const EMAIL = /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/;

/** Same rules as the saved settings (normalize_billing_email_list). Throws the same messages. */
export function normalizeEmailList(list: unknown, label: 'Send-to' | 'CC'): string[] {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error(`${label} must be a list of addresses.`);
  const out: string[] = [];
  for (const raw of list) {
    const e = String(raw ?? '').trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL.test(e)) throw new Error(`"${e}" is not a valid email address.`);
    if (out.includes(e)) throw new Error(`${label} already lists ${e}.`);
    out.push(e);
  }
  if (out.length > 10) throw new Error(`${label} can hold at most 10 addresses.`);
  return out;
}

export interface Recipients { to: string[]; cc: string[] }

/** The saved lists unless THIS send passes edited ones. The saved settings never change. */
export function resolveRecipients(
  saved: Recipients, override: { to?: unknown; cc?: unknown }, testRecipient?: string | null,
): Recipients {
  if (testRecipient) {
    const [one] = normalizeEmailList([testRecipient], 'Send-to');
    if (!one) throw new Error('A test address is required.');
    return { to: [one], cc: [] };
  }
  const to = override.to !== undefined ? normalizeEmailList(override.to, 'Send-to') : saved.to;
  const cc = override.cc !== undefined ? normalizeEmailList(override.cc, 'CC') : saved.cc;
  if (to.length === 0) throw new Error('The factoring company has no send-to address.');
  const both = to.filter((e) => cc.includes(e));
  if (both.length) throw new Error('An address cannot be both a send-to and a CC address.');
  return { to, cc };
}

export interface SubjectInput {
  invoiceNumber: string; brokerName: string | null; orderNumber: string | null; remitToName: string;
}

export function buildSubject(s: SubjectInput, isTest = false): string {
  const base = `Invoice ${s.invoiceNumber} — ${s.brokerName || '-'} — Order ${s.orderNumber || '-'} — ${s.remitToName}`;
  return isTest ? `[TEST] ${base}` : base;
}

export function buildFromAddress(remitToName: string, fromDomain: string): string {
  return `${remitToName} Billing <billing@${fromDomain}>`;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim();

export function combinedFileName(invoiceNumber: string, orderNumber: string | null, loadNumber: string): string {
  return `${safe(invoiceNumber)} - ${safe(orderNumber || loadNumber)}.pdf`;
}

const TYPE_LABEL: Record<string, string> = {
  invoice: 'Invoice', bol: 'BOL', pod: 'POD', rate_confirmation: 'Rate confirmation',
  revised_rate_confirmation: 'Revised rate confirmation', lumper_receipt: 'Lumper receipt',
  scale_ticket: 'Scale ticket', detention_documentation: 'Detention documentation',
  loadout_pickup_inspection: 'Pickup inspection', loadout_delivery_inspection: 'Delivery inspection',
  permit: 'Permit', broker_correspondence: 'Broker correspondence', reimbursement_proof: 'Reimbursement proof', other: 'Other',
};

/** Separate style: one PDF per part, in packet order, named so they sort. */
export function separateFileName(n: number, invoiceNumber: string, documentType: string): string {
  return `${String(n).padStart(2, '0')} ${safe(invoiceNumber)} - ${TYPE_LABEL[documentType] ?? documentType}.pdf`;
}

export interface SizedFile { name: string; bytes: number }

/** Refuses over 35 MB, naming the largest files. Returns null when it fits. */
export function sizeRefusal(files: SizedFile[]): string | null {
  const total = files.reduce((t, f) => t + f.bytes, 0);
  if (total <= MAX_TOTAL_BYTES) return null;
  const largest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 3)
    .map((f) => `${f.name} (${(f.bytes / 1024 / 1024).toFixed(1)} MB)`).join(', ');
  return `The attachments total ${(total / 1024 / 1024).toFixed(1)} MB, over the 35 MB limit. Largest: ${largest}.`;
}

export interface BodyInput {
  invoiceNumber: string; loadNumber: string; orderNumber: string | null; brokerName: string | null;
  amount: number; remitToName: string; attachments: SizedFile[]; missing?: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const kb = (b: number) => `${Math.max(1, Math.round(b / 1024))} KB`;

export function buildBody(b: BodyInput): { text: string; html: string } {
  const facts: Array<[string, string]> = [
    ['Invoice', b.invoiceNumber], ['Load', b.loadNumber], ['Order', b.orderNumber || '-'],
    ['Broker', b.brokerName || '-'], ['Amount', money(b.amount)],
  ];
  const missing = b.missing?.length ? b.missing : null;
  const text = [
    ...(missing ? ['TEST SEND — this invoice is not ready. Missing before invoicing:', ...missing.map((m) => `- ${m}`), ''] : []),
    'Please find the invoice and supporting documents attached.', '',
    ...facts.map(([k, v]) => `${k}: ${v}`), '',
    'Attached:', ...b.attachments.map((a) => `- ${a.name} (${kb(a.bytes)})`), '',
    b.remitToName,
  ].join('\n');
  const html = [
    missing ? `<div style="border:1px solid #d33;padding:8px 12px;margin-bottom:12px"><strong>TEST SEND — this invoice is not ready. Missing before invoicing:</strong><ul>${missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '',
    '<p>Please find the invoice and supporting documents attached.</p>',
    `<table cellpadding="4">${facts.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join('')}</table>`,
    `<p><strong>Attached:</strong></p><ul>${b.attachments.map((a) => `<li>${esc(a.name)} (${kb(a.bytes)})</li>`).join('')}</ul>`,
    `<p>${esc(b.remitToName)}</p>`,
  ].join('');
  return { text, html };
}
