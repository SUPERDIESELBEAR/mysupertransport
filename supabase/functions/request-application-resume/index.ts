import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildEmail, sendEmail, BRAND_NAME, RECRUITING_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Always respond with the same generic message to prevent enumeration.
const GENERIC_OK = {
  success: true,
  message: "If an application exists for that email, we've sent a resume link.",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body?.email === 'string' ? body.email : '';
    const email = rawEmail.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const appUrl = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app';

    const admin = createClient(supabaseUrl, serviceKey);

    // Rate limit: max 3 resume requests per email per hour (based on created_at)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from('application_resume_tokens')
      .select('token', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) >= 3) {
      // Still return generic OK — do not leak rate-limit to attackers
      return new Response(JSON.stringify(GENERIC_OK), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up the most recent draft application for this email
    const { data: app } = await admin
      .from('applications')
      .select('id, first_name, email')
      .eq('is_draft', true)
      .ilike('email', email)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!app) {
      return new Response(JSON.stringify(GENERIC_OK), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a resume token (24h expiry)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertErr } = await admin
      .from('application_resume_tokens')
      .insert({ token, application_id: app.id, email, expires_at: expiresAt });

    if (insertErr) {
      console.error('request-application-resume insert error:', insertErr);
      return new Response(JSON.stringify(GENERIC_OK), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resumeUrl = `${appUrl.replace(/\/$/, '')}/apply?resume=${encodeURIComponent(token)}`;

    if (resendKey) {
      const greeting = app.first_name
        ? `Hi ${String(app.first_name).replace(/[<>&"']/g, '')},`
        : 'Hello,';

      const bodyHtml = `
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${greeting}</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
          We saved your ${BRAND_NAME} driver application so you can finish it when you're ready.
          Click the button below to pick up right where you left off.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.6;">
          This link is valid for <strong>24 hours</strong> and can only be used once. If you didn't request this, you can safely ignore this email.
        </p>
      `;
      const subject = `Resume your ${BRAND_NAME} application`;
      const html = buildEmail(subject, 'Resume Your Application', bodyHtml, {
        label: 'Resume application',
        url: resumeUrl,
      }, RECRUITING_EMAIL);

      try {
        await sendEmail(email, subject, html, resendKey);
      } catch (e) {
        console.error('request-application-resume sendEmail error:', e);
      }
    } else {
      console.error('request-application-resume: RESEND_API_KEY not configured');
    }

    return new Response(JSON.stringify(GENERIC_OK), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('request-application-resume error:', err);
    // Still return generic OK to avoid leaking state
    return new Response(JSON.stringify(GENERIC_OK), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});