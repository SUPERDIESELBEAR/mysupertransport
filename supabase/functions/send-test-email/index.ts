import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, buildEmail, ONBOARDING_EMAIL, BRAND_NAME, BRAND_COLOR, BRAND_DARK } from '../_shared/email-layout.ts';

const APP_URL = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app';

// ─── Server-rendered preview templates ──────────────────────────────────────
// These mirror the exact HTML produced by the live email functions:
//   - application_submitted → send-notification
//   - welcome_superdrive    → launch-superdrive-invite (consolidated approval)
function renderApplicationSubmitted(firstName: string): { subject: string; html: string } {
  const greetingName = firstName || 'there';
  const subject = firstName
    ? `We've got your application, ${firstName}`
    : "We've got your application";
  const html = buildEmail(
    subject,
    '✅ Application Received',
    `<p>Hi ${greetingName},</p>
     <p>Thanks for applying to drive with <strong>SUPERTRANSPORT</strong>. Your application is in our hands and our onboarding team will review it shortly.</p>
     <p><strong>What happens next:</strong></p>
     <ul style="padding-left:20px;line-height:1.8;color:#444;">
       <li>Our team reviews your application (typically within 1–2 business days).</li>
       <li>You'll receive an email with our decision and next steps.</li>
       <li>If approved, you'll set your password and get into <strong>SUPERDRIVE</strong> — your operator app.</li>
     </ul>
     <p style="margin-top:18px;">Questions in the meantime? Reply to this email or write us at <a href="mailto:${ONBOARDING_EMAIL}" style="color:${BRAND_COLOR};">${ONBOARDING_EMAIL}</a>.</p>
     <p style="margin-top:18px;">Talk soon,<br/>— The SUPERTRANSPORT team</p>`,
    undefined,
    ONBOARDING_EMAIL
  );
  return { subject, html };
}

function renderWelcomeSuperdrive(firstName: string, recoveryUrl = '#preview'): { subject: string; html: string } {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const namePart = firstName ? `, ${firstName}` : '';

  const featureCard = (icon: string, title: string, desc: string) => `
    <div style="background:#FAF8F2;border:1px solid #EDE6CF;border-radius:10px;padding:18px;margin:0 0 12px;">
      <p style="margin:0 0 6px;color:${BRAND_DARK};font-size:15px;font-weight:700;">${icon} ${title}</p>
      <p style="margin:0;color:#444;font-size:14px;line-height:1.6;">${desc}</p>
    </div>`;

  const features = [
    featureCard('🔍', 'Inspection Binder', 'Carry your DOT binder in your pocket. CDL, medical card, truck title, inspection report — all one tap away at the scale house.'),
    featureCard('💰', 'Settlement Forecast', "Track projected take-home before settlement day. Add expected loads, log expenses, see your weekly net in real time."),
    featureCard('🚛', 'My Truck', 'Truck specs, photos, plate, VIN, ELD, BestPass, dash cam — logged and ready when dispatch or DOT asks.'),
    featureCard('📍', 'Dispatch Status', 'Update your status (available, on-load, truck-down) and see where your next load is going the moment it\'s assigned.'),
    featureCard('💬', 'Direct Messages', 'Talk one-on-one to dispatch and onboarding without group-text noise.'),
    featureCard('📅', 'Payroll Calendar', 'Wednesday-to-Tuesday work weeks, pay dates, and settlement PDFs always in reach.'),
  ].join('');

  const body = `
    <p style="margin:0 0 14px;">${greeting}</p>
    <p>Congratulations — your driver application has been <strong>approved</strong>, and we're glad to have you on the team. <strong>SUPERDRIVE</strong> is your new operator app: your truck, your settlements, your documents — all in one place, always with you.</p>
    <p style="margin:0 0 22px;">Click below to set your password and get into SUPERDRIVE.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${recoveryUrl}" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
        Set Your Password &amp; Open SUPERDRIVE
      </a>
    </div>
    <p style="margin:0 0 22px;text-align:center;color:#666;font-size:13px;line-height:1.6;font-style:italic;">After you set your password, we'll walk you through installing SUPERDRIVE on your phone — takes about a minute.</p>
    <p style="margin:30px 0 14px;color:${BRAND_DARK};font-size:16px;font-weight:700;">Here's what's waiting for you:</p>
    ${features}
    <p style="margin:28px 0 0;color:#777;font-size:13px;line-height:1.6;">Need to install on a different device later? Go to <a href="${APP_URL}/install" style="color:${BRAND_DARK};font-weight:600;">${APP_URL.replace(/^https?:\/\//, '')}/install</a>.</p>
    <p style="margin:18px 0 0;color:#777;font-size:13px;line-height:1.6;">Questions? Just reply to this email — we're here.<br/>— The SUPERTRANSPORT team</p>
  `;

  const subject = `You're approved${namePart} — welcome to SUPERTRANSPORT`;
  const html = buildEmail(subject, subject, body, undefined, ONBOARDING_EMAIL);
  return { subject, html };
}

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

    if (!user.email) {
      return new Response(JSON.stringify({ error: 'No email address on file for your account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { template, first_name } = body;
    let { subject, html, to } = body;

    // Server-rendered preview templates take precedence over raw subject/html.
    if (template === 'application_submitted') {
      const r = renderApplicationSubmitted(first_name || '');
      subject = r.subject;
      html = r.html;
    } else if (template === 'welcome_superdrive') {
      const r = renderWelcomeSuperdrive(first_name || '');
      subject = r.subject;
      html = r.html;
    }

    if (!subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing subject or html (or unknown template)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional `to` override — restricted to internal mysupertransport.com inboxes for safety.
    let recipientEmail = user.email!;
    if (typeof to === 'string' && to.trim()) {
      const candidate = to.trim().toLowerCase();
      if (!/^[^\s@]+@mysupertransport\.com$/.test(candidate)) {
        return new Response(JSON.stringify({ error: '`to` override must be a @mysupertransport.com address' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      recipientEmail = candidate;
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
