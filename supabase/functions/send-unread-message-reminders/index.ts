import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail } from '../_shared/email-layout.ts';
import { buildAppUrl } from '../_shared/app-url.ts';
import { isDemoRecipient } from '../_shared/demo-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * send-unread-message-reminders
 *
 * Daily cron. Finds messages that are STILL unread 48+ hours after they were
 * sent and sends the recipient ONE digest email. Each message is reminded
 * about exactly once — `reminder_sent_at` is stamped whether or not the email
 * ultimately goes out, so a reminder can never repeat.
 */

const REMINDER_AFTER_MS = 48 * 60 * 60 * 1000;
const MAX_PREVIEW_LEN = 140;
const MAX_ITEMS_PER_EMAIL = 10;

interface Item {
  senderName: string;
  preview: string;
  groupTitle: string | null;
  sentAt: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function previewOf(m: { body: string | null; attachment_name: string | null; attachment_mime: string | null }): string {
  let preview = (m.body ?? '').trim();
  if (!preview && m.attachment_name) {
    const isImg = (m.attachment_mime ?? '').startsWith('image/');
    preview = isImg ? `Sent a photo: ${m.attachment_name}` : `Sent an attachment: ${m.attachment_name}`;
  }
  if (preview.length > MAX_PREVIEW_LEN) preview = preview.slice(0, MAX_PREVIEW_LEN - 1) + '…';
  return preview || 'Sent you a message.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const cutoff = new Date(Date.now() - REMINDER_AFTER_MS).toISOString();

    const { data: candidates, error } = await admin
      .from('messages')
      .select('id, sender_id, recipient_id, thread_id, body, attachment_name, attachment_mime, sent_at, read_at')
      .is('reminder_sent_at', null)
      .is('deleted_at', null)
      .eq('is_system', false)
      .lt('sent_at', cutoff)
      .order('sent_at', { ascending: true })
      .limit(500);

    if (error) throw error;
    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ ok: true, considered: 0, emails: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senderNames = new Map<string, string>();
    const resolveSender = async (uid: string): Promise<string> => {
      if (senderNames.has(uid)) return senderNames.get(uid)!;
      const { data: p } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', uid)
        .maybeSingle();
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || 'A SUPERTRANSPORT teammate';
      senderNames.set(uid, name);
      return name;
    };

    const threadTitles = new Map<string, string | null>();
    const resolveThreadTitle = async (tid: string): Promise<string | null> => {
      if (threadTitles.has(tid)) return threadTitles.get(tid)!;
      const { data: t } = await admin.from('message_threads').select('title').eq('id', tid).maybeSingle();
      const title = t?.title ?? null;
      threadTitles.set(tid, title);
      return title;
    };

    const perRecipient = new Map<string, Item[]>();
    const processedIds: string[] = [];

    for (const m of candidates) {
      processedIds.push(m.id);

      const unreadRecipients: string[] = [];
      if (m.recipient_id) {
        if (!m.read_at) unreadRecipients.push(m.recipient_id);
      } else if (m.thread_id) {
        const { data: parts } = await admin
          .from('thread_participants')
          .select('user_id, last_read_at')
          .eq('thread_id', m.thread_id);
        for (const p of parts ?? []) {
          if (p.user_id === m.sender_id) continue;
          const lastRead = p.last_read_at ? new Date(p.last_read_at).getTime() : 0;
          if (lastRead < new Date(m.sent_at).getTime()) unreadRecipients.push(p.user_id);
        }
      }
      if (unreadRecipients.length === 0) continue;

      const item: Item = {
        senderName: await resolveSender(m.sender_id),
        preview: previewOf(m),
        groupTitle: m.thread_id ? await resolveThreadTitle(m.thread_id) : null,
        sentAt: m.sent_at,
      };
      for (const uid of unreadRecipients) {
        const list = perRecipient.get(uid) ?? [];
        list.push(item);
        perRecipient.set(uid, list);
      }
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const appOrigin = new URL(buildAppUrl('/')).origin;
    let sent = 0;
    const skipped: Array<Record<string, unknown>> = [];

    for (const [recipientId, items] of perRecipient.entries()) {
      // Respect the user's "new message" email preference.
      const { data: pref } = await admin
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', recipientId)
        .eq('event_type', 'new_message')
        .maybeSingle();
      if (!(pref?.email_enabled ?? true)) { skipped.push({ recipientId, reason: 'opted_out' }); continue; }

      const { data: userRes } = await admin.auth.admin.getUserById(recipientId);
      const email = userRes?.user?.email;
      if (!email) { skipped.push({ recipientId, reason: 'no_address' }); continue; }

      // Demo accounts never receive real mail, and there is no acting staff
      // member on a cron run to reroute to.
      if (await isDemoRecipient(admin, email)) { skipped.push({ recipientId, reason: 'demo' }); continue; }

      const { data: suppressed } = await admin
        .from('suppressed_emails')
        .select('email')
        .ilike('email', email)
        .limit(1);
      if (suppressed && suppressed.length > 0) { skipped.push({ recipientId, reason: 'suppressed' }); continue; }

      // Portal deep link by role.
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', recipientId);
      const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
      let portalLink = '/operator?tab=messages';
      if (roleSet.has('management') || roleSet.has('owner')) portalLink = '/management?view=messages';
      else if (roleSet.has('onboarding_staff')) portalLink = '/staff?view=messages';
      else if (roleSet.has('dispatcher')) portalLink = '/dispatch?view=messages';

      const shown = items.slice(0, MAX_ITEMS_PER_EMAIL);
      const extra = items.length - shown.length;
      const count = items.length;
      const subject = count === 1
        ? `Unread message from ${shown[0].senderName}`
        : `You have ${count} unread messages in SUPERDRIVE`;
      const heading = count === 1
        ? `You have an unread message`
        : `You have ${count} unread messages`;

      const blocks = shown.map(i => `
        <div style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:12px 0;">
          <p style="margin:0 0 6px;font-weight:700;color:#0f1117;">${escapeHtml(i.senderName)}${i.groupTitle ? ` <span style="font-weight:400;color:#777;">in ${escapeHtml(i.groupTitle)}</span>` : ''}</p>
          <p style="margin:0;color:#444;white-space:pre-wrap;">${escapeHtml(i.preview)}</p>
        </div>`).join('');

      const bodyHtml = `
        <p>These messages have been waiting in SUPERDRIVE for more than 48 hours.</p>
        ${blocks}
        ${extra > 0 ? `<p style="color:#666;font-size:14px;">…and ${extra} more.</p>` : ''}
        <p style="color:#888;font-size:13px;">This is a one-time reminder — we will not email you again about these messages. Replies happen inside SUPERDRIVE.</p>
      `;
      const html = buildEmail(subject, heading, bodyHtml, { label: 'Open Messages', url: `${appOrigin}${portalLink}` });

      if (!RESEND_API_KEY) { skipped.push({ recipientId, reason: 'no_api_key' }); continue; }
      try {
        await sendEmail(email, subject, html, RESEND_API_KEY);
        sent++;
      } catch (e) {
        console.warn('[send-unread-message-reminders] send failed', recipientId, e);
        skipped.push({ recipientId, reason: 'send_failed' });
      }
    }

    // Stamp every considered message so a reminder can never repeat.
    if (processedIds.length > 0) {
      const stamp = new Date().toISOString();
      for (let i = 0; i < processedIds.length; i += 200) {
        await admin
          .from('messages')
          .update({ reminder_sent_at: stamp })
          .in('id', processedIds.slice(i, i + 200));
      }
    }

    return new Response(JSON.stringify({ ok: true, considered: processedIds.length, emails: sent, skipped }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-unread-message-reminders] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});