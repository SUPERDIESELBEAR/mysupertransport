import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Wait ms milliseconds — used for Resend rate-limit throttling */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Payload {
  /** 'published' = brand-new doc made visible | 'updated' = existing doc content changed | 'reminder' = manual compliance reminder */
  event_type: 'published' | 'updated' | 'reminder';
  document_title: string;
  document_description?: string;
  /** For 'updated' / 'reminder': only notify specific users */
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

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
    const docHubUrl = `${appUrl}/operator?tab=docs-hub`;

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

    // ─── Filter by notification preferences (respect opt-outs) ──────────────
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

    // ─── Fetch auth emails ───────────────────────────────────────────────────
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
    } else if (event_type === 'reminder') {
      subject = `Reminder: Acknowledge "${document_title}"`;
      heading = '⏰ Action Required — Document Acknowledgment';
      bodyHtml = `<p>You have a required document in the <strong>Document Hub</strong> that still needs your acknowledgment.</p>
        <div style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:16px 0;">
          <p style="margin:0;font-weight:700;color:#0f1117;">${document_title}</p>
          ${descHtml}
        </div>
        <p>Please log in to your portal, open the <strong>Doc Hub</strong> tab, read the document, and click <strong>Acknowledge</strong> to complete this requirement.</p>`;
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

    // ─── Send sequentially with 600ms delay to respect Resend 2 req/s limit ─
    let sent = 0;
    let failed = 0;
    for (const u of recipients) {
      try {
        await sendEmail(u.email!, subject, html, RESEND_API_KEY);
        sent++;
      } catch {
        failed++;
      }
      // Throttle: stay safely under Resend's 2 requests/second limit
      if (recipients.indexOf(u) < recipients.length - 1) {
        await sleep(600);
      }
    }

    console.log(`[notify-document-update] '${event_type}' '${document_title}' → sent ${sent}/${recipients.length}, failed ${failed}`);

    return new Response(JSON.stringify({ success: true, event_type, sent, failed, total: recipients.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-document-update] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
