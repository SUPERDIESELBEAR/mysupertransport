// Unified sending helpers. Two paths:
//
//  1. sendTemplateEmail(...)  → queue-backed (send-transactional-email → pgmq).
//     Preferred for anything with a registered template. Gets retries,
//     suppression, and email_send_log for free.
//
//  2. sendResendDirect(...)   → direct Resend REST call.
//     Escape hatch for cases the queue path can't cover today (large PDF
//     attachments, bulk staff CC/reply-to lists). Still checks suppression,
//     enforces attachment size, and writes to email_send_log so it is
//     visible in the dashboard just like queue-backed sends.
//
// Both paths surface provider errors verbatim so callers can return a
// readable JSON body instead of a bare "non-2xx" toast.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildFrom, replyTo, type SenderRole } from './sender.ts';

// Resend limit is ~40MB base64 total. Leave headroom for HTML + headers.
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface TemplateSendOptions {
  supabase: SupabaseClient;
  authHeader: string;
  templateName: string;
  recipientEmail: string;
  templateData?: Record<string, unknown>;
  /** Stable key per business event so retries can't double-send. */
  idempotencyKey: string;
}

export interface TemplateSendResult {
  success: boolean;
  queued?: boolean;
  reason?: string;
  error?: string;
  details?: unknown;
}

/**
 * Enqueue an email via the shared send-transactional-email function.
 * Always use this for anything with a registered template — you get the
 * queue, suppression, retries, and email_send_log for free.
 */
export async function sendTemplateEmail(
  opts: TemplateSendOptions,
): Promise<TemplateSendResult> {
  const { supabase, authHeader, templateName, recipientEmail, templateData, idempotencyKey } = opts;
  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName,
      recipientEmail,
      idempotencyKey,
      templateData: templateData ?? {},
    },
    headers: { Authorization: authHeader },
  });
  if (error) {
    // Try to pull the real cause out of FunctionsHttpError context.
    let details: unknown = error.message;
    // deno-lint-ignore no-explicit-any
    const ctx = (error as any).context;
    if (ctx && typeof ctx.text === 'function') {
      try { details = await ctx.text(); } catch { /* ignore */ }
    }
    return {
      success: false,
      error: `Template send failed: ${error.message}`,
      details,
    };
  }
  return { success: true, queued: true, ...((data as object) ?? {}) };
}

export interface ResendAttachment {
  filename: string;
  /** Base64-encoded content. */
  content: string;
  content_type?: string;
}

export interface DirectSendOptions {
  supabase: SupabaseClient;
  role?: SenderRole;
  to: string | string[];
  cc?: string[];
  replyToList?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
  /** For email_send_log. Should mirror what a template name would be. */
  logLabel: string;
  /** Skip suppression check (rare: staff-only internal notifications). */
  skipSuppression?: boolean;
}

export interface DirectSendResult {
  success: boolean;
  status: number;
  providerId?: string;
  error?: string;
  details?: string;
  suppressed?: boolean;
}

function estimateBase64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function normalizeRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .map(v => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter(v => v.length > 0);
}

/**
 * Direct Resend REST call. Only use when the queue path genuinely cannot cover
 * the case (large attachments, dynamic multi-recipient CC lists). Enforces:
 *   - Suppression check for each recipient (unless skipSuppression is set)
 *   - Attachment size cap (20MB combined)
 *   - Provider errors returned verbatim in `details`
 *   - email_send_log row per recipient (`sent` on 2xx, `failed` otherwise)
 */
export async function sendResendDirect(
  opts: DirectSendOptions,
): Promise<DirectSendResult> {
  const {
    supabase,
    role = 'onboarding',
    to,
    cc,
    replyToList,
    subject,
    html,
    text,
    attachments,
    logLabel,
    skipSuppression,
  } = opts;

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return { success: false, status: 500, error: 'RESEND_API_KEY not configured' };
  }

  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) {
    return { success: false, status: 400, error: 'At least one recipient is required' };
  }

  // Suppression: block any recipient on the list.
  if (!skipSuppression) {
    const { data: suppressed, error: supErr } = await supabase
      .from('suppressed_emails')
      .select('email')
      .in('email', recipients);
    if (supErr) {
      console.error('sendResendDirect: suppression check failed', supErr);
      return { success: false, status: 500, error: 'Suppression check failed', details: supErr.message };
    }
    if (suppressed && suppressed.length > 0) {
      const blocked = suppressed.map(r => r.email as string);
      // Log the suppressed attempts.
      for (const email of blocked) {
        await supabase.from('email_send_log').insert({
          message_id: crypto.randomUUID(),
          template_name: logLabel,
          recipient_email: email,
          status: 'suppressed',
        });
      }
      return {
        success: false,
        status: 400,
        error: 'Recipient(s) are on the suppression list',
        details: blocked.join(', '),
        suppressed: true,
      };
    }
  }

  // Attachment size check.
  if (attachments && attachments.length > 0) {
    let total = 0;
    for (const a of attachments) total += estimateBase64Bytes(a.content);
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      return {
        success: false,
        status: 413,
        error: `Attachments exceed ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))}MB limit`,
        details: `Total ~${Math.round(total / (1024 * 1024))}MB`,
      };
    }
  }

  const payload: Record<string, unknown> = {
    from: buildFrom(role),
    to: recipients,
    subject,
    html,
  };
  if (text) payload.text = text;
  if (cc && cc.length > 0) payload.cc = cc;
  if (replyToList && replyToList.length > 0) payload.reply_to = replyToList;
  else payload.reply_to = replyTo(role);
  if (attachments && attachments.length > 0) payload.attachments = attachments;

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`sendResendDirect: network error for ${logLabel}`, message);
    for (const email of recipients) {
      await supabase.from('email_send_log').insert({
        message_id: crypto.randomUUID(),
        template_name: logLabel,
        recipient_email: email,
        status: 'failed',
        error_message: `Network error: ${message}`,
      });
    }
    return { success: false, status: 502, error: 'Resend network error', details: message };
  }

  const bodyText = await res.text();
  let providerId: string | undefined;
  if (res.ok) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed.id === 'string') providerId = parsed.id;
    } catch { /* provider returned non-JSON success — ignore */ }
  }

  const status = res.status;
  const success = res.ok;
  for (const email of recipients) {
    await supabase.from('email_send_log').insert({
      message_id: providerId ?? crypto.randomUUID(),
      template_name: logLabel,
      recipient_email: email,
      status: success ? 'sent' : 'failed',
      error_message: success ? null : `Resend ${status}: ${bodyText}`,
    });
  }

  if (!success) {
    console.error(`sendResendDirect: Resend ${status} for ${logLabel}`, bodyText);
    return {
      success: false,
      status: status === 429 ? 429 : 502,
      error: `Resend rejected the send (HTTP ${status})`,
      details: bodyText,
    };
  }

  return { success: true, status: 200, providerId };
}