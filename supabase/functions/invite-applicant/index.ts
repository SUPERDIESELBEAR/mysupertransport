import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { emailHeader, emailFooter, RECRUITING_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function buildInviteEmail(firstName: string, note: string | null, appUrl: string): string {
  const noteHtml = note
    ? `<div style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#555;"><strong>A note from our team:</strong> ${note}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>You're Invited to Apply — SUPERTRANSPORT</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader()}
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#0f1117;font-weight:700;">You're Invited to Join Our Team, ${firstName}!</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">
              <p>We'd love for you to apply to become an owner-operator with <strong>SUPERTRANSPORT</strong>.</p>
              <p>We work with independent trucking professionals who value flexibility, competitive pay, and real support on the road. If you're interested in partnering with us, click below to start your application — it only takes a few minutes.</p>
              ${noteHtml}
              <p style="margin-top:20px;"><strong>What to expect:</strong></p>
              <ul style="padding-left:20px;line-height:2;color:#555;">
                <li>Simple online application form</li>
                <li>Fast review by our onboarding team</li>
                <li>A dedicated coordinator from day one</li>
              </ul>
            </div>
            <!-- CTA -->
            <div style="text-align:center;margin:32px 0;">
              <a href="${appUrl}/apply" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                Start Your Application
              </a>
            </div>
            <p style="font-size:13px;color:#999;text-align:center;">Or visit: <a href="${appUrl}/apply" style="color:#C9A84C;">${appUrl}/apply</a></p>
            <!-- Secondary: Install app CTA -->
            <div style="margin:28px 0 0;padding:18px 20px;background:#faf7ef;border:1px solid #ecdfb8;border-radius:10px;text-align:center;">
              <p style="margin:0 0 10px;font-size:13px;color:#555;line-height:1.6;">
                📱 <strong>While you're here</strong> — install the SUPERDRIVE app on your phone for the smoothest application experience.
              </p>
              <a href="${appUrl}/install" style="display:inline-block;font-size:13px;color:#0f1117;background:transparent;border:1px solid #C9A84C;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
                Install SUPERDRIVE
              </a>
            </div>
          </td>
        </tr>
        ${emailFooter(RECRUITING_EMAIL, 'You received this email because a SUPERTRANSPORT team member personally invited you to apply.')}
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Auth guard — requires staff/management JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use user-context client with getClaims() for signing-keys compatibility
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = claimsData.claims.sub as string;

    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['management', 'onboarding_staff']);

    if (!roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch full user for email fallback
    const { data: { user: callerUser } } = await supabaseAdmin.auth.admin.getUserById(callerId);
    const callerEmail = callerUser?.email ?? 'staff';

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { first_name, last_name, email, phone, note, invite_id } = body;

    if (!first_name || !last_name || !email) {
      return new Response(JSON.stringify({ error: 'first_name, last_name, and email are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve caller name
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerId)
      .maybeSingle();
    const callerName = callerProfile
      ? `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || callerEmail
      : callerEmail;

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
    const html = buildInviteEmail(first_name, note ?? null, appUrl);
    const subject = `${first_name}, you're invited to apply at SUPERTRANSPORT`;

    // Send email via Resend
    let emailSent = false;
    let emailError: string | null = null;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `SUPERTRANSPORT Recruiting <${RECRUITING_EMAIL}>`,
        to: [email],
        subject,
        html,
      }),
    });

    if (resendRes.ok) {
      emailSent = true;
    } else {
      const errText = await resendRes.text();
      emailError = errText;
      console.error(`Resend error [${resendRes.status}]: ${errText}`);
    }

    // If this is a resend (invite_id provided), update the existing record
    if (invite_id) {
      await supabaseAdmin
        .from('application_invites')
        .update({
          email_sent: emailSent,
          email_error: emailError,
          resent_at: new Date().toISOString(),
        })
        .eq('id', invite_id);
    } else {
      // Insert new invite record
      const { data: newInvite, error: insertError } = await supabaseAdmin
        .from('application_invites')
        .insert({
          first_name,
          last_name,
          email,
          phone: phone ?? null,
          note: note ?? null,
          invited_by: callerId,
          invited_by_name: callerName,
          email_sent: emailSent,
          email_error: emailError,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Insert invite error:', insertError.message);
      }

      // Audit log (fire-and-forget via awaited try/catch)
      try {
        await supabaseAdmin.from('audit_log').insert({
          actor_id: callerId,
          actor_name: callerName as string,
          action: 'applicant_invited',
          entity_type: 'application_invite',
          entity_id: newInvite?.id ?? null,
          entity_label: `${first_name} ${last_name}`,
          metadata: { email, phone: phone ?? null },
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return new Response(JSON.stringify({ success: true, email_sent: emailSent, email_error: emailError }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
