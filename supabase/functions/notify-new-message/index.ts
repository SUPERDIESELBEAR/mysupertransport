import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * notify-new-message
 *
 * Triggered after a message is inserted. Creates an in-app notification for
 * each recipient. Messages NEVER trigger an email at send time — they stay
 * inside SUPERDRIVE. The only message-related email is the once-per-message
 * 48-hour unread reminder (see `send-unread-message-reminders`).
 */
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
      .select('id, sender_id, recipient_id, thread_id, is_system, body, attachment_name, attachment_mime, sent_at, deleted_at')
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

    // Never notify for system messages (join/leave/rename banners)
    if (msg.is_system) {
      return new Response(JSON.stringify({ ok: true, skipped: 'system' }), {
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

    // ─── Build list of recipient ids ──────────────────────────────────────
    // DM: single recipient. Group: all thread participants except the sender.
    let recipientIds: string[] = [];
    let groupTitle: string | null = null;
    if (msg.recipient_id) {
      recipientIds = [msg.recipient_id];
    } else if (msg.thread_id) {
      const { data: parts } = await supabaseAdmin
        .from('thread_participants')
        .select('user_id')
        .eq('thread_id', msg.thread_id);
      recipientIds = (parts ?? [])
        .map((p: { user_id: string }) => p.user_id)
        .filter((uid: string) => uid !== msg.sender_id);
      const { data: t } = await supabaseAdmin
        .from('message_threads')
        .select('title')
        .eq('id', msg.thread_id)
        .maybeSingle();
      groupTitle = t?.title ?? null;
    }

    const results: Array<Record<string, unknown>> = [];
    for (const recipientId of recipientIds) {
      results.push(await notifyOne(recipientId));
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    async function notifyOne(recipientId: string): Promise<Record<string, unknown>> {
    // ─── Determine recipient portal link based on role ────────────────────
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', recipientId);

    const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
    let portalLink = '/operator?tab=messages';
    if (roleSet.has('management') || roleSet.has('owner')) portalLink = '/management?view=messages';
    else if (roleSet.has('onboarding_staff')) portalLink = '/staff?view=messages';
    else if (roleSet.has('dispatcher')) portalLink = '/dispatch?view=messages';

    const title = groupTitle
      ? `${senderName} in ${groupTitle}`
      : `New message from ${senderName}`;

    // ─── Always: insert in-app notification (push surface) ────────────────
    // Respect in_app_enabled preference for 'new_message' (default ON).
    const { data: inAppPref } = await supabaseAdmin
      .from('notification_preferences')
      .select('in_app_enabled')
      .eq('user_id', recipientId)
      .eq('event_type', 'new_message')
      .maybeSingle();
    const inAppEnabled = inAppPref?.in_app_enabled ?? true;

    if (inAppEnabled) {
      await supabaseAdmin.from('notifications').insert({
        user_id: recipientId,
        title,
        body: preview,
        type: 'new_message',
        channel: 'in_app',
        link: portalLink,
      });
    }

    // Messages stay inside SUPERDRIVE — no email is ever sent at send time.
    return { recipient: recipientId, in_app: inAppEnabled, email: 'never' };
    }

  } catch (err) {
    console.error('[notify-new-message] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});