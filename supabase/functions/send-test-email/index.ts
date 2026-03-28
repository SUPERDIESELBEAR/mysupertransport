import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, ONBOARDING_EMAIL, BRAND_NAME } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the caller is authenticated using getClaims (signing-keys compatible)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseUser.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: claimsData.claims.sub as string, email: claimsData.claims.email as string | undefined };

    // Confirm the user has the management role
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'management')
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden — management role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recipientEmail = user.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'No email address on file for your account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { subject, html } = await req.json();
    if (!subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing subject or html' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepend a test banner to the HTML so recipients know it's a test send
    const testBanner = `
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 16px;margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#856404;text-align:center;">
        📧 <strong>TEST EMAIL</strong> — This is a catalog preview sent to <em>${recipientEmail}</em>. Not delivered to end users.
      </div>`;

    // Inject the banner right after the opening <body> tag
    const htmlWithBanner = html.replace(
      /<body[^>]*>/i,
      (match: string) => `${match}<div style="max-width:640px;margin:0 auto;padding:12px 0 0;">${testBanner}</div>`
    );

    await sendEmail(
      recipientEmail,
      `[TEST] ${subject}`,
      htmlWithBanner,
      RESEND_API_KEY,
      `${BRAND_NAME} <${ONBOARDING_EMAIL}>`
    );

    return new Response(JSON.stringify({ ok: true, sentTo: recipientEmail }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-test-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
