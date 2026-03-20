import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function buildEmail(subject: string, heading: string, body: string, cta: { label: string; url: string }): string {
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
            <div style="text-align:center;margin:32px 0;">
              <a href="${cta.url}" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                ${cta.label}
              </a>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT &nbsp;·&nbsp; Questions? <a href="mailto:support@mysupertransport.com" style="color:#C9A84C;">support@mysupertransport.com</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

    const payload = await req.json();
    const { driver_user_id, file_name, category } = payload as {
      driver_user_id: string;
      file_name?: string;
      category?: string;
    };

    if (!driver_user_id) {
      return new Response(JSON.stringify({ error: 'driver_user_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Check email notification preference ───────────────────────────────────
    const { data: prefRow } = await supabaseAdmin
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', driver_user_id)
      .eq('event_type', 'document_update')
      .maybeSingle();

    const emailEnabled = prefRow?.email_enabled ?? true;
    if (!emailEnabled) {
      console.log(`[notify-upload-attention] Email disabled for user ${driver_user_id}`);
      return new Response(JSON.stringify({ skipped: true, reason: 'email disabled by preference' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve email from auth ───────────────────────────────────────────────
    const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(driver_user_id);
    const driverEmail = authUser?.email;
    if (!driverEmail) {
      return new Response(JSON.stringify({ error: 'no email for driver user' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve driver name from operators → applications ─────────────────────
    let driverName = 'Driver';
    const { data: opRow } = await supabaseAdmin
      .from('operators')
      .select('application_id')
      .eq('user_id', driver_user_id)
      .maybeSingle();

    if (opRow?.application_id) {
      const { data: appRow } = await supabaseAdmin
        .from('applications')
        .select('first_name, last_name')
        .eq('id', opRow.application_id)
        .maybeSingle();
      if (appRow) {
        const full = `${appRow.first_name ?? ''} ${appRow.last_name ?? ''}`.trim();
        if (full) driverName = full;
      }
    }

    // ── Build email copy ──────────────────────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
    const binderUrl = `${appUrl}/operator?tab=inspection-binder`;

    const categoryLabel = category
      ? category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Document';
    const fileLabel = file_name ? `<strong>${file_name}</strong>` : `a <strong>${categoryLabel}</strong>`;

    const subject = 'Action Required: Your Upload Needs Attention';
    const heading = '⚠️ Your Upload Needs Attention';
    const bodyHtml = `<p>Hi ${driverName},</p>
      <p>Your coordinator has reviewed ${fileLabel} that you uploaded and flagged it as needing attention.</p>
      <div style="background:#fff8ed;border-left:4px solid #e6a817;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0;font-weight:700;color:#0f1117;">What to do next:</p>
        <p style="margin:6px 0 0;color:#555;font-size:14px;">Open your <strong>Inspection Binder</strong> tab to review the flagged upload. Your coordinator may have left additional context in your messages.</p>
      </div>
      <p>If you have questions, reply through the Messages section in your portal or reach out to your coordinator directly.</p>`;

    const html = buildEmail(subject, heading, bodyHtml, {
      label: 'Go to Inspection Binder',
      url: binderUrl,
    });

    // ── Send via Resend ───────────────────────────────────────────────────────
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SUPERTRANSPORT <support@mysupertransport.com>',
        to: [driverEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[notify-upload-attention] Resend error [${res.status}] to ${driverEmail}: ${err}`);
      return new Response(JSON.stringify({ success: false, error: `Resend ${res.status}: ${err}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await res.text();
    console.log(`[notify-upload-attention] Email sent to ${driverEmail} for driver ${driver_user_id}`);

    return new Response(JSON.stringify({ success: true, to: driverEmail }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-upload-attention] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
