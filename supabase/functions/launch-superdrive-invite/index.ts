import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail, BRAND_COLOR, BRAND_DARK, ONBOARDING_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APP_URL = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app';
const COOLDOWN_DAYS = 30;

interface SendResult {
  operator_id: string;
  email?: string;
  status: 'sent' | 'recently_invited' | 'no_email' | 'no_user_account' | 'not_eligible' | 'error';
  message?: string;
  last_invited_at?: string;
}

function buildWelcomeEmailHtml(firstName: string, recoveryUrl: string): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';

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

  const installCallout = `
    <div style="background:#0f1117;border-radius:10px;padding:20px;margin:24px 0 0;">
      <p style="margin:0 0 10px;color:${BRAND_COLOR};font-size:14px;font-weight:700;letter-spacing:1px;">📱 INSTALL ON YOUR PHONE</p>
      <p style="margin:0 0 14px;color:#cfcfcf;font-size:13px;line-height:1.6;">After setting your password, install SUPERDRIVE to your home screen for one-tap access:</p>
      <p style="margin:0 0 6px;color:#fff;font-size:13px;line-height:1.5;"><strong>iPhone (Safari):</strong> Tap Share → "Add to Home Screen"</p>
      <p style="margin:0;color:#fff;font-size:13px;line-height:1.5;"><strong>Android (Chrome):</strong> Tap menu (⋮) → "Install app"</p>
    </div>`;

  const body = `
    <p style="margin:0 0 14px;">${greeting}</p>
    <p>You've been driving with SUPERTRANSPORT for a while — and we built something for you. <strong>SUPERDRIVE</strong> is your new operator app. Your truck, your settlements, your documents — all in one place, always with you.</p>
    <p style="margin:0 0 22px;">Click the button below to set your password and open SUPERDRIVE for the first time.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${recoveryUrl}" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
        Set Your Password &amp; Open SUPERDRIVE
      </a>
    </div>

    <p style="margin:30px 0 14px;color:${BRAND_DARK};font-size:16px;font-weight:700;">Here's what's waiting for you:</p>
    ${features}
    ${installCallout}

    <p style="margin:28px 0 0;color:#777;font-size:13px;line-height:1.6;">Questions? Just reply to this email — we're here.<br/>— The SUPERTRANSPORT team</p>
  `;

  return buildEmail(
    'Welcome to SUPERDRIVE — Your Operator App Is Ready',
    `Welcome to SUPERDRIVE${firstName ? `, ${firstName}` : ''}`,
    body,
    undefined, // CTA already embedded inline above
    ONBOARDING_EMAIL
  );
}

function buildBinderEmailHtml(firstName: string, recoveryUrl: string): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';

  const binderCard = `
    <div style="background:#FAF8F2;border:1px solid #EDE6CF;border-radius:10px;padding:20px;margin:0 0 12px;">
      <p style="margin:0 0 10px;color:${BRAND_DARK};font-size:16px;font-weight:700;">🔍 Your DOT Inspection Binder</p>
      <p style="margin:0 0 12px;color:#444;font-size:14px;line-height:1.6;">Carry your binder in your pocket. At the scale house, every document is one tap away:</p>
      <ul style="margin:0;padding:0 0 0 18px;color:#444;font-size:14px;line-height:1.7;">
        <li>CDL &amp; Medical Card</li>
        <li>Truck Title &amp; Registration</li>
        <li>Periodic DOT Inspection</li>
        <li>IRS Form 2290</li>
        <li>Insurance &amp; more</li>
      </ul>
      <p style="margin:14px 0 0;color:#444;font-size:14px;line-height:1.6;">We keep it synced — when something is renewed, your binder updates automatically. You can even share a clean link with an officer if they prefer.</p>
    </div>`;

  const installCallout = `
    <div style="background:#0f1117;border-radius:10px;padding:20px;margin:24px 0 0;">
      <p style="margin:0 0 10px;color:${BRAND_COLOR};font-size:14px;font-weight:700;letter-spacing:1px;">📱 INSTALL ON YOUR PHONE</p>
      <p style="margin:0 0 14px;color:#cfcfcf;font-size:13px;line-height:1.6;">Install SUPERDRIVE to your home screen so your binder is one tap away — even before the scale.</p>
      <p style="margin:0 0 6px;color:#fff;font-size:13px;line-height:1.5;"><strong>iPhone (Safari):</strong> Tap Share → "Add to Home Screen"</p>
      <p style="margin:0;color:#fff;font-size:13px;line-height:1.5;"><strong>Android (Chrome):</strong> Tap menu (⋮) → "Install app"</p>
    </div>`;

  const body = `
    <p style="margin:0 0 14px;">${greeting}</p>
    <p>We just rolled out a new tool to make your life at the scale house easier. <strong>SUPERDRIVE</strong> puts your full DOT inspection binder in your pocket — no more shuffling through papers in the cab.</p>
    <p style="margin:0 0 22px;">Click the button below to set your password and open your binder for the first time.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${recoveryUrl}" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
        Set Your Password &amp; Open SUPERDRIVE
      </a>
    </div>

    ${binderCard}
    ${installCallout}

    <p style="margin:28px 0 0;color:#555;font-size:13px;line-height:1.6;">More tools — settlement forecasts, dispatch status, direct messages, payroll calendar — are coming. We'll let you know in-app as each one goes live.</p>
    <p style="margin:18px 0 0;color:#777;font-size:13px;line-height:1.6;">Questions? Just reply to this email — we're here.<br/>— The SUPERTRANSPORT team</p>
  `;

  return buildEmail(
    'Your DOT Inspection Binder is now in your pocket',
    `Your DOT Inspection Binder is here${firstName ? `, ${firstName}` : ''}`,
    body,
    undefined,
    ONBOARDING_EMAIL
  );
}

