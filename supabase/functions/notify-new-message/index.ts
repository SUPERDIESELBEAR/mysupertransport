import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * notify-new-message
 *
 * Triggered after a DM is inserted. Always creates an in-app notification
 * for the recipient. Sends an email ONLY if:
 *   - the recipient is "offline" (no presence ping in last 2 minutes), AND
 *   - we have not already emailed them about a message from this same
 *     sender within the last 10 minutes (throttle window).
 *
 * This prevents email-spam during a back-and-forth chat while still
 * surfacing missed messages to absent users.
 */

const PRESENCE_GRACE_MS    = 2  * 60 * 1000; // user is "online" if seen in last 2 min
const THROTTLE_WINDOW_MS   = 10 * 60 * 1000; // do not re-email same sender→recipient within 10 min
const MAX_PREVIEW_LEN      = 140;

interface Payload {
  message_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { message_id }: Payload = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ error: 'message_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Load message ─────────────────────────────────────────────────────
    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, recipient_id, body, attachment_name, attachment_mime, sent_at, deleted_at')
      .eq('id', message_id)
      .maybeSingle();

    if (msgErr || !msg) {
      console.warn('[notify-new-message] message not found', message_id, msgErr);
      return new Response(JSON.stringify({ ok: true, skipped: 'not_found' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (msg.deleted_at) {
      return new Response(JSON.stringify({ ok: true, skipped: 'deleted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Resolve sender display name ──────────────────────────────────────
    const { data: senderProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', msg.sender_id)
      .maybeSingle();

    const senderName = [senderProfile?.first_name, senderProfile?.last_name]
      .filter(Boolean).join(' ').trim() || 'A SUPERTRANSPORT teammate';

    // ─── Build preview ────────────────────────────────────────────────────
    let preview = (msg.body ?? '').trim();
    if (!preview && msg.attachment_name) {
      const isImg = (msg.attachment_mime ?? '').startsWith('image/');
      preview = isImg ? `📎 Sent a photo: ${msg.attachment_name}` : `📎 Sent an attachment: ${msg.attachment_name}`;
    }
    if (preview.length > MAX_PREVIEW_LEN) {
      preview = preview.slice(0, MAX_PREVIEW_LEN - 1) + '…';
    }
    if (!preview) preview = 'Sent you a new message.';

    // ─── Determine recipient portal link based on role ────────────────────
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', msg.recipient_id);

    const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
    let portalLink = '/operator?tab=messages';
    if (roleSet.has('management') || roleSet.has('owner')) portalLink = '/management?view=messages';
    else if (roleSet.has('onboarding_staff')) portalLink = '/staff?view=messages';
    else if (roleSet.has('dispatcher')) portalLink = '/dispatch?view=messages';

    // ─── Always: insert in-app notification (push surface) ────────────────
    // Respect in_app_enabled preference for 'new_message' (default ON).
    const { data: inAppPref } = await supabaseAdmin
      .from('notification_preferences')
      .select('in_app_enabled')
      .eq('user_id', msg.recipient_id)
      .eq('event_type', 'new_message')
      .maybeSingle();
    const inAppEnabled = inAppPref?.in_app_enabled ?? true;

    if (inAppEnabled) {
      await supabaseAdmin.from('notifications').insert({
        user_id: msg.recipient_id,
        title: `New message from ${senderName}`,
        body: preview,
        type: 'new_message',
        channel: 'in_app',
        link: portalLink,
      });
    }

    // ─── Decide whether to send email (offline + throttle) ────────────────
    const { data: emailPref } = await supabaseAdmin
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', msg.recipient_id)
      .eq('event_type', 'new_message')
      .maybeSingle();
    const emailEnabled = emailPref?.email_enabled ?? true;

    if (!emailEnabled) {
      return new Response(JSON.stringify({ ok: true, in_app: inAppEnabled, email: 'opted_out' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Presence: consider user online if they have a notification read or
    // a sent message within the grace window — a lightweight signal that
    // avoids requiring a separate presence table.
    const sinceIso = new Date(Date.now() - PRESENCE_GRACE_MS).toISOString();
    const [{ data: recentRead }, { data: recentSent }] = await Promise.all([
      supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', msg.recipient_id)
        .gte('read_at', sinceIso)
        .limit(1),
      supabaseAdmin
        .from('messages')
        .select('id')
        .eq('sender_id', msg.recipient_id)
        .gte('sent_at', sinceIso)
        .limit(1),
    ]);
    const isOnline = (recentRead?.length ?? 0) > 0 || (recentSent?.length ?? 0) > 0;

    if (isOnline) {
      // Reset throttle so the next offline period starts fresh
      await supabaseAdmin
        .from('message_notification_throttle')
        .delete()
        .eq('sender_id', msg.sender_id)
        .eq('recipient_id', msg.recipient_id);
      return new Response(JSON.stringify({ ok: true, in_app: inAppEnabled, email: 'recipient_online' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Throttle check
    const { data: throttle } = await supabaseAdmin
      .from('message_notification_throttle')
      .select('last_notified_at, unread_count')
      .eq('sender_id', msg.sender_id)
      .eq('recipient_id', msg.recipient_id)
      .maybeSingle();

    const now = Date.now();
    if (throttle && (now - new Date(throttle.last_notified_at).getTime()) < THROTTLE_WINDOW_MS) {
      // Within throttle window — increment count, skip email
      await supabaseAdmin
        .from('message_notification_throttle')
        .update({ unread_count: (throttle.unread_count ?? 1) + 1 })
        .eq('sender_id', msg.sender_id)
        .eq('recipient_id', msg.recipient_id);
      return new Response(JSON.stringify({ ok: true, in_app: inAppEnabled, email: 'throttled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Send email ───────────────────────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { data: { user: recipUser } } = await supabaseAdmin.auth.admin.getUserById(msg.recipient_id);
    const recipientEmail = recipUser?.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ ok: true, email: 'no_address' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl  = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
    const ctaUrl  = `${appUrl}${portalLink}`;
    const subject = `New message from ${senderName}`;
    const heading = `💬 ${senderName} sent you a message`;
    const bodyHtml = `
      <p>You have a new direct message in SUPERTRANSPORT.</p>
      <div style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0 0 6px;font-weight:700;color:#0f1117;">${senderName}</p>
        <p style="margin:0;color:#444;white-space:pre-wrap;">${escapeHtml(preview)}</p>
      </div>
      <p style="color:#888;font-size:13px;">You're receiving this because you were offline. We'll wait at least 10 minutes before sending another email about messages from ${escapeHtml(senderName)}.</p>
    `;
    const html = buildEmail(subject, heading, bodyHtml, { label: 'Open Messages', url: ctaUrl });

    try {
      await sendEmail(recipientEmail, subject, html, RESEND_API_KEY);
    } catch (e) {
      console.warn('[notify-new-message] email send failed', e);
    }

    // Upsert throttle row
    await supabaseAdmin
      .from('message_notification_throttle')
      .upsert({
        sender_id: msg.sender_id,
        recipient_id: msg.recipient_id,
        last_notified_at: new Date().toISOString(),
        unread_count: 1,
      });

    return new Response(JSON.stringify({ ok: true, in_app: inAppEnabled, email: 'sent' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-new-message] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}