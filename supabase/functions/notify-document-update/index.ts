import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Email HTML builder (matches existing brand) ─────────────────────────────
function buildEmail(subject: string, heading: string, body: string, cta?: { label: string; url: string }): string {
  const ctaHtml = cta
    ? `<div style="text-align:center;margin:32px 0;">
        <a href="${cta.url}" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
          ${cta.label}
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0f1117;padding:24px 40px;border-bottom:3px solid #C9A84C;">
            <p style="margin:0;color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:2px;">SUPERTRANSPORT</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">DRIVER OPERATIONS</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#0f1117;font-weight:700;">${heading}</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">${body}</div>
            ${ctaHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT LLC &nbsp;·&nbsp; Questions? <a href="mailto:support@mysupertransport.com" style="color:#C9A84C;">support@mysupertransport.com</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string, resendKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SUPERTRANSPORT <onboarding@mysupertransport.com>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`[notify-document-update] Resend warning [${res.status}] to ${to}: ${err}`);
  }
}

interface Payload {
  /** 'published' = brand-new doc made visible | 'updated' = existing doc content changed */
  event_type: 'published' | 'updated';
  document_title: string;
  document_description?: string;
  /** For 'updated': only notify users who previously acknowledged this doc */
  acknowledged_user_ids?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload: Payload = await req.json();
    const { event_type, document_title, document_description, acknowledged_user_ids } = payload;

    if (!event_type || !document_title) {
      return new Response(JSON.stringify({ error: 'event_type and document_title are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
    const docHubUrl = `${appUrl}/dashboard?tab=docs-hub`;

    // ─── Determine recipient user IDs ───────────────────────────────────────
    let recipientUserIds: string[] = [];

    if (event_type === 'published') {
      // Notify ALL active operators
      const { data: operators } = await supabaseAdmin
        .from('operators')
        .select('user_id');
      recipientUserIds = (operators ?? []).map((op: { user_id: string }) => op.user_id);
    } else {
      // Notify only operators who previously acknowledged this document
      recipientUserIds = acknowledged_user_ids ?? [];
    }

    if (recipientUserIds.length === 0) {
      console.log(`[notify-document-update] No recipients for '${event_type}' of '${document_title}'`);
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Filter by notification preferences ─────────────────────────────────
    const { data: optedOut } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id')
      .in('user_id', recipientUserIds)
      .eq('event_type', 'document_update')
      .eq('email_enabled', false);
    const optedOutSet = new Set((optedOut ?? []).map((r: { user_id: string }) => r.user_id));
    const filteredIds = recipientUserIds.filter(id => !optedOutSet.has(id));

    if (filteredIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'all opted out' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Fetch auth emails in batches (listUsers paginates) ─────────────────
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const filteredSet = new Set(filteredIds);
    const recipients = (users ?? []).filter(u => filteredSet.has(u.id) && u.email);

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Build email copy based on event type ────────────────────────────────
    let subject: string;
    let heading: string;
    let bodyHtml: string;

    const descHtml = document_description
      ? `<p style="color:#666;font-size:14px;font-style:italic;">${document_description}</p>`
      : '';

    if (event_type === 'published') {
      subject = `New Document Available: ${document_title}`;
      heading = '📄 New Document in Your Doc Hub';
      bodyHtml = `<p>A new document has been added to the <strong>Document Hub</strong> and is ready for you to review.</p>
        <div style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:16px 0;">
          <p style="margin:0;font-weight:700;color:#0f1117;">${document_title}</p>
          ${descHtml}
        </div>
        <p>Log in to your portal and visit the <strong>Doc Hub</strong> tab to read and acknowledge the document.</p>`;
    } else {
      subject = `Document Updated: ${document_title}`;
      heading = '🔄 A Document Has Been Updated';
      bodyHtml = `<p>A document you previously reviewed in the <strong>Document Hub</strong> has been updated with new content.</p>
        <div style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:16px 0;">
          <p style="margin:0;font-weight:700;color:#0f1117;">${document_title}</p>
          ${descHtml}
        </div>
        <p>Please log in to your portal, open the <strong>Doc Hub</strong> tab, and re-read and re-acknowledge the updated document to stay compliant.</p>`;
    }

    const html = buildEmail(subject, heading, bodyHtml, {
      label: 'Go to Doc Hub',
      url: docHubUrl,
    });

    // ─── Send in parallel (fire-and-forget per recipient) ────────────────────
    let sent = 0;
    await Promise.all(
      recipients.map(async (u) => {
        try {
          await sendEmail(u.email!, subject, html, RESEND_API_KEY);
          sent++;
        } catch (e) {
          console.warn(`[notify-document-update] Failed to send to ${u.email}: ${e}`);
        }
      })
    );

    console.log(`[notify-document-update] '${event_type}' '${document_title}' → sent to ${sent}/${recipients.length}`);

    return new Response(JSON.stringify({ success: true, event_type, sent, total: recipients.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-document-update] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