type EmailTemplate = 'binder' | 'full';
const SUBJECTS: Record<EmailTemplate, string> = {
  binder: 'Your DOT Inspection Binder is now in your pocket',
  full: 'Welcome to SUPERDRIVE — Your Operator App Is Ready',
};
const TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  binder: 'binder-rollout',
  full: 'welcome-superdrive',
};

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

    // ── Authorization ───────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await userClient.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = claimsData.claims.sub as string;
    const callerEmail = (claimsData.claims.email as string | undefined) ?? 'Staff';

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['management', 'owner'])
      .limit(1);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: management or owner role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Input ───────────────────────────────────────────────────────────────
    const { operator_ids, template: rawTemplate } = await req.json();
    const template: EmailTemplate = rawTemplate === 'full' ? 'full' : 'binder';
    if (!Array.isArray(operator_ids) || operator_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'operator_ids must be a non-empty array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (operator_ids.length > 100) {
      return new Response(JSON.stringify({ error: 'Maximum 100 operators per request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Caller name (for audit log) ────────────────────────────────────────
    const callerProfile = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerId)
      .maybeSingle();
    const callerName = callerProfile.data
      ? `${callerProfile.data.first_name ?? ''} ${callerProfile.data.last_name ?? ''}`.trim() || callerEmail
      : callerEmail;

    // ── Per-operator processing ────────────────────────────────────────────
    const results: SendResult[] = [];
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (const operatorId of operator_ids) {
      try {
        // Fetch operator + linked application
        const { data: op, error: opErr } = await supabaseAdmin
          .from('operators')
          .select('id, user_id, application_id, is_active, applications(first_name, last_name, email)')
          .eq('id', operatorId)
          .maybeSingle();

        if (opErr || !op) {
          results.push({ operator_id: operatorId, status: 'error', message: opErr?.message ?? 'Operator not found' });
          continue;
        }

        if (!op.is_active) {
          results.push({ operator_id: operatorId, status: 'not_eligible', message: 'Operator is not active' });
          continue;
        }

        if (!op.user_id) {
          results.push({ operator_id: operatorId, status: 'no_user_account' });
          continue;
        }

        // Resolve email — prefer auth user email (source of truth for login),
        // fall back to application email.
        let email: string | null = null;
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(op.user_id);
          email = authUser?.user?.email ?? null;
        } catch (_e) {
          email = null;
        }
        const app = (op as any).applications;
        if (!email && app?.email) email = app.email;

        if (!email) {
          results.push({ operator_id: operatorId, status: 'no_email' });
          continue;
        }

        const firstName = app?.first_name ?? '';
        const lastName = app?.last_name ?? '';
        const operatorName = `${firstName} ${lastName}`.trim() || email;

        // Idempotency check (30-day cooldown via audit_log)
        const { data: recentSends } = await supabaseAdmin
          .from('audit_log')
          .select('created_at')
          .eq('action', 'superdrive_invite_sent')
          .eq('entity_type', 'operator')
          .eq('entity_id', operatorId)
          .gte('created_at', cooldownCutoff)
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentSends && recentSends.length > 0) {
          results.push({
            operator_id: operatorId,
            email,
            status: 'recently_invited',
            last_invited_at: recentSends[0].created_at,
          });
          continue;
        }

        // Generate recovery link (works whether or not user has set a password yet)
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${APP_URL}/reset-password` },
        });

        if (linkErr || !linkData?.properties?.action_link) {
          results.push({ operator_id: operatorId, email, status: 'error', message: linkErr?.message ?? 'Failed to generate link' });
          continue;
        }

        const recoveryUrl = linkData.properties.action_link;
        const html = template === 'full'
          ? buildWelcomeEmailHtml(firstName, recoveryUrl)
          : buildBinderEmailHtml(firstName, recoveryUrl);
        const subject = SUBJECTS[template];

        try {
          await sendEmail(
            email,
            subject,
            html,
            resendKey
          );
        } catch (sendErr) {
          results.push({
            operator_id: operatorId,
            email,
            status: 'error',
            message: sendErr instanceof Error ? sendErr.message : 'Email send failed',
          });
          continue;
        }

        // Audit log entry
        await supabaseAdmin.from('audit_log').insert({
          action: 'superdrive_invite_sent',
          actor_id: callerId,
          actor_name: callerName,
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: {
            template: TEMPLATE_LABELS[template],
            email,
            recovery_link_generated: true,
          },
        });

        results.push({ operator_id: operatorId, email, status: 'sent' });
      } catch (perOperatorErr) {
        console.error(`Error processing operator ${operatorId}:`, perOperatorErr);
        results.push({
          operator_id: operatorId,
          status: 'error',
          message: perOperatorErr instanceof Error ? perOperatorErr.message : 'Internal error',
        });
      }
    }

    // ── Summary ────────────────────────────────────────────────────────────
    const summary = {
      total: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      recently_invited: results.filter(r => r.status === 'recently_invited').length,
      no_email: results.filter(r => r.status === 'no_email').length,
      no_user_account: results.filter(r => r.status === 'no_user_account').length,
      not_eligible: results.filter(r => r.status === 'not_eligible').length,
      errors: results.filter(r => r.status === 'error').length,
    };

    return new Response(JSON.stringify({ success: true, summary, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('launch-superdrive-invite error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});