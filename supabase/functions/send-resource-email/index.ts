import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail, BRAND_NAME } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STAFF_ROLES = new Set(['onboarding_staff', 'dispatcher', 'management', 'owner']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Authentication: require a valid JWT from a staff user ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = claimsData.claims.sub;
    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId);
    const hasStaffRole = (roleRows ?? []).some((r: { role: string }) => STAFF_ROLES.has(r.role));
    if (!hasStaffRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { resourceTitle, resourceUrl, recipientEmail, recipientName, senderNote } = await req.json();

    // Validate required fields
    if (!resourceTitle || typeof resourceTitle !== 'string') {
      return new Response(JSON.stringify({ error: 'resourceTitle is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!resourceUrl || typeof resourceUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'resourceUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!/^https?:\/\//i.test(resourceUrl)) {
      return new Response(JSON.stringify({ error: 'resourceUrl must be http(s)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'A valid recipientEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const greeting = recipientName ? `Hi ${escapeHtml(String(recipientName))},` : 'Hello,';
    const noteHtml = senderNote
      ? `<p style="margin:16px 0;padding:12px 16px;background:#f9f9f9;border-left:3px solid #C9A84C;color:#555;font-size:14px;line-height:1.6;border-radius:4px;"><strong>Note from your coordinator:</strong><br/>${escapeHtml(String(senderNote)).replace(/\n/g, '<br/>')}</p>`
      : '';

    const bodyHtml = `
      <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
      <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
        Your ${BRAND_NAME} team is sharing a document with you:
      </p>
      <p style="margin:0 0 8px;color:#222;font-size:16px;font-weight:700;">📄 ${escapeHtml(String(resourceTitle))}</p>
      ${noteHtml}
      <p style="margin:16px 0 0;color:#444;font-size:15px;line-height:1.7;">
        Click the button below to download the file.
      </p>
    `;

    const subject = `${BRAND_NAME} — ${resourceTitle}`;
    const html = buildEmail(subject, 'Document Shared With You', bodyHtml, {
      label: 'Download File',
      url: resourceUrl,
    });

    await sendEmail(recipientEmail, subject, html, resendKey);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-resource-email error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
