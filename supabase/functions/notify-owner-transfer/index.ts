import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildEmail, sendEmailStrict, BRAND_NAME, SUPPORT_EMAIL } from '../_shared/email-layout.ts';
import { buildAppUrl } from '../_shared/app-url.ts';
import { getLogClient, makeMessageId, withEmailLog } from '../_shared/email-log.ts';

/**
 * Owner invariant, Pass 5 — THE ONLY LAYER THAT REACHES OUTSIDE THE APP.
 *
 * Every other control in this sequence assumes whoever holds the session is the
 * owner. This one does not: it mails the current owner at his address on record
 * the moment a transfer is initiated, so a transfer started from inside a stolen
 * session lands in the real owner's inbox with a cancel link.
 *
 * Sent on INITIATION ONLY. Acceptance, cancellation and expiry are visible in
 * the app; this is an anti-hijack measure, not a notification system.
 *
 * The cancel link carries NO authority. It names the transfer and lands on the
 * Ownership Transfer screen, which requires a signed-in session and where the
 * cancel itself still goes through cancel_owner_transfer(), which refuses
 * anyone who is not a party to the transfer.
 *
 * THE SEND IS NOT PART OF THE TRANSFER. The row is already committed by
 * initiate_owner_transfer() before this function is called; a failure here
 * leaves the transfer standing and is recorded as a `failed` row in
 * email_send_log (visible in Management → Email Log) plus a function log line.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const esc = (s: string) => s.replace(/[<>&"']/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: claimsData, error: claimsError } =
      await anon.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims) return json({ error: 'Unauthorized' }, 401);
    const callerId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const transferId = typeof body?.transfer_id === 'string' ? body.transfer_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(transferId)) {
      return json({ error: 'transfer_id is required' }, 400);
    }

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: transfer } = await admin
      .from('owner_transfers')
      .select('id, from_user_id, to_user_id, expires_at, status')
      .eq('id', transferId)
      .maybeSingle();

    if (!transfer) return json({ error: 'Ownership transfer not found' }, 404);
    // Only the outgoing owner named on the row may trigger the notice, and only
    // while it is still live. Nothing here is taken from the caller's payload
    // beyond the id of a row that must already name them.
    if (transfer.from_user_id !== callerId) return json({ error: 'Forbidden' }, 403);
    if (transfer.status !== 'pending') return json({ error: 'Transfer is not pending' }, 409);

    const { data: ownerAuth } = await admin.auth.admin.getUserById(transfer.from_user_id);
    const ownerEmail = ownerAuth?.user?.email;
    if (!ownerEmail) {
      console.error('notify-owner-transfer: owner has no email on record', transfer.from_user_id);
      return json({ sent: false, reason: 'no_owner_email' }, 200);
    }

    const { data: profs } = await admin
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', [transfer.from_user_id, transfer.to_user_id]);
    const nameOf = (id: string) => {
      const p = profs?.find((r) => r.user_id === id);
      return esc([p?.first_name, p?.last_name].filter(Boolean).join(' ').trim()) || 'a management user';
    };

    const recipientName = nameOf(transfer.to_user_id);
    const expires = new Date(transfer.expires_at).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const cancelUrl = buildAppUrl(
      `/management?view=ownership-transfer&cancel=${encodeURIComponent(transfer.id)}`,
    );

    const subject = `Ownership transfer started on your ${BRAND_NAME} account`;
    const html = buildEmail(
      subject,
      'An ownership transfer was started',
      `
        <p style="margin:0 0 16px;">
          Someone signed in as you and started transferring ownership of
          ${BRAND_NAME} to <strong>${recipientName}</strong>.
        </p>
        <p style="margin:0 0 16px;">
          If they accept, they become the owner and you stop being the owner. The
          request expires on <strong>${esc(expires)}</strong> (Central time) if nobody
          accepts it.
        </p>
        <p style="margin:0 0 16px;">
          <strong>If this was you, no action is needed.</strong> If it was not, cancel
          it now and change your password.
        </p>
        <p style="margin:0;color:#666;font-size:13px;line-height:1.6;">
          You will be asked to sign in first — this link cannot cancel anything on
          its own.
        </p>
      `,
      { label: 'Cancel this transfer', url: cancelUrl },
      SUPPORT_EMAIL,
    );

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.error('notify-owner-transfer: RESEND_API_KEY not configured');
      return json({ sent: false, reason: 'no_resend_key' }, 200);
    }

    const messageId = makeMessageId(`owner-transfer-${transfer.id}`);
    const result = await withEmailLog(
      getLogClient(),
      {
        messageId,
        templateName: 'owner-transfer-initiated',
        recipientEmail: ownerEmail,
        metadata: {
          transfer_id: transfer.id,
          to_user_id: transfer.to_user_id,
          expires_at: transfer.expires_at,
          cancel_url: cancelUrl,
        },
      },
      () => sendEmailStrict(ownerEmail, subject, html, resendKey, undefined, { messageId }),
    );

    // withEmailLog swallows the throw after writing the `failed` row: the
    // transfer must not be undone by a mail problem.
    return json({ sent: result !== null }, 200);
  } catch (err) {
    console.error('notify-owner-transfer error:', err);
    return json({ sent: false, error: err instanceof Error ? err.message : 'Internal error' }, 200);
  }
});
