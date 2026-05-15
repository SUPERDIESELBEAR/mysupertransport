import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

/**
 * Lightweight helper to log directly-sent (non-queue) emails to email_send_log
 * so the admin Email Log dashboard can see them.
 *
 * Pattern: insert a `pending` row up front, then a `sent` or `failed` row on completion.
 * Rows share the same `message_id` and are deduplicated client-side (latest per id).
 */

export type EmailLogStatus = 'pending' | 'sent' | 'failed';

export function makeMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function getLogClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function logEmailEvent(
  client: SupabaseClient | null,
  args: {
    messageId: string;
    templateName: string;
    recipientEmail: string;
    status: EmailLogStatus;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  if (!client) return;
  try {
    await client.from('email_send_log').insert({
      message_id: args.messageId,
      template_name: args.templateName,
      recipient_email: args.recipientEmail,
      status: args.status,
      error_message: args.errorMessage ?? null,
      metadata: args.metadata ?? null,
    });
  } catch (err) {
    console.warn('[email-log] insert failed:', err);
  }
}

/**
 * Wrap a send call with pending → sent/failed logging.
 * The send function should throw on failure for the failed row to capture the error.
 */
export async function withEmailLog<T>(
  client: SupabaseClient | null,
  args: {
    messageId: string;
    templateName: string;
    recipientEmail: string;
    metadata?: Record<string, unknown> | null;
  },
  send: () => Promise<T>
): Promise<T | null> {
  await logEmailEvent(client, { ...args, status: 'pending' });
  try {
    const result = await send();
    await logEmailEvent(client, { ...args, status: 'sent' });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEmailEvent(client, { ...args, status: 'failed', errorMessage: msg });
    console.error(`[email-log] ${args.templateName} send failed:`, msg);
    return null;
  }
}