import { supabase } from '@/integrations/supabase/client';

/**
 * Phase 4 will swap this out for a Resend-backed edge function call.
 * For now it advances the request status and stamps the relevant date so
 * staff can exercise the full workflow end-to-end without email delivery.
 */
export async function sendPEIEmail(
  requestId: string,
  kind: 'initial' | 'follow_up' | 'final_notice'
): Promise<void> {
  const now = new Date().toISOString();
  const patch =
    kind === 'initial'
      ? { status: 'sent', date_sent: now }
      : kind === 'follow_up'
        ? { status: 'follow_up_sent', date_follow_up_sent: now }
        : { status: 'final_notice_sent', date_final_notice_sent: now };
  const { error } = await supabase.from('pei_requests').update(patch as any).eq('id', requestId);
  if (error) throw error;
}